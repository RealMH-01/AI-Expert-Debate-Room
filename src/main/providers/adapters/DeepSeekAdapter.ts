import type { ProviderRequest, ProviderResponse } from '../types'
import { OpenAICompatibleAdapter, buildOpenAICompatibleChatBody, parseOpenAICompatibleResponse } from './OpenAICompatibleAdapter'

export function mapEffortToDeepSeek(effort: NonNullable<ProviderRequest['thinking']>['effort']): 'high' | 'max' {
  return effort === 'xhigh' || effort === 'max' ? 'max' : 'high'
}

export function buildDeepSeekChatBody(request: ProviderRequest): Record<string, unknown> {
  const body = buildOpenAICompatibleChatBody(request)
  if (request.thinking?.enabled !== false) {
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = mapEffortToDeepSeek(request.thinking?.effort)
    delete body.temperature
    delete body.top_p
    delete body.presence_penalty
    delete body.frequency_penalty
  } else {
    body.thinking = { type: 'disabled' }
  }
  return body
}

export function parseDeepSeekResponse(data: unknown): ProviderResponse {
  return parseOpenAICompatibleResponse(data, 'deepseek', (data as any)?.model ?? '')
}

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'deepseek', ...options })
  }

  protected buildBody(request: ProviderRequest): Record<string, unknown> {
    return buildDeepSeekChatBody(request)
  }
}
