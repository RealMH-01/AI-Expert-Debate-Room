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
  votes: [] as Array<{ voterAgentId: string; targetAgentId: string; score: number }>,
  settlements: [] as SettlementRecord[],
  initialCalls: [] as Array<{ expertId: string; visibleTranscriptLength: number; deferred: Deferred<{ content: string }> }>,
  voteCalls: [] as Array<{ voterId: string; deferred: Deferred<{ rawJson: string }> }>,
  failInitialFor: null as string | null,
  slowInitial: false,
  slowVotes: false,
  settlementId: 1
}))

const room = {
  id: 'room-performance',
  name: 'Performance Room',
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

const experts: Agent[] = ['expert-1', 'expert-2', 'expert-3'].map((id, index) => ({
  ...moderator,
  id,
  role: 'expert',
  name: `Expert ${index + 1}`,
  influence: index
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
  name: 'mock-performance',
  generateModeratorOpening: vi.fn(async () => ({ content: 'opening' })),
  generateExpertInitialAnswer: vi.fn((input: { agent: Agent; visibleTranscript: unknown[] }) => {
    const call = {
      expertId: input.agent.id,
      visibleTranscriptLength: input.visibleTranscript.length,
      deferred: deferred<{ content: string }>()
    }
    state.initialCalls.push(call)
    if (state.failInitialFor === input.agent.id) {
      call.deferred.reject(new Error('network: request timeout'))
    } else if (!state.slowInitial) {
      call.deferred.resolve({ content: expertJson(`initial ${input.agent.id}`) })
    }
    return call.deferred.promise
  }),
  generateExpertDebateTurn: vi.fn(async (input: { agent: Agent; roundIndex: number }) => ({
    content: expertJson(`debate ${input.roundIndex} ${input.agent.id}`)
  })),
  generateModeratorRoundSummary: vi.fn(async (input: { roundIndex: number }) => ({
    content: `summary ${input.roundIndex}`
  })),
  generateModeratorFinalSummary: vi.fn(async () => ({ content: 'final summary' })),
  generateExpertVote: vi.fn((input: { voter: Agent; aliveExperts: Agent[] }) => {
    const target = input.aliveExperts.find((expert) => expert.id !== input.voter.id)!
    const call = {
      voterId: input.voter.id,
      deferred: deferred<{ rawJson: string }>()
    }
    state.voteCalls.push(call)
    if (!state.slowVotes) {
      call.deferred.resolve({ rawJson: voteJson(input.voter.id, target.id) })
    }
    return call.deferred.promise
  })
}

vi.mock('../src/main/db/repositories/sessionRepository', () => ({
  createSession: (roomId: string, title: string, userQuestion: string) => {
    const session: Session = {
      id: 'session-performance',
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
  getRunningSession: () => undefined,
  getRunningSessions: () => [],
  updateSessionPhase: (sessionId: string, phase: DebatePhase) => {
    const session = state.sessions.get(sessionId)!
    const updated = { ...session, current_phase: phase }
    state.sessions.set(sessionId, updated)
    return updated
  },
  failSession: vi.fn(),
  abortSession: vi.fn(),
  finishSession: vi.fn()
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
  }
}))

vi.mock('../src/main/db/repositories/roomRepository', () => ({
  getRoomById: (roomId: string) => (roomId === room.id ? room : undefined)
}))

vi.mock('../src/main/db/repositories/agentRepository', () => ({
  getModerator: () => moderator,
  getExperts: () => experts
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
vi.mock('../src/main/db/repositories/voteRepository', () => ({
  insertVote: vi.fn((input: { voterAgentId: string; targetAgentId: string; score: number }) => {
    state.votes.push(input)
  })
}))
vi.mock('../src/main/db/repositories/settlementRepository', () => ({
  insertSettlement: (params: { sessionId: string; roundIndex: number; settlementJson: string; status?: string }) => {
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
  updateSettlementStatus: vi.fn(),
  getPendingSettlement: vi.fn()
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

describe('debate performance behavior', () => {
  beforeEach(() => {
    vi.resetModules()
    state.sessions.clear()
    state.messages.length = 0
    state.votes.length = 0
    state.settlements.length = 0
    state.initialCalls.length = 0
    state.voteCalls.length = 0
    state.failInitialFor = null
    state.slowInitial = false
    state.slowVotes = false
    state.settlementId = 1
    vi.clearAllMocks()
  })

  it('starts all initial expert answers from the same transcript snapshot before waiting for completion', async () => {
    state.slowInitial = true
    const { startDebate } = await import('../src/main/debate/debateEngine')
    const debatePromise = startDebate(room.id, 'Question?', {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    })

    await vi.waitFor(() => expect(state.initialCalls).toHaveLength(3), { timeout: 100 })
    expect(state.initialCalls.map((call) => call.visibleTranscriptLength)).toEqual([1, 1, 1])

    state.initialCalls[2].deferred.resolve({ content: expertJson('initial expert-3') })
    state.initialCalls[0].deferred.resolve({ content: expertJson('initial expert-1') })
    state.initialCalls[1].deferred.resolve({ content: expertJson('initial expert-2') })
    await debatePromise

    const initialMessages = state.messages.filter((message) => message.phase === 'expert_initial')
    expect(initialMessages.map((message) => message.speaker_id)).toEqual(['expert-1', 'expert-2', 'expert-3'])
  })

  it('keeps successful initial answers when one expert times out', async () => {
    state.failInitialFor = 'expert-2'
    const { startDebate } = await import('../src/main/debate/debateEngine')

    await startDebate(room.id, 'Question?', {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    })

    const initialMessages = state.messages.filter((message) => message.phase === 'expert_initial')
    expect(initialMessages.map((message) => message.speaker_id)).toEqual(['expert-1', null, 'expert-3'])
    expect(initialMessages[1].content).toContain('Provider 请求超时')
  })

  it('starts all votes independently before validating and saving them', async () => {
    state.slowVotes = true
    const { startDebate } = await import('../src/main/debate/debateEngine')
    const debatePromise = startDebate(room.id, 'Question?', {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    })

    await vi.waitFor(() => expect(state.voteCalls).toHaveLength(3), { timeout: 100 })
    state.voteCalls[1].deferred.reject(new Error('network: request timeout'))
    state.voteCalls[2].deferred.resolve({ rawJson: voteJson('expert-3', 'expert-1') })
    state.voteCalls[0].deferred.resolve({ rawJson: voteJson('expert-1', 'expert-2') })
    await debatePromise

    expect(state.votes.map((vote) => vote.voterAgentId).sort()).toEqual(['expert-1', 'expert-3'])
    expect(state.messages.some((message) => message.phase === 'voting' && message.content.includes('Provider 请求超时'))).toBe(true)
  })
})
