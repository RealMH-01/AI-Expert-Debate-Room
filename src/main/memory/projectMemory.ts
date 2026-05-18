import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SessionFullDetail } from '../db/repositories/historyRepository'

export type MemoryCategory =
  | 'core_canon'
  | 'confirmed_setting'
  | 'tentative_idea'
  | 'rejected_idea'

export type MemorySuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'edited'
export type ProjectMemoryStatus = 'active' | 'disabled' | 'deleted'
export type UserInterventionStatus = 'pending' | 'applied' | 'dismissed' | 'failed'
export type UserInterventionType =
  | 'add_information'
  | 'ask_expert_focus'
  | 'request_extra_round'
  | 'request_early_summary'
  | 'reject_moderator_summary'
  | 'terminate_session'
  | 'note_only'

export interface MemorySuggestionRecord {
  id: string
  meeting_id: string
  content: string
  category: MemoryCategory
  source_summary: string
  status: MemorySuggestionStatus
  edited_content: string | null
  created_at: string
  updated_at: string
  decided_at: string | null
}

export interface ProjectMemoryItemRecord {
  id: string
  content: string
  category: MemoryCategory
  source_suggestion_id: string | null
  source_meeting_id: string | null
  status: ProjectMemoryStatus
  created_at: string
  updated_at: string
}

export interface UserInterventionRecord {
  id: string
  meeting_id: string
  phase: string
  round_index: number | null
  type: UserInterventionType
  content: string
  target_expert_id: string | null
  status: UserInterventionStatus
  created_at: string
  applied_at: string | null
}

export interface MemorySuggestionInput {
  meetingId: string
  content: string
  category: MemoryCategory
  sourceSummary: string
}

export interface UserInterventionInput {
  meetingId: string
  phase: string
  roundIndex?: number | null
  type: UserInterventionType
  content: string
  targetExpertId?: string | null
  status?: UserInterventionStatus
}

interface MemorySuggestionDraft {
  content: string
  category: MemoryCategory
  sourceSummary: string
}

const VALID_MEMORY_CATEGORIES: MemoryCategory[] = [
  'core_canon',
  'confirmed_setting',
  'tentative_idea',
  'rejected_idea'
]

const VALID_INTERVENTION_TYPES: UserInterventionType[] = [
  'add_information',
  'ask_expert_focus',
  'request_extra_round',
  'request_early_summary',
  'reject_moderator_summary',
  'terminate_session',
  'note_only'
]

export function createMemorySuggestion(
  db: Database.Database,
  input: MemorySuggestionInput
): MemorySuggestionRecord {
  validateMemoryCategory(input.category)
  const content = normalizeRequiredText(input.content, 'Memory suggestion content')
  const sourceSummary = normalizeRequiredText(input.sourceSummary, 'Memory source summary')
  const now = new Date().toISOString()
  const record: MemorySuggestionRecord = {
    id: randomUUID(),
    meeting_id: input.meetingId,
    content,
    category: input.category,
    source_summary: sourceSummary,
    status: 'pending',
    edited_content: null,
    created_at: now,
    updated_at: now,
    decided_at: null
  }

  db.prepare(
    `INSERT INTO memory_suggestions (
      id, meeting_id, content, category, source_summary, status,
      edited_content, created_at, updated_at, decided_at
    ) VALUES (
      @id, @meeting_id, @content, @category, @source_summary, @status,
      @edited_content, @created_at, @updated_at, @decided_at
    )`
  ).run(record)

  return record
}

export function acceptMemorySuggestion(
  db: Database.Database,
  suggestionId: string,
  editedContent?: string | null
): ProjectMemoryItemRecord {
  const suggestion = getMemorySuggestionById(db, suggestionId)
  if (!suggestion) {
    throw new Error('Memory suggestion not found')
  }
  if (suggestion.status !== 'pending') {
    throw new Error('Only pending memory suggestions can be accepted')
  }

  const finalContent = normalizeOptionalText(editedContent) || suggestion.content
  const decisionStatus: MemorySuggestionStatus =
    finalContent !== suggestion.content ? 'edited' : 'accepted'
  const now = new Date().toISOString()
  const item: ProjectMemoryItemRecord = {
    id: randomUUID(),
    content: finalContent,
    category: suggestion.category,
    source_suggestion_id: suggestion.id,
    source_meeting_id: suggestion.meeting_id,
    status: 'active',
    created_at: now,
    updated_at: now
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE memory_suggestions
       SET status = ?, edited_content = ?, updated_at = ?, decided_at = ?
       WHERE id = ?`
    ).run(
      decisionStatus,
      decisionStatus === 'edited' ? finalContent : null,
      now,
      now,
      suggestion.id
    )

    db.prepare(
      `INSERT INTO project_memory_items (
        id, content, category, source_suggestion_id, source_meeting_id,
        status, created_at, updated_at
      ) VALUES (
        @id, @content, @category, @source_suggestion_id, @source_meeting_id,
        @status, @created_at, @updated_at
      )`
    ).run(item)
  })

  tx()
  return item
}

export function rejectMemorySuggestion(
  db: Database.Database,
  suggestionId: string
): MemorySuggestionRecord {
  const suggestion = getMemorySuggestionById(db, suggestionId)
  if (!suggestion) {
    throw new Error('Memory suggestion not found')
  }
  if (suggestion.status !== 'pending') {
    throw new Error('Only pending memory suggestions can be rejected')
  }

  const now = new Date().toISOString()
  db.prepare(
    `UPDATE memory_suggestions
     SET status = 'rejected', updated_at = ?, decided_at = ?
     WHERE id = ?`
  ).run(now, now, suggestionId)

  return getMemorySuggestionById(db, suggestionId)!
}

export function getMemorySuggestionById(
  db: Database.Database,
  suggestionId: string
): MemorySuggestionRecord | undefined {
  return db
    .prepare('SELECT * FROM memory_suggestions WHERE id = ?')
    .get(suggestionId) as MemorySuggestionRecord | undefined
}

export function listMemorySuggestionsByMeeting(
  db: Database.Database,
  meetingId: string
): MemorySuggestionRecord[] {
  return db
    .prepare(
      `SELECT * FROM memory_suggestions
       WHERE meeting_id = ?
       ORDER BY created_at ASC`
    )
    .all(meetingId) as MemorySuggestionRecord[]
}

export function listActiveProjectMemoryItems(
  db: Database.Database
): ProjectMemoryItemRecord[] {
  return db
    .prepare(
      `SELECT * FROM project_memory_items
       WHERE status = 'active'
       ORDER BY category ASC, created_at DESC`
    )
    .all() as ProjectMemoryItemRecord[]
}

export function listProjectMemoryItems(
  db: Database.Database
): ProjectMemoryItemRecord[] {
  return db
    .prepare(
      `SELECT * FROM project_memory_items
       WHERE status <> 'deleted'
       ORDER BY status ASC, category ASC, created_at DESC`
    )
    .all() as ProjectMemoryItemRecord[]
}

export function disableProjectMemoryItem(
  db: Database.Database,
  itemId: string
): ProjectMemoryItemRecord {
  return updateProjectMemoryItemStatus(db, itemId, 'disabled')
}

export function softDeleteProjectMemoryItem(
  db: Database.Database,
  itemId: string
): ProjectMemoryItemRecord {
  return updateProjectMemoryItemStatus(db, itemId, 'deleted')
}

export function createUserIntervention(
  db: Database.Database,
  input: UserInterventionInput
): UserInterventionRecord {
  if (!VALID_INTERVENTION_TYPES.includes(input.type)) {
    throw new Error(`Unsupported user intervention type: ${input.type}`)
  }

  const content = normalizeRequiredText(input.content, 'User intervention content')
  const status = input.status || (input.type === 'note_only' ? 'applied' : 'pending')
  const now = new Date().toISOString()
  const appliedAt = status === 'applied' ? now : null
  const record: UserInterventionRecord = {
    id: randomUUID(),
    meeting_id: input.meetingId,
    phase: input.phase,
    round_index: input.roundIndex ?? null,
    type: input.type,
    content,
    target_expert_id: input.targetExpertId ?? null,
    status,
    created_at: now,
    applied_at: appliedAt
  }

  db.prepare(
    `INSERT INTO user_interventions (
      id, meeting_id, phase, round_index, type, content,
      target_expert_id, status, created_at, applied_at
    ) VALUES (
      @id, @meeting_id, @phase, @round_index, @type, @content,
      @target_expert_id, @status, @created_at, @applied_at
    )`
  ).run(record)

  return record
}

export function listUserInterventionsByMeeting(
  db: Database.Database,
  meetingId: string
): UserInterventionRecord[] {
  return db
    .prepare(
      `SELECT * FROM user_interventions
       WHERE meeting_id = ?
       ORDER BY created_at ASC`
    )
    .all(meetingId) as UserInterventionRecord[]
}

export function ensureMemorySuggestionsForMeeting(
  db: Database.Database,
  detail: SessionFullDetail,
  maxSuggestions = 5
): MemorySuggestionRecord[] {
  const existing = listMemorySuggestionsByMeeting(db, detail.session.id)
  if (existing.length > 0) return existing

  const drafts = buildMemorySuggestionDrafts(detail, maxSuggestions)
  return drafts.map((draft) =>
    createMemorySuggestion(db, {
      meetingId: detail.session.id,
      content: draft.content,
      category: draft.category,
      sourceSummary: draft.sourceSummary
    })
  )
}

export function buildMemorySuggestionDrafts(
  detail: SessionFullDetail,
  maxSuggestions = 5
): MemorySuggestionDraft[] {
  const drafts: MemorySuggestionDraft[] = []
  const userQuestion = normalizeOptionalText(detail.session.user_question)
  const finalSummary = normalizeOptionalText(detail.session.final_summary)
  const sessionSummary = detail.context_summaries?.find((item) => item.scope === 'session')
  const activeClaims = (detail.claims || []).filter((claim) => claim.status === 'active')
  const attacks = detail.attacks || []

  const rejectionText = findRejectionSignal([userQuestion, finalSummary].filter(Boolean).join('\n'))
  if (rejectionText) {
    drafts.push({
      content: rejectionText,
      category: 'rejected_idea',
      sourceSummary: 'User-facing text contains an explicit rejection or avoidance signal.'
    })
  }

  if (finalSummary) {
    drafts.push({
      content: trimText(finalSummary, 260),
      category: 'confirmed_setting',
      sourceSummary: 'Drafted from the moderator final summary; still requires user confirmation.'
    })
  }

  if (sessionSummary?.summary_text) {
    drafts.push({
      content: trimText(sessionSummary.summary_text, 240),
      category: 'tentative_idea',
      sourceSummary: 'Drafted from the system context summary; tentative until accepted.'
    })
  }

  for (const claim of activeClaims.slice(0, 2)) {
    drafts.push({
      content: trimText(claim.claim_text, 220),
      category: 'tentative_idea',
      sourceSummary: `Drafted from claim tracker in round ${claim.round_index}; not treated as truth.`
    })
  }

  if (attacks.length > 0) {
    drafts.push({
      content: trimText(attacks[0].attack_text, 220),
      category: 'tentative_idea',
      sourceSummary: `Drafted from an attack record in round ${attacks[0].round_index}; useful as a risk note.`
    })
  }

  return uniqueDrafts(drafts).slice(0, Math.max(0, maxSuggestions))
}

function updateProjectMemoryItemStatus(
  db: Database.Database,
  itemId: string,
  status: ProjectMemoryStatus
): ProjectMemoryItemRecord {
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE project_memory_items
     SET status = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, now, itemId)

  const item = db
    .prepare('SELECT * FROM project_memory_items WHERE id = ?')
    .get(itemId) as ProjectMemoryItemRecord | undefined

  if (!item) {
    throw new Error('Project memory item not found')
  }
  return item
}

function validateMemoryCategory(category: MemoryCategory): void {
  if (!VALID_MEMORY_CATEGORIES.includes(category)) {
    throw new Error(`Unsupported memory category: ${category}`)
  }
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const text = normalizeOptionalText(value)
  if (!text) {
    throw new Error(`${label} is required`)
  }
  return text
}

function normalizeOptionalText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function trimText(value: string, maxLength: number): string {
  const text = normalizeOptionalText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trim()}…`
}

function findRejectionSignal(text: string): string | null {
  const normalized = normalizeOptionalText(text)
  if (!normalized) return null

  const patterns = [
    /[^。.!?]*(不要|不采用|不接受|拒绝|否决|避免|不要再)[^。.!?]*/i,
    /[^。.!?]*(reject|rejected|avoid|do not adopt|do not use)[^。.!?]*/i
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[0]) {
      return trimText(match[0], 220)
    }
  }

  return null
}

function uniqueDrafts(drafts: MemorySuggestionDraft[]): MemorySuggestionDraft[] {
  const seen = new Set<string>()
  const result: MemorySuggestionDraft[] = []
  for (const draft of drafts) {
    const key = draft.content.toLowerCase()
    if (!draft.content || seen.has(key)) continue
    seen.add(key)
    result.push(draft)
  }
  return result
}
