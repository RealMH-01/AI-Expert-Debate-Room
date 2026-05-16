/**
 * Preload 脚本
 *
 * 使用 contextBridge 安全地暴露 IPC API 给渲染进程。
 * 渲染进程通过 window.api 调用主进程功能。
 * 不暴露 Node API，不开启 nodeIntegration。
 */

import { contextBridge, ipcRenderer } from 'electron'

/** 暴露给渲染进程的 API 类型 */
export interface ElectronAPI {
  /** 数据库健康检查 */
  healthCheck: () => Promise<{
    status: 'ok' | 'error'
    database: boolean
    timestamp: string
    message: string
  }>
  /** 获取应用信息 */
  getAppInfo: () => Promise<{
    appName: string
    version: string
    databasePath: string
    environment: string
    nodeVersion: string
    electronVersion: string
    platform: string
    arch: string
    dbVersion: string
    tableCount: number
  }>
}

const api: ElectronAPI = {
  healthCheck: () => ipcRenderer.invoke('app:health-check'),
  getAppInfo: () => ipcRenderer.invoke('app:get-app-info')
}

// 安全暴露 API
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose API via contextBridge:', error)
  }
} else {
  // @ts-expect-error fallback for non-isolated context
  window.api = api
}
