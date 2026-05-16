/**
 * Test Category 5: Adapter Request Mapping Tests (Section XVI.5)
 *
 * Verifies:
 * - Each adapter maps models to correct provider registry entries
 * - Thinking mode parameter mapping per provider
 * - Provider-specific API format matching
 * - Error classification logic
 */

import { describe, it, expect } from 'vitest'
import {
  MODEL_REGISTRY,
  PROVIDER_REGISTRY,
  findModelCapability
} from '../src/shared/providers/modelRegistry'
import { classifyTestError } from '../src/main/providers/types'

describe('Adapter Request Mapping', () => {
  // 5.1 DeepSeek thinking models with thinkingParam defined should use thinking.type
  it('DeepSeek active thinking models should use thinking.type + reasoning_effort', () => {
    const dsModels = MODEL_REGISTRY.filter(
      m => m.providerId === 'deepseek' && m.supportsThinking === true && m.thinkingParam
    )
    expect(dsModels.length).toBeGreaterThan(0)
    for (const m of dsModels) {
      expect(m.thinkingParam).toContain('thinking.type')
    }
  })

  // 5.2 Qwen thinking models use enable_thinking + thinking_budget
  it('Qwen models should use enable_thinking + thinking_budget', () => {
    const qwenModels = MODEL_REGISTRY.filter(
      m => m.providerId === 'qwen' && m.supportsThinking === true
    )
    expect(qwenModels.length).toBeGreaterThan(0)
    for (const m of qwenModels) {
      expect(m.thinkingParam).toContain('enable_thinking')
    }
  })

  // 5.3 BigModel thinking models use thinking.type
  it('BigModel models should use thinking.type', () => {
    const bmModels = MODEL_REGISTRY.filter(
      m => m.providerId === 'bigmodel' && m.supportsThinking === true
    )
    expect(bmModels.length).toBeGreaterThan(0)
    for (const m of bmModels) {
      expect(m.thinkingParam).toContain('thinking.type')
    }
  })

  // 5.4 Moonshot kimi-k2-thinking has always-on thinking
  it('kimi-k2-thinking should have always-on thinking', () => {
    const m = findModelCapability('moonshot', 'kimi-k2-thinking')
    expect(m).toBeDefined()
    expect(m!.supportsThinking).toBe(true)
    expect(m!.thinkingParam).toContain('always on')
  })

  // 5.5 Anthropic Opus uses adaptive thinking
  it('Anthropic Opus should use adaptive thinking', () => {
    const m = findModelCapability('anthropic', 'claude-opus-4-7')
    expect(m).toBeDefined()
    expect(m!.thinkingParam).toContain('adaptive')
  })

  // 5.6 Anthropic Haiku uses enabled + budget_tokens
  it('Anthropic Haiku should use enabled + budget_tokens', () => {
    const m = findModelCapability('anthropic', 'claude-haiku-4-5-20251001')
    expect(m).toBeDefined()
    expect(m!.thinkingParam).toContain('budget_tokens')
  })

  // 5.7 Google Gemini 2.5 uses thinkingBudget
  it('Gemini 2.5 models should use thinkingBudget', () => {
    const g25 = MODEL_REGISTRY.filter(
      m => m.providerId === 'google' && m.apiModelId.startsWith('gemini-2.5')
    )
    expect(g25.length).toBeGreaterThan(0)
    for (const m of g25) {
      expect(m.thinkingParam).toContain('thinkingBudget')
    }
  })

  // 5.8 Google Gemini 3 uses thinkingLevel
  it('Gemini 3 models should use thinkingLevel', () => {
    const g3 = MODEL_REGISTRY.filter(
      m => m.providerId === 'google' && m.apiModelId.startsWith('gemini-3')
    )
    expect(g3.length).toBeGreaterThan(0)
    for (const m of g3) {
      expect(m.thinkingParam).toContain('thinkingLevel')
    }
  })

  // 5.9 OpenAI models use reasoning.effort
  it('OpenAI thinking models should use reasoning.effort', () => {
    const oaiThinking = MODEL_REGISTRY.filter(
      m => m.providerId === 'openai' && m.supportsThinking === true
    )
    expect(oaiThinking.length).toBeGreaterThan(0)
    for (const m of oaiThinking) {
      expect(m.thinkingParam).toContain('reasoning.effort')
    }
  })

  // 5.10 API format consistency between provider and models
  it('model apiFormat should be compatible with provider apiFormat', () => {
    for (const m of MODEL_REGISTRY) {
      const provider = PROVIDER_REGISTRY.find(p => p.id === m.providerId)
      expect(provider).toBeDefined()
      // Models should use their provider's format or a compatible one
      // OpenAI has both openai_responses and openai_chat_completions (legacy)
      if (m.providerId === 'openai') {
        expect(['openai_responses', 'openai_chat_completions']).toContain(m.apiFormat)
      } else {
        expect(m.apiFormat).toBe(provider!.apiFormat)
      }
    }
  })
})

describe('Error Classification', () => {
  // 5.11 HTTP status classification
  it('should classify 401 as auth', () => {
    expect(classifyTestError(401)).toBe('auth')
  })

  it('should classify 403 as permission', () => {
    expect(classifyTestError(403)).toBe('permission')
  })

  it('should classify 429 as rate_limit', () => {
    expect(classifyTestError(429)).toBe('rate_limit')
  })

  it('should classify 400 as validation', () => {
    expect(classifyTestError(400)).toBe('validation')
  })

  it('should classify 500 as server', () => {
    expect(classifyTestError(500)).toBe('server')
  })

  it('should classify 502 as server', () => {
    expect(classifyTestError(502)).toBe('server')
  })

  // 5.12 Message-based classification
  it('should classify ECONNREFUSED as network', () => {
    expect(classifyTestError(undefined, 'ECONNREFUSED')).toBe('network')
  })

  it('should classify timeout message as network', () => {
    expect(classifyTestError(undefined, 'Request timeout after 30s')).toBe('network')
  })

  it('should classify unauthorized as auth', () => {
    expect(classifyTestError(undefined, 'Unauthorized access')).toBe('auth')
  })

  it('should classify invalid api key as auth', () => {
    expect(classifyTestError(undefined, 'Invalid API key provided')).toBe('auth')
  })

  it('should classify quota exceeded as permission', () => {
    expect(classifyTestError(undefined, 'Quota exceeded for project')).toBe('permission')
  })

  it('should classify rate limit as rate_limit', () => {
    expect(classifyTestError(undefined, 'Rate limit exceeded. Please try later.')).toBe('rate_limit')
  })

  it('should classify unknown error as unknown', () => {
    expect(classifyTestError(undefined, 'Something weird happened')).toBe('unknown')
  })

  // 5.13 HTTP status takes priority over message
  it('HTTP status should take priority', () => {
    // Even though message says "timeout", status 401 wins
    expect(classifyTestError(401, 'Request timeout')).toBe('auth')
  })
})
