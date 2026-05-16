/**
 * Provider Factory - Provider 工厂
 *
 * 根据 agent 的 provider/model 配置返回对应的 DebateModelProvider 实例。
 *
 * 路由规则（第 6 轮）：
 * - provider === 'mock' -> MockProvider
 * - provider === 'openai' 或 'openai_compatible' -> OpenAICompatibleProvider
 * - 其他 provider（anthropic/gemini/deepseek/qwen/zhipu/kimi）-> 抛错，第 7 轮扩展
 * - Mock 角色继续走 MockProvider，不受真实 Provider 影响
 *
 * 设计原则：
 * - DebateEngine 按当前发言 agent 的 provider/model 选择 Provider
 * - 不用全局真实 Provider 覆盖整场会议所有角色
 * - 未实现的 Provider 直接抛错，不会静默回退 Mock
 */

import type { DebateModelProvider } from './base'
import type { Agent } from '../../shared/types'
import { getMockProvider } from './mockProvider'
import { OpenAICompatibleProvider } from './openaiCompatibleProvider'
import { isProviderConfigured } from './providerSettings'

/** 第 6 轮已实现的真实 Provider 列表 */
const ROUND6_IMPLEMENTED_PROVIDERS = ['openai', 'openai_compatible']

/** 第 7 轮待扩展的 Provider（当前未实现，选择会报错） */
const ROUND7_PENDING_PROVIDERS = ['anthropic', 'gemini', 'deepseek', 'qwen', 'zhipu', 'kimi']

/** 缓存已创建的 Provider 实例 (key: `${providerId}:${model}`) */
const providerCache = new Map<string, DebateModelProvider>()

/**
 * 根据 Agent 配置获取对应的 Provider 实例
 */
export function getProviderForAgent(agent: Agent): DebateModelProvider {
  const providerId = agent.provider || 'mock'
  const model = agent.model || 'mock-basic'

  // Mock 永远返回 MockProvider
  if (providerId === 'mock') {
    return getMockProvider()
  }

  // 缓存 key
  const cacheKey = `${providerId}:${model}`
  const cached = providerCache.get(cacheKey)
  if (cached) {
    return cached
  }

  // 第 6 轮：只有 openai / openai_compatible 走真实 Provider
  if (ROUND6_IMPLEMENTED_PROVIDERS.includes(providerId)) {
    const provider = new OpenAICompatibleProvider({
      providerId,
      model,
      thinkingEnabled: agent.thinking_enabled === 1
    })
    providerCache.set(cacheKey, provider)
    return provider
  }

  // 未实现的 Provider（第 7 轮扩展）- 直接抛错，不静默回退 Mock
  if (ROUND7_PENDING_PROVIDERS.includes(providerId)) {
    throw new Error(
      `Provider "${providerId}" is not implemented in Round 6. Please use mock/openai/openai_compatible.`
    )
  }

  // 完全未知的 provider - 抛错
  throw new Error(
    `Provider "${providerId}" is not implemented in Round 6. Please use mock/openai/openai_compatible.`
  )
}

/**
 * 校验 Agent 列表中所有真实 Provider 是否已配置 API Key
 *
 * 在启动会议前调用，如果有 agent 选择了真实 provider 但缺少 API Key，
 * 返回错误列表。
 *
 * @returns 错误列表。空数组表示所有 provider 已就绪。
 */
export function validateProvidersReady(agents: Agent[]): string[] {
  const errors: string[] = []
  const checked = new Set<string>()

  for (const agent of agents) {
    const providerId = agent.provider || 'mock'
    if (providerId === 'mock') continue
    if (checked.has(providerId)) continue
    checked.add(providerId)

    // 第 6 轮：未实现的 Provider 直接报错
    if (!ROUND6_IMPLEMENTED_PROVIDERS.includes(providerId)) {
      errors.push(
        `Provider "${providerId}" is not implemented in Round 6. Please use mock/openai/openai_compatible.（相关 Agent: ${agent.name}）`
      )
      continue
    }

    if (!isProviderConfigured(providerId)) {
      errors.push(
        `Provider "${providerId}" 未配置 API Key。请在"设置 > Provider 配置"中配置 ${providerId} 的 API Key 后再启动会议。（相关 Agent: ${agent.name}）`
      )
    }
  }

  return errors
}

/**
 * 清除 Provider 缓存
 * 在 Provider 配置更新时调用
 */
export function clearProviderCache(): void {
  providerCache.clear()
}
