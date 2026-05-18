import {
  ACTIVE_MODEL_SEED,
  getModelCapability,
  getProviderDefinition,
  type ModelCapability,
  type ProviderId
} from '../../shared/providers/modelRegistry'
import { getProviderConfig } from './providerSettings'
import { joinUrl, sanitizeErrorMessage } from './types'

export type RefreshedModel = {
  apiModelId: string
  displayName?: string
  status: 'active' | 'unverified'
  capabilities?: Partial<ModelCapability>
}

export type ModelListRefreshResult = {
  providerId: ProviderId
  fetchedAt: string
  models: RefreshedModel[]
  source: 'official_api' | 'static_seed'
}

function staticSeed(providerId: ProviderId): ModelListRefreshResult {
  return {
    providerId,
    fetchedAt: new Date().toISOString(),
    source: 'static_seed',
    models: ACTIVE_MODEL_SEED
      .filter((model) => model.providerId === providerId)
      .map((model) => ({
        apiModelId: model.apiModelId,
        displayName: model.displayName,
        status: model.status === 'active' ? 'active' : 'unverified',
        capabilities: model
      }))
  }
}

function authHeaders(providerId: ProviderId, apiKey: string): Record<string, string> {
  if (providerId === 'google') return { 'x-goog-api-key': apiKey }
  if (providerId === 'anthropic') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  return { Authorization: `Bearer ${apiKey}` }
}

export async function refreshProviderModels(providerId: ProviderId): Promise<ModelListRefreshResult> {
  const provider = getProviderDefinition(providerId)
  if (!provider || providerId === 'mock' || providerId === 'qwen' || providerId === 'bigmodel') {
    return staticSeed(providerId)
  }

  const config = getProviderConfig(providerId)
  if (!config?.apiKey) return staticSeed(providerId)

  const fetchedAt = new Date().toISOString()
  try {
    const path = providerId === 'google' ? 'models' : providerId === 'anthropic' ? 'v1/models' : 'models'
    const response = await fetch(joinUrl(config.baseUrl || provider.defaultBaseUrl, path), {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(providerId, config.apiKey),
        ...(config.defaultHeaders || {})
      }
    })
    if (!response.ok) throw new Error(await response.text().catch(() => response.statusText))
    const data = await response.json() as any
    const rawModels = providerId === 'google'
      ? (data.models ?? []).map((item: any) => item.name?.replace(/^models\//, ''))
      : (data.data ?? data.models ?? []).map((item: any) => item.id ?? item.name)

    return {
      providerId,
      fetchedAt,
      source: 'official_api',
      models: rawModels
        .filter(Boolean)
        .map((apiModelId: string) => {
          const active = getModelCapability(providerId, apiModelId)
          return {
            apiModelId,
            displayName: active?.displayName ?? apiModelId,
            status: active?.status === 'active' ? 'active' : 'unverified',
            capabilities: active
          }
        })
    }
  } catch (error) {
    console.warn(`[ModelListFetcher] refresh failed for ${providerId}: ${sanitizeErrorMessage(error instanceof Error ? error.message : 'unknown')}`)
    return staticSeed(providerId)
  }
}
