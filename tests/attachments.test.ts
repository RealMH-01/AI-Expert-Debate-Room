import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_TEXT_BYTES,
  validateDebateAttachments
} from '../src/shared/attachments'
import { formatSharedAttachmentsForPrompt } from '../src/main/prompts/attachmentPrompts'
import {
  getAttachmentMetadataBySession,
  getAttachmentsBySession,
  insertAttachmentsForSession
} from '../src/main/db/repositories/attachmentRepository'
import type { DebateAttachmentInput } from '../src/shared/types'

let activeDb: AttachmentMemoryDb | null = null

vi.mock('../src/main/db/sqlite', () => ({
  getDatabase: () => {
    if (!activeDb) throw new Error('test database is not initialized')
    return activeDb
  }
}))

interface AttachmentRow {
  id: string
  session_id: string
  original_name: string
  mime_type: string | null
  size_bytes: number
  content_text: string
  summary_text: string | null
  status: string
  created_at: string
}

class AttachmentMemoryDb {
  attachments: AttachmentRow[] = []

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => fn(...args)
  }

  prepare(sql: string): {
    run: (...args: unknown[]) => { changes: number }
    all: (...args: unknown[]) => unknown[]
  } {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    return {
      run: (...args: unknown[]) => this.run(normalized, args),
      all: (...args: unknown[]) => this.all(normalized, args)
    }
  }

  private run(sql: string, args: unknown[]): { changes: number } {
    if (
      sql ===
      'INSERT INTO attachments ( id, session_id, original_name, mime_type, size_bytes, content_text, summary_text, status, created_at ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ) {
      this.attachments.push({
        id: String(args[0]),
        session_id: String(args[1]),
        original_name: String(args[2]),
        mime_type: args[3] == null ? null : String(args[3]),
        size_bytes: Number(args[4]),
        content_text: String(args[5]),
        summary_text: args[6] == null ? null : String(args[6]),
        status: String(args[7]),
        created_at: String(args[8])
      })
      return { changes: 1 }
    }

    if (sql === 'DELETE FROM sessions WHERE id = ?') {
      const sessionId = String(args[0])
      this.attachments = this.attachments.filter((row) => row.session_id !== sessionId)
      return { changes: 1 }
    }

    throw new Error(`Unhandled run SQL: ${sql}`)
  }

  private all(sql: string, args: unknown[]): unknown[] {
    if (
      sql ===
      'SELECT * FROM attachments WHERE session_id = ? ORDER BY created_at ASC'
    ) {
      return this.attachments.filter((row) => row.session_id === args[0])
    }

    if (
      sql ===
      'SELECT id, session_id, original_name, mime_type, size_bytes, length(content_text) AS content_length, summary_text, status, created_at FROM attachments WHERE session_id = ? ORDER BY created_at ASC'
    ) {
      return this.attachments
        .filter((row) => row.session_id === args[0])
        .map((row) => ({
          id: row.id,
          session_id: row.session_id,
          original_name: row.original_name,
          mime_type: row.mime_type,
          size_bytes: row.size_bytes,
          content_length: row.content_text.length,
          summary_text: row.summary_text,
          status: row.status,
          created_at: row.created_at
        }))
    }

    throw new Error(`Unhandled all SQL: ${sql}`)
  }
}

function createAttachment(
  originalName: string,
  contentText: string,
  overrides: Partial<DebateAttachmentInput> = {}
): DebateAttachmentInput {
  return {
    originalName,
    mimeType: 'text/plain',
    sizeBytes: contentText.length,
    contentText,
    ...overrides
  }
}

afterEach(() => {
  activeDb = null
})

describe('attachment input validation', () => {
  it('accepts txt, md, markdown, json, and csv files', () => {
    const attachments = [
      createAttachment('notes.txt', 'text'),
      createAttachment('outline.md', '# outline'),
      createAttachment('world.markdown', '# world'),
      createAttachment('data.json', '{"ok":true}'),
      createAttachment('beats.csv', 'a,b')
    ]

    expect(validateDebateAttachments(attachments)).toEqual({
      valid: true,
      attachments,
      errors: []
    })
  })

  it('rejects unsupported file extensions', () => {
    const result = validateDebateAttachments([
      createAttachment('draft.pdf', 'not allowed')
    ])

    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('draft.pdf')
    expect(result.errors.join('\n')).toContain('不支持')
  })

  it('rejects a single file over 200KB', () => {
    const result = validateDebateAttachments([
      createAttachment('large.txt', 'x', {
        sizeBytes: MAX_ATTACHMENT_SIZE_BYTES + 1
      })
    ])

    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('过大')
  })

  it('rejects a file whose content is over 200KB even when sizeBytes is spoofed smaller', () => {
    const result = validateDebateAttachments([
      createAttachment('spoofed.txt', 'x'.repeat(MAX_ATTACHMENT_SIZE_BYTES + 1), {
        sizeBytes: 1
      })
    ])

    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('过大')
  })

  it('rejects total attachment text over 300KB', () => {
    const result = validateDebateAttachments([
      createAttachment('a.txt', 'a'.repeat(150 * 1024)),
      createAttachment('b.txt', 'b'.repeat(150 * 1024)),
      createAttachment('c.txt', 'c')
    ])

    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('总文本')
  })
})

describe('prompt attachment formatting', () => {
  it('omits the shared attachment block when there are no attachments', () => {
    expect(formatSharedAttachmentsForPrompt()).toBe('')
    expect(formatSharedAttachmentsForPrompt([])).toBe('')
  })

  it('includes a shared public attachment block when attachments exist', () => {
    const text = formatSharedAttachmentsForPrompt([
      {
        id: 'attachment-1',
        originalName: 'outline.md',
        mimeType: 'text/markdown',
        sizeBytes: 9,
        contentText: '# Outline'
      }
    ])

    expect(text).toContain('以下是本次会议所有参与者共享的公共素材')
    expect(text).toContain('outline.md')
    expect(text).toContain('# Outline')
  })

  it('gives every prompt builder the same shared attachment text', async () => {
    const { buildExpertInitialPrompt } = await import('../src/main/prompts/expertPrompts')
    const { buildModeratorOpeningPrompt } = await import('../src/main/prompts/moderatorPrompts')
    const agent = {
      id: 'agent-1',
      room_id: 'room-1',
      role: 'expert' as const,
      name: 'Expert',
      provider: 'mock',
      model: 'mock',
      persona: null,
      domain: null,
      stance: null,
      memory: null,
      supports_thinking: 0,
      thinking_enabled: 0,
      hp: 100,
      max_hp: 100,
      influence: 0,
      prestige: 0,
      status: 'active' as const,
      aggression: 50,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    const attachments = [
      createAttachment('shared.txt', 'shared material')
    ].map((attachment) => ({
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      contentText: attachment.contentText
    }))
    const input = {
      role: 'expert' as const,
      phase: 'expert_initial' as const,
      agent,
      userQuestion: 'question',
      roundIndex: 0,
      visibleTranscript: [],
      otherExperts: [],
      rules: {
        min_debate_rounds: 3,
        initial_hp: 100,
        max_hp: 100,
        max_hp_loss_per_round: 20,
        first_place_hp_gain: 3,
        second_place_hp_gain: 1,
        second_last_hp_loss: 8,
        last_place_hp_loss: 15,
        stop_settlement_when_alive_experts_less_than: 3,
        voting_anonymous: true,
        allow_user_veto_settlement: true,
        influence_affects_speaking_order: true,
        influence_affects_tie_break: true,
        influence_affects_final_summary_weight: false,
        moderator_can_validate_votes: false
      },
      roomName: 'room',
      attachments
    }

    const expertText = buildExpertInitialPrompt(input)
      .map((message) => message.content)
      .join('\n')
    const moderatorText = buildModeratorOpeningPrompt({
      ...input,
      role: 'moderator',
      phase: 'moderator_opening',
      agent: { ...agent, role: 'moderator' as const }
    })
      .map((message) => message.content)
      .join('\n')

    expect(expertText).toContain('shared material')
    expect(moderatorText).toContain('shared material')
  })

  it('truncates long attachment content and marks the original length', () => {
    const text = formatSharedAttachmentsForPrompt([
      {
        originalName: 'long.txt',
        mimeType: 'text/plain',
        sizeBytes: 13000,
        contentText: 'x'.repeat(13000)
      }
    ])

    expect(text).toContain('[内容已截断，原始长度 13000 字符]')
    expect(text.length).toBeLessThan(13000)
  })
})

describe('attachment repository and schema', () => {
  it('inserts attachments and reads them by session', () => {
    activeDb = new AttachmentMemoryDb()

    const inserted = insertAttachmentsForSession('session-1', [
      createAttachment('outline.md', '# outline')
    ])

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      sessionId: 'session-1',
      originalName: 'outline.md',
      contentText: '# outline',
      status: 'ready'
    })
    expect(getAttachmentsBySession('session-1')).toEqual(inserted)
  })

  it('keeps full content reads separate from metadata-only reads', () => {
    activeDb = new AttachmentMemoryDb()

    insertAttachmentsForSession('session-1', [
      createAttachment('outline.md', '# outline')
    ])

    const fullAttachments = getAttachmentsBySession('session-1')
    const metadata = getAttachmentMetadataBySession('session-1')

    expect(fullAttachments[0]).toMatchObject({
      originalName: 'outline.md',
      contentText: '# outline'
    })
    expect(metadata[0]).toMatchObject({
      originalName: 'outline.md',
      contentLength: '# outline'.length,
      status: 'ready'
    })
    expect('contentText' in metadata[0]).toBe(false)
  })

  it('uses metadata-only attachments for history detail and attachment IPC', () => {
    const historyRepository = readFileSync(
      new URL('../src/main/db/repositories/historyRepository.ts', import.meta.url),
      'utf8'
    )
    const attachmentIpc = readFileSync(
      new URL('../src/main/ipc/attachment.ipc.ts', import.meta.url),
      'utf8'
    )

    expect(historyRepository).toMatch(/attachments:\s*DebateAttachmentMetadata\[\]/)
    expect(historyRepository).toMatch(/getAttachmentMetadataBySession\(sessionId\)/)
    expect(historyRepository).not.toMatch(/getAttachmentsBySession\(sessionId\)/)
    expect(attachmentIpc).toMatch(/getAttachmentMetadataBySession\(sessionId\)/)
    expect(attachmentIpc).not.toMatch(/getAttachmentsBySession\(sessionId\)/)
  })

  it('renders SessionDetail attachment character counts from contentLength', () => {
    const sessionDetail = readFileSync(
      new URL('../src/renderer/components/SessionDetail.tsx', import.meta.url),
      'utf8'
    )

    expect(sessionDetail).toMatch(/contentLength:\s*number/)
    expect(sessionDetail).toContain('{attachment.contentLength}')
    expect(sessionDetail).not.toContain('attachment.contentText.length')
  })

  it('defines additive schema and v8 migration with session cascade', () => {
    const schema = readFileSync(new URL('../src/main/db/schema.ts', import.meta.url), 'utf8')
    const migrations = readFileSync(
      new URL('../src/main/db/migrations.ts', import.meta.url),
      'utf8'
    )

    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS attachments/)
    expect(schema).toMatch(/FOREIGN KEY \(session_id\) REFERENCES sessions\(id\) ON DELETE CASCADE/)
    expect(schema).toMatch(/CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments\(session_id\)/)
    expect(migrations).toMatch(/version:\s*8/)
    expect(migrations).toMatch(/CREATE TABLE IF NOT EXISTS attachments/)
    expect(migrations).toMatch(/CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments\(session_id\)/)
    expect(migrations).toMatch(/migration\.version >= 3 && migration\.version <= 6/)
  })
})
