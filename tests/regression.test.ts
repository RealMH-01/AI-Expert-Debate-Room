/**
 * Test Category 6: Regression Tests (Section XVI.6)
 *
 * Verifies:
 * - modelCatalog backward compatibility (PROVIDERS, findModel, etc.)
 * - shared/types.ts re-exports work
 * - IPC channel names haven't changed
 * - Provider default base URLs are correct
 * - Model display names are non-empty
 * - No provider with empty displayName
 */

import { describe, it, expect } from 'vitest'
import {
  MODEL_CATALOG,
  PROVIDERS,
  findModel,
  getModelsForProvider,
  getAllProviderIds
} from '../src/shared/modelCatalog'
import { IPC_CHANNELS } from '../src/main/ipc/channels'
import { PROVIDER_REGISTRY, MODEL_REGISTRY } from '../src/shared/providers/modelRegistry'

describe('Regression - modelCatalog backward compatibility', () => {
  // 6.1 PROVIDERS array should derive from PROVIDER_REGISTRY
  it('PROVIDERS should have same count as PROVIDER_REGISTRY', () => {
    expect(PROVIDERS.length).toBe(PROVIDER_REGISTRY.length)
  })

  // 6.2 MODEL_CATALOG should derive from MODEL_REGISTRY
  it('MODEL_CATALOG should have same count as MODEL_REGISTRY', () => {
    expect(MODEL_CATALOG.length).toBe(MODEL_REGISTRY.length)
  })

  // 6.3 findModel should find known models
  it('findModel should find OpenAI gpt-5.4-nano', () => {
    const m = findModel('openai', 'gpt-5.4-nano')
    expect(m).toBeDefined()
    expect(m!.displayName).toContain('GPT-5.4 Nano')
  })

  it('findModel should find Anthropic claude-opus-4-7', () => {
    const m = findModel('anthropic', 'claude-opus-4-7')
    expect(m).toBeDefined()
    expect(m!.displayName).toContain('Opus')
  })

  it('findModel should return undefined for unknown model', () => {
    const m = findModel('openai', 'nonexistent-model')
    expect(m).toBeUndefined()
  })

  // 6.4 getModelsForProvider backward compatibility
  it('getModelsForProvider should return ModelInfo[]', () => {
    const models = getModelsForProvider('openai')
    expect(models.length).toBeGreaterThan(0)
    for (const m of models) {
      expect(m.provider).toBe('openai')
      expect(m.model).toBeTruthy()
      expect(m.displayName).toBeTruthy()
      expect(typeof m.supportsThinking).toBe('boolean')
    }
  })

  // 6.5 getAllProviderIds backward compatibility
  it('getAllProviderIds should return all 9 IDs', () => {
    const ids = getAllProviderIds()
    expect(ids.length).toBe(9)
    expect(ids).toContain('mock')
    expect(ids).toContain('openai')
  })

  // 6.6 Each PROVIDERS entry has models array
  it('each PROVIDERS entry should have models array', () => {
    for (const p of PROVIDERS) {
      expect(p.id).toBeTruthy()
      expect(p.displayName).toBeTruthy()
      expect(Array.isArray(p.models)).toBe(true)
      expect(p.models.length).toBeGreaterThan(0)
    }
  })
})

describe('Regression - IPC Channel Names', () => {
  // 6.7 Critical IPC channels should not have changed
  it('should have all required provider IPC channels', () => {
    expect(IPC_CHANNELS.PROVIDER_GET_ALL_CONFIGS).toBe('provider:get-all-configs')
    expect(IPC_CHANNELS.PROVIDER_GET_CONFIG).toBe('provider:get-config')
    expect(IPC_CHANNELS.PROVIDER_SAVE_CONFIG).toBe('provider:save-config')
    expect(IPC_CHANNELS.PROVIDER_DELETE_CONFIG).toBe('provider:delete-config')
    expect(IPC_CHANNELS.PROVIDER_TEST_CONNECTION).toBe('provider:test-connection')
  })

  // 6.8 New channels added in Phase 2
  it('should have new model refresh IPC channels', () => {
    expect(IPC_CHANNELS.PROVIDER_REFRESH_MODELS).toBe('provider:refresh-models')
    expect(IPC_CHANNELS.PROVIDER_GET_CACHED_MODELS).toBe('provider:get-cached-models')
  })

  // 6.9 Core debate channels unchanged
  it('should preserve core debate IPC channels', () => {
    expect(IPC_CHANNELS.DEBATE_VALIDATE).toBe('debate:validate')
    expect(IPC_CHANNELS.DEBATE_START).toBe('debate:start')
    expect(IPC_CHANNELS.DEBATE_IS_RUNNING).toBe('debate:is-running')
  })

  // 6.10 Room channels unchanged
  it('should preserve room IPC channels', () => {
    expect(IPC_CHANNELS.ROOM_GET_ALL).toBe('room:get-all')
    expect(IPC_CHANNELS.ROOM_CREATE).toBe('room:create')
    expect(IPC_CHANNELS.ROOM_DELETE).toBe('room:delete')
  })
})

describe('Regression - Provider Default URLs', () => {
  // 6.11 Default base URLs are correct for each provider
  it('OpenAI default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'openai')!
    expect(p.defaultBaseUrl).toBe('https://api.openai.com/v1')
  })

  it('Anthropic default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'anthropic')!
    expect(p.defaultBaseUrl).toBe('https://api.anthropic.com')
  })

  it('Google Gemini default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'google')!
    expect(p.defaultBaseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
  })

  it('DeepSeek default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'deepseek')!
    expect(p.defaultBaseUrl).toBe('https://api.deepseek.com')
  })

  it('Qwen/DashScope default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'qwen')!
    expect(p.defaultBaseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
  })

  it('BigModel default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'bigmodel')!
    expect(p.defaultBaseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
  })

  it('Moonshot default URL should be correct', () => {
    const p = PROVIDER_REGISTRY.find(p => p.id === 'moonshot')!
    expect(p.defaultBaseUrl).toBe('https://api.moonshot.cn/v1')
  })
})

describe('Regression - No empty display names', () => {
  // 6.12 All providers have non-empty displayName
  it('all providers should have displayName', () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.displayName.trim().length).toBeGreaterThan(0)
    }
  })

  // 6.13 All models have non-empty displayName
  it('all models should have displayName', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.displayName.trim().length).toBeGreaterThan(0)
    }
  })
})
