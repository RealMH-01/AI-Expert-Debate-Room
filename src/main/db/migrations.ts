/**
 * 数据库迁移管理
 *
 * 使用 app_meta 表记录迁移版本。
 * 每次应用启动时检查并执行未运行的迁移。
 * 幂等设计：多次启动不会重复执行已完成的迁移。
 */

import type Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema'

/** 迁移记录接口 */
interface Migration {
  version: number
  name: string
  sql: string
}

/** 迁移列表，按版本号顺序排列 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '初始化基础表结构',
    sql: SCHEMA_SQL
  }
]

/**
 * 获取当前数据库迁移版本
 */
function getCurrentVersion(db: Database.Database): number {
  try {
    // 首先检查 app_meta 表是否存在
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta'"
      )
      .get()

    if (!tableExists) {
      return 0
    }

    const row = db
      .prepare("SELECT value FROM app_meta WHERE key = 'db_version'")
      .get() as { value: string } | undefined

    return row ? parseInt(row.value, 10) : 0
  } catch {
    return 0
  }
}

/**
 * 设置当前数据库迁移版本
 */
function setCurrentVersion(db: Database.Database, version: number): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('db_version', ?, ?)`
  ).run(String(version), now)
}

/**
 * 运行数据库迁移
 * 幂等操作：只执行尚未运行的迁移
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db)
  console.log(`[Migrations] 当前数据库版本: ${currentVersion}`)

  const pendingMigrations = MIGRATIONS.filter((m) => m.version > currentVersion)

  if (pendingMigrations.length === 0) {
    console.log('[Migrations] 数据库已是最新版本，无需迁移')
    return
  }

  console.log(`[Migrations] 需要执行 ${pendingMigrations.length} 个迁移`)

  for (const migration of pendingMigrations) {
    console.log(
      `[Migrations] 执行迁移 v${migration.version}: ${migration.name}`
    )

    // 使用事务确保原子性
    const runMigration = db.transaction(() => {
      db.exec(migration.sql)
      setCurrentVersion(db, migration.version)
    })

    runMigration()

    console.log(`[Migrations] 迁移 v${migration.version} 完成`)
  }

  console.log('[Migrations] 所有迁移执行完毕')

  // 记录初始化时间
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('initialized_at', ?, ?)`
  ).run(now, now)
}
