import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import { getProviderDefinition } from '../../../shared/providers/modelRegistry'
import type { ProviderId } from '../../../shared/providers/modelRegistry'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, mapHttpStatusToErrorType, sanitizeErrorMessage } from '../types'
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
    return requestQueue.enqueue(this.providerId, async () => {
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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 60000)

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(this.buildBody(request)),
          signal: controller.signal
        })

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          const errorType = mapHttpStatusToErrorType(response.status)
          throw new Error(`${errorType}: ${sanitizeErrorMessage(body || response.statusText)}`)
        }

        return this.parseResponse(await response.json())
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('network: request timeout')
        }
        throw error instanceof Error
          ? new Error(sanitizeErrorMessage(error.message))
          : new Error('unknown: provider request failed')
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }
}
