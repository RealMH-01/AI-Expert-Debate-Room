import { describe, expect, it } from 'vitest'

import {
  maskApiKey,
  sanitizeProviderConfigForRenderer,
  sanitizeSensitiveData
} from '../../src/main/providers/providerSettings'
import {
  getAdapterClassNameForProvider,
  validateAgentProviderConfig
} from '../../src/main/providers/providerFactory'
import type { Agent } from '../../src/shared/types'

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: 'agent-1',
    room_id: 'room-1',
    role: 'expert',
    name: 'Expert',
    provider: 'mock',
    model: 'mock-basic',
    persona: null,
    domain: null,
    stance: null,
    memory: null,
    supports_thinking: 0,
    thinking_enabled: 0,
    hp: 100,
    max_hp: 100,
    influence: 0,
    prestige: 0,
    status: 'active',
    aggression: 50,
    created_at: '',
    updated_at: '',
    ...overrides
  }
}

describe('Round 7 API key safety and meeting preflight', () => {
  it('routes every supported provider to its adapter without fallback', () => {
    expect(getAdapterClassNameForProvider('mock')).toBe('MockAdapter')
    expect(getAdapterClassNameForProvider('openai')).toBe('OpenAIAdapter')
    expect(getAdapterClassNameForProvider('openai_compatible')).toBe('OpenAICompatibleAdapter')
    expect(getAdapterClassNameForProvider('anthropic')).toBe('AnthropicAdapter')
    expect(getAdapterClassNameForProvider('google')).toBe('GeminiAdapter')
    expect(getAdapterClassNameForProvider('deepseek')).toBe('DeepSeekAdapter')
    expect(getAdapterClassNameForProvider('qwen')).toBe('QwenAdapter')
    expect(getAdapterClassNameForProvider('bigmodel')).toBe('BigModelAdapter')
    expect(getAdapterClassNameForProvider('moonshot')).toBe('MoonshotAdapter')
  })

  it('never returns plaintext keys in renderer-safe provider config', () => {
    const safe = sanitizeProviderConfigForRenderer({
      providerId: 'openai',
      apiKey: 'sk-test-secret-token-value',
      baseUrl: 'https://api.openai.com/v1',
      defaultHeaders: { Authorization: 'Bearer very-secret', 'x-api-key': 'secret' },
      timeout: 15000,
      enabled: true,
      allowUnverifiedModels: false
    })

    expect(safe.hasApiKey).toBe(true)
    expect(safe.maskedKey).toBe(maskApiKey('sk-test-secret-token-value'))
    expect(JSON.stringify(safe)).not.toContain('sk-test-secret-token-value')
    expect(JSON.stringify(safe)).not.toContain('very-secret')
  })

  it('redacts sensitive fields and nested default headers for JSON export', () => {
    const redacted = sanitizeSensitiveData({
      apiKey: 'sk-real-key',
      token: 'token-value',
      nested: {
        Authorization: 'Bearer secret',
        'x-api-key': 'x-secret',
        'x-goog-api-key': 'goog-secret',
        defaultHeaders: { auth: 'auth-secret', normal: 'kept' }
      }
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('sk-real-key')
    expect(serialized).not.toContain('token-value')
    expect(serialized).not.toContain('Bearer secret')
    expect(serialized).not.toContain('x-secret')
    expect(serialized).not.toContain('goog-secret')
    expect(serialized).not.toContain('auth-secret')
  })

  it('blocks invalid provider/model combinations before real meetings', () => {
    expect(validateAgentProviderConfig(agent({
      provider: 'unknown',
      model: 'whatever'
    }), { providerConfigured: true }).ok).toBe(false)

    expect(validateAgentProviderConfig(agent({
      provider: 'openai',
      model: 'not-in-registry'
    }), { providerConfigured: true }).ok).toBe(false)

    expect(validateAgentProviderConfig(agent({
      provider: 'openai',
      model: 'gpt-5.5'
    }), { providerConfigured: false }).ok).toBe(false)
  })

  it('allows mock only when explicitly selected and keeps unverified models gated', () => {
    expect(validateAgentProviderConfig(agent({
      provider: 'mock',
      model: 'mock-basic'
    }), { providerConfigured: false }).ok).toBe(true)

    expect(validateAgentProviderConfig(agent({
      provider: 'qwen',
      model: 'custom-qwen'
    }), {
      providerConfigured: true,
      allowUnverifiedModels: false,
      lastTestStatus: 'success'
    }).ok).toBe(false)

    expect(validateAgentProviderConfig(agent({
      provider: 'qwen',
      model: 'custom-qwen'
    }), {
      providerConfigured: true,
      allowUnverifiedModels: true,
      lastTestStatus: 'failure'
    }).ok).toBe(false)

    expect(validateAgentProviderConfig(agent({
      provider: 'qwen',
      model: 'custom-qwen'
    }), {
      providerConfigured: true,
      allowUnverifiedModels: true,
      lastTestStatus: 'success'
    }).ok).toBe(true)
  })
})
