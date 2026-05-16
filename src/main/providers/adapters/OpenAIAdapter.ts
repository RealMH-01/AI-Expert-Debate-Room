/**
 * OpenAI Adapter
 *
 * For OpenAI models (GPT-5.x) using Chat Completions API.
 * Endpoint: POST {baseUrl}/chat/completions
 * Auth: Authorization: Bearer <API_KEY>
 *
 * Note: GPT-5.x models use the Responses API in the registry (openai_responses),
 * but for debate use we use chat completions which is simpler and sufficient.
 * Legacy models (GPT-4o) also use chat completions.
 */

import { BaseAdapter, type TestConnectionResult } from './BaseAdapter'
import type { ProviderRequest, ProviderResponse, OpenAIChatCompletionsResponse } from '../types'
import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'

export class OpenAIAdapter extends BaseAdapter {
  readonly name: string

  constructor(model: string, thinkingEnabled: boolean = false) {
    super('openai', model, thinkingEnabled)
    this.name = `openai:${model}`
  }

  protected async callApi(request: ProviderRequest): Promise<ProviderResponse> {
    return requestQueue.enqueue(this.providerId, async () => {
      const config = getProviderConfig(this.providerId)
      if (!config) throw new Error(`Provider "${this.providerId}" 未配置。请在设置中配置 API Key。`)
      if (!config.apiKey) throw new Error(`Provider "${this.providerId}" 缺少 API Key。`)
      if (!config.enabled) throw new Error(`Provider "${this.providerId}" 已禁用。`)

      const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      const endpoint = `${baseUrl}/chat/completions`

      const body: Record<string, unknown> = {
        model: this.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature,
        max_tokens: request.maxTokens
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
        console.log(`[OpenAIAdapter] 调用 ${this.model} - endpoint: ${baseUrl}`)

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

        return {
          content: data.choices[0].message.content ?? '',
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
            throw new Error(`Provider "openai" 请求超时 (${timeout / 1000}s)。`)
          }
          throw new Error(this.sanitizeError(error.message))
        }
        throw new Error('Provider "openai" 调用失败: 未知错误')
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  async testConnection(): Promise<TestConnectionResult> {
    const config = getProviderConfig(this.providerId)
    if (!config) return { success: false, message: 'Provider "openai" 未配置' }
    if (!config.apiKey) return { success: false, message: 'API Key 未配置' }
    if (!config.enabled) return { success: false, message: 'Provider 已禁用' }

    const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const endpoint = `${baseUrl}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.defaultHeaders || {})
    }

    const body = {
      model: 'gpt-5.4-nano',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5
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
