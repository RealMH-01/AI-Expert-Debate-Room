/**
 * Provider Settings - 管理真实 Provider 的配置
 *
 * 负责 API Key 和 Provider 配置的存取。
 * API Key 存储在本地 SQLite settings 表中。
 *
 * 安全规则：
 * 1. API Key 绝不通过 IPC 返回明文给 Renderer
 * 2. 返回给 Renderer 的数据只包含 maskedApiKey / hasApiKey
 * 3. 日志中不打印 API Key
 * 4. 导出数据时过滤 API Key
 *
 * TODO: 后续升级到系统 Keychain / Credential Manager（如 keytar / electron-safeStorage）
 * 当前 MVP 方案使用本地 settings 表保存，不是最终安全存储方案。
 */

import { getDatabase } from '../db/sqlite'
import type { ProviderId } from '../../shared/types'

/**
 * Provider 配置（存储在 settings 表中）
 */
export interface ProviderConfig {
  providerId: ProviderId | string
  apiKey: string
  baseUrl: string
  defaultHeaders: Record<string, string>
  timeout: number
  enabled: boolean
}

/**
 * 返回给 Renderer 的脱敏配置
 * 绝不包含明文 apiKey
 */
export interface ProviderConfigSafe {
  providerId: ProviderId | string
  hasApiKey: boolean
  maskedApiKey: string
  baseUrl: string
  timeout: number
  enabled: boolean
}

/** settings 表中 provider 配置的 key 前缀 */
const PROVIDER_SETTINGS_KEY = 'provider_configs'

/**
 * 将 API Key 脱敏为 sk-****abcd 形式
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length === 0) return ''
  if (apiKey.length <= 8) return '****'
  const prefix = apiKey.slice(0, 3)
  const suffix = apiKey.slice(-4)
  return `${prefix}****${suffix}`
}

/**
 * 获取所有 Provider 配置（内部使用，包含明文 API Key）
 * 仅限 Main Process 内部调用，绝不通过 IPC 暴露
 */
export function getAllProviderConfigs(): ProviderConfig[] {
  const db = getDatabase()
  const row = db
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(PROVIDER_SETTINGS_KEY) as { value_json: string } | undefined

  if (!row || !row.value_json) return []

  try {
    const configs = JSON.parse(row.value_json) as ProviderConfig[]
    return Array.isArray(configs) ? configs : []
  } catch {
    return []
  }
}

/**
 * 获取指定 Provider 的配置（内部使用，包含明文 API Key）
 * 仅限 Main Process 内部调用
 */
export function getProviderConfig(providerId: string): ProviderConfig | null {
  const configs = getAllProviderConfigs()
  return configs.find((c) => c.providerId === providerId) ?? null
}

/**
 * 获取指定 Provider 的 API Key（内部使用）
 * 仅限 Main Process 内部调用
 */
export function getProviderApiKey(providerId: string): string | null {
  const config = getProviderConfig(providerId)
  return config?.apiKey ?? null
}

/**
 * 获取所有 Provider 配置（安全版本，返回给 Renderer）
 * 不包含明文 API Key
 */
export function getAllProviderConfigsSafe(): ProviderConfigSafe[] {
  const configs = getAllProviderConfigs()
  return configs.map((c) => ({
    providerId: c.providerId,
    hasApiKey: !!c.apiKey && c.apiKey.length > 0,
    maskedApiKey: maskApiKey(c.apiKey),
    baseUrl: c.baseUrl,
    timeout: c.timeout,
    enabled: c.enabled
  }))
}

/**
 * 获取指定 Provider 的安全配置
 */
export function getProviderConfigSafe(providerId: string): ProviderConfigSafe | null {
  const config = getProviderConfig(providerId)
  if (!config) return null
  return {
    providerId: config.providerId,
    hasApiKey: !!config.apiKey && config.apiKey.length > 0,
    maskedApiKey: maskApiKey(config.apiKey),
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    enabled: config.enabled
  }
}

/**
 * 保存 Provider 配置
 * 如果 providerId 已存在，覆盖；否则新增
 */
export function saveProviderConfig(config: ProviderConfig): void {
  const db = getDatabase()
  const existing = getAllProviderConfigs()
  const index = existing.findIndex((c) => c.providerId === config.providerId)

  if (index >= 0) {
    existing[index] = config
  } else {
    existing.push(config)
  }

  const jsonStr = JSON.stringify(existing)
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
  ).run(PROVIDER_SETTINGS_KEY, jsonStr)
}

/**
 * 更新 Provider 配置（部分更新）
 * 如果传入了空字符串 apiKey，保持原有 apiKey 不变
 */
export function updateProviderConfig(
  providerId: string,
  updates: Partial<Omit<ProviderConfig, 'providerId'>>
): void {
  const existing = getProviderConfig(providerId)
  if (!existing) {
    // 如果不存在，创建新配置
    const newConfig: ProviderConfig = {
      providerId,
      apiKey: updates.apiKey ?? '',
      baseUrl: updates.baseUrl ?? '',
      defaultHeaders: updates.defaultHeaders ?? {},
      timeout: updates.timeout ?? 60000,
      enabled: updates.enabled ?? true
    }
    saveProviderConfig(newConfig)
    return
  }

  const updated: ProviderConfig = {
    ...existing,
    ...updates,
    providerId // 不允许修改 providerId
  }

  // 如果 updates.apiKey 是空字符串且原来有值，保持原值
  if (updates.apiKey === '' && existing.apiKey) {
    updated.apiKey = existing.apiKey
  }

  saveProviderConfig(updated)
}

/**
 * 删除 Provider 配置
 */
export function deleteProviderConfig(providerId: string): void {
  const db = getDatabase()
  const existing = getAllProviderConfigs()
  const filtered = existing.filter((c) => c.providerId !== providerId)
  const jsonStr = JSON.stringify(filtered)
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
  ).run(PROVIDER_SETTINGS_KEY, jsonStr)
}

/**
 * 检查指定 Provider 是否已配置且可用
 */
export function isProviderConfigured(providerId: string): boolean {
  if (providerId === 'mock') return true // Mock 永远可用
  const config = getProviderConfig(providerId)
  return !!config && config.enabled && !!config.apiKey && config.apiKey.length > 0
}
