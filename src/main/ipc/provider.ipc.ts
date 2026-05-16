/**
 * Provider Settings IPC Handlers
 *
 * Round 7 Phase 2: Extended with model refresh, enhanced test results, allowUnverifiedModels.
 *
 * Security rules:
 * 1. Never return plaintext apiKey to Renderer
 * 2. Only return maskedApiKey / hasApiKey
 * 3. No API Key in logs
 * 4. No API Key in error messages
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  getAllProviderConfigsSafe,
  getProviderConfigSafe,
  updateProviderConfig,
  deleteProviderConfig
} from '../providers/providerSettings'
import { testProviderConnection } from '../providers/openaiCompatibleProvider'
import { clearProviderCache } from '../providers/providerFactory'
import { refreshModelsForProvider, getCachedRemoteModels } from '../providers/modelRefresh'

export function registerProviderIpc(): void {
  // Get all Provider configs (safe version)
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_ALL_CONFIGS, async () => {
    try {
      const configs = getAllProviderConfigsSafe()
      return { success: true, data: configs }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get single Provider config (safe version)
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_CONFIG, async (_event, providerId: string) => {
    try {
      const config = getProviderConfigSafe(providerId)
      return { success: true, data: config }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Save Provider config - now supports allowUnverifiedModels
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SAVE_CONFIG,
    async (
      _event,
      params: {
        providerId: string
        apiKey: string
        baseUrl?: string
        defaultHeaders?: Record<string, string>
        timeout?: number
        enabled?: boolean
        allowUnverifiedModels?: boolean
      }
    ) => {
      try {
        updateProviderConfig(params.providerId, {
          apiKey: params.apiKey,
          baseUrl: params.baseUrl || '',
          defaultHeaders: params.defaultHeaders || {},
          timeout: params.timeout || 60000,
          enabled: params.enabled !== false,
          allowUnverifiedModels: params.allowUnverifiedModels ?? false
        })

        clearProviderCache()

        const safe = getProviderConfigSafe(params.providerId)
        console.log(`[ProviderIPC] Provider "${params.providerId}" 配置已保存`)
        return { success: true, data: safe }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Delete Provider config
  ipcMain.handle(IPC_CHANNELS.PROVIDER_DELETE_CONFIG, async (_event, providerId: string) => {
    try {
      deleteProviderConfig(providerId)
      clearProviderCache()
      console.log(`[ProviderIPC] Provider "${providerId}" 配置已删除`)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Test Provider connection - enhanced with ProviderTestResult
  ipcMain.handle(IPC_CHANNELS.PROVIDER_TEST_CONNECTION, async (_event, providerId: string) => {
    try {
      console.log(`[ProviderIPC] 测试连接: ${providerId}`)
      const result = await testProviderConnection(providerId)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Refresh remote model list for a provider
  ipcMain.handle(IPC_CHANNELS.PROVIDER_REFRESH_MODELS, async (_event, providerId: string) => {
    try {
      console.log(`[ProviderIPC] 刷新模型列表: ${providerId}`)
      const result = await refreshModelsForProvider(providerId)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get cached remote models for a provider
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_CACHED_MODELS, async (_event, providerId: string) => {
    try {
      const models = getCachedRemoteModels(providerId)
      return { success: true, data: models }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Provider 处理器已注册')
}
