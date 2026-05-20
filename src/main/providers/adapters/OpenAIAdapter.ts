import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, mapHttpStatusToErrorType, sanitizeErrorMessage } from '../types'
import { createCombinedAbortSignal, DebateAbortError, isDebateAbortError } from '../abort'
import { BaseAdapter } from './BaseAdapter'

export function buildOpenAIResponsesBody(request: ProviderRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    input: request.messages.map((message) => ({
      role: message.role === 'model' ? 'assistant' : message.role,
      content: message.content
    }))
  }
  if (request.maxTokens !== undefined) body.max_output_tokens = request.maxTokens
  if (request.stream !== undefined) body.stream = request.stream
  if (request.responseFormat === 'json_object') {
    body.text = { format: { type: 'json_object' } }
  }
  if (request.tools?.length) body.tools = request.tools
  if (request.thinking?.enabled !== false) {
    body.reasoning = { effort: request.thinking?.effort ?? 'medium' }
  }
  return body
}

export function parseOpenAIResponsesResponse(data: any, model: string): ProviderResponse {
  const text = data?.output_text
    ?? data?.output?.flatMap((item: any) => item.content ?? [])
      .map((content: any) => content.text ?? '')
      .join('')
    ?? ''
  const usage = data?.usage
  return {
    text,
    raw: data,
    providerId: 'openai',
    model,
    finishReason: data?.status,
    usage: usage
      ? {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          reasoningTokens: usage.output_tokens_details?.reasoning_tokens,
          totalTokens: usage.total_tokens
        }
      : undefined
  }
}

export class OpenAIAdapter extends BaseAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'openai', ...options })
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    const config = getProviderConfig('openai')
    if (!config?.apiKey) throw new Error('Provider "openai" is missing API Key.')
    if (!config.enabled) throw new Error('Provider "openai" is disabled.')
    const timeoutMs = config.timeout || 60000
    const totalStartedAt = Date.now()

    return requestQueue.enqueue('openai', async () => {
      const requestStartedAt = Date.now()
      const endpoint = joinUrl(config.baseUrl || 'https://api.openai.com/v1', 'responses')
      const abort = createCombinedAbortSignal(request.signal, timeoutMs)
      request.telemetry = {
        ...request.telemetry,
        timeoutMs
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            ...(config.defaultHeaders || {})
          },
          body: JSON.stringify(buildOpenAIResponsesBody(request)),
          signal: abort.signal
        })

        const requestDurationMs = Date.now() - requestStartedAt
        if (!response.ok) {
          const errorType = mapHttpStatusToErrorType(response.status)
          request.telemetry = {
            ...request.telemetry,
            requestDurationMs,
            totalDurationMs: Date.now() - totalStartedAt,
            errorType
          }
          throw new Error(`${errorType}: ${sanitizeErrorMessage(await response.text().catch(() => response.statusText))}`)
        }
        const parsed = parseOpenAIResponsesResponse(await response.json(), this.model)
        request.telemetry = {
          ...request.telemetry,
          requestDurationMs,
          totalDurationMs: Date.now() - totalStartedAt,
          finishReason: parsed.finishReason
        }
        return { ...parsed, telemetry: request.telemetry }
      } catch (error) {
        const requestDurationMs = Date.now() - requestStartedAt
        if (isDebateAbortError(error)) {
          attachTelemetryToError(error, request.telemetry)
          throw error
        }
        if (error instanceof Error && error.name === 'AbortError') {
          if (abort.getAbortReason() === 'external') {
            const debateAbort = new DebateAbortError()
            attachTelemetryToError(debateAbort, request.telemetry)
            throw debateAbort
          }
          request.telemetry = {
            ...request.telemetry,
            requestDurationMs,
            totalDurationMs: Date.now() - totalStartedAt,
            errorType: 'network_timeout'
          }
          const timeoutError = new Error('network: request timeout')
          attachTelemetryToError(timeoutError, request.telemetry)
          throw timeoutError
        }
        request.telemetry = {
          ...request.telemetry,
          requestDurationMs,
          totalDurationMs: Date.now() - totalStartedAt,
          errorType: 'provider_error'
        }
        const providerError = error instanceof Error
          ? new Error(sanitizeErrorMessage(error.message))
          : new Error('unknown: provider request failed')
        attachTelemetryToError(providerError, request.telemetry)
        throw providerError
      } finally {
        abort.cleanup()
      }
    }, {
      maxConcurrency: config.maxConcurrency,
      onStart: ({ queueWaitMs }) => {
        request.telemetry = {
          ...request.telemetry,
          queueWaitMs
        }
      }
    })
  }
}

function attachTelemetryToError(error: unknown, telemetry: ProviderRequest['telemetry']): void {
  if (error && typeof error === 'object') {
    ;(error as { providerTelemetry?: ProviderRequest['telemetry'] }).providerTelemetry = telemetry
  }
}
