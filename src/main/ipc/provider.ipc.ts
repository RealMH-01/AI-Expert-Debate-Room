/**
 * Provider Settings IPC Handlers
 *
 * 处理 Renderer 发来的 Provider 配置相关请求。
 *
 * 安全规则：
 * 1. 读取配置时绝不返回明文 apiKey，只返回 maskedApiKey / hasApiKey
 * 2. 保存配置时，API Key 只存在 Main Process 侧
 * 3. 日志中不打印 API Key
 * 4. 错误消息中不包含 API Key
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
import { refreshProviderModels } from '../providers/modelListFetcher'
import {
  getCachedProviderModels,
  upsertRefreshedModels
} from '../db/repositories/providerModelRepository'
import { isProviderId } from '../../shared/providers/modelRegistry'

export function registerProviderIpc(): void {
  // 获取所有 Provider 配置（安全版）
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_ALL_CONFIGS, async () => {
    try {
      const configs = getAllProviderConfigsSafe()
      return { success: true, data: configs }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取单个 Provider 配置（安全版）
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_CONFIG, async (_event, providerId: string) => {
    try {
      const config = getProviderConfigSafe(providerId)
      return { success: true, data: config }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 保存 Provider 配置
  // Renderer 提交 API Key 到 Main Process，Main Process 负责安全存储
  // 使用 updateProviderConfig 确保：apiKey 为空字符串时保留旧 Key
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
        maxConcurrency?: number
        enabled?: boolean
        allowUnverifiedModels?: boolean
      }
    ) => {
      try {
        // 使用 updateProviderConfig 而非 saveProviderConfig
        // updateProviderConfig 内部会处理：如果 apiKey === '' 且旧配置已有 key，则保留旧 key
        updateProviderConfig(params.providerId, {
          apiKey: params.apiKey,
          baseUrl: params.baseUrl || '',
          defaultHeaders: params.defaultHeaders || {},
          timeout: params.timeout || 60000,
          maxConcurrency: params.maxConcurrency,
          enabled: params.enabled !== false,
          allowUnverifiedModels: params.allowUnverifiedModels === true
        })

        // 清除缓存，下次使用时会用新配置
        clearProviderCache()

        // 返回安全版本（不含明文 API Key）
        const safe = getProviderConfigSafe(params.providerId)
        console.log(`[ProviderIPC] Provider "${params.providerId}" 配置已保存`)
        return { success: true, data: safe }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 删除 Provider 配置
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

  // 测试 Provider 连接
  ipcMain.handle(IPC_CHANNELS.PROVIDER_TEST_CONNECTION, async (_event, providerId: string, model?: string) => {
    try {
      console.log(`[ProviderIPC] 测试连接: ${providerId}`)
      const result = await testProviderConnection(providerId, model)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROVIDER_REFRESH_MODELS, async (_event, providerId: string) => {
    try {
      if (!isProviderId(providerId)) {
        return { success: false, error: `Unknown provider "${providerId}"` }
      }
      const result = await refreshProviderModels(providerId)
      upsertRefreshedModels(result)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_CACHED_MODELS, async (_event, providerId: string) => {
    try {
      return { success: true, data: getCachedProviderModels(providerId) }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Provider 处理器已注册')
}
