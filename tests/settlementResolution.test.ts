import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, DebatePhase, Message, Session } from '../src/shared/types'
import { DEFAULT_RULES_CONFIG } from '../src/shared/types'
import type { SettlementRecord } from '../src/main/voting/voteTypes'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const state = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  messages: [] as Message[],
  settlements: [] as SettlementRecord[],
  agents: new Map<string, Agent>(),
  finalSummaryCalls: [] as Array<Deferred<{ content: string }>>,
  finishCalls: 0,
  settlementId: 1
}))

const room = {
  id: 'room-settlement',
  name: 'Settlement Room',
  rules_json: JSON.stringify({
    ...DEFAULT_RULES_CONFIG,
    stop_settlement_when_alive_experts_less_than: 1
  })
}

const moderator: Agent = {
  id: 'moderator-1',
  room_id: room.id,
  role: 'moderator',
  name: 'Moderator',
  provider: 'mock',
  model: 'mock-fast',
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
  status: 'active',
  aggression: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
}

const baseExperts: Agent[] = ['expert-1', 'expert-2', 'expert-3'].map((id, index) => ({
  ...moderator,
  id,
  role: 'expert',
  name: `Expert ${index + 1}`,
  hp: 50,
  max_hp: 100,
  influence: index,
  prestige: index
}))

function expertJson(message: string): string {
  return JSON.stringify({
    message,
    claims: [{ claim_text: `${message} claim` }],
    attacks: []
  })
}

function voteJson(voterId: string, targetId: string): string {
  return JSON.stringify({
    voter: voterId,
    votes: [
      {
        target: targetId,
        score: 8,
        reason: {
          attacked_what: 'a point',
          rebutted_what: 'a rebuttal',
          revised_what: 'a revision',
          survived_claim: 'a surviving claim',
          main_weakness: 'a weakness'
        }
      }
    ]
  })
}

const provider = {
  name: 'mock-settlement',
  generateModeratorOpening: vi.fn(async () => ({ content: 'opening' })),
  generateExpertInitialAnswer: vi.fn(async (input: { agent: Agent }) => ({
    content: expertJson(`initial ${input.agent.id}`)
  })),
  generateExpertDebateTurn: vi.fn(async (input: { agent: Agent; roundIndex: number }) => ({
    content: expertJson(`debate ${input.roundIndex} ${input.agent.id}`)
  })),
  generateModeratorRoundSummary: vi.fn(async (input: { roundIndex: number }) => ({
    content: `summary ${input.roundIndex}`
  })),
  generateModeratorFinalSummary: vi.fn(() => {
    const call = deferred<{ content: string }>()
    state.finalSummaryCalls.push(call)
    return call.promise
  }),
  generateExpertVote: vi.fn(async (input: { voter: Agent; aliveExperts: Agent[] }) => {
    const target = input.aliveExperts.find((expert) => expert.id !== input.voter.id)!
    return { rawJson: voteJson(input.voter.id, target.id) }
  })
}

vi.mock('../src/main/db/repositories/sessionRepository', () => ({
  createSession: (roomId: string, title: string, userQuestion: string) => {
    const session: Session = {
      id: 'session-settlement',
      room_id: roomId,
      title,
      user_question: userQuestion,
      status: 'running',
      current_phase: 'moderator_opening',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    state.sessions.set(session.id, session)
    return session
  },
  getSessionById: (id: string) => state.sessions.get(id),
  getRunningSession: (roomId: string) =>
    [...state.sessions.values()].find(
      (session) => session.room_id === roomId && session.status === 'running'
    ),
  getRunningSessions: () =>
    [...state.sessions.values()].filter((session) => session.status === 'running'),
  updateSessionPhase: (sessionId: string, phase: DebatePhase) => {
    const session = state.sessions.get(sessionId)!
    const updated = { ...session, current_phase: phase }
    state.sessions.set(sessionId, updated)
    return updated
  },
  updateSessionStatus: vi.fn(),
  failSession: vi.fn(),
  abortSession: vi.fn((sessionId: string, reason?: string) => {
    const session = state.sessions.get(sessionId)!
    const updated: Session = { ...session, status: 'aborted', final_summary: reason ?? null }
    state.sessions.set(sessionId, updated)
    return updated
  }),
  finishSession: vi.fn((sessionId: string, finalSummary: string) => {
    state.finishCalls += 1
    const session = state.sessions.get(sessionId)!
    const updated: Session = {
      ...session,
      status: 'finished',
      current_phase: 'moderator_final_summary',
      final_summary: finalSummary
    }
    state.sessions.set(sessionId, updated)
    return updated
  })
}))

vi.mock('../src/main/db/repositories/messageRepository', () => ({
  insertMessage: (input: {
    sessionId: string
    roundIndex: number
    phase: DebatePhase
    speakerId: string | null
    speakerName: string | null
    speakerRole: string | null
    content: string
    structuredJson: string | null
  }) => {
    const message: Message = {
      id: `message-${state.messages.length + 1}`,
      session_id: input.sessionId,
      round_index: input.roundIndex,
      phase: input.phase,
      speaker_id: input.speakerId,
      speaker_name: input.speakerName,
      speaker_role: input.speakerRole,
      content: input.content,
      structured_json: input.structuredJson,
      created_at: '2026-01-01T00:00:00.000Z'
    }
    state.messages.push(message)
    return message
  },
  getMessagesBySession: (sessionId: string) =>
    state.messages.filter((message) => message.session_id === sessionId)
}))

vi.mock('../src/main/db/repositories/roomRepository', () => ({
  getRoomById: (roomId: string) => (roomId === room.id ? room : undefined)
}))

vi.mock('../src/main/db/repositories/agentRepository', () => ({
  getModerator: () => moderator,
  getExperts: () => [...state.agents.values()],
  getAgentById: (id: string) => state.agents.get(id),
  updateExpert: (id: string, data: Partial<Agent>) => {
    const agent = state.agents.get(id)!
    state.agents.set(id, { ...agent, ...data })
  }
}))

vi.mock('../src/main/providers/providerFactory', () => ({
  getProviderForAgent: () => provider,
  validateProvidersReady: () => []
}))

vi.mock('../src/main/cost/usageTracker', () => ({
  trackModelCallUsage: async (_metadata: unknown, call: () => Promise<unknown>) => call()
}))

vi.mock('../src/main/db/repositories/participantRepository', () => ({
  insertParticipants: vi.fn(),
  updateParticipantFinalState: vi.fn()
}))
vi.mock('../src/main/db/repositories/voteRepository', () => ({ insertVote: vi.fn() }))
vi.mock('../src/main/db/repositories/settlementRepository', () => ({
  insertSettlement: (params: {
    sessionId: string
    roundIndex: number
    settlementJson: string
    status?: string
  }) => {
    const record: SettlementRecord = {
      id: `settlement-${state.settlementId++}`,
      session_id: params.sessionId,
      round_index: params.roundIndex,
      settlement_json: params.settlementJson,
      status: params.status ?? 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
      applied_at: null
    }
    state.settlements.push(record)
    return record
  },
  updateSettlementStatus: vi.fn((id: string, status: 'applied' | 'vetoed' | 'skipped') => {
    const record = state.settlements.find((settlement) => settlement.id === id)
    if (!record) return undefined
    record.status = status
    if (status === 'applied') {
      record.applied_at = '2026-01-01T00:00:00.000Z'
    }
    return record
  }),
  tryResolvePendingSettlement: vi.fn((id: string, status: 'applied' | 'vetoed') => {
    const record = state.settlements.find((settlement) => settlement.id === id)
    if (!record || record.status !== 'pending') {
      return { updated: false, record }
    }
    record.status = status
    if (status === 'applied') {
      record.applied_at = '2026-01-01T00:00:00.000Z'
    }
    return { updated: true, record }
  }),
  getPendingSettlement: (sessionId: string) =>
    state.settlements.find(
      (settlement) => settlement.session_id === sessionId && settlement.status === 'pending'
    ),
  getSettlementsBySession: (sessionId: string) =>
    state.settlements.filter((settlement) => settlement.session_id === sessionId),
  insertAgentSnapshot: vi.fn()
}))
vi.mock('../src/main/db/repositories/reviewRepository', () => ({ insertReview: vi.fn() }))
vi.mock('../src/main/db/repositories/historyRepository', () => ({ getSessionFullDetail: vi.fn() }))
vi.mock('../src/main/db/repositories/claimRepository', () => ({
  insertClaimsForMessage: vi.fn(),
  insertAttacksForMessage: vi.fn()
}))
vi.mock('../src/main/db/repositories/contextSummaryRepository', () => ({ insertContextSummary: vi.fn() }))
vi.mock('../src/main/db/repositories/modelCallUsageRepository', () => ({ insertModelCallUsage: vi.fn() }))
vi.mock('../src/main/review/sessionReviewBuilder', () => ({ buildSessionReview: vi.fn() }))
vi.mock('../src/main/export/markdownExporter', () => ({ generateSessionMarkdown: vi.fn() }))
vi.mock('../src/main/db/sqlite', () => ({
  getDatabase: vi.fn(() => ({ transaction: (callback: () => void) => callback }))
}))
vi.mock('../src/main/memory/projectMemory', () => ({ ensureMemorySuggestionsForMeeting: vi.fn() }))
vi.mock('../src/main/db/repositories/attachmentRepository', () => ({
  insertAttachmentsForSession: vi.fn(() => [])
}))

async function startToPending() {
  const { startDebate } = await import('../src/main/debate/debateEngine')
  await startDebate(room.id, 'Question?', {
    onMessage: vi.fn(),
    onPhaseChange: vi.fn(),
    onSessionFinished: vi.fn(),
    onError: vi.fn(),
    onSettlementReady: vi.fn()
  })
  expect(state.settlements).toHaveLength(1)
  expect(state.settlements[0].status).toBe('pending')
}

async function flushFinalSummary() {
  await vi.waitFor(() => expect(state.finalSummaryCalls).toHaveLength(1), { timeout: 100 })
  state.finalSummaryCalls[0].resolve({ content: 'final summary' })
}

describe('settlement resolution idempotency', () => {
  beforeEach(() => {
    vi.resetModules()
    state.sessions.clear()
    state.messages.length = 0
    state.settlements.length = 0
    state.agents.clear()
    for (const expert of baseExperts) {
      state.agents.set(expert.id, { ...expert })
    }
    state.finalSummaryCalls.length = 0
    state.finishCalls = 0
    state.settlementId = 1
    vi.clearAllMocks()
  })

  it('handles five concurrent veto clicks once and calls final summary provider once', async () => {
    await startToPending()
    const beforeSettlementMessages = state.messages.filter(
      (message) => message.phase === 'settlement_pending'
    ).length
    const { vetoSettlement } = await import('../src/main/debate/debateEngine')

    const vetoes = Array.from({ length: 5 }, () => vetoSettlement('session-settlement'))
    await flushFinalSummary()
    const results = await Promise.all(vetoes)

    expect(results.every((result) => result.success)).toBe(true)
    expect(state.settlements[0].status).toBe('vetoed')
    expect(state.messages.filter((message) => message.phase === 'settlement_pending')).toHaveLength(
      beforeSettlementMessages + 1
    )
    expect(provider.generateModeratorFinalSummary).toHaveBeenCalledTimes(1)
    expect(state.messages.filter((message) => message.phase === 'moderator_final_summary')).toHaveLength(1)
    expect(state.finishCalls).toBe(1)
  })

  it('handles five concurrent apply clicks once, applies HP once, and calls final summary provider once', async () => {
    await startToPending()
    const beforeHp = new Map([...state.agents].map(([id, agent]) => [id, agent.hp]))
    const { applySettlement } = await import('../src/main/debate/debateEngine')

    const applies = Array.from({ length: 5 }, () => applySettlement('session-settlement'))
    await flushFinalSummary()
    const results = await Promise.all(applies)

    expect(results.every((result) => result.success)).toBe(true)
    expect(state.settlements[0].status).toBe('applied')
    expect(provider.generateModeratorFinalSummary).toHaveBeenCalledTimes(1)
    expect(state.messages.filter((message) => message.phase === 'moderator_final_summary')).toHaveLength(1)
    expect(state.finishCalls).toBe(1)
    expect([...state.agents.values()].some((agent) => agent.hp !== beforeHp.get(agent.id))).toBe(true)
    for (const agent of state.agents.values()) {
      const hpDelta = agent.hp - beforeHp.get(agent.id)!
      expect(Math.abs(hpDelta)).toBeLessThanOrEqual(DEFAULT_RULES_CONFIG.last_place_hp_loss)
    }
  })

  it('keeps a vetoed settlement vetoed when apply races after veto', async () => {
    await startToPending()
    const beforeHp = new Map([...state.agents].map(([id, agent]) => [id, agent.hp]))
    const { vetoSettlement, applySettlement } = await import('../src/main/debate/debateEngine')

    const veto = vetoSettlement('session-settlement')
    const apply = applySettlement('session-settlement')
    await flushFinalSummary()
    await Promise.all([veto, apply])

    expect(state.settlements[0].status).toBe('vetoed')
    expect(provider.generateModeratorFinalSummary).toHaveBeenCalledTimes(1)
    expect(state.messages.filter((message) => message.phase === 'moderator_final_summary')).toHaveLength(1)
    expect([...state.agents.values()].map((agent) => agent.hp)).toEqual(
      [...state.agents.values()].map((agent) => beforeHp.get(agent.id))
    )
  })

  it('keeps an applied settlement applied when veto races after apply', async () => {
    await startToPending()
    const { applySettlement, vetoSettlement } = await import('../src/main/debate/debateEngine')

    const apply = applySettlement('session-settlement')
    const veto = vetoSettlement('session-settlement')
    await flushFinalSummary()
    await Promise.all([apply, veto])

    expect(state.settlements[0].status).toBe('applied')
    expect(provider.generateModeratorFinalSummary).toHaveBeenCalledTimes(1)
    expect(state.messages.filter((message) => message.phase === 'moderator_final_summary')).toHaveLength(1)
  })

  it('does not call provider again when the session already has a final summary', async () => {
    await startToPending()
    const { vetoSettlement, applySettlement } = await import('../src/main/debate/debateEngine')

    const first = vetoSettlement('session-settlement')
    await flushFinalSummary()
    await first
    provider.generateModeratorFinalSummary.mockClear()

    const second = await applySettlement('session-settlement')

    expect(second.success).toBe(true)
    expect(state.settlements[0].status).toBe('vetoed')
    expect(provider.generateModeratorFinalSummary).not.toHaveBeenCalled()
    expect(state.messages.filter((message) => message.phase === 'moderator_final_summary')).toHaveLength(1)
  })
})
