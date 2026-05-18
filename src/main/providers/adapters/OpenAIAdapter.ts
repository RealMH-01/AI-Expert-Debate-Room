import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, sanitizeErrorMessage } from '../types'
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
    return requestQueue.enqueue('openai', async () => {
      const config = getProviderConfig('openai')
      if (!config?.apiKey) throw new Error('Provider "openai" is missing API Key.')
      if (!config.enabled) throw new Error('Provider "openai" is disabled.')

      const endpoint = joinUrl(config.baseUrl || 'https://api.openai.com/v1', 'responses')
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.defaultHeaders || {})
        },
        body: JSON.stringify(buildOpenAIResponsesBody(request))
      })

      if (!response.ok) {
        throw new Error(sanitizeErrorMessage(await response.text().catch(() => response.statusText)))
      }
      return parseOpenAIResponsesResponse(await response.json(), this.model)
    })
  }
}
