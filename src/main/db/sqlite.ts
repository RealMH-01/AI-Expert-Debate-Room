/**
 * SQLite 数据库连接管理
 *
 * 数据库文件存放策略（开发阶段）：
 * - 开发环境：项目根目录下的 data/ 目录
 * - 生产环境：Electron app.getPath('userData') 目录
 *
 * 选择理由：
 * 开发阶段放在项目 data/ 目录便于直接查看和调试数据库文件，
 * 生产环境放在 userData 目录符合操作系统惯例。
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null
let dbPath: string = ''

/**
 * 获取数据库文件路径
 */
function resolveDatabasePath(): string {
  const isDev = !app.isPackaged

  if (isDev) {
    // 开发环境：项目 data/ 目录
    const dataDir = path.join(app.getAppPath(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    return path.join(dataDir, 'debate-room.db')
  } else {
    // 生产环境：userData 目录
    const userDataDir = app.getPath('userData')
    return path.join(userDataDir, 'debate-room.db')
  }
}

/**
 * 初始化数据库连接
 * 幂等操作：如果数据库已经初始化，直接返回现有连接
 */
export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  dbPath = resolveDatabasePath()
  console.log(`[Database] 初始化数据库: ${dbPath}`)

  db = new Database(dbPath)

  // 启用 WAL 模式以提升并发读写性能
  db.pragma('journal_mode = WAL')
  // 启用外键约束
  db.pragma('foreign_keys = ON')

  console.log('[Database] 数据库连接成功')
  return db
}

/**
 * 获取当前数据库实例
 * 如果尚未初始化则抛出错误
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('[Database] 数据库尚未初始化，请先调用 initDatabase()')
  }
  return db
}

/**
 * 获取数据库文件路径
 */
export function getDatabasePath(): string {
  return dbPath
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[Database] 数据库连接已关闭')
  }
}

/**
 * 检查数据库连接是否正常
 */
export function isDatabaseHealthy(): boolean {
  try {
    if (!db) return false
    // 执行简单查询验证连接
    const result = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined
    return result?.ok === 1
  } catch {
    return false
  }
}
