/**
 * OpenAI-Compatible Provider - Legacy Compatibility Layer
 *
 * Round 7: This file now serves as a thin wrapper that delegates to the new
 * adapter-based architecture. The actual adapter implementations are in
 * src/main/providers/adapters/.
 *
 * This file is kept for backward compatibility with:
 * - provider.ipc.ts (imports testProviderConnection)
 * - Any other existing imports
 *
 * New code should import directly from adapters/ or providerFactory.
 */

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
import type { ProviderTestResult } from './types'
import { classifyTestError } from './types'
import { updateTestResult } from './providerSettings'

// Re-export the adapter for backward compatibility
export { OpenAICompatibleAdapter as OpenAICompatibleProvider } from './adapters'

/**
 * Test Provider Connection
 *
 * Round 7 Phase 2: Enhanced with error classification and result persistence.
 * Returns ProviderTestResult with errorType classification.
 * Persists test result into provider config.
 */
export async function testProviderConnection(providerId: string): Promise<ProviderTestResult> {
  const testedAt = new Date().toISOString()
  let adapter: { testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> }

  switch (providerId) {
    case 'openai':
      adapter = new OpenAIAdapter('gpt-5.4-nano', false)
      break
    case 'openai_compatible':
      adapter = new OpenAICompatibleAdapter('custom', false)
      break
    case 'anthropic':
      adapter = new AnthropicAdapter('claude-haiku-4-5-20251001', false)
      break
    case 'google':
      adapter = new GeminiAdapter('gemini-2.5-flash-lite', false)
      break
    case 'deepseek':
      adapter = new DeepSeekAdapter('deepseek-v4-flash', false)
      break
    case 'qwen':
      adapter = new QwenAdapter('qwen3.6-flash', false)
      break
    case 'bigmodel':
      adapter = new BigModelAdapter('glm-4.6', false)
      break
    case 'moonshot':
      adapter = new MoonshotAdapter('kimi-k2.5', false)
      break
    default: {
      const result: ProviderTestResult = {
        success: false,
        message: `Unknown provider: ${providerId}`,
        errorType: 'validation',
        testedAt
      }
      return result
    }
  }

  try {
    const raw = await adapter.testConnection()

    // Extract HTTP status from message if present (adapters may include it)
    let httpStatus: number | undefined
    const statusMatch = raw.message.match(/HTTP (\d{3})/)
    if (statusMatch) {
      httpStatus = parseInt(statusMatch[1], 10)
    }

    const result: ProviderTestResult = {
      success: raw.success,
      message: raw.message,
      latencyMs: raw.latencyMs,
      testedAt,
      httpStatus,
      errorType: raw.success ? undefined : classifyTestError(httpStatus, raw.message)
    }

    // Persist result
    updateTestResult(providerId, raw.success ? 'success' : 'fail', raw.success ? undefined : raw.message)

    return result
  } catch (error: unknown) {
    const errMsg = (error as Error).message || 'Unknown error'
    const errorType = classifyTestError(undefined, errMsg)

    const result: ProviderTestResult = {
      success: false,
      message: errMsg,
      errorType,
      testedAt
    }

    // Persist failure
    updateTestResult(providerId, 'fail', errMsg)

    return result
  }
}

/**
 * Get default base URL for a provider (exported for backward compatibility)
 */
export function getDefaultBaseUrlForProvider(providerId: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openai_compatible: '',
    deepseek: 'https://api.deepseek.com',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com/v1beta'
  }
  return urls[providerId] || ''
}

/**
 * Get test model for a provider (exported for backward compatibility)
 */
export function getTestModelForProvider(providerId: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-5.4-nano',
    openai_compatible: 'gpt-4o-mini',
    deepseek: 'deepseek-v4-flash',
    qwen: 'qwen3.6-flash',
    bigmodel: 'glm-4.6',
    moonshot: 'kimi-k2.5',
    anthropic: 'claude-haiku-4-5-20251001',
    google: 'gemini-2.5-flash-lite'
  }
  return models[providerId] || ''
}
