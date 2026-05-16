/**
 * Settlement Repository - HP 结算数据访问层
 *
 * 处理 settlements 表和 agent_snapshots 表的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { SettlementRecord } from '../../voting/voteTypes'

/**
 * 保存结算记录（初始状态 pending）
 */
export function insertSettlement(params: {
  sessionId: string
  roundIndex: number
  settlementJson: string
  status?: string
}): SettlementRecord {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO settlements (id, session_id, round_index, settlement_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.sessionId, params.roundIndex, params.settlementJson, params.status || 'pending', now)

  return getSettlementById(id)!
}

/**
 * 更新结算状态
 */
export function updateSettlementStatus(
  id: string,
  status: 'applied' | 'vetoed' | 'skipped'
): SettlementRecord | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()

  if (status === 'applied') {
    db.prepare(`UPDATE settlements SET status = ?, applied_at = ? WHERE id = ?`).run(status, now, id)
  } else {
    db.prepare(`UPDATE settlements SET status = ? WHERE id = ?`).run(status, id)
  }

  return getSettlementById(id)
}

/**
 * 根据 ID 获取结算记录
 */
export function getSettlementById(id: string): SettlementRecord | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM settlements WHERE id = ?').get(id) as SettlementRecord | undefined
}

/**
 * 获取某会议某轮的结算记录
 */
export function getSettlementBySessionRound(
  sessionId: string,
  roundIndex: number
): SettlementRecord | undefined {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM settlements WHERE session_id = ? AND round_index = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId, roundIndex) as SettlementRecord | undefined
}

/**
 * 获取某会议的所有结算记录
 */
export function getSettlementsBySession(sessionId: string): SettlementRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM settlements WHERE session_id = ? ORDER BY round_index ASC')
    .all(sessionId) as SettlementRecord[]
}

/**
 * 获取某会议最新的 pending 结算
 */
export function getPendingSettlement(sessionId: string): SettlementRecord | undefined {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM settlements WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
    .get(sessionId) as SettlementRecord | undefined
}

// ===== Agent Snapshots =====

export interface AgentSnapshotRecord {
  id: string
  session_id: string
  round_index: number
  agent_id: string
  hp: number
  influence: number
  prestige: number
  status: string
  created_at: string
}

/**
 * 保存 agent 快照
 */
export function insertAgentSnapshot(params: {
  sessionId: string
  roundIndex: number
  agentId: string
  hp: number
  influence: number
  prestige: number
  status: string
}): AgentSnapshotRecord {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO agent_snapshots (id, session_id, round_index, agent_id, hp, influence, prestige, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.sessionId, params.roundIndex, params.agentId, params.hp, params.influence, params.prestige, params.status, now)

  return db.prepare('SELECT * FROM agent_snapshots WHERE id = ?').get(id) as AgentSnapshotRecord
}

/**
 * 获取某会议某轮的所有快照
 */
export function getSnapshotsBySessionRound(sessionId: string, roundIndex: number): AgentSnapshotRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM agent_snapshots WHERE session_id = ? AND round_index = ? ORDER BY created_at ASC')
    .all(sessionId, roundIndex) as AgentSnapshotRecord[]
}
