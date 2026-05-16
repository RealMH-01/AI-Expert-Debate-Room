/**
 * Message Repository
 *
 * 数据访问层：辩论消息的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { Message, DebatePhase } from '../../../shared/types'

/**
 * 保存一条消息
 */
export function insertMessage(params: {
  sessionId: string
  roundIndex: number
  phase: DebatePhase
  speakerId: string | null
  speakerName: string | null
  speakerRole: string | null
  content: string
  structuredJson?: string | null
}): Message {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO messages (id, session_id, round_index, phase, speaker_id, speaker_name, speaker_role, content, structured_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.sessionId,
    params.roundIndex,
    params.phase,
    params.speakerId,
    params.speakerName,
    params.speakerRole,
    params.content,
    params.structuredJson ?? null,
    now
  )

  return getMessageById(id)!
}

/**
 * 根据 ID 获取消息
 */
export function getMessageById(id: string): Message | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined
}

/**
 * 获取会议的所有消息（按创建时间排序）
 */
export function getMessagesBySession(sessionId: string): Message[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as Message[]
}

/**
 * 获取会议某一轮的消息
 */
export function getMessagesByRound(sessionId: string, roundIndex: number): Message[] {
  const db = getDatabase()
  return db
    .prepare(
      'SELECT * FROM messages WHERE session_id = ? AND round_index = ? ORDER BY created_at ASC'
    )
    .all(sessionId, roundIndex) as Message[]
}

/**
 * 获取会议的消息数量
 */
export function getMessageCount(sessionId: string): number {
  const db = getDatabase()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
    .get(sessionId) as { count: number }
  return row.count
}
