/**
 * History Repository
 *
 * 历史会议列表查询，聚合信息（专家数、消息数、投票/结算/Hell Pool 状态）。
 * 支持搜索、按 room 过滤、时间倒序。
 * 删除 session 及其所有关联 session-local 数据。
 */

import { getDatabase } from '../sqlite'
import type { DebateAttachmentContext, Session } from '../../../shared/types'
import type { AttackRecord, ClaimRecord } from './claimRepository'
import type { ContextSummaryRecord } from './contextSummaryRepository'
import type { ModelCallUsageRecord } from './modelCallUsageRepository'
import type {
  MemorySuggestionRecord,
  ProjectMemoryItemRecord,
  UserInterventionRecord
} from '../../memory/projectMemory'
import * as attachmentRepo from './attachmentRepository'

export interface HistorySessionItem {
  id: string
  room_id: string
  room_name: string
  title: string
  user_question: string | null
  status: string
  created_at: string
  updated_at: string
  expert_count: number
  message_count: number
  has_votes: boolean
  has_settlement: boolean
  has_hell_pool: boolean
  final_summary: string | null
}

export interface HistoryListParams {
  search?: string
  roomId?: string
  limit?: number
  offset?: number
}

/**
 * 获取历史会议列表（聚合查询，避免 N+1）
 */
export function getHistoryList(params: HistoryListParams = {}): {
  items: HistorySessionItem[]
  total: number
} {
  const db = getDatabase()
  const { search, roomId, limit = 50, offset = 0 } = params

  const conditions: string[] = []
  const args: unknown[] = []

  if (roomId) {
    conditions.push('s.room_id = ?')
    args.push(roomId)
  }

  if (search && search.trim()) {
    conditions.push('(s.title LIKE ? OR s.user_question LIKE ?)')
    const like = `%${search.trim()}%`
    args.push(like, like)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Count total
  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM sessions s ${whereClause}`)
    .get(...args) as { total: number }

  // Main query with aggregation via subqueries for correctness
  const sql = `
    SELECT
      s.id,
      s.room_id,
      COALESCE(r.name, '(已删除)') as room_name,
      s.title,
      s.user_question,
      s.status,
      s.created_at,
      s.updated_at,
      s.final_summary,
      (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id AND sp.role = 'expert') as expert_count,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count,
      (SELECT COUNT(*) FROM votes v WHERE v.session_id = s.id) > 0 as has_votes,
      (SELECT COUNT(*) FROM settlements st WHERE st.session_id = s.id AND st.status = 'applied') > 0 as has_settlement,
      (SELECT COUNT(*) FROM session_participants sp2 WHERE sp2.session_id = s.id AND sp2.status = 'hell_pool') > 0 as has_hell_pool
    FROM sessions s
    LEFT JOIN rooms r ON r.id = s.room_id
    ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `

  const rows = db.prepare(sql).all(...args, limit, offset) as HistorySessionItem[]

  // SQLite returns 0/1 for booleans, convert
  const items = rows.map((row) => ({
    ...row,
    has_votes: !!row.has_votes,
    has_settlement: !!row.has_settlement,
    has_hell_pool: !!row.has_hell_pool
  }))

  return { items, total: countRow.total }
}

/**
 * 获取会议完整详情（单次查询多表，避免 N+1）
 */
export interface SessionFullDetail {
  session: Session
  room_name: string
  participants: SessionParticipant[]
  messages: SessionMessage[]
  votes: SessionVote[]
  settlements: SessionSettlement[]
  snapshots: SessionSnapshot[]
  claims: ClaimRecord[]
  attacks: AttackRecord[]
  context_summaries: ContextSummaryRecord[]
  model_call_usage: ModelCallUsageRecord[]
  attachments: DebateAttachmentContext[]
  memory_suggestions: MemorySuggestionRecord[]
  project_memory_items: ProjectMemoryItemRecord[]
  user_interventions: UserInterventionRecord[]
  review: SessionReviewRecord | null
}

export interface SessionParticipant {
  id: string
  session_id: string
  agent_id: string
  role: string
  name: string
  provider: string | null
  model: string | null
  persona: string | null
  domain: string | null
  stance: string | null
  initial_hp: number
  final_hp: number | null
  initial_influence: number
  initial_prestige: number
  status: string
  created_at: string
}

export interface SessionMessage {
  id: string
  session_id: string
  round_index: number
  phase: string
  speaker_id: string | null
  speaker_name: string | null
  speaker_role: string | null
  content: string
  structured_json: string | null
  created_at: string
}

export interface SessionVote {
  id: string
  session_id: string
  round_index: number
  voter_agent_id: string
  target_agent_id: string
  score: number
  reason_json: string | null
  valid: number
  invalid_reason: string | null
  created_at: string
}

export interface SessionSettlement {
  id: string
  session_id: string
  round_index: number
  settlement_json: string
  status: string
  created_at: string
  applied_at: string | null
}

export interface SessionSnapshot {
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

export interface SessionReviewRecord {
  id: string
  session_id: string
  review_json: string
  markdown: string | null
  created_at: string
  updated_at: string
}

/**
 * 获取单个 session 的完整详情
 */
export function getSessionFullDetail(sessionId: string): SessionFullDetail | null {
  const db = getDatabase()

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | Session
    | undefined
  if (!session) return null

  const roomRow = db.prepare('SELECT name FROM rooms WHERE id = ?').get(session.room_id) as
    | { name: string }
    | undefined
  const room_name = roomRow?.name ?? '(已删除)'

  // Check if session_participants table has data for this session
  const participants = db
    .prepare(
      'SELECT * FROM session_participants WHERE session_id = ? ORDER BY role ASC, created_at ASC'
    )
    .all(sessionId) as SessionParticipant[]

  const messages = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as SessionMessage[]

  const votes = db
    .prepare(
      'SELECT * FROM votes WHERE session_id = ? ORDER BY round_index ASC, created_at ASC'
    )
    .all(sessionId) as SessionVote[]

  const settlements = db
    .prepare('SELECT * FROM settlements WHERE session_id = ? ORDER BY round_index ASC')
    .all(sessionId) as SessionSettlement[]

  const snapshots = db
    .prepare(
      'SELECT * FROM agent_snapshots WHERE session_id = ? ORDER BY round_index ASC, created_at ASC'
    )
    .all(sessionId) as SessionSnapshot[]

  const claims = db
    .prepare('SELECT * FROM claims WHERE meeting_id = ? ORDER BY round_index ASC, created_at ASC')
    .all(sessionId) as ClaimRecord[]

  const attacks = db
    .prepare('SELECT * FROM attacks WHERE meeting_id = ? ORDER BY round_index ASC, created_at ASC')
    .all(sessionId) as AttackRecord[]

  const context_summaries = db
    .prepare(
      `SELECT * FROM context_summaries
       WHERE meeting_id = ?
       ORDER BY CASE scope WHEN 'session' THEN 0 ELSE 1 END, round_index ASC, created_at ASC`
    )
    .all(sessionId) as ContextSummaryRecord[]

  const model_call_usage = db
    .prepare(
      `SELECT * FROM model_call_usage
       WHERE meeting_id = ?
       ORDER BY request_started_at ASC, created_at ASC`
    )
    .all(sessionId) as ModelCallUsageRecord[]

  const attachments = attachmentRepo.getAttachmentsBySession(sessionId)

  const memory_suggestions = db
    .prepare(
      `SELECT * FROM memory_suggestions
       WHERE meeting_id = ?
       ORDER BY created_at ASC`
    )
    .all(sessionId) as MemorySuggestionRecord[]

  const project_memory_items = db
    .prepare(
      `SELECT * FROM project_memory_items
       WHERE status <> 'deleted'
       ORDER BY status ASC, category ASC, created_at DESC`
    )
    .all() as ProjectMemoryItemRecord[]

  const user_interventions = db
    .prepare(
      `SELECT * FROM user_interventions
       WHERE meeting_id = ?
       ORDER BY created_at ASC`
    )
    .all(sessionId) as UserInterventionRecord[]

  const review = db
    .prepare('SELECT * FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as SessionReviewRecord | undefined

  return {
    session,
    room_name,
    participants,
    messages,
    votes,
    settlements,
    snapshots,
    claims,
    attacks,
    context_summaries,
    model_call_usage,
    attachments,
    memory_suggestions,
    project_memory_items,
    user_interventions,
    review: review ?? null
  }
}

/**
 * 删除 session 及其所有 session-local 数据
 * 不删除 rooms、agents，不回滚已应用的 HP/status 变化
 */
export function deleteSession(sessionId: string): boolean {
  const db = getDatabase()

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
  if (!session) return false

  const deleteTxn = db.transaction(() => {
    db.prepare('DELETE FROM session_reviews WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM user_interventions WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM memory_suggestions WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM model_call_usage WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM context_summaries WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM attacks WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM claims WHERE meeting_id = ?').run(sessionId)
    db.prepare('DELETE FROM agent_snapshots WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM settlements WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM votes WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM attachments WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM session_participants WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  })

  deleteTxn()
  return true
}

/**
 * 获取所有 room（供过滤下拉使用）
 */
export function getRoomsForFilter(): Array<{ id: string; name: string }> {
  const db = getDatabase()
  return db.prepare('SELECT id, name FROM rooms ORDER BY name ASC').all() as Array<{
    id: string
    name: string
  }>
}
