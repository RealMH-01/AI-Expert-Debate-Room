import type { DebateModelProvider } from './base'
import type { Agent } from '../../shared/types'
import type { ProviderId } from '../../shared/providers/modelRegistry'
import {
  createCustomModelCapability,
  getModelCapability,
  getProviderDefinition,
  isProviderId
} from '../../shared/providers/modelRegistry'
import { getMockProvider } from './mockProvider'
import { isProviderConfigured, getProviderConfig } from './providerSettings'
import { OpenAIAdapter } from './adapters/OpenAIAdapter'
import { OpenAICompatibleAdapter } from './adapters/OpenAICompatibleAdapter'
import { AnthropicAdapter } from './adapters/AnthropicAdapter'
import { GeminiAdapter } from './adapters/GeminiAdapter'
import { DeepSeekAdapter } from './adapters/DeepSeekAdapter'
import { QwenAdapter } from './adapters/QwenAdapter'
import { BigModelAdapter } from './adapters/BigModelAdapter'
import { MoonshotAdapter } from './adapters/MoonshotAdapter'

const providerCache = new Map<string, DebateModelProvider>()

export type AgentProviderValidationContext = {
  providerConfigured?: boolean
  providerEnabled?: boolean
  allowUnverifiedModels?: boolean
  lastTestStatus?: 'success' | 'failure'
  lastTestedModel?: string
}

export type AgentProviderValidationResult = {
  ok: boolean
  reason?: string
}

export function validateAgentProviderConfig(
  agent: Pick<Agent, 'name' | 'provider' | 'model'>,
  context: AgentProviderValidationContext = {}
): AgentProviderValidationResult {
  const providerId = agent.provider
  const modelId = agent.model
  if (!providerId) return { ok: false, reason: `${agent.name}: missing providerId` }
  if (!modelId) return { ok: false, reason: `${agent.name}: missing model` }
  if (!isProviderId(providerId)) {
    return { ok: false, reason: `${agent.name}: unknown provider "${providerId}"` }
  }
  if (providerId === 'mock') {
    return modelId.startsWith('mock-')
      ? { ok: true }
      : { ok: false, reason: `${agent.name}: unknown mock model "${modelId}"` }
  }

  const provider = getProviderDefinition(providerId)
  if (!provider?.adapterImplemented) {
    return { ok: false, reason: `${agent.name}: adapter not implemented for ${providerId}` }
  }
  if (context.providerEnabled === false) {
    return { ok: false, reason: `${agent.name}: provider ${providerId} is disabled` }
  }
  if (context.providerConfigured === false) {
    return { ok: false, reason: `${agent.name}: provider ${providerId} is missing API Key` }
  }

  const staticCapability = getModelCapability(providerId, modelId)
  const capability = staticCapability ?? createCustomModelCapability(providerId, modelId)
  if (capability.status === 'stub') {
    return { ok: false, reason: `${agent.name}: model ${modelId} is a stub and cannot run` }
  }
  if (capability.status === 'active') {
    return { ok: true }
  }
  if (!context.allowUnverifiedModels) {
    return { ok: false, reason: `${agent.name}: model ${modelId} is unverified` }
  }
  if (context.lastTestStatus !== 'success' || context.lastTestedModel !== modelId) {
    return {
      ok: false,
      reason: `${agent.name}: unverified model ${modelId} has not passed connection test for this exact model`
    }
  }
  return { ok: true }
}

export function getProviderForAgent(agent: Agent): DebateModelProvider {
  const providerId = agent.provider
  const model = agent.model
  if (!providerId || !model) {
    throw new Error(`Agent "${agent.name}" must select provider and model before debate.`)
  }
  if (!isProviderId(providerId)) {
    throw new Error(`Unknown provider "${providerId}".`)
  }

  if (providerId === 'mock') {
    return getMockProvider()
  }

  const cacheKey = `${providerId}:${model}:${agent.thinking_enabled}`
  const cached = providerCache.get(cacheKey)
  if (cached) return cached

  const thinkingEnabled = agent.thinking_enabled === 1
  let provider: DebateModelProvider
  switch (providerId) {
    case 'openai':
      provider = new OpenAIAdapter({ model, thinkingEnabled })
      break
    case 'openai_compatible':
      provider = new OpenAICompatibleAdapter({ providerId, model, thinkingEnabled })
      break
    case 'anthropic':
      provider = new AnthropicAdapter({ model, thinkingEnabled })
      break
    case 'google':
      provider = new GeminiAdapter({ model, thinkingEnabled })
      break
    case 'deepseek':
      provider = new DeepSeekAdapter({ model, thinkingEnabled })
      break
    case 'qwen':
      provider = new QwenAdapter({ model, thinkingEnabled })
      break
    case 'bigmodel':
      provider = new BigModelAdapter({ model, thinkingEnabled })
      break
    case 'moonshot':
      provider = new MoonshotAdapter({ model, thinkingEnabled })
      break
    default:
      throw new Error(`Unknown provider "${providerId}".`)
  }

  providerCache.set(cacheKey, provider)
  return provider
}

export function validateProvidersReady(agents: Agent[]): string[] {
  const errors: string[] = []

  for (const agent of agents) {
    const providerId = agent.provider
    if (providerId === 'mock') {
      const result = validateAgentProviderConfig(agent)
      if (!result.ok) errors.push(result.reason ?? `Invalid mock model for ${agent.name}`)
      continue
    }
    if (!providerId || !isProviderId(providerId)) {
      errors.push(`${agent.name}: unknown provider "${providerId ?? ''}"`)
      continue
    }
    const config = getProviderConfig(providerId)
    const result = validateAgentProviderConfig(agent, {
      providerConfigured: isProviderConfigured(providerId),
      providerEnabled: config?.enabled !== false,
      allowUnverifiedModels: config?.allowUnverifiedModels ?? false,
      lastTestStatus: config?.lastTestStatus,
      lastTestedModel: config?.lastTestedModel
    })
    if (!result.ok) {
      errors.push(result.reason ?? `Invalid provider/model for ${agent.name}`)
    }
  }

  return errors
}

export function clearProviderCache(): void {
  providerCache.clear()
}

export function getAdapterClassNameForProvider(providerId: ProviderId): string {
  switch (providerId) {
    case 'mock':
      return 'MockAdapter'
    case 'openai':
      return 'OpenAIAdapter'
    case 'openai_compatible':
      return 'OpenAICompatibleAdapter'
    case 'anthropic':
      return 'AnthropicAdapter'
    case 'google':
      return 'GeminiAdapter'
    case 'deepseek':
      return 'DeepSeekAdapter'
    case 'qwen':
      return 'QwenAdapter'
    case 'bigmodel':
      return 'BigModelAdapter'
    case 'moonshot':
      return 'MoonshotAdapter'
  }
}
