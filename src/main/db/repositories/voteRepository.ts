/**
 * Vote Repository - 投票数据访问层
 *
 * 处理 votes 表的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { VoteRecord } from '../../voting/voteTypes'

/**
 * 保存一条投票记录
 */
export function insertVote(params: {
  sessionId: string
  roundIndex: number
  voterAgentId: string
  targetAgentId: string
  score: number
  reasonJson: string | null
  valid: boolean
  invalidReason: string | null
}): VoteRecord {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO votes (id, session_id, round_index, voter_agent_id, target_agent_id, score, reason_json, valid, invalid_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.sessionId,
    params.roundIndex,
    params.voterAgentId,
    params.targetAgentId,
    params.score,
    params.reasonJson,
    params.valid ? 1 : 0,
    params.invalidReason,
    now
  )

  return getVoteById(id)!
}

/**
 * 根据 ID 获取投票
 */
export function getVoteById(id: string): VoteRecord | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM votes WHERE id = ?').get(id) as VoteRecord | undefined
}

/**
 * 获取某会议某轮的所有投票
 */
export function getVotesBySessionRound(sessionId: string, roundIndex: number): VoteRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM votes WHERE session_id = ? AND round_index = ? ORDER BY created_at ASC')
    .all(sessionId, roundIndex) as VoteRecord[]
}

/**
 * 获取某会议某轮的有效投票
 */
export function getValidVotesBySessionRound(sessionId: string, roundIndex: number): VoteRecord[] {
  const db = getDatabase()
  return db
    .prepare(
      'SELECT * FROM votes WHERE session_id = ? AND round_index = ? AND valid = 1 ORDER BY created_at ASC'
    )
    .all(sessionId, roundIndex) as VoteRecord[]
}

/**
 * 获取某会议的所有投票
 */
export function getVotesBySession(sessionId: string): VoteRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM votes WHERE session_id = ? ORDER BY round_index ASC, created_at ASC')
    .all(sessionId) as VoteRecord[]
}
