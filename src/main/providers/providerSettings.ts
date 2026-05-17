import type { ProviderId } from '../../shared/types'
import { getProviderDefinition } from '../../shared/providers/modelRegistry'

export interface ProviderConfig {
  providerId: ProviderId | string
  apiKey: string
  baseUrl: string
  defaultHeaders: Record<string, string>
  timeout: number
  enabled: boolean
  allowUnverifiedModels: boolean
  lastTestStatus?: 'success' | 'failure'
  lastTestError?: string
  lastTestAt?: string
  lastTestedModel?: string
}

export interface ProviderConfigSafe {
  providerId: ProviderId | string
  displayName: string
  hasApiKey: boolean
  maskedKey: string
  maskedApiKey: string
  baseUrl: string
  timeout: number
  enabled: boolean
  allowUnverifiedModels: boolean
  lastTestStatus?: 'success' | 'failure'
  lastTestError?: string
  lastTestAt?: string
  lastTestedModel?: string
}

const PROVIDER_SETTINGS_KEY = 'provider_configs'
const REDACTED = '****REDACTED****'

function getDb() {
  const sqlite = require('../db/sqlite') as typeof import('../db/sqlite')
  return sqlite.getDatabase()
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return '****'
  return `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`
}

function isSensitiveKey(key: string): boolean {
  return /apiKey|api[_-]?key|authorization|x-api-key|x-goog-api-key|defaultHeaders|bearer token|secret|token|auth|key/i.test(key)
}

export function sanitizeSensitiveData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitiveData(item)) as T
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        if (key === 'defaultHeaders' && nestedValue && typeof nestedValue === 'object') {
          output[key] = Object.fromEntries(
            Object.keys(nestedValue as Record<string, unknown>).map((headerKey) => [
              headerKey,
              isSensitiveKey(headerKey) ? REDACTED : sanitizeSensitiveData((nestedValue as Record<string, unknown>)[headerKey])
            ])
          )
        } else {
          output[key] = REDACTED
        }
      } else if (typeof nestedValue === 'string') {
        output[key] = nestedValue
          .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ****')
          .replace(/(sk|sk-ant|sk-proj|sk-live)-[A-Za-z0-9_-]{8,}/gi, '$1-****')
      } else {
        output[key] = sanitizeSensitiveData(nestedValue)
      }
    }
    return output as T
  }
  return value
}

export function sanitizeProviderConfigForRenderer(config: ProviderConfig): ProviderConfigSafe {
  const provider = getProviderDefinition(config.providerId)
  return {
    providerId: config.providerId,
    displayName: provider?.displayName ?? config.providerId,
    hasApiKey: !!config.apiKey,
    maskedKey: maskApiKey(config.apiKey),
    maskedApiKey: maskApiKey(config.apiKey),
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    enabled: config.enabled,
    allowUnverifiedModels: config.allowUnverifiedModels,
    lastTestStatus: config.lastTestStatus,
    lastTestError: config.lastTestError,
    lastTestAt: config.lastTestAt,
    lastTestedModel: config.lastTestedModel
  }
}

function normalizeConfig(config: Partial<ProviderConfig> & { providerId: string }): ProviderConfig {
  const provider = getProviderDefinition(config.providerId)
  return {
    providerId: config.providerId,
    apiKey: config.apiKey ?? '',
    baseUrl: config.baseUrl ?? provider?.defaultBaseUrl ?? '',
    defaultHeaders: config.defaultHeaders ?? {},
    timeout: config.timeout ?? 60000,
    enabled: config.enabled ?? true,
    allowUnverifiedModels: config.allowUnverifiedModels ?? provider?.allowUnverifiedModelsDefault ?? false,
    lastTestStatus: config.lastTestStatus,
    lastTestError: config.lastTestError,
    lastTestAt: config.lastTestAt,
    lastTestedModel: config.lastTestedModel
  }
}

export function getAllProviderConfigs(): ProviderConfig[] {
  const row = getDb()
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(PROVIDER_SETTINGS_KEY) as { value_json: string } | undefined
  if (!row?.value_json) return []

  try {
    const configs = JSON.parse(row.value_json) as Array<Partial<ProviderConfig> & { providerId: string }>
    return Array.isArray(configs) ? configs.map(normalizeConfig) : []
  } catch {
    return []
  }
}

export function getProviderConfig(providerId: string): ProviderConfig | null {
  return getAllProviderConfigs().find((config) => config.providerId === providerId) ?? null
}

export function getProviderApiKey(providerId: string): string | null {
  return getProviderConfig(providerId)?.apiKey ?? null
}

export function getAllProviderConfigsSafe(): ProviderConfigSafe[] {
  return getAllProviderConfigs().map(sanitizeProviderConfigForRenderer)
}

export function getProviderConfigSafe(providerId: string): ProviderConfigSafe | null {
  const config = getProviderConfig(providerId)
  return config ? sanitizeProviderConfigForRenderer(config) : null
}

export function saveProviderConfig(config: ProviderConfig): void {
  const existing = getAllProviderConfigs()
  const normalized = normalizeConfig(config)
  const index = existing.findIndex((item) => item.providerId === normalized.providerId)
  if (index >= 0) existing[index] = normalized
  else existing.push(normalized)

  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime(\'now\'))')
    .run(PROVIDER_SETTINGS_KEY, JSON.stringify(existing))
}

export function updateProviderConfig(
  providerId: string,
  updates: Partial<Omit<ProviderConfig, 'providerId'>>
): void {
  const existing = getProviderConfig(providerId)
  const updated = normalizeConfig({
    ...(existing ?? { providerId }),
    ...updates,
    providerId
  })

  if (updates.apiKey === '' && existing?.apiKey) {
    updated.apiKey = existing.apiKey
  }
  saveProviderConfig(updated)
}

export function deleteProviderConfig(providerId: string): void {
  const filtered = getAllProviderConfigs().filter((config) => config.providerId !== providerId)
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime(\'now\'))')
    .run(PROVIDER_SETTINGS_KEY, JSON.stringify(filtered))
}

export function isProviderConfigured(providerId: string): boolean {
  if (providerId === 'mock') return true
  const config = getProviderConfig(providerId)
  return !!config?.enabled && !!config.apiKey
}
