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
  requiresForeignKeysOff?: boolean
}

/** 迁移列表，按版本号顺序排列 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '初始化基础表结构',
    sql: SCHEMA_SQL
  },
  {
    version: 2,
    name: '添加 session_reviews 和 session_participants 表',
    sql: `
-- ============================
-- 会议参与者快照（记录参会时刻的专家状态）
-- 用于历史详情还原，不受后续编辑影响
-- ============================
CREATE TABLE IF NOT EXISTS session_participants (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  role            TEXT NOT NULL,
  name            TEXT NOT NULL,
  provider        TEXT,
  model           TEXT,
  persona         TEXT,
  domain          TEXT,
  stance          TEXT,
  initial_hp      INTEGER NOT NULL DEFAULT 100,
  final_hp        INTEGER,
  initial_influence INTEGER NOT NULL DEFAULT 0,
  initial_prestige  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================
-- 结构化复盘
-- ============================
CREATE TABLE IF NOT EXISTS session_reviews (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  review_json     TEXT NOT NULL,
  markdown        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_reviews_session ON session_reviews(session_id);
`
  },
  {
    version: 3,
    name: 'add claims and attacks tracking tables',
    sql: `
CREATE TABLE IF NOT EXISTS claims (
  id                     TEXT PRIMARY KEY,
  meeting_id             TEXT NOT NULL,
  round_index            INTEGER NOT NULL,
  speaker_expert_id      TEXT NOT NULL,
  source_message_id      TEXT NOT NULL,
  claim_text             TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active',
  revised_from_claim_id  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (revised_from_claim_id) REFERENCES claims(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attacks (
  id                      TEXT PRIMARY KEY,
  meeting_id              TEXT NOT NULL,
  round_index             INTEGER NOT NULL,
  attacker_expert_id      TEXT NOT NULL,
  target_expert_id        TEXT,
  target_claim_id         TEXT,
  target_claim_text       TEXT,
  attack_text             TEXT NOT NULL,
  attack_dimensions_json  TEXT NOT NULL,
  source_message_id       TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (target_claim_id) REFERENCES claims(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_meeting_round ON claims(meeting_id, round_index);
CREATE INDEX IF NOT EXISTS idx_claims_source_message ON claims(source_message_id);
CREATE INDEX IF NOT EXISTS idx_attacks_meeting_round ON attacks(meeting_id, round_index);
CREATE INDEX IF NOT EXISTS idx_attacks_source_message ON attacks(source_message_id);
`
  },
  {
    version: 4,
    name: 'add context summaries and model call usage tables',
    sql: `
CREATE TABLE IF NOT EXISTS context_summaries (
  id                         TEXT PRIMARY KEY,
  meeting_id                 TEXT NOT NULL,
  scope                      TEXT NOT NULL,
  round_index                INTEGER,
  summary_text               TEXT NOT NULL,
  structured_summary_json    TEXT NOT NULL,
  source_message_ids_json    TEXT,
  created_by                 TEXT NOT NULL DEFAULT 'system',
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_call_usage (
  id                         TEXT PRIMARY KEY,
  meeting_id                 TEXT NOT NULL,
  phase                      TEXT NOT NULL,
  round_index                INTEGER,
  role                       TEXT NOT NULL,
  expert_id                  TEXT,
  provider                   TEXT NOT NULL,
  model                      TEXT NOT NULL,
  estimated_input_tokens     INTEGER NOT NULL DEFAULT 0,
  estimated_output_tokens    INTEGER NOT NULL DEFAULT 0,
  actual_input_tokens        INTEGER,
  actual_output_tokens       INTEGER,
  estimated_cost             REAL,
  currency                   TEXT NOT NULL DEFAULT 'USD',
  pricing_source             TEXT NOT NULL DEFAULT 'estimated',
  request_started_at         TEXT NOT NULL,
  request_finished_at        TEXT NOT NULL,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_context_summaries_meeting_scope ON context_summaries(meeting_id, scope, round_index);
CREATE INDEX IF NOT EXISTS idx_model_call_usage_meeting ON model_call_usage(meeting_id, provider, model);
`
  },
  {
    version: 5,
    name: 'add project memory suggestions and user interventions',
    sql: `
CREATE TABLE IF NOT EXISTS memory_suggestions (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL,
  content         TEXT NOT NULL,
  category        TEXT NOT NULL,
  source_summary  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  edited_content  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at      TEXT,
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_memory_items (
  id                    TEXT PRIMARY KEY,
  content               TEXT NOT NULL,
  category              TEXT NOT NULL,
  source_suggestion_id  TEXT,
  source_meeting_id     TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_suggestion_id) REFERENCES memory_suggestions(id) ON DELETE SET NULL,
  FOREIGN KEY (source_meeting_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_interventions (
  id                TEXT PRIMARY KEY,
  meeting_id        TEXT NOT NULL,
  phase             TEXT NOT NULL,
  round_index       INTEGER,
  type              TEXT NOT NULL,
  content           TEXT NOT NULL,
  target_expert_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at        TEXT,
  FOREIGN KEY (meeting_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_suggestions_meeting_status ON memory_suggestions(meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_project_memory_items_status_category ON project_memory_items(status, category);
CREATE INDEX IF NOT EXISTS idx_user_interventions_meeting_created ON user_interventions(meeting_id, created_at);
`
  },
  {
    version: 6,
    name: 'add provider model cache',
    sql: `
CREATE TABLE IF NOT EXISTS provider_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'unverified',
  capabilities_json TEXT,
  source TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  last_test_status TEXT,
  last_test_at TEXT,
  UNIQUE(provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_models_provider ON provider_models(provider_id);
`
  },
  {
    version: 7,
    name: 'add room delete cascade to sessions',
    requiresForeignKeysOff: true,
    sql: `
DROP TABLE IF EXISTS sessions_new;

CREATE TABLE sessions_new (
  id              TEXT PRIMARY KEY,
  room_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  user_question   TEXT,
  status          TEXT NOT NULL DEFAULT 'preparing',
  current_phase   TEXT,
  final_summary   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

INSERT INTO sessions_new (
  id,
  room_id,
  title,
  user_question,
  status,
  current_phase,
  final_summary,
  created_at,
  updated_at
)
SELECT
  id,
  room_id,
  title,
  user_question,
  status,
  current_phase,
  final_summary,
  created_at,
  updated_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
`
  },
  {
    version: 8,
    name: 'add session attachments table',
    sql: `
CREATE TABLE IF NOT EXISTS attachments (
  id              TEXT PRIMARY KEY,
  session_id      TEXT,
  original_name   TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  content_text    TEXT NOT NULL,
  summary_text    TEXT,
  status          TEXT NOT NULL DEFAULT 'ready',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments(session_id);
`
  },
  {
    version: 9,
    name: 'add session ended_at timestamp',
    sql: `
ALTER TABLE sessions ADD COLUMN ended_at TEXT;
`
  },
  {
    version: 10,
    name: 'add model call telemetry fields',
    sql: `
ALTER TABLE model_call_usage ADD COLUMN queue_wait_ms INTEGER;
ALTER TABLE model_call_usage ADD COLUMN request_duration_ms INTEGER;
ALTER TABLE model_call_usage ADD COLUMN total_duration_ms INTEGER;
ALTER TABLE model_call_usage ADD COLUMN finish_reason TEXT;
ALTER TABLE model_call_usage ADD COLUMN error_type TEXT;
ALTER TABLE model_call_usage ADD COLUMN timeout_ms INTEGER;
ALTER TABLE model_call_usage ADD COLUMN max_tokens INTEGER;
ALTER TABLE model_call_usage ADD COLUMN thinking_enabled INTEGER;
ALTER TABLE model_call_usage ADD COLUMN response_format TEXT;
ALTER TABLE model_call_usage ADD COLUMN provider_fallback_json TEXT;
`
  },
  {
    version: 11,
    name: 'add settlement rules migration support',
    sql: `
-- ============================================================
-- Migration 11: Settlement Rules - 辩论赛制改动
-- 新增 vote_attempts 表
-- agent_snapshots 增加 consecutive_last_count 字段
-- settlements 增加 raw_hp_after 字段
-- 创建唯一索引确保幂等性
-- ============================================================

-- 1. 新增 vote_attempts 表（存储投票重试过程中的无效输出）
CREATE TABLE IF NOT EXISTS vote_attempts (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_index     INTEGER NOT NULL,
  voter_agent_id  TEXT NOT NULL,
  attempt         INTEGER NOT NULL,
  raw_output      TEXT NOT NULL,
  error           TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vote_attempts_session_round
  ON vote_attempts(session_id, round_index);

-- 2. agent_snapshots 增加 consecutive_last_count 字段
-- 记录该专家截至本轮的连续唯一垫底次数
ALTER TABLE agent_snapshots ADD COLUMN consecutive_last_count INTEGER NOT NULL DEFAULT 0;

-- 3. settlements 增加 raw_hp_after 字段
-- TEXT JSON object: { [agentId]: rawHpAfter }
-- settlements 是整轮结算批次表，没有 agent_id 字段，因此这里存每专家 rawHpAfter 映射
ALTER TABLE settlements ADD COLUMN raw_hp_after TEXT;

-- 4. 唯一索引（确保幂等性）

-- 同一 voter 对同一 target 在同一轮只能有一条最终投票记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_unique
  ON votes(session_id, round_index, voter_agent_id, target_agent_id);

-- 同一专家同一轮次只能有一条快照
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique
  ON agent_snapshots(session_id, round_index, agent_id);

-- 同一 session 同一轮次只能有一条结算批次记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_unique
  ON settlements(session_id, round_index);
`
  }
]

/**
 * 获取当前数据库迁移版本
 */
function getCurrentVersion(db: Database.Database): number {
  try {
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

function assertNoForeignKeyViolations(db: Database.Database): void {
  const violations = db.pragma('foreign_key_check') as Array<Record<string, unknown>>
  if (violations.length > 0) {
    throw new Error(
      `[Migrations] foreign_key_check failed: ${JSON.stringify(violations)}`
    )
  }
}

function checkDuplicatesBeforeV11(db: Database.Database): void {
  const issues: string[] = []

  const dupVotes = db
    .prepare(
      `
      SELECT session_id, round_index, voter_agent_id, target_agent_id, COUNT(*) as cnt
      FROM votes
      GROUP BY session_id, round_index, voter_agent_id, target_agent_id
      HAVING cnt > 1
    `
    )
    .all() as Array<Record<string, unknown>>

  if (dupVotes.length > 0) {
    issues.push(
      `Found ${dupVotes.length} duplicate vote records ` +
        `(session_id + round_index + voter_agent_id + target_agent_id). ` +
        `Duplicates (first 5): ${JSON.stringify(dupVotes.slice(0, 5))}`
    )
  }

  const dupSnapshots = db
    .prepare(
      `
      SELECT session_id, round_index, agent_id, COUNT(*) as cnt
      FROM agent_snapshots
      GROUP BY session_id, round_index, agent_id
      HAVING cnt > 1
    `
    )
    .all() as Array<Record<string, unknown>>

  if (dupSnapshots.length > 0) {
    issues.push(
      `Found ${dupSnapshots.length} duplicate snapshot records ` +
        `(session_id + round_index + agent_id). ` +
        `Duplicates (first 5): ${JSON.stringify(dupSnapshots.slice(0, 5))}`
    )
  }

  const dupSettlements = db
    .prepare(
      `
      SELECT session_id, round_index, COUNT(*) as cnt
      FROM settlements
      GROUP BY session_id, round_index
      HAVING cnt > 1
    `
    )
    .all() as Array<Record<string, unknown>>

  if (dupSettlements.length > 0) {
    issues.push(
      `Found ${dupSettlements.length} duplicate settlement records ` +
        `(session_id + round_index). ` +
        `Duplicates (first 5): ${JSON.stringify(dupSettlements.slice(0, 5))}`
    )
  }

  if (issues.length > 0) {
    const errorMessage =
      `[Migration V11] Cannot proceed: duplicate data detected that would violate unique indexes.\n\n` +
      issues.join('\n\n') +
      `\n\nPlease manually inspect and remove duplicate records before restarting the application.`

    console.error(errorMessage)
    throw new Error(errorMessage)
  }
}

function runSingleMigration(db: Database.Database, migration: Migration): void {
  if (!migration.requiresForeignKeysOff) {
    const runMigration = db.transaction(() => {
      db.exec(migration.sql)
      setCurrentVersion(db, migration.version)
    })

    runMigration()
    return
  }

  const foreignKeysWereEnabled = Boolean(
    db.pragma('foreign_keys', { simple: true })
  )

  db.pragma('foreign_keys = OFF')
  try {
    const runMigration = db.transaction(() => {
      db.exec(migration.sql)
      assertNoForeignKeyViolations(db)
      setCurrentVersion(db, migration.version)
    })

    runMigration()
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysWereEnabled ? 'ON' : 'OFF'}`)
  }

  assertNoForeignKeyViolations(db)
}

/**
 * 合并后安全网：幂等确保 v3-v6 所有表存在。
 * 处理边缘情况：数据库之前可能跑过不同的版本编号方案。
 * 所有语句都是 CREATE IF NOT EXISTS，运行永远安全。
 */
function ensurePostMergeTables(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db)
  if (currentVersion < 3) return

  for (const migration of MIGRATIONS) {
    if (migration.version >= 3 && migration.version <= 6) {
      db.exec(migration.sql)
    }
  }
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
    ensurePostMergeTables(db)
    console.log('[Migrations] 数据库已是最新版本，无需迁移')
    return
  }

  console.log(`[Migrations] 需要执行 ${pendingMigrations.length} 个迁移`)

  for (const migration of pendingMigrations) {
    console.log(
      `[Migrations] 执行迁移 v${migration.version}: ${migration.name}`
    )

    if (migration.version === 11) {
      checkDuplicatesBeforeV11(db)
    }

    runSingleMigration(db, migration)

    console.log(`[Migrations] 迁移 v${migration.version} 完成`)
  }

  ensurePostMergeTables(db)

  console.log('[Migrations] 所有迁移执行完毕')

  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('initialized_at', ?, ?)`
  ).run(now, now)
}
