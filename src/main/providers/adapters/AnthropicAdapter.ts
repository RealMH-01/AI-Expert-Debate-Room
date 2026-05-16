/**
 * Anthropic Claude Adapter
 *
 * Uses the Anthropic Messages API: POST {baseUrl}/v1/messages
 * Auth: x-api-key: <ANTHROPIC_API_KEY>
 * Required header: anthropic-version: 2023-06-01
 *
 * Thinking mode rules (per official docs):
 * - Claude Opus 4.7: MUST use thinking.type = "adaptive" (no manual budget)
 * - Claude Sonnet 4.6: prefer thinking.type = "adaptive", also supports "enabled" + budget_tokens
 * - Claude Haiku 4.5: use thinking.type = "enabled" + budget_tokens
 * - When thinking is enabled, max_tokens must be larger (16384+)
 *
 * Response parsing:
 * - Content blocks may be type="thinking" (with thinking text) or type="text"
 * - Extract thinking blocks as reasoningText
 */

import { BaseAdapter, type TestConnectionResult } from './BaseAdapter'
import type { ProviderRequest, ProviderResponse } from '../types'
import type { ChatMessage } from '../../prompts/moderatorPrompts'
import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'

interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text' | 'thinking'
    text?: string
    thinking?: string
  }>
  stop_reason: string | null
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export class AnthropicAdapter extends BaseAdapter {
  readonly name: string

  constructor(model: string, thinkingEnabled: boolean = false) {
    super('anthropic', model, thinkingEnabled)
    this.name = `anthropic:${model}`
  }

  protected async callApi(request: ProviderRequest): Promise<ProviderResponse> {
    return requestQueue.enqueue(this.providerId, async () => {
      const config = getProviderConfig('anthropic')
      if (!config) throw new Error('Provider "anthropic" 未配置。请在设置中配置 API Key。')
      if (!config.apiKey) throw new Error('Provider "anthropic" 缺少 API Key。')
      if (!config.enabled) throw new Error('Provider "anthropic" 已禁用。')

      const baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
      const endpoint = `${baseUrl}/v1/messages`

      // Convert ChatMessage[] to Anthropic format
      // Anthropic requires system as a top-level parameter, not in messages
      let systemPrompt = ''
      const anthropicMessages: Array<{ role: string; content: string }> = []

      for (const msg of request.messages) {
        if (msg.role === 'system') {
          systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content
        } else {
          anthropicMessages.push({ role: msg.role, content: msg.content })
        }
      }

      // Build request body
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: request.maxTokens,
        messages: anthropicMessages
      }

      if (systemPrompt) {
        body.system = systemPrompt
      }

      // Model-specific thinking configuration
      if (request.thinking.enabled) {
        const thinkingConfig = this.getThinkingConfig()
        if (thinkingConfig) {
          body.thinking = thinkingConfig
        }
        // Larger max_tokens for thinking + response
        body.max_tokens = 16384
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...(config.defaultHeaders || {})
      }

      const timeout = config.timeout || 120000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        console.log(`[AnthropicAdapter] 调用 ${this.model} - thinking: ${request.thinking.enabled} - endpoint: ${baseUrl}`)

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

        const data = (await response.json()) as AnthropicResponse

        // Extract text content and thinking content from response blocks
        let content = ''
        let reasoningText = ''

        for (const block of data.content) {
          if (block.type === 'text' && block.text) {
            content += block.text
          } else if (block.type === 'thinking' && block.thinking) {
            reasoningText += block.thinking
          }
        }

        return {
          content,
          reasoningText: reasoningText || undefined,
          usage: data.usage
            ? {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
              }
            : undefined
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(`Provider "anthropic" 请求超时 (${timeout / 1000}s)。`)
          }
          throw new Error(this.sanitizeError(error.message))
        }
        throw new Error('Provider "anthropic" 调用失败: 未知错误')
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  /**
   * Get model-specific thinking configuration
   *
   * - Opus 4.7: adaptive only (no manual budget)
   * - Sonnet 4.6: adaptive (preferred)
   * - Haiku 4.5: enabled + budget_tokens
   */
  private getThinkingConfig(): Record<string, unknown> | null {
    if (this.model.includes('opus')) {
      // Opus 4.7: MUST use adaptive
      return { type: 'adaptive' }
    } else if (this.model.includes('sonnet')) {
      // Sonnet 4.6: prefer adaptive
      return { type: 'adaptive' }
    } else if (this.model.includes('haiku')) {
      // Haiku 4.5: use enabled + budget_tokens
      return { type: 'enabled', budget_tokens: 4096 }
    }
    // Default: adaptive
    return { type: 'adaptive' }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const config = getProviderConfig('anthropic')
    if (!config) return { success: false, message: 'Provider "anthropic" 未配置' }
    if (!config.apiKey) return { success: false, message: 'API Key 未配置' }
    if (!config.enabled) return { success: false, message: 'Provider 已禁用' }

    const baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
    const endpoint = `${baseUrl}/v1/messages`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      ...(config.defaultHeaders || {})
    }

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
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
