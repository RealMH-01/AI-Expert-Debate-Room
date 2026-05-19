import { beforeEach, describe, expect, it, vi } from 'vitest'

const { settingsRows } = vi.hoisted(() => ({
  settingsRows: new Map<string, string>()
}))

vi.mock('../src/main/db/sqlite', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => ({
      get: (key: string) => {
        const value = settingsRows.get(key)
        return value ? { value_json: value } : undefined
      },
      run: (key: string, valueJson: string) => {
        if (!/settings/i.test(sql)) {
          throw new Error(`Unexpected SQL: ${sql}`)
        }
        settingsRows.set(key, valueJson)
      }
    })
  })
}))

import {
  getProviderConfig,
  getProviderConfigSafe,
  updateProviderConfig
} from '../src/main/providers/providerSettings'

describe('provider settings persistence', () => {
  beforeEach(() => {
    settingsRows.clear()
  })

  it('saves provider config through the settings table and reads back a safe copy', () => {
    updateProviderConfig('deepseek', {
      apiKey: 'sk-test-provider-secret',
      baseUrl: 'https://api.deepseek.com',
      defaultHeaders: { Authorization: 'Bearer test-secret', 'x-feature': 'enabled' },
      timeout: 30000,
      enabled: true,
      allowUnverifiedModels: false
    })

    const saved = getProviderConfig('deepseek')
    const safe = getProviderConfigSafe('deepseek')

    expect(saved?.apiKey).toBe('sk-test-provider-secret')
    expect(safe?.hasApiKey).toBe(true)
    expect(JSON.stringify(safe)).not.toContain('sk-test-provider-secret')
    expect(settingsRows.has('provider_configs')).toBe(true)
  })

  it('preserves an existing api key when saving an empty apiKey update', () => {
    updateProviderConfig('deepseek', {
      apiKey: 'sk-test-provider-secret',
      baseUrl: 'https://api.deepseek.com'
    })

    updateProviderConfig('deepseek', {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v2'
    })

    const saved = getProviderConfig('deepseek')

    expect(saved?.apiKey).toBe('sk-test-provider-secret')
    expect(saved?.baseUrl).toBe('https://api.deepseek.com/v2')
  })
})
