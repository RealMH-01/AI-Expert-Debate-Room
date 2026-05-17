/**
 * 数据库 Schema 定义
 *
 * 包含所有基础数据表的 CREATE TABLE 语句。
 * 表设计遵循开发契约 第六节 中的数据表设计。
 *
 * 注意事项：
 * 1. messages.speaker_id 允许为空，支持 system 类型消息
 * 2. settlements 表有独立的 status 字段表达整轮结算批次状态
 *    (pending / applied / vetoed)，不仅仅依赖单条明细的 vetoed 字段
 */

/** 所有建表 SQL，按依赖顺序排列 */
export const SCHEMA_SQL = `
-- ============================
-- 应用元信息
-- ============================
CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================
-- 会议室（可复用配置）
-- ============================
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  rules_json  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================
-- 智能体（主理人或专家，挂在 Room 下）
-- ============================
CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  room_id             TEXT NOT NULL,
  role                TEXT NOT NULL,
  name                TEXT NOT NULL,
  provider            TEXT,
  model               TEXT,
  persona             TEXT,
  domain              TEXT,
  stance              TEXT,
  memory              TEXT,
  supports_thinking   INTEGER DEFAULT 0,
  thinking_enabled    INTEGER DEFAULT 1,
  hp                  INTEGER DEFAULT 100,
  max_hp              INTEGER DEFAULT 100,
  influence           INTEGER DEFAULT 0,
  prestige            INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'active',
  aggression          INTEGER DEFAULT 50,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- ============================
-- 会议实例
-- ============================
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  room_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  user_question   TEXT,
  status          TEXT NOT NULL DEFAULT 'preparing',
  current_phase   TEXT,
  final_summary   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- ============================
-- 辩论消息
-- speaker_id 允许为空，支持 system 类型消息（无真实 agent_id）
-- ============================
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  round_index     INTEGER DEFAULT 0,
  phase           TEXT NOT NULL,
  speaker_id      TEXT,
  speaker_name    TEXT,
  speaker_role    TEXT,
  content         TEXT NOT NULL,
  structured_json TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================
-- 投票
-- ============================
CREATE TABLE IF NOT EXISTS votes (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  round_index       INTEGER NOT NULL,
  voter_agent_id    TEXT NOT NULL,
  target_agent_id   TEXT NOT NULL,
  score             INTEGER NOT NULL,
  reason_json       TEXT,
  valid             INTEGER DEFAULT 1,
  invalid_reason    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================
-- 智能体快照（Session/Round 级别状态记录）
-- ============================
CREATE TABLE IF NOT EXISTS agent_snapshots (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  round_index INTEGER NOT NULL,
  agent_id    TEXT NOT NULL,
  hp          INTEGER NOT NULL,
  influence   INTEGER NOT NULL,
  prestige    INTEGER NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================
-- HP 结算记录
-- status 字段表达整个结算批次状态：pending / applied / vetoed
-- 支持用户否决整轮结算
-- ============================
CREATE TABLE IF NOT EXISTS settlements (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  round_index     INTEGER NOT NULL,
  settlement_json TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================
-- Claim Tracker
-- ============================
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

-- ============================
-- Attack Dimension Tracker
-- ============================
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

-- ============================
-- 全局设置
-- ============================
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================
-- 索引
-- ============================
CREATE INDEX IF NOT EXISTS idx_agents_room_id ON agents(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_round ON messages(session_id, round_index);
CREATE INDEX IF NOT EXISTS idx_votes_session_round ON votes(session_id, round_index);
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_session ON agent_snapshots(session_id, round_index);
CREATE INDEX IF NOT EXISTS idx_settlements_session_round ON settlements(session_id, round_index);
CREATE INDEX IF NOT EXISTS idx_claims_meeting_round ON claims(meeting_id, round_index);
CREATE INDEX IF NOT EXISTS idx_claims_source_message ON claims(source_message_id);
CREATE INDEX IF NOT EXISTS idx_attacks_meeting_round ON attacks(meeting_id, round_index);
CREATE INDEX IF NOT EXISTS idx_attacks_source_message ON attacks(source_message_id);
`;
