import type { ProviderRequest, ProviderResponse } from '../types'
import { OpenAICompatibleAdapter, buildOpenAICompatibleChatBody, parseOpenAICompatibleResponse } from './OpenAICompatibleAdapter'

export function buildMoonshotChatBody(request: ProviderRequest): Record<string, unknown> {
  const body = buildOpenAICompatibleChatBody(request)
  if (request.model === 'kimi-k2.6' || request.model === 'kimi-k2.5') {
    if (request.thinking?.enabled === false) {
      body.thinking = { type: 'disabled' }
    } else {
      body.thinking = { type: 'enabled' }
      delete body.temperature
      delete body.top_p
      delete body.presence_penalty
      delete body.frequency_penalty
    }
  }
  return body
}

export function parseMoonshotResponse(data: unknown): ProviderResponse {
  return parseOpenAICompatibleResponse(data, 'moonshot', (data as any)?.model ?? '')
}

export class MoonshotAdapter extends OpenAICompatibleAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'moonshot', ...options })
  }

  protected buildBody(request: ProviderRequest): Record<string, unknown> {
    return buildMoonshotChatBody(request)
  }
}
