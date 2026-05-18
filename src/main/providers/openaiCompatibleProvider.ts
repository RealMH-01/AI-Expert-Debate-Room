/**
 * OpenAI-Compatible Provider
 *
 * 实现 DebateModelProvider 接口，调用 OpenAI 或兼容 OpenAI API 格式的服务。
 * 未来 DeepSeek、Qwen、Kimi、智谱等兼容 OpenAI API 格式的 provider 也可复用此实现。
 *
 * 本轮只实现非流式调用。如果容易实现流式，后续可扩展。
 *
 * 安全规则：
 * - API Key 从 providerSettings 读取，不从参数传入
 * - 不在日志中打印 API Key
 * - 错误消息中不包含 API Key
 */

import type {
  DebateModelProvider,
  DebateGenerateInput,
  DebateGenerateOutput,
  VoteGenerateInput,
  VoteGenerateOutput
} from './base'
import { getProviderConfig } from './providerSettings'
import { requestQueue } from './requestQueue'
import {
  buildModeratorOpeningPrompt,
  buildModeratorRoundSummaryPrompt,
  buildModeratorFinalSummaryPrompt
} from '../prompts/moderatorPrompts'
import {
  buildExpertInitialPrompt,
  buildExpertDebatePrompt
} from '../prompts/expertPrompts'
import { buildExpertVotePrompt } from '../prompts/votingPrompts'
import type { ChatMessage } from '../prompts/moderatorPrompts'

/**
 * OpenAI API 响应类型
 */
interface OpenAIResponse {
  id: string
  choices: Array<{
    message: {
      content: string | null
      role: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * OpenAI-Compatible Provider 配置
 */
interface OpenAIProviderOptions {
  providerId: string
  model: string
  thinkingEnabled?: boolean
}

/**
 * OpenAI-Compatible Provider
 *
 * 本类按辩论引擎 DebateModelProvider 接口实现，
 * 内部使用 Node.js fetch 调用 OpenAI-compatible API。
 */
export class OpenAICompatibleProvider implements DebateModelProvider {
  readonly name: string
  private providerId: string
  private model: string
  private thinkingEnabled: boolean

  constructor(options: OpenAIProviderOptions) {
    this.providerId = options.providerId
    this.model = options.model
    this.name = `openai_compatible:${options.providerId}/${options.model}`
    this.thinkingEnabled = options.thinkingEnabled ?? false
  }

  async generateModeratorOpening(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorOpeningPrompt(input)
    return this.callApi(messages)
  }

  async generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildExpertInitialPrompt(input)
    return this.callApi(messages)
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildExpertDebatePrompt(input)
    return this.callApi(messages)
  }

  async generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorRoundSummaryPrompt(input)
    return this.callApi(messages)
  }

  async generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorFinalSummaryPrompt(input)
    return this.callApi(messages)
  }

  async generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput> {
    const messages = buildExpertVotePrompt(input)
    const output = await this.callApi(messages)
    
    // 尝试从内容中提取 JSON
    let rawJson = output.content
    
    // 如果内容包含 markdown code block，提取 JSON
    const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      rawJson = jsonMatch[1].trim()
    }
    
    return { rawJson, usage: output.usage }
  }

  /**
   * 调用 OpenAI-compatible API
   * 通过 requestQueue 限制并发
   */
  private async callApi(messages: ChatMessage[]): Promise<DebateGenerateOutput> {
    return requestQueue.enqueue(this.providerId, async () => {
      const config = getProviderConfig(this.providerId)
      if (!config) {
        throw new Error(`Provider "${this.providerId}" 未配置。请在设置中配置 API Key。`)
      }
      if (!config.apiKey) {
        throw new Error(`Provider "${this.providerId}" 缺少 API Key。请在设置中配置。`)
      }
      if (!config.enabled) {
        throw new Error(`Provider "${this.providerId}" 已禁用。请在设置中启用。`)
      }

      // 确定 base URL
      const baseUrl = config.baseUrl || this.getDefaultBaseUrl()
      const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

      // 构建请求 body
      const body: Record<string, unknown> = {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 4096
      }

      // 构建 headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.defaultHeaders || {})
      }

      const timeout = config.timeout || 60000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        console.log(
          `[OpenAIProvider] 调用 ${this.providerId}/${this.model} - endpoint: ${baseUrl}`
        )

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error')
          // 过滤可能的敏感信息
          const safeErrorBody = this.sanitizeError(errorBody)
          throw new Error(
            `API 请求失败 (${response.status}): ${safeErrorBody}`
          )
        }

        const data = (await response.json()) as OpenAIResponse

        if (!data.choices || data.choices.length === 0) {
          throw new Error('API 返回了空的 choices')
        }

        const content = data.choices[0].message.content ?? ''

        return {
          content,
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
            throw new Error(
              `Provider "${this.providerId}" 请求超时 (${timeout / 1000}s)。请检查网络连接或增加超时时间。`
            )
          }
          // 确保错误消息不包含 API Key
          const safeMessage = this.sanitizeError(error.message)
          throw new Error(safeMessage)
        }
        throw new Error(`Provider "${this.providerId}" 调用失败: 未知错误`)
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  /**
   * 获取默认 base URL
   * 第 6 轮只支持 openai 和 openai_compatible
   * TODO: 第 7 轮扩展 deepseek/qwen/zhipu/kimi 的默认 baseUrl
   */
  private getDefaultBaseUrl(): string {
    switch (this.providerId) {
      case 'openai':
        return 'https://api.openai.com'
      case 'openai_compatible':
        // openai_compatible 必须由用户配置 baseUrl，默认用 OpenAI
        return 'https://api.openai.com'
      default:
        return 'https://api.openai.com'
    }
  }

  /**
   * 清理错误消息中的敏感信息
   */
  private sanitizeError(message: string): string {
    // 移除可能泄露的 API Key 模式
    return message
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****')
      .replace(/Bearer [a-zA-Z0-9\-_]+/g, 'Bearer ****')
      .replace(/api[_-]?key["\s:=]+["']?[a-zA-Z0-9\-_]+/gi, 'api_key=****')
  }
}

/**
 * 测试 Provider 连接
 * 发送一个简单请求来验证 API Key 和网络连接
 */
export async function testProviderConnection(providerId: string): Promise<{
  success: boolean
  message: string
  latencyMs?: number
}> {
  const config = getProviderConfig(providerId)
  if (!config) {
    return { success: false, message: `Provider "${providerId}" 未配置` }
  }
  if (!config.apiKey) {
    return { success: false, message: 'API Key 未配置' }
  }
  if (!config.enabled) {
    return { success: false, message: 'Provider 已禁用' }
  }

  const baseUrl = config.baseUrl || getDefaultBaseUrlForTest(providerId)
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.defaultHeaders || {})
  }

  const body = {
    model: getTestModel(providerId),
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 5
  }

  const timeout = Math.min(config.timeout || 15000, 15000) // 测试连接最多 15s
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
      // 清理敏感信息
      const safeError = errorBody
        .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****')
        .slice(0, 200)
      return {
        success: false,
        message: `API 返回错误 (${response.status}): ${safeError}`,
        latencyMs
      }
    }

    return {
      success: true,
      message: `连接成功 (${latencyMs}ms)`,
      latencyMs
    }
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, message: `连接超时 (${timeout / 1000}s)`, latencyMs }
    }
    const msg = error instanceof Error ? error.message : '未知错误'
    return {
      success: false,
      message: `连接失败: ${msg.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****')}`,
      latencyMs
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 第 6 轮只支持 openai / openai_compatible 的测试连接
 * TODO: 第 7 轮扩展 deepseek/qwen/zhipu/kimi 的默认 baseUrl
 */
function getDefaultBaseUrlForTest(providerId: string): string {
  switch (providerId) {
    case 'openai':
      return 'https://api.openai.com'
    case 'openai_compatible':
      return 'https://api.openai.com'
    default:
      return 'https://api.openai.com'
  }
}

/**
 * 第 6 轮只支持 openai / openai_compatible 的测试模型
 * TODO: 第 7 轮扩展 deepseek/qwen/zhipu/kimi 的 test model
 */
function getTestModel(providerId: string): string {
  switch (providerId) {
    case 'openai':
      return 'gpt-4o-mini'
    case 'openai_compatible':
      return 'gpt-4o-mini'
    default:
      return 'gpt-4o-mini'
  }
}
