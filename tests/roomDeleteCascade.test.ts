import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteRoom } from '../src/main/db/repositories/roomRepository'

let activeDb: CascadeMemoryDb | null = null

vi.mock('../src/main/db/sqlite', () => ({
  getDatabase: () => {
    if (!activeDb) throw new Error('test database is not initialized')
    return activeDb
  }
}))

interface Row {
  id: string
  [key: string]: unknown
}

class CascadeMemoryDb {
  rooms: Row[] = []
  agents: Row[] = []
  sessions: Row[] = []
  messages: Row[] = []
  votes: Row[] = []
  agent_snapshots: Row[] = []
  settlements: Row[] = []
  claims: Row[] = []
  attacks: Row[] = []
  context_summaries: Row[] = []
  model_call_usage: Row[] = []
  memory_suggestions: Row[] = []
  project_memory_items: Row[] = []
  user_interventions: Row[] = []

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => fn(...args)
  }

  prepare(sql: string): {
    run: (...args: unknown[]) => { changes: number }
    get: (...args: unknown[]) => unknown
  } {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    return {
      run: (...args: unknown[]) => this.run(normalized, args),
      get: (...args: unknown[]) => this.get(normalized, args)
    }
  }

  pragma(sql: string): unknown[] {
    if (sql === 'foreign_key_check') return []
    throw new Error(`Unhandled pragma: ${sql}`)
  }

  private run(sql: string, args: unknown[]): { changes: number } {
    if (sql === 'DELETE FROM sessions WHERE room_id = ?') {
      const roomId = args[0]
      const sessionIds = this.sessions
        .filter((session) => session.room_id === roomId)
        .map((session) => session.id)
      for (const sessionId of sessionIds) {
        this.deleteSession(sessionId)
      }
      return { changes: sessionIds.length }
    }

    if (sql === 'DELETE FROM rooms WHERE id = ?') {
      const roomId = args[0]
      if (this.sessions.some((session) => session.room_id === roomId)) {
        throw new Error('FOREIGN KEY constraint failed')
      }

      const before = this.rooms.length
      this.rooms = this.rooms.filter((room) => room.id !== roomId)
      this.agents = this.agents.filter((agent) => agent.room_id !== roomId)
      return { changes: before - this.rooms.length }
    }

    throw new Error(`Unhandled run SQL: ${sql}`)
  }

  private get(sql: string, args: unknown[]): unknown {
    if (sql === 'SELECT id FROM rooms WHERE id = ?') {
      return this.rooms.find((room) => room.id === args[0])
    }

    const countMatch = sql.match(/^SELECT COUNT\(\*\) AS count FROM ([a-z_]+)$/)
    if (countMatch) {
      const table = countMatch[1] as keyof CascadeMemoryDb
      return { count: (this[table] as Row[]).length }
    }

    if (sql === 'SELECT source_suggestion_id, source_meeting_id FROM project_memory_items') {
      const item = this.project_memory_items[0]
      return {
        source_suggestion_id: item?.source_suggestion_id ?? null,
        source_meeting_id: item?.source_meeting_id ?? null
      }
    }

    throw new Error(`Unhandled get SQL: ${sql}`)
  }

  private deleteSession(sessionId: string): void {
    const messageIds = this.messages
      .filter((message) => message.session_id === sessionId)
      .map((message) => message.id)
    const suggestionIds = this.memory_suggestions
      .filter((suggestion) => suggestion.meeting_id === sessionId)
      .map((suggestion) => suggestion.id)

    this.sessions = this.sessions.filter((session) => session.id !== sessionId)
    this.messages = this.messages.filter((message) => message.session_id !== sessionId)
    this.votes = this.votes.filter((vote) => vote.session_id !== sessionId)
    this.agent_snapshots = this.agent_snapshots.filter(
      (snapshot) => snapshot.session_id !== sessionId
    )
    this.settlements = this.settlements.filter(
      (settlement) => settlement.session_id !== sessionId
    )
    this.claims = this.claims.filter(
      (claim) => claim.meeting_id !== sessionId && !messageIds.includes(String(claim.source_message_id))
    )
    this.attacks = this.attacks.filter(
      (attack) =>
        attack.meeting_id !== sessionId && !messageIds.includes(String(attack.source_message_id))
    )
    this.context_summaries = this.context_summaries.filter(
      (summary) => summary.meeting_id !== sessionId
    )
    this.model_call_usage = this.model_call_usage.filter((usage) => usage.meeting_id !== sessionId)
    this.memory_suggestions = this.memory_suggestions.filter(
      (suggestion) => suggestion.meeting_id !== sessionId
    )
    this.user_interventions = this.user_interventions.filter(
      (intervention) => intervention.meeting_id !== sessionId
    )

    for (const item of this.project_memory_items) {
      if (suggestionIds.includes(String(item.source_suggestion_id))) {
        item.source_suggestion_id = null
      }
      if (item.source_meeting_id === sessionId) {
        item.source_meeting_id = null
      }
    }
  }
}

function createDb(): CascadeMemoryDb {
  activeDb = new CascadeMemoryDb()
  return activeDb
}

function seedRoom(db: CascadeMemoryDb, roomId = 'room-1'): void {
  db.rooms.push({ id: roomId })
}

function seedAgent(db: CascadeMemoryDb, roomId = 'room-1'): void {
  db.agents.push({ id: 'agent-1', room_id: roomId })
}

function seedSession(db: CascadeMemoryDb, roomId = 'room-1', sessionId = 'session-1'): void {
  db.sessions.push({ id: sessionId, room_id: roomId })
}

function seedSessionChildren(db: CascadeMemoryDb, sessionId = 'session-1'): void {
  db.messages.push({ id: 'message-1', session_id: sessionId })
  db.votes.push({ id: 'vote-1', session_id: sessionId })
  db.agent_snapshots.push({ id: 'snapshot-1', session_id: sessionId })
  db.settlements.push({ id: 'settlement-1', session_id: sessionId })
  db.claims.push({ id: 'claim-1', meeting_id: sessionId, source_message_id: 'message-1' })
  db.attacks.push({ id: 'attack-1', meeting_id: sessionId, source_message_id: 'message-1' })
  db.context_summaries.push({ id: 'summary-1', meeting_id: sessionId })
  db.model_call_usage.push({ id: 'usage-1', meeting_id: sessionId })
  db.memory_suggestions.push({ id: 'suggestion-1', meeting_id: sessionId })
  db.project_memory_items.push({
    id: 'memory-1',
    source_suggestion_id: 'suggestion-1',
    source_meeting_id: sessionId
  })
  db.user_interventions.push({ id: 'intervention-1', meeting_id: sessionId })
}

function countRows(db: CascadeMemoryDb, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
}

function readProjectMemorySource(db: CascadeMemoryDb): unknown {
  return db.prepare('SELECT source_suggestion_id, source_meeting_id FROM project_memory_items').get()
}

afterEach(() => {
  activeDb = null
})

describe('roomRepository.deleteRoom', () => {
  it('deletes an empty room', () => {
    const db = createDb()
    seedRoom(db)

    expect(deleteRoom('room-1')).toBe(true)
    expect(countRows(db, 'rooms')).toBe(0)
  })

  it('deletes a room with agents', () => {
    const db = createDb()
    seedRoom(db)
    seedAgent(db)

    expect(deleteRoom('room-1')).toBe(true)
    expect(countRows(db, 'rooms')).toBe(0)
    expect(countRows(db, 'agents')).toBe(0)
  })

  it('deletes a room with sessions even when the legacy sessions foreign key has no room cascade', () => {
    const db = createDb()
    seedRoom(db)
    seedSession(db)

    expect(deleteRoom('room-1')).toBe(true)
    expect(countRows(db, 'rooms')).toBe(0)
    expect(countRows(db, 'sessions')).toBe(0)
  })

  it('deletes session child data without leaving orphans', () => {
    const db = createDb()
    seedRoom(db)
    seedAgent(db)
    seedSession(db)
    seedSessionChildren(db)

    expect(deleteRoom('room-1')).toBe(true)

    for (const table of [
      'rooms',
      'agents',
      'sessions',
      'messages',
      'votes',
      'agent_snapshots',
      'settlements',
      'claims',
      'attacks',
      'context_summaries',
      'model_call_usage',
      'memory_suggestions',
      'user_interventions'
    ]) {
      expect(countRows(db, table), table).toBe(0)
    }
    expect(countRows(db, 'project_memory_items')).toBe(1)
    expect(readProjectMemorySource(db)).toEqual({
      source_suggestion_id: null,
      source_meeting_id: null
    })
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('returns false when the room does not exist', () => {
    createDb()

    expect(deleteRoom('missing-room')).toBe(false)
  })
})

describe('sessions room cascade migration', () => {
  it('defines v7 migration that rebuilds sessions with ON DELETE CASCADE and verifies foreign keys', () => {
    const migrations = readFileSync(new URL('../src/main/db/migrations.ts', import.meta.url), 'utf8')

    expect(migrations).toMatch(/version:\s*7/)
    expect(migrations).toMatch(/CREATE TABLE sessions_new/)
    expect(migrations).toMatch(/FOREIGN KEY \(room_id\) REFERENCES rooms\(id\) ON DELETE CASCADE/)
    expect(migrations).toMatch(/INSERT INTO sessions_new \(\s*id,\s*room_id,\s*title,/)
    expect(migrations).toMatch(/DROP TABLE sessions/)
    expect(migrations).toMatch(/ALTER TABLE sessions_new RENAME TO sessions/)
    expect(migrations).toMatch(/CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions\(room_id\)/)
    expect(migrations).toMatch(/foreign_key_check/)
    expect(migrations).toMatch(/requiresForeignKeysOff:\s*true/)
  })

  it('keeps post-merge safety migrations limited to additive table creation', () => {
    const migrations = readFileSync(new URL('../src/main/db/migrations.ts', import.meta.url), 'utf8')

    expect(migrations).toMatch(/migration\.version >= 3 && migration\.version <= 6/)
  })

  it('defines the current sessions schema with room delete cascade', () => {
    const schema = readFileSync(new URL('../src/main/db/schema.ts', import.meta.url), 'utf8')

    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS sessions \([\s\S]*FOREIGN KEY \(room_id\) REFERENCES rooms\(id\) ON DELETE CASCADE/
    )
  })
})
