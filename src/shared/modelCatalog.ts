/**
 * 模型能力表（静态目录）
 *
 * Round 7: 现在由 modelRegistry.ts 驱动。
 * 此文件提供向后兼容的 API，供 Renderer 组件使用。
 *
 * 注意：
 * - MODEL_CATALOG 和 PROVIDERS 现在从 modelRegistry 派生
 * - 不会破坏 Round 6 已有的 UI 代码
 */

import type { ProviderInfo, ModelInfo } from './types'
import {
  MODEL_REGISTRY,
  PROVIDER_REGISTRY,
  getModelsForProvider as _getModelsForProvider,
  findModelCapability,
  type ProviderId
} from './providers/modelRegistry'

/**
 * Convert ModelCapability to legacy ModelInfo format
 */
function capabilityToModelInfo(cap: (typeof MODEL_REGISTRY)[0]): ModelInfo {
  return {
    provider: cap.providerId,
    model: cap.apiModelId,
    displayName: cap.displayName,
    supportsThinking: cap.supportsThinking === true,
    supportsStreaming: cap.supportsStreaming === true,
    supportsJson: cap.supportsJson === true,
    supportsVision: cap.supportsVision === true,
    status: cap.status,
    notes: cap.notes || ''
  }
}

/** 全部模型目录（派生自 MODEL_REGISTRY） */
export const MODEL_CATALOG: ModelInfo[] = MODEL_REGISTRY.map(capabilityToModelInfo)

/** Provider 列表（派生自 PROVIDER_REGISTRY） */
export const PROVIDERS: ProviderInfo[] = PROVIDER_REGISTRY.map((p) => ({
  id: p.id,
  displayName: p.displayName,
  models: MODEL_CATALOG.filter((m) => m.provider === p.id)
}))

/**
 * 根据 provider + model 查找模型信息
 */
export function findModel(provider: ProviderId | string, model: string): ModelInfo | undefined {
  const cap = findModelCapability(provider, model)
  if (cap) return capabilityToModelInfo(cap)
  // Fallback: search in catalog for backward compatibility
  return MODEL_CATALOG.find((m) => m.provider === provider && m.model === model)
}

/**
 * 获取指定 Provider 的所有模型
 */
export function getModelsForProvider(providerId: ProviderId | string): ModelInfo[] {
  return _getModelsForProvider(providerId).map(capabilityToModelInfo)
}

/**
 * 获取所有 Provider ID 列表
 */
export function getAllProviderIds(): ProviderId[] {
  return PROVIDER_REGISTRY.map((p) => p.id)
}
