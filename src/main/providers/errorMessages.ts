import { sanitizeErrorMessage } from './types'

export type ProviderFailureType =
  | 'network_timeout'
  | 'output_truncated'
  | 'provider_incomplete'
  | 'provider_error'

export function classifyProviderFailure(errorMsg: string): ProviderFailureType {
  if (errorMsg === 'network: request timeout' || errorMsg.includes('request timeout')) {
    return 'network_timeout'
  }
  if (errorMsg.startsWith('output_truncated:')) return 'output_truncated'
  if (errorMsg.startsWith('provider_incomplete:')) return 'provider_incomplete'
  return 'provider_error'
}

export function formatProviderFailureForUser(errorMsg: string, providerId?: string | null): string {
  const sanitized = sanitizeErrorMessage(errorMsg)
  if (classifyProviderFailure(errorMsg) !== 'network_timeout') {
    return sanitized
  }

  const common =
    'Provider 请求超时（network: request timeout）。可能原因：模型响应较慢、Thinking 已开启、输出较长、服务繁忙、网络/代理不稳定，或 Provider 并发限制。'

  if (providerId === 'bigmodel') {
    return `${common} 智谱/BigModel 模型本轮响应超时；建议提高该 Provider timeout、关闭 Thinking、换更快模型，或在较浅深度下重试。`
  }

  return `${common} 建议提高该 Provider timeout、关闭 Thinking、换更快模型，或降低本轮深度后重试。`
}
