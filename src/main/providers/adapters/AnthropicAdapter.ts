import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, mapHttpStatusToErrorType, sanitizeErrorMessage } from '../types'
import { createCombinedAbortSignal, DebateAbortError, isDebateAbortError } from '../abort'
import { BaseAdapter } from './BaseAdapter'

export function buildAnthropicMessagesRequest(request: ProviderRequest): {
  headers: Record<string, string>
  body: Record<string, unknown>
} {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' || message.role === 'model' ? 'assistant' : 'user',
      content: message.content
    }))

  const body: Record<string, unknown> = {
    model: request.model,
    system: system || undefined,
    messages,
    max_tokens: request.maxTokens ?? 4096,
    stream: request.stream ?? false
  }

  if (request.thinking?.enabled !== false) {
    if (request.model === 'claude-opus-4-7' || request.model === 'claude-sonnet-4-6') {
      body.thinking = { type: 'adaptive' }
    } else if (request.model === 'claude-haiku-4-5-20251001') {
      body.thinking = {
        type: 'enabled',
        budget_tokens: request.thinking?.budgetTokens ?? 4096
      }
    }
  }

  return {
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body
  }
}

export function parseAnthropicResponse(data: any, model: string): ProviderResponse {
  const textParts: string[] = []
  const thinkingParts: string[] = []
  for (const block of data?.content ?? []) {
    if (block?.type === 'text') textParts.push(block.text ?? '')
    if (block?.type === 'thinking') thinkingParts.push(block.thinking ?? '')
  }
  return {
    text: textParts.join(''),
    reasoningText: thinkingParts.join('') || undefined,
    raw: data,
    providerId: 'anthropic',
    model,
    finishReason: data?.stop_reason,
    usage: data?.usage
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens
        }
      : undefined
  }
}

export function parseAnthropicSseEvents(sseText: string): Pick<ProviderResponse, 'text' | 'reasoningText'> {
  let text = ''
  let reasoningText = ''
  for (const event of sseText.split(/\n\n+/)) {
    const dataLine = event.split('\n').find((line) => line.startsWith('data:'))
    if (!dataLine || dataLine.trim() === 'data: [DONE]') continue
    try {
      const data = JSON.parse(dataLine.replace(/^data:\s*/, ''))
      const delta = data.delta
      if (delta?.type === 'text_delta') text += delta.text ?? ''
      if (delta?.type === 'thinking_delta') reasoningText += delta.thinking ?? ''
    } catch {
      // Ignore malformed provider event chunks.
    }
  }
  return { text, reasoningText: reasoningText || undefined }
}

export class AnthropicAdapter extends BaseAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'anthropic', ...options })
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    const config = getProviderConfig('anthropic')
    if (!config?.apiKey) throw new Error('Provider "anthropic" is missing API Key.')
    if (!config.enabled) throw new Error('Provider "anthropic" is disabled.')
    const timeoutMs = config.timeout || 60000
    const totalStartedAt = Date.now()

    return requestQueue.enqueue('anthropic', async () => {
      const requestStartedAt = Date.now()
      const built = buildAnthropicMessagesRequest(request)
      const abort = createCombinedAbortSignal(request.signal, timeoutMs)
      request.telemetry = {
        ...request.telemetry,
        timeoutMs
      }
      try {
        const response = await fetch(joinUrl(config.baseUrl || 'https://api.anthropic.com', 'v1/messages'), {
          method: 'POST',
          headers: {
            ...built.headers,
            'x-api-key': config.apiKey,
            ...(config.defaultHeaders || {})
          },
          body: JSON.stringify(built.body),
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
        const parsed = parseAnthropicResponse(await response.json(), this.model)
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
