/**
 * Google Gemini Adapter
 *
 * Uses native Gemini generateContent API.
 * Endpoint: POST {baseUrl}/models/{model}:generateContent
 * Auth: x-goog-api-key: <GEMINI_API_KEY>
 *
 * IMPORTANT Thinking mapping:
 * - gemini-2.5-* -> generationConfig.thinkingConfig.thinkingBudget (number)
 *   Effort mapping: none=0, low=1024, medium=8192, high=24576
 * - gemini-3-*   -> generationConfig.thinkingConfig.thinkingLevel ('minimal'|'low'|'medium'|'high')
 *   Effort mapping: none='minimal', low='low', medium='medium', high='high'
 * - NEVER send thinkingLevel to 2.5 series
 * - NEVER send thinkingBudget as default for 3 series
 *
 * Response parsing:
 * - parts with thought=true are thinking content (reasoningText)
 * - parts without thought flag are regular text content
 */

import { BaseAdapter, type TestConnectionResult } from './BaseAdapter'
import type { ProviderRequest, ProviderResponse, ThinkingEffort } from '../types'
import { getProviderConfig } from '../providerSettings'
import { requestQueue } from '../requestQueue'

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text?: string; thought?: boolean }>
      role: string
    }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export class GeminiAdapter extends BaseAdapter {
  readonly name: string

  constructor(model: string, thinkingEnabled: boolean = false) {
    super('google', model, thinkingEnabled)
    this.name = `google:${model}`
  }

  protected async callApi(request: ProviderRequest): Promise<ProviderResponse> {
    return requestQueue.enqueue(this.providerId, async () => {
      const config = getProviderConfig('google')
      if (!config) throw new Error('Provider "google" 未配置。请在设置中配置 API Key。')
      if (!config.apiKey) throw new Error('Provider "google" 缺少 API Key。')
      if (!config.enabled) throw new Error('Provider "google" 已禁用。')

      const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
      const endpoint = `${baseUrl}/models/${this.model}:generateContent`

      // Convert ChatMessage[] to Gemini format
      let systemInstruction: string | undefined
      const contents: GeminiContent[] = []

      for (const msg of request.messages) {
        if (msg.role === 'system') {
          systemInstruction = (systemInstruction ? systemInstruction + '\n\n' : '') + msg.content
        } else {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })
        }
      }

      // Build request body
      const body: Record<string, unknown> = { contents }

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }]
        }
      }

      // Build generationConfig
      const generationConfig: Record<string, unknown> = {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens
      }

      // Add thinking configuration based on model family
      if (request.thinking.enabled) {
        const thinkingConfig = this.buildThinkingConfig(request.thinking.effort)
        if (thinkingConfig) {
          generationConfig.thinkingConfig = thinkingConfig
        }
      } else {
        // Explicitly disable thinking
        const disableConfig = this.buildDisableThinkingConfig()
        if (disableConfig) {
          generationConfig.thinkingConfig = disableConfig
        }
      }

      body.generationConfig = generationConfig

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
        ...(config.defaultHeaders || {})
      }

      const timeout = config.timeout || 120000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        console.log(`[GeminiAdapter] 调用 ${this.model} - thinking: ${request.thinking.enabled} - endpoint: ${baseUrl}`)

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

        const data = (await response.json()) as GeminiResponse

        if (!data.candidates || data.candidates.length === 0) {
          throw new Error('API 返回了空的 candidates')
        }

        // Extract text content and thinking content
        let content = ''
        let reasoningText = ''

        for (const part of data.candidates[0].content.parts) {
          if (part.text) {
            if (part.thought) {
              reasoningText += part.text
            } else {
              content += part.text
            }
          }
        }

        return {
          content,
          reasoningText: reasoningText || undefined,
          usage: data.usageMetadata
            ? {
                promptTokens: data.usageMetadata.promptTokenCount,
                completionTokens: data.usageMetadata.candidatesTokenCount,
                totalTokens: data.usageMetadata.totalTokenCount
              }
            : undefined
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(`Provider "google" 请求超时 (${timeout / 1000}s)。`)
          }
          throw new Error(this.sanitizeError(error.message))
        }
        throw new Error('Provider "google" 调用失败: 未知错误')
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  /**
   * Build thinking config based on model family and effort level.
   *
   * Gemini 2.5 series: thinkingBudget (number)
   *   none=0, low=1024, medium=8192, high=24576
   *
   * Gemini 3 series: thinkingLevel (string)
   *   none='minimal', low='low', medium='medium', high='high'
   */
  private buildThinkingConfig(effort: ThinkingEffort): Record<string, unknown> | null {
    if (this.model.startsWith('gemini-2.5')) {
      // Gemini 2.5 series uses thinkingBudget
      const budgetMap: Record<string, number> = {
        none: 0,
        low: 1024,
        medium: 8192,
        high: 24576
      }
      return { thinkingBudget: budgetMap[effort] ?? 8192 }
    } else if (this.model.startsWith('gemini-3')) {
      // Gemini 3 series uses thinkingLevel
      const levelMap: Record<string, string> = {
        none: 'minimal',
        low: 'low',
        medium: 'medium',
        high: 'high'
      }
      return { thinkingLevel: levelMap[effort] ?? 'medium' }
    }
    return null
  }

  /**
   * Build config to explicitly disable thinking.
   */
  private buildDisableThinkingConfig(): Record<string, unknown> | null {
    if (this.model.startsWith('gemini-2.5')) {
      return { thinkingBudget: 0 }
    } else if (this.model.startsWith('gemini-3')) {
      return { thinkingLevel: 'minimal' }
    }
    return null
  }

  async testConnection(): Promise<TestConnectionResult> {
    const config = getProviderConfig('google')
    if (!config) return { success: false, message: 'Provider "google" 未配置' }
    if (!config.apiKey) return { success: false, message: 'API Key 未配置' }
    if (!config.enabled) return { success: false, message: 'Provider 已禁用' }

    const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
    const endpoint = `${baseUrl}/models/gemini-2.5-flash-lite:generateContent`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
      ...(config.defaultHeaders || {})
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      generationConfig: { maxOutputTokens: 10 }
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
