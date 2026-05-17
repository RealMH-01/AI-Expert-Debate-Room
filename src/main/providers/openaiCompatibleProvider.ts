import type { ProviderId } from '../../shared/providers/modelRegistry'
import {
  createCustomModelCapability,
  getModelCapability,
  getModelsForProvider,
  getProviderDefinition
} from '../../shared/providers/modelRegistry'
import { getProviderConfig, updateProviderConfig } from './providerSettings'
import type { ProviderTestResult } from './types'
import { joinUrl, mapHttpStatusToErrorType, sanitizeErrorMessage } from './types'
import { OpenAICompatibleAdapter } from './adapters/OpenAICompatibleAdapter'

export { OpenAICompatibleAdapter as OpenAICompatibleProvider }

function getTestPath(providerId: ProviderId, model: string): string {
  if (providerId === 'openai') return 'responses'
  if (providerId === 'anthropic') return 'v1/messages'
  if (providerId === 'google') return `models/${model}:generateContent`
  return 'chat/completions'
}

function buildTestBody(providerId: ProviderId, model: string): Record<string, unknown> {
  if (providerId === 'openai') {
    return {
      model,
      input: [{ role: 'user', content: 'Return exactly OK.' }],
      max_output_tokens: 8
    }
  }
  if (providerId === 'anthropic') {
    return {
      model,
      messages: [{ role: 'user', content: 'Return exactly OK.' }],
      max_tokens: 8
    }
  }
  if (providerId === 'google') {
    return {
      contents: [{ role: 'user', parts: [{ text: 'Return exactly OK.' }] }],
      generationConfig: { maxOutputTokens: 8 }
    }
  }
  return {
    model,
    messages: [{ role: 'user', content: 'Return exactly OK.' }],
    max_tokens: 8
  }
}

function buildTestHeaders(providerId: ProviderId, apiKey: string, extra: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (providerId === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (providerId === 'google') {
    headers['x-goog-api-key'] = apiKey
  } else {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

export async function testProviderConnection(
  providerId: string,
  model?: string
): Promise<ProviderTestResult> {
  const testedAt = new Date().toISOString()
  if (!getProviderDefinition(providerId)) {
    return {
      ok: false,
      providerId: providerId as ProviderId,
      model: model ?? '',
      errorType: 'validation',
      sanitizedMessage: `Unknown provider "${providerId}".`,
      testedAt
    }
  }
  const typedProviderId = providerId as ProviderId
  if (typedProviderId === 'mock') {
    return { ok: true, providerId: 'mock', model: model ?? 'mock-basic', testedAt }
  }

  const config = getProviderConfig(typedProviderId)
  const provider = getProviderDefinition(typedProviderId)!
  const testModel = model || provider.defaultModelId || getModelsForProvider(typedProviderId)[0]?.apiModelId || ''
  const capability = getModelCapability(typedProviderId, testModel) ?? createCustomModelCapability(typedProviderId, testModel)
  if (capability.status === 'stub') {
    return {
      ok: false,
      providerId: typedProviderId,
      model: testModel,
      errorType: 'validation',
      sanitizedMessage: 'Stub models cannot be tested.',
      testedAt
    }
  }
  if (!config?.apiKey) {
    return {
      ok: false,
      providerId: typedProviderId,
      model: testModel,
      errorType: 'auth',
      sanitizedMessage: 'API Key is not configured.',
      testedAt
    }
  }
  if (!config.enabled) {
    return {
      ok: false,
      providerId: typedProviderId,
      model: testModel,
      errorType: 'permission',
      sanitizedMessage: 'Provider is disabled.',
      testedAt
    }
  }

  const started = Date.now()
  const controller = new AbortController()
  const timeout = Math.min(config.timeout || 15000, 15000)
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(joinUrl(config.baseUrl || provider.defaultBaseUrl, getTestPath(typedProviderId, testModel)), {
      method: 'POST',
      headers: buildTestHeaders(typedProviderId, config.apiKey, config.defaultHeaders || {}),
      body: JSON.stringify(buildTestBody(typedProviderId, testModel)),
      signal: controller.signal
    })
    const latencyMs = Date.now() - started
    if (!response.ok) {
      const result: ProviderTestResult = {
        ok: false,
        providerId: typedProviderId,
        model: testModel,
        latencyMs,
        errorType: mapHttpStatusToErrorType(response.status),
        sanitizedMessage: sanitizeErrorMessage(await response.text().catch(() => response.statusText)),
        testedAt
      }
      updateProviderConfig(typedProviderId, {
        lastTestStatus: 'failure',
        lastTestError: result.sanitizedMessage,
        lastTestAt: testedAt,
        lastTestedModel: testModel
      })
      return result
    }

    updateProviderConfig(typedProviderId, {
      lastTestStatus: 'success',
      lastTestError: '',
      lastTestAt: testedAt,
      lastTestedModel: testModel
    })
    return { ok: true, providerId: typedProviderId, model: testModel, latencyMs, testedAt }
  } catch (error) {
    const result: ProviderTestResult = {
      ok: false,
      providerId: typedProviderId,
      model: testModel,
      latencyMs: Date.now() - started,
      errorType: error instanceof Error && error.name === 'AbortError' ? 'network' : 'unknown',
      sanitizedMessage: sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error'),
      testedAt
    }
    updateProviderConfig(typedProviderId, {
      lastTestStatus: 'failure',
      lastTestError: result.sanitizedMessage,
      lastTestAt: testedAt,
      lastTestedModel: testModel
    })
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}
