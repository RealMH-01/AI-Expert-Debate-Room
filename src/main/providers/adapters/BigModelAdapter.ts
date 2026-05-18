import type { ProviderRequest, ProviderResponse } from '../types'
import { OpenAICompatibleAdapter, buildOpenAICompatibleChatBody, parseOpenAICompatibleResponse } from './OpenAICompatibleAdapter'

export function buildBigModelChatBody(request: ProviderRequest): Record<string, unknown> {
  const body = buildOpenAICompatibleChatBody(request)
  if (request.thinking?.enabled !== undefined) {
    body.thinking = { type: request.thinking.enabled ? 'enabled' : 'disabled' }
  }
  if (request.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' }
  }
  return body
}

export function parseBigModelResponse(data: unknown): ProviderResponse {
  return parseOpenAICompatibleResponse(data, 'bigmodel', (data as any)?.model ?? '')
}

export class BigModelAdapter extends OpenAICompatibleAdapter {
  constructor(options: { model: string; thinkingEnabled?: boolean }) {
    super({ providerId: 'bigmodel', ...options })
  }

  protected buildBody(request: ProviderRequest): Record<string, unknown> {
    return buildBigModelChatBody(request)
  }
}
