import type { ModelCapability, ProviderId } from './modelRegistry'
import {
  createCustomModelCapability,
  getModelCapability,
  getModelsForProvider
} from './modelRegistry'

export type CachedProviderModel = {
  provider_id: string
  model_id: string
  display_name?: string | null
  status?: string | null
  capabilities_json?: string | null
  source?: string | null
}

export type ProviderModelOption = ModelCapability & {
  source: 'static_seed' | 'cached' | 'custom'
}

export function buildProviderModelOptions(params: {
  providerId: ProviderId
  cachedModels?: CachedProviderModel[]
  customModelIds?: string[]
}): ProviderModelOption[] {
  const byId = new Map<string, ProviderModelOption>()

  for (const model of getModelsForProvider(params.providerId)) {
    byId.set(model.apiModelId, { ...model, source: 'static_seed' })
  }

  for (const cached of params.cachedModels ?? []) {
    if (cached.provider_id !== params.providerId || !cached.model_id) continue

    const staticCapability = getModelCapability(params.providerId, cached.model_id)
    if (staticCapability) {
      byId.set(cached.model_id, {
        ...staticCapability,
        displayName: cached.display_name || staticCapability.displayName,
        source: byId.get(cached.model_id)?.source ?? 'cached'
      })
      continue
    }

    const custom = createCustomModelCapability(params.providerId, cached.model_id)
    byId.set(cached.model_id, {
      ...custom,
      displayName: cached.display_name || custom.displayName,
      status: 'unverified',
      source: 'cached',
      notes: custom.notes
    })
  }

  for (const modelId of params.customModelIds ?? []) {
    if (!modelId || byId.has(modelId)) continue
    byId.set(modelId, {
      ...createCustomModelCapability(params.providerId, modelId),
      status: 'unverified',
      source: 'custom'
    })
  }

  return Array.from(byId.values())
}
