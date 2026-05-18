import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  acceptMemorySuggestion,
  createMemorySuggestion,
  createUserIntervention,
  disableProjectMemoryItem,
  listActiveProjectMemoryItems,
  rejectMemorySuggestion,
  softDeleteProjectMemoryItem
} from '../src/main/memory/projectMemory.ts'
import { getSpectatorCapabilities } from '../src/renderer/utils/spectatorMode.ts'

function createMigratedDb() {
  return new MemoryDb()
}

class MemoryDb {
  constructor() {
    this.memory_suggestions = []
    this.project_memory_items = []
    this.user_interventions = []
    this.votes = []
    this.settlements = []
    this.agent_snapshots = []
  }

  transaction(fn) {
    return (...args) => fn(...args)
  }

  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    return {
      run: (...args) => this.run(normalized, args),
      get: (...args) => this.get(normalized, args),
      all: (...args) => this.all(normalized, args)
    }
  }

  run(sql, args) {
    if (sql.startsWith('INSERT INTO memory_suggestions')) {
      this.memory_suggestions.push({ ...args[0] })
      return { changes: 1 }
    }
    if (sql.startsWith('INSERT INTO project_memory_items')) {
      this.project_memory_items.push({ ...args[0] })
      return { changes: 1 }
    }
    if (sql.startsWith('INSERT INTO user_interventions')) {
      this.user_interventions.push({ ...args[0] })
      return { changes: 1 }
    }
    if (sql.startsWith('UPDATE memory_suggestions SET status = ?, edited_content = ?')) {
      const [status, editedContent, updatedAt, decidedAt, id] = args
      const row = this.memory_suggestions.find((item) => item.id === id)
      Object.assign(row, {
        status,
        edited_content: editedContent,
        updated_at: updatedAt,
        decided_at: decidedAt
      })
      return { changes: row ? 1 : 0 }
    }
    if (sql.startsWith("UPDATE memory_suggestions SET status = 'rejected'")) {
      const [updatedAt, decidedAt, id] = args
      const row = this.memory_suggestions.find((item) => item.id === id)
      Object.assign(row, {
        status: 'rejected',
        updated_at: updatedAt,
        decided_at: decidedAt
      })
      return { changes: row ? 1 : 0 }
    }
    if (sql.startsWith('UPDATE project_memory_items SET status = ?')) {
      const [status, updatedAt, id] = args
      const row = this.project_memory_items.find((item) => item.id === id)
      Object.assign(row, { status, updated_at: updatedAt })
      return { changes: row ? 1 : 0 }
    }
    throw new Error(`Unhandled run SQL: ${sql}`)
  }

  get(sql, args) {
    if (sql === 'SELECT COUNT(*) AS count FROM project_memory_items') {
      return { count: this.project_memory_items.length }
    }
    if (sql === 'SELECT COUNT(*) AS count FROM votes') {
      return { count: this.votes.length }
    }
    if (sql === 'SELECT COUNT(*) AS count FROM settlements') {
      return { count: this.settlements.length }
    }
    if (sql === 'SELECT COUNT(*) AS count FROM agent_snapshots') {
      return { count: this.agent_snapshots.length }
    }
    if (sql === 'SELECT status FROM memory_suggestions WHERE id = ?') {
      return pick(this.memory_suggestions.find((item) => item.id === args[0]), ['status'])
    }
    if (sql === 'SELECT edited_content FROM memory_suggestions WHERE id = ?') {
      return pick(this.memory_suggestions.find((item) => item.id === args[0]), ['edited_content'])
    }
    if (sql === 'SELECT * FROM memory_suggestions WHERE id = ?') {
      return this.memory_suggestions.find((item) => item.id === args[0])
    }
    if (sql === 'SELECT * FROM project_memory_items WHERE id = ?') {
      return this.project_memory_items.find((item) => item.id === args[0])
    }
    throw new Error(`Unhandled get SQL: ${sql}`)
  }

  all(sql, args) {
    if (sql.startsWith('SELECT * FROM memory_suggestions WHERE meeting_id = ?')) {
      return this.memory_suggestions.filter((item) => item.meeting_id === args[0])
    }
    if (sql.startsWith("SELECT * FROM project_memory_items WHERE status = 'active'")) {
      return this.project_memory_items.filter((item) => item.status === 'active')
    }
    if (sql.startsWith("SELECT * FROM project_memory_items WHERE status <> 'deleted'")) {
      return this.project_memory_items.filter((item) => item.status !== 'deleted')
    }
    if (sql.startsWith('SELECT * FROM user_interventions WHERE meeting_id = ?')) {
      return this.user_interventions.filter((item) => item.meeting_id === args[0])
    }
    throw new Error(`Unhandled all SQL: ${sql}`)
  }
}

function pick(row, keys) {
  if (!row) return undefined
  return Object.fromEntries(keys.map((key) => [key, row[key]]))
}

test('migration version 5 defines project memory and intervention tables idempotently', () => {
  const migrations = readFileSync(new URL('../src/main/db/migrations.ts', import.meta.url), 'utf8')
  const schema = readFileSync(new URL('../src/main/db/schema.ts', import.meta.url), 'utf8')

  assert.match(migrations, /version:\s*5/)
  for (const tableName of ['memory_suggestions', 'project_memory_items', 'user_interventions']) {
    assert.match(migrations, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`))
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`))
  }
})

test('memory suggestions start pending and accepted suggestions create active project memory', () => {
  const db = createMigratedDb()

  const suggestion = createMemorySuggestion(db, {
    meetingId: 'meeting-1',
    content: 'The project treats user confirmation as the only path into memory.',
    category: 'confirmed_setting',
    sourceSummary: 'Derived from final summary and user preference.'
  })

  assert.equal(suggestion.status, 'pending')
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM project_memory_items').get().count,
    0
  )

  const item = acceptMemorySuggestion(db, suggestion.id)

  assert.equal(item.status, 'active')
  assert.equal(item.content, suggestion.content)
  assert.equal(item.category, 'confirmed_setting')
  assert.equal(item.source_suggestion_id, suggestion.id)
  assert.equal(
    db.prepare('SELECT status FROM memory_suggestions WHERE id = ?').get(suggestion.id).status,
    'accepted'
  )
})

test('rejected suggestions do not create project memory items', () => {
  const db = createMigratedDb()

  const suggestion = createMemorySuggestion(db, {
    meetingId: 'meeting-1',
    content: 'Do not adopt this direction.',
    category: 'rejected_idea',
    sourceSummary: 'User explicitly rejected the direction.'
  })

  rejectMemorySuggestion(db, suggestion.id)

  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM project_memory_items').get().count,
    0
  )
  assert.equal(
    db.prepare('SELECT status FROM memory_suggestions WHERE id = ?').get(suggestion.id).status,
    'rejected'
  )
})

test('edited acceptance stores edited content and active listing excludes disabled and deleted items', () => {
  const db = createMigratedDb()

  const suggestion = createMemorySuggestion(db, {
    meetingId: 'meeting-1',
    content: 'Draft wording.',
    category: 'tentative_idea',
    sourceSummary: 'A restrained suggestion.'
  })

  const item = acceptMemorySuggestion(db, suggestion.id, 'Edited wording approved by the user.')

  assert.equal(item.content, 'Edited wording approved by the user.')
  assert.equal(
    db.prepare('SELECT status FROM memory_suggestions WHERE id = ?').get(suggestion.id).status,
    'edited'
  )
  assert.equal(
    db.prepare('SELECT edited_content FROM memory_suggestions WHERE id = ?').get(suggestion.id).edited_content,
    'Edited wording approved by the user.'
  )
  assert.equal(listActiveProjectMemoryItems(db).length, 1)

  disableProjectMemoryItem(db, item.id)
  assert.equal(listActiveProjectMemoryItems(db).length, 0)

  const second = acceptMemorySuggestion(
    db,
    createMemorySuggestion(db, {
      meetingId: 'meeting-1',
      content: 'Second approved memory.',
      category: 'core_canon',
      sourceSummary: 'Confirmed by user.'
    }).id
  )
  assert.equal(listActiveProjectMemoryItems(db).length, 1)
  softDeleteProjectMemoryItem(db, second.id)
  assert.equal(listActiveProjectMemoryItems(db).length, 0)
})

test('user interventions are persisted as events without changing scoring tables', () => {
  const db = createMigratedDb()

  const note = createUserIntervention(db, {
    meetingId: 'meeting-1',
    phase: 'debate_round',
    roundIndex: 1,
    type: 'note_only',
    content: 'Remember the user is skeptical about automatic memory.',
    status: 'applied'
  })
  const info = createUserIntervention(db, {
    meetingId: 'meeting-1',
    phase: 'debate_round',
    roundIndex: 1,
    type: 'add_information',
    content: 'Additional user-provided constraint.',
    status: 'applied'
  })

  assert.equal(note.type, 'note_only')
  assert.equal(note.status, 'applied')
  assert.equal(info.type, 'add_information')
  assert.equal(info.status, 'applied')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM votes').get().count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM settlements').get().count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_snapshots').get().count, 0)
})

test('deleting a source session does not actively delete accepted project memory', () => {
  const historyRepository = readFileSync(
    new URL('../src/main/db/repositories/historyRepository.ts', import.meta.url),
    'utf8'
  )
  const schema = readFileSync(new URL('../src/main/db/schema.ts', import.meta.url), 'utf8')
  const db = createMigratedDb()

  const suggestion = createMemorySuggestion(db, {
    meetingId: 'meeting-1',
    content: 'Accepted memory must outlive its source session.',
    category: 'confirmed_setting',
    sourceSummary: 'Confirmed by user before deleting the source session.'
  })
  const item = acceptMemorySuggestion(db, suggestion.id)
  createUserIntervention(db, {
    meetingId: 'meeting-1',
    phase: 'debate_round',
    type: 'note_only',
    content: 'Session-local note.',
    status: 'applied'
  })

  assert.doesNotMatch(
    historyRepository,
    /DELETE\s+FROM\s+project_memory_items\s+WHERE\s+source_meeting_id/i
  )
  assert.match(
    schema,
    /FOREIGN KEY \(source_meeting_id\) REFERENCES sessions\(id\) ON DELETE SET NULL/
  )

  db.memory_suggestions = db.memory_suggestions.filter((row) => row.meeting_id !== 'meeting-1')
  db.user_interventions = db.user_interventions.filter((row) => row.meeting_id !== 'meeting-1')
  for (const row of db.project_memory_items) {
    if (row.source_meeting_id === 'meeting-1') row.source_meeting_id = null
  }

  assert.equal(db.project_memory_items.length, 1)
  assert.equal(db.project_memory_items[0].id, item.id)
  assert.equal(db.project_memory_items[0].source_meeting_id, null)
  assert.equal(db.memory_suggestions.length, 0)
  assert.equal(db.user_interventions.length, 0)
})

test('spectator mode disables state-changing capabilities while preserving reading', () => {
  assert.deepEqual(getSpectatorCapabilities(false), {
    canView: true,
    canSubmitIntervention: true,
    canDecideMemory: true,
    canManageProjectMemory: true,
    canMutateSession: true
  })

  assert.deepEqual(getSpectatorCapabilities(true), {
    canView: true,
    canSubmitIntervention: false,
    canDecideMemory: false,
    canManageProjectMemory: false,
    canMutateSession: false
  })
})
