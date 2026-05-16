/**
 * Review Repository
 *
 * session_reviews 表的 CRUD 操作。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'

export interface SessionReviewRecord {
  id: string
  session_id: string
  review_json: string
  markdown: string | null
  created_at: string
  updated_at: string
}

/**
 * 创建 review 记录
 */
export function insertReview(params: {
  sessionId: string
  reviewJson: string
  markdown: string | null
}): SessionReviewRecord {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO session_reviews (id, session_id, review_json, markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.sessionId, params.reviewJson, params.markdown, now, now)

  return getReviewById(id)!
}

/**
 * 根据 ID 获取 review
 */
export function getReviewById(id: string): SessionReviewRecord | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM session_reviews WHERE id = ?').get(id) as
    | SessionReviewRecord
    | undefined
}

/**
 * 获取某 session 的 review（最新的一条）
 */
export function getReviewBySession(sessionId: string): SessionReviewRecord | undefined {
  const db = getDatabase()
  return db
    .prepare(
      'SELECT * FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(sessionId) as SessionReviewRecord | undefined
}

/**
 * 更新 review 的 markdown 字段
 */
export function updateReviewMarkdown(
  id: string,
  markdown: string
): SessionReviewRecord | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare('UPDATE session_reviews SET markdown = ?, updated_at = ? WHERE id = ?').run(
    markdown,
    now,
    id
  )
  return getReviewById(id)
}
