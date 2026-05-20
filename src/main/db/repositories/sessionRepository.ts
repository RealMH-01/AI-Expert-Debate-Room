/**
 * Session Repository
 *
 * 数据访问层：会议实例 (session) 的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { Session, SessionStatus, DebatePhase } from '../../../shared/types'

const TERMINAL_SESSION_STATUSES = new Set<SessionStatus>(['finished', 'failed', 'aborted'])

/**
 * 创建会议
 */
export function createSession(
  roomId: string,
  title: string,
  userQuestion: string
): Session {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO sessions (id, room_id, title, user_question, status, current_phase, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', 'moderator_opening', ?, ?)`
  ).run(id, roomId, title, userQuestion, now, now)

  return getSessionById(id)!
}

/**
 * 更新会议状态
 */
export function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Session | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()
  if (TERMINAL_SESSION_STATUSES.has(status)) {
    db.prepare(`UPDATE sessions SET status = ?, updated_at = ?, ended_at = ? WHERE id = ?`).run(
      status,
      now,
      now,
      sessionId
    )
  } else {
    db.prepare(`UPDATE sessions SET status = ?, updated_at = ?, ended_at = NULL WHERE id = ?`).run(
      status,
      now,
      sessionId
    )
  }
  return getSessionById(sessionId)
}

/**
 * 更新会议当前阶段
 */
export function updateSessionPhase(
  sessionId: string,
  phase: DebatePhase
): Session | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(`UPDATE sessions SET current_phase = ?, updated_at = ? WHERE id = ?`).run(
    phase,
    now,
    sessionId
  )
  return getSessionById(sessionId)
}

/**
 * 完成会议 - 设置最终总结并标记为 finished
 */
export function finishSession(
  sessionId: string,
  finalSummary: string
): Session | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE sessions SET status = 'finished', final_summary = ?, current_phase = 'moderator_final_summary', updated_at = ?, ended_at = ? WHERE id = ?`
  ).run(finalSummary, now, now, sessionId)
  return getSessionById(sessionId)
}

/**
 * 标记会议失败
 */
export function failSession(
  sessionId: string,
  errorMessage: string
): Session | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE sessions SET status = 'failed', final_summary = ?, updated_at = ?, ended_at = ? WHERE id = ?`
  ).run(`[ERROR] ${errorMessage}`, now, now, sessionId)
  return getSessionById(sessionId)
}

export function abortSession(
  sessionId: string,
  reason = '用户已中止本次辩论。'
): Session | undefined {
  const current = getSessionById(sessionId)
  if (!current) return undefined
  if (TERMINAL_SESSION_STATUSES.has(current.status)) {
    return current
  }

  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE sessions SET status = 'aborted', final_summary = ?, updated_at = ?, ended_at = ? WHERE id = ?`
  ).run(reason, now, now, sessionId)
  return getSessionById(sessionId)
}

/**
 * 根据 ID 获取会议
 */
export function getSessionById(id: string): Session | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined
}

/**
 * 获取会议室的所有会议列表
 */
export function getSessionsByRoom(roomId: string): Session[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM sessions WHERE room_id = ? ORDER BY created_at DESC')
    .all(roomId) as Session[]
}

/**
 * 获取会议室正在运行的会议
 */
export function getRunningSession(roomId: string): Session | undefined {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM sessions WHERE room_id = ? AND status = 'running' LIMIT 1")
    .get(roomId) as Session | undefined
}

export function getRunningSessions(): Session[] {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'running' ORDER BY created_at ASC")
    .all() as Session[]
}
