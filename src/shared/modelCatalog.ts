import {
  ACTIVE_MODEL_SEED,
  MODEL_REGISTRY,
  PROVIDER_DEFINITIONS,
  getModelCapability,
  getModelsForProvider as getRegistryModelsForProvider
} from './providers/modelRegistry'
import type { ModelInfo, ProviderId, ProviderInfo } from './types'

function bool(value: boolean | 'unknown'): boolean {
  return value === true
}

function toModelInfo(model: (typeof MODEL_REGISTRY)[number]): ModelInfo {
  return {
    provider: model.providerId,
    model: model.apiModelId,
    displayName: model.displayName,
    supportsThinking: bool(model.supportsThinking),
    supportsStreaming: bool(model.supportsStreaming),
    supportsJson: bool(model.supportsJson),
    supportsVision: bool(model.supportsVision),
    supportsToolCalling: bool(model.supportsToolCalling),
    status: model.status,
    apiFormat: model.apiFormat,
    defaultBaseUrl: model.defaultBaseUrl,
    notes: model.notes ?? ''
  }
}

export const MODEL_CATALOG: ModelInfo[] = MODEL_REGISTRY.map(toModelInfo)

export const PROVIDERS: ProviderInfo[] = PROVIDER_DEFINITIONS.map((provider) => ({
  id: provider.id,
  displayName: provider.displayName,
  models: MODEL_CATALOG.filter((model) => model.provider === provider.id)
}))

export function findModel(provider: ProviderId | string, model: string): ModelInfo | undefined {
  const capability = getModelCapability(provider, model)
  return capability ? toModelInfo(capability) : undefined
}

export function getModelsForProvider(providerId: ProviderId | string): ModelInfo[] {
  return getRegistryModelsForProvider(providerId).map(toModelInfo)
}

export function getAllProviderIds(): ProviderId[] {
  return PROVIDER_DEFINITIONS.map((provider) => provider.id)
}
