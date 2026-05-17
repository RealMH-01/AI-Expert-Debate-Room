import { describe, expect, it } from 'vitest'

import {
  ACTIVE_MODEL_SEED,
  PROVIDER_DEFINITIONS,
  createCustomModelCapability,
  getModelCapability,
  getProviderDefinition,
  isProviderId,
  modelCanBeTested
} from '../../src/shared/providers/modelRegistry'

describe('Round 7 model registry', () => {
  it('keeps every active seed complete and scoped to known providers', () => {
    const providerIds = new Set(PROVIDER_DEFINITIONS.map((provider) => provider.id))

    expect(providerIds.has('bigmodel')).toBe(true)
    expect(providerIds.has('zhipu')).toBe(false)

    for (const model of ACTIVE_MODEL_SEED) {
      expect(isProviderId(model.providerId)).toBe(true)
      expect(providerIds.has(model.providerId)).toBe(true)
      expect(model.providerDisplayName).not.toBe('')
      expect(model.displayName).not.toBe('')
      expect(model.apiModelId).not.toBe('')
      expect(model.apiFormat).not.toBe('')
      expect(model.defaultBaseUrl).not.toBe('')
      expect(model.status).toBe('active')
    }
  })

  it('uses the Round 7 static active seed only', () => {
    expect(getModelCapability('openai', 'gpt-5.5')?.status).toBe('active')
    expect(getModelCapability('anthropic', 'claude-haiku-4-5-20251001')?.status).toBe('active')
    expect(getModelCapability('google', 'gemini-3-flash-preview')?.status).toBe('active')
    expect(getModelCapability('deepseek', 'deepseek-v4-pro')?.status).toBe('active')
    expect(getModelCapability('qwen', 'qwen3.6-max-preview')?.status).toBe('active')
    expect(getModelCapability('bigmodel', 'glm-5.1')?.status).toBe('active')
    expect(getModelCapability('moonshot', 'kimi-k2.6')?.status).toBe('active')

    expect(getModelCapability('openai', 'gpt-4o')?.status).not.toBe('active')
    expect(getModelCapability('deepseek', 'deepseek-chat')?.status).not.toBe('active')
    expect(getModelCapability('bigmodel', 'glm-default')).toBeUndefined()
  })

  it('marks custom models unverified and blocks stub testing', () => {
    const custom = createCustomModelCapability('qwen', 'my-qwen-model')
    expect(custom.status).toBe('unverified')
    expect(custom.notes).toContain('user-provided')

    expect(modelCanBeTested(custom)).toBe(true)
    expect(modelCanBeTested({ ...custom, status: 'stub' })).toBe(false)
  })

  it('keeps preview models visible without making them default recommendations', () => {
    const geminiPreview = getModelCapability('google', 'gemini-3-flash-preview')
    const qwenPreview = getModelCapability('qwen', 'qwen3.6-max-preview')

    expect(geminiPreview?.notes?.toLowerCase()).toContain('preview')
    expect(qwenPreview?.notes?.toLowerCase()).toContain('preview')
    expect(getProviderDefinition('google')?.defaultModelId).toBeUndefined()
    expect(getProviderDefinition('qwen')?.defaultModelId).toBeUndefined()
  })
})
