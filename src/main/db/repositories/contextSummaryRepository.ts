import { randomUUID } from 'node:crypto'
import { getDatabase } from '../sqlite'
import type { BuiltContextSummary } from '../../context/contextCompressor'

export interface ContextSummaryRecord {
  id: string
  meeting_id: string
  scope: 'round' | 'session'
  round_index: number | null
  summary_text: string
  structured_summary_json: string
  source_message_ids_json: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export function insertContextSummary(summary: BuiltContextSummary): ContextSummaryRecord {
  const db = getDatabase()
  const now = new Date().toISOString()
  const record = {
    id: randomUUID(),
    meeting_id: summary.meeting_id,
    scope: summary.scope,
    round_index: summary.round_index,
    summary_text: summary.summary_text,
    structured_summary_json: JSON.stringify(summary.structured_summary),
    source_message_ids_json: summary.source_message_ids.length > 0
      ? JSON.stringify(summary.source_message_ids)
      : null,
    created_by: summary.created_by,
    created_at: now,
    updated_at: now
  }

  db.prepare(
    `INSERT INTO context_summaries (
      id, meeting_id, scope, round_index, summary_text, structured_summary_json,
      source_message_ids_json, created_by, created_at, updated_at
    ) VALUES (
      @id, @meeting_id, @scope, @round_index, @summary_text, @structured_summary_json,
      @source_message_ids_json, @created_by, @created_at, @updated_at
    )`
  ).run(record)

  return record
}

export function getContextSummariesForMeeting(meetingId: string): ContextSummaryRecord[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM context_summaries
       WHERE meeting_id = ?
       ORDER BY CASE scope WHEN 'session' THEN 0 ELSE 1 END, round_index ASC, created_at ASC`
    )
    .all(meetingId) as ContextSummaryRecord[]
}
