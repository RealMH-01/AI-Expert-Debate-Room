/**
 * 渲染进程全局类型声明
 *
 * 声明 window.api 的类型，使渲染进程可以安全调用 IPC API
 */

/** 健康检查结果 */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  database: boolean
  timestamp: string
  message: string
}

/** 应用信息 */
export interface AppInfoResult {
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
}

/** Electron API 接口 */
export interface ElectronAPI {
  healthCheck: () => Promise<HealthCheckResult>
  getAppInfo: () => Promise<AppInfoResult>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
