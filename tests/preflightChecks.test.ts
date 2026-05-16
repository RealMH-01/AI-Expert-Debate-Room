/**
 * Test Category 4: Meeting Preflight / Model Usability Tests (Section XVI.4)
 *
 * Verifies the isModelUsableForMeeting gate logic which is the core
 * of validateProvidersReady. Since validateProvidersReady requires
 * DB access, we test the pure logic in isModelUsableForMeeting.
 *
 * Checks:
 * - Active model passes
 * - Stub model blocked
 * - Unverified model blocked without allowUnverified
 * - Unverified model passes with allowUnverified
 * - Unknown/custom model blocked without allowUnverified
 * - Unknown/custom model passes with allowUnverified
 * - Mock always passes
 */

import { describe, it, expect } from 'vitest'
import {
  isModelUsableForMeeting,
  MODEL_REGISTRY
} from '../src/shared/providers/modelRegistry'

describe('Meeting Preflight - Model Usability Gate', () => {
  // 4.1 Active model always allowed
  it('active model should always be allowed', () => {
    const activeModel = MODEL_REGISTRY.find(m => m.status === 'active' && m.providerId !== 'mock')
    expect(activeModel).toBeDefined()
    const result = isModelUsableForMeeting(activeModel!.providerId, activeModel!.apiModelId, false)
    expect(result.allowed).toBe(true)
  })

  // 4.2 Stub model always blocked
  it('stub model should always be blocked', () => {
    const stubModel = MODEL_REGISTRY.find(m => m.status === 'stub')
    if (!stubModel) {
      // No stub models in current registry - that's fine, skip
      return
    }
    const result = isModelUsableForMeeting(stubModel.providerId, stubModel.apiModelId, true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('stub')
  })

  // 4.3 Unverified model blocked without allowUnverified
  it('unverified model should be blocked without allowUnverified', () => {
    const uvModel = MODEL_REGISTRY.find(m => m.status === 'unverified')
    if (!uvModel) return
    const result = isModelUsableForMeeting(uvModel.providerId, uvModel.apiModelId, false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('unverified')
  })

  // 4.4 Unverified model allowed with allowUnverified
  it('unverified model should be allowed with allowUnverified', () => {
    const uvModel = MODEL_REGISTRY.find(m => m.status === 'unverified')
    if (!uvModel) return
    const result = isModelUsableForMeeting(uvModel.providerId, uvModel.apiModelId, true)
    expect(result.allowed).toBe(true)
  })

  // 4.5 Unknown/custom model blocked without allowUnverified
  it('unknown model should be blocked without allowUnverified', () => {
    const result = isModelUsableForMeeting('openai', 'my-custom-finetune-v1', false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not in the registry')
  })

  // 4.6 Unknown/custom model allowed with allowUnverified
  it('unknown model should be allowed with allowUnverified', () => {
    const result = isModelUsableForMeeting('openai', 'my-custom-finetune-v1', true)
    expect(result.allowed).toBe(true)
  })

  // 4.7 Mock always passes
  it('mock provider should always be allowed', () => {
    const result1 = isModelUsableForMeeting('mock', 'mock-basic', false)
    expect(result1.allowed).toBe(true)

    const result2 = isModelUsableForMeeting('mock', 'any-mock-model', false)
    expect(result2.allowed).toBe(true)
  })

  // 4.8 Active model allowed regardless of allowUnverified flag
  it('active model allowed regardless of allowUnverified', () => {
    const activeModel = MODEL_REGISTRY.find(m => m.status === 'active' && m.providerId !== 'mock')!
    const r1 = isModelUsableForMeeting(activeModel.providerId, activeModel.apiModelId, false)
    const r2 = isModelUsableForMeeting(activeModel.providerId, activeModel.apiModelId, true)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })

  // 4.9 Multiple provider checks
  it('should correctly check models across different providers', () => {
    // OpenAI active
    expect(isModelUsableForMeeting('openai', 'gpt-5.4', false).allowed).toBe(true)
    // Anthropic active
    expect(isModelUsableForMeeting('anthropic', 'claude-opus-4-7', false).allowed).toBe(true)
    // DeepSeek active
    expect(isModelUsableForMeeting('deepseek', 'deepseek-v4-flash', false).allowed).toBe(true)
    // Google active
    expect(isModelUsableForMeeting('google', 'gemini-2.5-flash', false).allowed).toBe(true)
    // Qwen active
    expect(isModelUsableForMeeting('qwen', 'qwen3.6-flash', false).allowed).toBe(true)
    // BigModel active
    expect(isModelUsableForMeeting('bigmodel', 'glm-5.1', false).allowed).toBe(true)
    // Moonshot active
    expect(isModelUsableForMeeting('moonshot', 'kimi-k2.6', false).allowed).toBe(true)
  })
})
