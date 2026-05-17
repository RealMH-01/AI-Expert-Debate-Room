import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'
import type { ProviderRequest, ProviderResponse } from '../types'
import { joinUrl, sanitizeErrorMessage } from '../types'
import { BaseAdapter } from './BaseAdapter'

export function mapEffortToGeminiThinkingLevel(
  effort: NonNullable<ProviderRequest['thinking']>['effort']
): 'minimal' | 'low' | 'medium' | 'high' {
  if (effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  if (effort === 'high' || effort === 'xhigh' || effort === 'max') return 'high'
  return 'minimal'
}

export function mapEffortToGemini25Budget(request: ProviderRequest): number {
  if (request.thinking?.budgetTokens !== undefined) return request.thinking.budgetTokens
  switch (request.thinking?.effort) {
    case 'none':
      return 0
    case 'low':
      return 1024
    case 'high':
      return 24576
    case 'xhigh':
    case 'max':
      return 32768
    case 'medium':
    default:
      return 8192
  }
}

export function buildGeminiGenerateContentRequest(request: ProviderRequest): {
  path: string
  body: Record<string, any>
} {
  const contents = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))
  const systemInstruction = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')

  const generationConfig: Record<string, unknown> = {}
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens
  if (request.responseFormat === 'json_object') generationConfig.responseMimeType = 'application/json'
  if (request.thinking?.enabled !== false) {
    if (request.model.startsWith('gemini-2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: mapEffortToGemini25Budget(request) }
    } else if (request.model.startsWith('gemini-3')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: mapEffortToGeminiThinkingLevel(request.thinking?.effort)
      }
    }
  }

  const body: Record<string, any> = {
    contents,
    generationConfig
  }
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] }
  if (request.tools?.length) body.tools = request.tools
  return { path: `models/${request.model}:generateContent`, body }
}

export function parseGeminiResponse(data: any, model: string): ProviderResponse {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part: any) => part.text ?? '').join('')
  const reasoningText = parts
    .filter((part: any) => part.thought === true || part.thoughtSignature)
    .map((part: any) => part.text ?? '')
    .join('')
  const usage = data?.usageMetadata
  return {
    text,
    reasoningText: reasoningText || undefined,
    raw: data,
    providerId: 'google',
    model,
    finishReason: data?.candidates?.[0]?.finishReason,
    usage: usage
      ? {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          reasoningTokens: usage.thoughtsTokenCount,
          totalTokens: usage.totalTokenCount
        }
      : undefined
  }
}

export class GeminiAdapter extends BaseAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'google', ...options })
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    return requestQueue.enqueue('google', async () => {
      const config = getProviderConfig('google')
      if (!config?.apiKey) throw new Error('Provider "google" is missing API Key.')
      if (!config.enabled) throw new Error('Provider "google" is disabled.')
      const built = buildGeminiGenerateContentRequest(request)
      const response = await fetch(joinUrl(config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta', built.path), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.apiKey,
          ...(config.defaultHeaders || {})
        },
        body: JSON.stringify(built.body)
      })
      if (!response.ok) {
        throw new Error(sanitizeErrorMessage(await response.text().catch(() => response.statusText)))
      }
      return parseGeminiResponse(await response.json(), this.model)
    })
  }
}
