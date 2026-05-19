import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { DebateAttachmentContext, DebateAttachmentInput } from '../../../shared/types'

interface AttachmentRow {
  id: string
  session_id: string | null
  original_name: string
  mime_type: string | null
  size_bytes: number
  content_text: string
  summary_text: string | null
  status: string
  created_at: string
}

export function insertAttachmentsForSession(
  sessionId: string,
  attachments: DebateAttachmentInput[]
): DebateAttachmentContext[] {
  if (attachments.length === 0) return []

  const db = getDatabase()
  const now = new Date().toISOString()
  const rows: DebateAttachmentContext[] = []

  const insert = db.prepare(
    `INSERT INTO attachments (
      id,
      session_id,
      original_name,
      mime_type,
      size_bytes,
      content_text,
      summary_text,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const insertTxn = db.transaction(() => {
    for (const attachment of attachments) {
      const id = uuidv4()
      insert.run(
        id,
        sessionId,
        attachment.originalName,
        attachment.mimeType ?? null,
        attachment.sizeBytes,
        attachment.contentText,
        null,
        'ready',
        now
      )
      rows.push({
        id,
        sessionId,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType ?? null,
        sizeBytes: attachment.sizeBytes,
        contentText: attachment.contentText,
        summaryText: null,
        status: 'ready',
        createdAt: now
      })
    }
  })

  insertTxn()
  return rows
}

export function getAttachmentsBySession(sessionId: string): DebateAttachmentContext[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM attachments WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as AttachmentRow[]

  return rows.map(rowToContext)
}

function rowToContext(row: AttachmentRow): DebateAttachmentContext {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentText: row.content_text,
    summaryText: row.summary_text,
    status: row.status,
    createdAt: row.created_at
  }
}
