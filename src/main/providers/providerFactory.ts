/**
 * Provider Factory - Provider 工厂
 *
 * Round 7 Phase 2: Strict routing per Sections VIII and XIII.
 *
 * Routes:
 * - mock -> MockProvider
 * - openai -> OpenAIAdapter
 * - openai_compatible -> OpenAICompatibleAdapter
 * - anthropic -> AnthropicAdapter
 * - google -> GeminiAdapter
 * - deepseek -> DeepSeekAdapter
 * - qwen -> QwenAdapter
 * - bigmodel -> BigModelAdapter
 * - moonshot -> MoonshotAdapter
 * - Unknown provider -> throws error (never silently falls back to Mock)
 *
 * Design principles:
 * - DebateEngine routes by each speaking agent's provider/model
 * - No global real Provider override for all agents
 * - Unimplemented/unknown providers throw errors
 * - Stub models always blocked
 * - Unverified/custom models require: allowUnverifiedModels=true + successful test
 */

import type { DebateModelProvider } from './base'
import type { Agent } from '../../shared/types'
import { getMockProvider } from './mockProvider'
import {
  OpenAIAdapter,
  OpenAICompatibleAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  DeepSeekAdapter,
  QwenAdapter,
  BigModelAdapter,
  MoonshotAdapter
} from './adapters'
import {
  isProviderConfigured,
  getProviderConfig,
  getProviderAllowUnverified
} from './providerSettings'
import { findModelCapability, isModelUsableForMeeting } from '../../shared/providers/modelRegistry'

/** All known provider IDs that have real implementations */
const IMPLEMENTED_PROVIDERS: string[] = [
  'openai',
  'openai_compatible',
  'anthropic',
  'google',
  'deepseek',
  'qwen',
  'bigmodel',
  'moonshot'
]

/** Cache of created Provider instances (key: `${providerId}:${model}`) */
const providerCache = new Map<string, DebateModelProvider>()

/**
 * Get the DebateModelProvider for an agent based on its provider/model configuration.
 *
 * Section VIII: Strict routing. Unknown provider/model throws, never fallback to Mock.
 */
export function getProviderForAgent(agent: Agent): DebateModelProvider {
  const providerId = agent.provider || 'mock'
  const model = agent.model || 'mock-basic'

  // Mock always returns MockProvider
  if (providerId === 'mock') {
    return getMockProvider()
  }

  // Strict: unknown provider throws
  if (!IMPLEMENTED_PROVIDERS.includes(providerId)) {
    throw new Error(
      `Provider "${providerId}" is unknown. Supported providers: mock, ${IMPLEMENTED_PROVIDERS.join(', ')}`
    )
  }

  // Cache key
  const cacheKey = `${providerId}:${model}`
  const cached = providerCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const thinkingEnabled = agent.thinking_enabled === 1
  let provider: DebateModelProvider

  switch (providerId) {
    case 'openai':
      provider = new OpenAIAdapter(model, thinkingEnabled)
      break
    case 'openai_compatible':
      provider = new OpenAICompatibleAdapter(model, thinkingEnabled)
      break
    case 'anthropic':
      provider = new AnthropicAdapter(model, thinkingEnabled)
      break
    case 'google':
      provider = new GeminiAdapter(model, thinkingEnabled)
      break
    case 'deepseek':
      provider = new DeepSeekAdapter(model, thinkingEnabled)
      break
    case 'qwen':
      provider = new QwenAdapter(model, thinkingEnabled)
      break
    case 'bigmodel':
      provider = new BigModelAdapter(model, thinkingEnabled)
      break
    case 'moonshot':
      provider = new MoonshotAdapter(model, thinkingEnabled)
      break
    default:
      // Completely unknown provider - throw error, never silently fall back to Mock
      throw new Error(
        `Provider "${providerId}" is unknown. Supported providers: mock, ${IMPLEMENTED_PROVIDERS.join(', ')}`
      )
  }

  providerCache.set(cacheKey, provider)
  return provider
}

/**
 * Validate that all real Providers for a list of agents are properly configured.
 * Called before starting a meeting (Section XIII: Strict Meeting Preflight).
 *
 * Checks per agent:
 * 1. Provider is known/implemented
 * 2. API key is configured and provider is enabled
 * 3. Model exists in registry OR is custom model
 * 4. Model status is not 'stub'
 * 5. If model is 'unverified' or custom: allowUnverifiedModels must be true
 * 6. If model is unverified/custom + allowUnverifiedModels: last test must be 'success'
 *
 * @returns Error list. Empty array means all providers are ready.
 */
export function validateProvidersReady(agents: Agent[]): string[] {
  const errors: string[] = []
  const checkedProviders = new Set<string>()

  for (const agent of agents) {
    const providerId = agent.provider || 'mock'
    const model = agent.model || ''

    if (providerId === 'mock') continue

    // --- Provider-level checks (once per provider) ---
    if (!checkedProviders.has(providerId)) {
      checkedProviders.add(providerId)

      // Check 1: Provider is known
      if (!IMPLEMENTED_PROVIDERS.includes(providerId)) {
        errors.push(
          `Provider "${providerId}" is unknown. Supported: mock, ${IMPLEMENTED_PROVIDERS.join(', ')}. (Agent: ${agent.name})`
        )
        continue
      }

      // Check 2: API key configured
      if (!isProviderConfigured(providerId)) {
        errors.push(
          `Provider "${providerId}" 未配置 API Key。请在"设置 > Provider 配置"中配置 ${providerId} 的 API Key 后再启动会议。（相关 Agent: ${agent.name}）`
        )
      }
    }

    // --- Model-level checks (per agent) ---
    if (!model) {
      errors.push(`Agent "${agent.name}" 未选择模型。`)
      continue
    }

    const allowUnverified = getProviderAllowUnverified(providerId)
    const usability = isModelUsableForMeeting(providerId, model, allowUnverified)

    if (!usability.allowed) {
      errors.push(`${usability.reason} (Agent: ${agent.name})`)
      continue
    }

    // Check for unverified/custom models: require successful test
    const capability = findModelCapability(providerId, model)
    const isCustomOrUnverified = !capability || capability.status === 'unverified'

    if (isCustomOrUnverified && allowUnverified) {
      // Must have a successful test result
      const config = getProviderConfig(providerId)
      if (config?.lastTestStatus !== 'success') {
        errors.push(
          `Provider "${providerId}" 的 unverified 模型 "${model}" 需要先通过连接测试。请在"设置 > Provider 配置"中测试连接。（Agent: ${agent.name}）`
        )
      }
    }
  }

  return errors
}

/**
 * Clear Provider cache.
 * Called when Provider configuration is updated.
 */
export function clearProviderCache(): void {
  providerCache.clear()
}
