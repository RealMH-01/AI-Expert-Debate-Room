import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import { getProviderDefinition } from '../../../shared/providers/modelRegistry'
import type { ProviderId } from '../../../shared/providers/modelRegistry'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, mapHttpStatusToErrorType, sanitizeErrorMessage } from '../types'
import { createCombinedAbortSignal, DebateAbortError, isDebateAbortError } from '../abort'
import { BaseAdapter } from './BaseAdapter'

export type ChatCompletionBody = Record<string, unknown>

export function buildOpenAICompatibleChatBody(request: ProviderRequest): ChatCompletionBody {
  const body: ChatCompletionBody = {
    model: request.model,
    messages: request.messages.map((message) => ({
      role: message.role === 'model' ? 'assistant' : message.role,
      content: message.content
    }))
  }
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
  if (request.temperature !== undefined) body.temperature = request.temperature
  if (request.stream !== undefined) body.stream = request.stream
  if (request.responseFormat === 'json_object') body.response_format = { type: 'json_object' }
  if (request.tools?.length) body.tools = request.tools
  return body
}

export function parseOpenAICompatibleResponse(
  data: any,
  providerId: ProviderId,
  model: string
): ProviderResponse {
  const choice = data?.choices?.[0]
  const message = choice?.message ?? {}
  const usage = data?.usage
  return {
    text: message.content ?? '',
    reasoningText: message.reasoning_content,
    raw: data,
    providerId,
    model,
    finishReason: choice?.finish_reason,
    toolCalls: message.tool_calls,
    usage: usage
      ? {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
          totalTokens: usage.total_tokens
        }
      : undefined
  }
}

export class OpenAICompatibleAdapter extends BaseAdapter {
  protected buildBody(request: ProviderRequest): ChatCompletionBody {
    return buildOpenAICompatibleChatBody(request)
  }

  protected parseResponse(data: unknown): ProviderResponse {
    return parseOpenAICompatibleResponse(data, this.providerId, this.model)
  }

  protected getEndpoint(baseUrl: string): string {
    return joinUrl(baseUrl, 'chat/completions')
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    const config = getProviderConfig(this.providerId)
    if (!config?.apiKey) {
      throw new Error(`Provider "${this.providerId}" is missing API Key.`)
    }
    if (!config.enabled) {
      throw new Error(`Provider "${this.providerId}" is disabled.`)
    }

    const provider = getProviderDefinition(this.providerId)
    const baseUrl = config.baseUrl || provider?.defaultBaseUrl || 'https://api.openai.com/v1'
    const endpoint = this.getEndpoint(baseUrl)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.defaultHeaders || {})
    }
    const timeoutMs = config.timeout || 60000
    const totalStartedAt = Date.now()

    return requestQueue.enqueue(this.providerId, async () => {
      const requestStartedAt = Date.now()
      const abort = createCombinedAbortSignal(request.signal, timeoutMs)
      request.telemetry = {
        ...request.telemetry,
        timeoutMs
      }
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(this.buildBody(request)),
          signal: abort.signal
        })

        const requestDurationMs = Date.now() - requestStartedAt
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          const errorType = mapHttpStatusToErrorType(response.status)
          request.telemetry = {
            ...request.telemetry,
            requestDurationMs,
            totalDurationMs: Date.now() - totalStartedAt,
            errorType
          }
          throw new Error(`${errorType}: ${sanitizeErrorMessage(body || response.statusText)}`)
        }

        const parsed = this.parseResponse(await response.json())
        request.telemetry = {
          ...request.telemetry,
          requestDurationMs,
          totalDurationMs: Date.now() - totalStartedAt,
          finishReason: parsed.finishReason
        }
        return {
          ...parsed,
          telemetry: request.telemetry
        }
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
          const timeoutError = new Error('network: request timeout')
          request.telemetry = {
            ...request.telemetry,
            requestDurationMs,
            totalDurationMs: Date.now() - totalStartedAt,
            errorType: 'network_timeout'
          }
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
