/**
 * Qwen / DashScope Adapter
 *
 * OpenAI-compatible Chat Completions with Qwen-specific thinking mode.
 * Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
 * Endpoint: POST {baseUrl}/chat/completions
 * Auth: Authorization: Bearer <DASHSCOPE_API_KEY>
 *
 * Thinking mode rules (per official docs):
 * - Enable via enable_thinking: true (body param)
 * - Control depth via thinking_budget: number (token count)
 * - Response includes reasoning_content in message
 * - When thinking is disabled, set enable_thinking: false
 */

import { BaseAdapter, type TestConnectionResult } from './BaseAdapter'
import type { ProviderRequest, ProviderResponse, OpenAIChatCompletionsResponse } from '../types'
import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export class QwenAdapter extends BaseAdapter {
  readonly name: string

  constructor(model: string, thinkingEnabled: boolean = false) {
    super('qwen', model, thinkingEnabled)
    this.name = `qwen:${model}`
  }

  protected async callApi(request: ProviderRequest): Promise<ProviderResponse> {
    return requestQueue.enqueue(this.providerId, async () => {
      const config = getProviderConfig(this.providerId)
      if (!config) throw new Error('Provider "qwen" 未配置。请在设置中配置 API Key。')
      if (!config.apiKey) throw new Error('Provider "qwen" 缺少 API Key。')
      if (!config.enabled) throw new Error('Provider "qwen" 已禁用。')

      const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
      const endpoint = `${baseUrl}/chat/completions`

      // Build request body
      const body: Record<string, unknown> = {
        model: this.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature,
        max_tokens: request.maxTokens
      }

      if (request.thinking.enabled) {
        // THINKING MODE
        body.enable_thinking = true
        body.thinking_budget = this.mapThinkingBudget(request.thinking.effort)
        // Larger max_tokens for thinking + response
        body.max_tokens = Math.max(request.maxTokens, 8192)
      } else {
        // Explicitly disable thinking
        body.enable_thinking = false
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.defaultHeaders || {})
      }

      const timeout = config.timeout || 120000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        console.log(`[QwenAdapter] 调用 ${this.model} - thinking: ${request.thinking.enabled} - endpoint: ${baseUrl}`)

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error')
          throw new Error(`API 请求失败 (${response.status}): ${this.sanitizeError(errorBody)}`)
        }

        const data = (await response.json()) as OpenAIChatCompletionsResponse

        if (!data.choices || data.choices.length === 0) {
          throw new Error('API 返回了空的 choices')
        }

        const msg = data.choices[0].message

        return {
          content: msg.content ?? '',
          // Parse reasoning_content from Qwen thinking mode response
          reasoningText: msg.reasoning_content ?? undefined,
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
              }
            : undefined
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(`Provider "qwen" 请求超时 (${timeout / 1000}s)。`)
          }
          throw new Error(this.sanitizeError(error.message))
        }
        throw new Error('Provider "qwen" 调用失败: 未知错误')
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  /**
   * Map unified ThinkingEffort to Qwen thinking_budget (token count)
   */
  private mapThinkingBudget(effort: string): number {
    switch (effort) {
      case 'low':
        return 2048
      case 'medium':
        return 4096
      case 'high':
        return 8192
      default:
        return 4096
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const config = getProviderConfig(this.providerId)
    if (!config) return { success: false, message: 'Provider "qwen" 未配置' }
    if (!config.apiKey) return { success: false, message: 'API Key 未配置' }
    if (!config.enabled) return { success: false, message: 'Provider 已禁用' }

    const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
    const endpoint = `${baseUrl}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.defaultHeaders || {})
    }

    const body = {
      model: 'qwen3.6-flash',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
      enable_thinking: false
    }

    const timeout = Math.min(config.timeout || 15000, 15000)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    const startTime = Date.now()

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const latencyMs = Date.now() - startTime

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        return { success: false, message: `API 返回错误 (${response.status}): ${this.sanitizeError(errorBody).slice(0, 200)}`, latencyMs }
      }

      return { success: true, message: `连接成功 (${latencyMs}ms)`, latencyMs }
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, message: `连接超时 (${timeout / 1000}s)`, latencyMs }
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return { success: false, message: `连接失败: ${this.sanitizeError(msg)}`, latencyMs }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
