import type { ProviderId } from '../../shared/providers/modelRegistry'

export type DebateMessage = {
  role: 'system' | 'user' | 'assistant' | 'model'
  content: string
}

export type ToolDefinition = Record<string, unknown>
export type ToolCall = Record<string, unknown>

export type ProviderRequest = {
  messages: DebateMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  responseFormat?: 'text' | 'json_object'
  thinking?: {
    enabled?: boolean
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    budgetTokens?: number
    preserve?: boolean
  }
  tools?: ToolDefinition[]
}

export type ProviderResponse = {
  text: string
  reasoningText?: string
  raw?: unknown
  toolCalls?: ToolCall[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    totalTokens?: number
  }
  providerId: ProviderId
  model: string
  finishReason?: string
}

export type ProviderErrorType =
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'validation'
  | 'network'
  | 'server'
  | 'unknown'

export type ProviderTestResult = {
  ok: boolean
  providerId: ProviderId
  model: string
  latencyMs?: number
  errorType?: ProviderErrorType
  sanitizedMessage?: string
  testedAt: string
}

export function mapHttpStatusToErrorType(status: number): ProviderErrorType {
  if (status === 401) return 'auth'
  if (status === 403) return 'permission'
  if (status === 429) return 'rate_limit'
  if (status === 400) return 'validation'
  if (status === 408) return 'network'
  if (status >= 500) return 'server'
  return 'unknown'
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ****')
    .replace(/(sk|sk-ant|sk-or|sk-proj|sk-live)-[A-Za-z0-9_-]{8,}/gi, '$1-****')
    .replace(/(api[_-]?key|x-api-key|x-goog-api-key|authorization|token|secret|auth)(["'\s:=]+)(["']?)[^"',\s}]+/gi, '$1$2$3****')
    .slice(0, 800)
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}
