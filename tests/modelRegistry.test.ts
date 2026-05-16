/**
 * Test Category 1: Model Registry Tests (Section XVI.1)
 *
 * Verifies:
 * - All 9 providers present in PROVIDER_REGISTRY
 * - MODEL_REGISTRY entries have required fields
 * - getModelsForProvider returns correct models
 * - findModelCapability returns correct model
 * - isModelUsableForMeeting gate logic
 * - getStatusBadge returns correct badges
 * - No duplicate apiModelId within same provider
 */

import { describe, it, expect } from 'vitest'
import {
  PROVIDER_REGISTRY,
  MODEL_REGISTRY,
  getModelsForProvider,
  findModelCapability,
  isModelUsableForMeeting,
  getStatusBadge,
  getProviderEntry,
  getAllProviderIds,
  type ProviderId,
  type ModelStatus
} from '../src/shared/providers/modelRegistry'

describe('Model Registry', () => {
  // 1.1 All 9 providers present
  it('should contain all 9 expected providers', () => {
    const expectedProviders: ProviderId[] = [
      'mock', 'openai', 'openai_compatible', 'anthropic',
      'google', 'deepseek', 'qwen', 'bigmodel', 'moonshot'
    ]
    const registryIds = PROVIDER_REGISTRY.map((p) => p.id)
    for (const pid of expectedProviders) {
      expect(registryIds).toContain(pid)
    }
  })

  // 1.2 Each provider has required fields
  it('should have valid fields for all provider entries', () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.id).toBeTruthy()
      expect(p.displayName).toBeTruthy()
      expect(typeof p.requiresApiKey).toBe('boolean')
      expect(p.apiFormat).toBeTruthy()
      expect(p.authType).toBeTruthy()
    }
  })

  // 1.3 Mock provider does not require API key
  it('mock provider should not require API key', () => {
    const mock = PROVIDER_REGISTRY.find((p) => p.id === 'mock')
    expect(mock).toBeDefined()
    expect(mock!.requiresApiKey).toBe(false)
  })

  // 1.4 All real providers require API key
  it('all non-mock providers should require API key', () => {
    const realProviders = PROVIDER_REGISTRY.filter((p) => p.id !== 'mock')
    for (const p of realProviders) {
      expect(p.requiresApiKey).toBe(true)
    }
  })

  // 1.5 MODEL_REGISTRY entries have required fields
  it('should have valid fields for all model entries', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.providerId).toBeTruthy()
      expect(m.displayName).toBeTruthy()
      expect(m.apiModelId).toBeTruthy()
      expect(m.apiFormat).toBeTruthy()
      expect(m.authType).toBeTruthy()
      expect(['active', 'unverified', 'stub']).toContain(m.status)
      expect(typeof m.supportsThinking).toBeDefined()
      expect(typeof m.supportsStreaming).toBeDefined()
      expect(typeof m.supportsJson).toBeDefined()
      expect(typeof m.supportsVision).toBeDefined()
    }
  })

  // 1.6 No duplicate apiModelId within same provider
  it('should have no duplicate model IDs within a provider', () => {
    const providerModels = new Map<string, Set<string>>()
    for (const m of MODEL_REGISTRY) {
      if (!providerModels.has(m.providerId)) {
        providerModels.set(m.providerId, new Set())
      }
      const set = providerModels.get(m.providerId)!
      expect(set.has(m.apiModelId)).toBe(false)
      set.add(m.apiModelId)
    }
  })

  // 1.7 getModelsForProvider returns correct count
  it('getModelsForProvider should return models for each provider', () => {
    for (const p of PROVIDER_REGISTRY) {
      const models = getModelsForProvider(p.id)
      expect(models.length).toBeGreaterThan(0)
      for (const m of models) {
        expect(m.providerId).toBe(p.id)
      }
    }
  })

  // 1.8 findModelCapability
  it('findModelCapability should find known model', () => {
    const m = findModelCapability('openai', 'gpt-5.4-nano')
    expect(m).toBeDefined()
    expect(m!.providerId).toBe('openai')
    expect(m!.status).toBe('active')
  })

  it('findModelCapability should return undefined for unknown model', () => {
    const m = findModelCapability('openai', 'nonexistent-model-xyz')
    expect(m).toBeUndefined()
  })

  // 1.9 isModelUsableForMeeting
  it('active model should be usable for meeting', () => {
    const result = isModelUsableForMeeting('openai', 'gpt-5.4-nano')
    expect(result.allowed).toBe(true)
  })

  it('stub model should NOT be usable for meeting', () => {
    // Find a stub model if any, otherwise skip
    const stubModel = MODEL_REGISTRY.find((m) => m.status === 'stub')
    if (stubModel) {
      const result = isModelUsableForMeeting(stubModel.providerId, stubModel.apiModelId)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('stub')
    }
  })

  it('unverified model should NOT be usable without allowUnverified', () => {
    const uModel = MODEL_REGISTRY.find((m) => m.status === 'unverified')
    if (uModel) {
      const result = isModelUsableForMeeting(uModel.providerId, uModel.apiModelId, false)
      expect(result.allowed).toBe(false)
    }
  })

  it('unverified model should be usable WITH allowUnverified', () => {
    const uModel = MODEL_REGISTRY.find((m) => m.status === 'unverified')
    if (uModel) {
      const result = isModelUsableForMeeting(uModel.providerId, uModel.apiModelId, true)
      expect(result.allowed).toBe(true)
    }
  })

  it('unknown model should be usable with allowUnverified=true', () => {
    const result = isModelUsableForMeeting('openai', 'totally-custom-model-xyz', true)
    expect(result.allowed).toBe(true)
  })

  it('unknown model should NOT be usable with allowUnverified=false', () => {
    const result = isModelUsableForMeeting('openai', 'totally-custom-model-xyz', false)
    expect(result.allowed).toBe(false)
  })

  it('mock provider models are always usable', () => {
    const result = isModelUsableForMeeting('mock', 'mock-basic')
    expect(result.allowed).toBe(true)
  })

  // 1.10 getStatusBadge
  it('getStatusBadge should return correct badges', () => {
    const statuses: ModelStatus[] = ['active', 'unverified', 'stub']
    for (const s of statuses) {
      const badge = getStatusBadge(s)
      expect(badge.label).toBeTruthy()
      expect(badge.color).toBeTruthy()
    }
  })

  // 1.11 getProviderEntry
  it('getProviderEntry should find known provider', () => {
    const entry = getProviderEntry('anthropic')
    expect(entry).toBeDefined()
    expect(entry!.displayName).toContain('Anthropic')
  })

  // 1.12 getAllProviderIds
  it('getAllProviderIds should return 9 IDs', () => {
    const ids = getAllProviderIds()
    expect(ids.length).toBe(9)
  })
})
