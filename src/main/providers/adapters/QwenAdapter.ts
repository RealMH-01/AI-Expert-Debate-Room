import type { ProviderRequest, ProviderResponse } from '../types'
import { OpenAICompatibleAdapter, buildOpenAICompatibleChatBody, parseOpenAICompatibleResponse } from './OpenAICompatibleAdapter'

export function buildQwenChatBody(request: ProviderRequest): Record<string, unknown> {
  const body = buildOpenAICompatibleChatBody(request)
  if (request.thinking?.enabled !== undefined) {
    body.enable_thinking = request.thinking.enabled
  }
  if (request.thinking?.budgetTokens !== undefined) {
    body.thinking_budget = request.thinking.budgetTokens
  }
  return body
}

export function parseQwenResponse(data: unknown): ProviderResponse {
  return parseOpenAICompatibleResponse(data, 'qwen', (data as any)?.model ?? '')
}

export class QwenAdapter extends OpenAICompatibleAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'qwen', ...options })
  }

  protected buildBody(request: ProviderRequest): Record<string, unknown> {
    return buildQwenChatBody(request)
  }
}
