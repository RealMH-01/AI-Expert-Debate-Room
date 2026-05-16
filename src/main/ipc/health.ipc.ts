/**
 * 健康检查和应用信息 IPC Handler
 *
 * 提供 healthCheck 和 getAppInfo 两个 IPC 接口。
 */

import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from './channels'
import { isDatabaseHealthy, getDatabasePath, getDatabase } from '../db/sqlite'

/** 健康检查响应 */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  database: boolean
  timestamp: string
  message: string
}

/** 应用信息响应 */
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

/**
 * 注册健康检查 IPC 处理器
 */
export function registerHealthIpc(): void {
  // 健康检查
  ipcMain.handle(IPC_CHANNELS.HEALTH_CHECK, async (): Promise<HealthCheckResult> => {
    const dbHealthy = isDatabaseHealthy()

    return {
      status: dbHealthy ? 'ok' : 'error',
      database: dbHealthy,
      timestamp: new Date().toISOString(),
      message: dbHealthy ? '数据库连接正常' : '数据库连接异常'
    }
  })

  // 获取应用信息
  ipcMain.handle(IPC_CHANNELS.GET_APP_INFO, async (): Promise<AppInfoResult> => {
    let dbVersion = '未知'
    let tableCount = 0

    try {
      const db = getDatabase()
      const versionRow = db
        .prepare("SELECT value FROM app_meta WHERE key = 'db_version'")
        .get() as { value: string } | undefined
      dbVersion = versionRow?.value ?? '0'

      const tables = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .get() as { count: number }
      tableCount = tables.count
    } catch {
      // 数据库可能未初始化
    }

    return {
      appName: 'AI 专家修罗场会议室',
      version: app.getVersion(),
      databasePath: getDatabasePath(),
      environment: app.isPackaged ? 'production' : 'development',
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      dbVersion,
      tableCount
    }
  })

  console.log('[IPC] 健康检查处理器已注册')
}
