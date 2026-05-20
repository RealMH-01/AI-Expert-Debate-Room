import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, DebatePhase, Message, Session } from '../src/shared/types'
import { DEFAULT_RULES_CONFIG } from '../src/shared/types'
import type { SettlementRecord } from '../src/main/voting/voteTypes'

const sessions = new Map<string, Session>()
const messages: Message[] = []
const settlements: SettlementRecord[] = []
let capturedSignal: AbortSignal | undefined
let providerMode: 'hangOpening' | 'completeToPending' = 'hangOpening'
let settlementId = 1

const room = {
  id: 'room-1',
  name: 'Abort Room',
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

const experts: Agent[] = ['expert-1', 'expert-2'].map((id, index) => ({
  ...moderator,
  id,
  role: 'expert',
  name: `Expert ${index + 1}`
}))

const voteReason = {
  attacked_what: 'a point',
  rebutted_what: 'a rebuttal',
  revised_what: 'a revision',
  survived_claim: 'a surviving claim',
  main_weakness: 'a weakness'
}

function voteJson(voterId: string, targetId: string): string {
  return JSON.stringify({
    voter: voterId,
    votes: [
      {
        target: targetId,
        score: 8,
        reason: voteReason
      }
    ]
  })
}

const delayedProvider = {
  name: 'delayed',
  generateModeratorOpening: vi.fn((input: { signal?: AbortSignal }) => {
    capturedSignal = input.signal
    if (providerMode === 'completeToPending') {
      return Promise.resolve({ content: 'opening' })
    }
    return new Promise((_resolve, reject) => {
      input.signal?.addEventListener('abort', () => {
        reject(input.signal?.reason ?? new Error('aborted'))
      })
    })
  }),
  generateExpertInitialAnswer: vi.fn((input: { signal?: AbortSignal }) => {
    capturedSignal = input.signal
    return Promise.resolve({ content: 'initial answer' })
  }),
  generateExpertDebateTurn: vi.fn((input: { signal?: AbortSignal }) => {
    capturedSignal = input.signal
    return Promise.resolve({ content: 'debate turn' })
  }),
  generateModeratorRoundSummary: vi.fn((input: { signal?: AbortSignal }) => {
    capturedSignal = input.signal
    return Promise.resolve({ content: 'round summary' })
  }),
  generateModeratorFinalSummary: vi.fn((input: { signal?: AbortSignal }) => {
    capturedSignal = input.signal
    return Promise.resolve({ content: 'final summary' })
  }),
  generateExpertVote: vi.fn((input: { voter: Agent; aliveExperts: Agent[]; signal?: AbortSignal }) => {
    capturedSignal = input.signal
    const target = input.aliveExperts.find((expert) => expert.id !== input.voter.id)!
    return Promise.resolve({ rawJson: voteJson(input.voter.id, target.id) })
  })
}

vi.mock('../src/main/db/repositories/sessionRepository', () => ({
  createSession: (roomId: string, title: string, userQuestion: string) => {
    const session: Session = {
      id: 'session-1',
      room_id: roomId,
      title,
      user_question: userQuestion,
      status: 'running',
      current_phase: 'moderator_opening',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    sessions.set(session.id, session)
    return session
  },
  getSessionById: (id: string) => sessions.get(id),
  getRunningSession: (roomId: string) =>
    [...sessions.values()].find(
      (session) => session.room_id === roomId && session.status === 'running'
    ),
  getRunningSessionsByRoom: (roomId: string) =>
    [...sessions.values()].filter(
      (session) => session.room_id === roomId && session.status === 'running'
    ),
  getRunningSessions: () =>
    [...sessions.values()].filter((session) => session.status === 'running'),
  updateSessionPhase: (sessionId: string, phase: DebatePhase) => {
    const session = sessions.get(sessionId)!
    const updated = { ...session, current_phase: phase }
    sessions.set(sessionId, updated)
    return updated
  },
  failSession: vi.fn((sessionId: string, errorMessage: string) => {
    const session = sessions.get(sessionId)!
    const updated: Session = {
      ...session,
      status: 'failed',
      final_summary: `[ERROR] ${errorMessage}`
    }
    sessions.set(sessionId, updated)
    return updated
  }),
  abortSession: vi.fn((sessionId: string, reason?: string) => {
    const session = sessions.get(sessionId)!
    const updated: Session = {
      ...session,
      status: 'aborted',
      final_summary: reason ?? null,
      updated_at: '2026-01-01T00:00:01.000Z',
      ...( { ended_at: '2026-01-01T00:00:01.000Z' } as Partial<Session> )
    }
    sessions.set(sessionId, updated)
    return updated
  }),
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
      id: `message-${messages.length + 1}`,
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
    messages.push(message)
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
  getProviderForAgent: () => delayedProvider,
  validateProvidersReady: () => []
}))

vi.mock('../src/main/db/repositories/participantRepository', () => ({
  insertParticipants: vi.fn(),
  updateParticipantFinalState: vi.fn()
}))

vi.mock('../src/main/cost/usageTracker', () => ({
  trackModelCallUsage: async (
    _metadata: unknown,
    call: () => Promise<unknown>
  ) => call()
}))

vi.mock('../src/main/db/repositories/voteRepository', () => ({
  insertVote: vi.fn()
}))
vi.mock('../src/main/db/repositories/settlementRepository', () => ({
  insertSettlement: (params: {
    sessionId: string
    roundIndex: number
    settlementJson: string
    status?: string
  }) => {
    const record: SettlementRecord = {
      id: `settlement-${settlementId++}`,
      session_id: params.sessionId,
      round_index: params.roundIndex,
      settlement_json: params.settlementJson,
      status: params.status ?? 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
      applied_at: null
    }
    settlements.push(record)
    return record
  },
  updateSettlementStatus: vi.fn((id: string, status: 'applied' | 'vetoed' | 'skipped') => {
    const record = settlements.find((settlement) => settlement.id === id)
    if (!record) return undefined
    record.status = status
    if (status === 'applied') {
      record.applied_at = '2026-01-01T00:00:00.000Z'
    }
    return record
  }),
  getPendingSettlement: (sessionId: string) =>
    settlements.find(
      (settlement) => settlement.session_id === sessionId && settlement.status === 'pending'
    )
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
  getDatabase: vi.fn(() => ({
    transaction: (callback: () => void) => callback
  }))
}))
vi.mock('../src/main/memory/projectMemory', () => ({ ensureMemorySuggestionsForMeeting: vi.fn() }))

describe('debate abort', () => {
  beforeEach(() => {
    sessions.clear()
    messages.length = 0
    settlements.length = 0
    capturedSignal = undefined
    providerMode = 'hangOpening'
    settlementId = 1
    vi.clearAllMocks()
  })

  it('aborts a running debate, marks the session aborted, records a system message, and clears running state', async () => {
    const { startDebate, abortDebate, isDebateRunning } = await import('../src/main/debate/debateEngine')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }

    const debatePromise = startDebate(room.id, 'Please debate this', callbacks)
    await vi.waitFor(() => {
      expect(isDebateRunning(room.id)).toBe(true)
      expect(capturedSignal).toBeDefined()
    })

    const abortResult = abortDebate(room.id)

    expect(abortResult).toMatchObject({
      success: true,
      aborted: true,
      roomId: room.id,
      sessionId: 'session-1'
    })
    expect(sessions.get('session-1')?.status).toBe('aborted')
    expect((sessions.get('session-1') as Session & { ended_at?: string })?.ended_at).toBeDefined()
    expect(isDebateRunning(room.id)).toBe(false)

    await debatePromise

    expect(capturedSignal?.aborted).toBe(true)
    expect(sessions.get('session-1')?.status).toBe('aborted')
    expect(isDebateRunning(room.id)).toBe(false)
    expect(messages.some((message) => message.structured_json?.includes('debate_aborted'))).toBe(true)
    expect(callbacks.onError).not.toHaveBeenCalledWith(expect.stringContaining('timeout'))
  })

  it('aborts settlement pending state, vetoes the pending settlement, and does not finish the session', async () => {
    providerMode = 'completeToPending'
    const { startDebate, abortDebate, hasPendingSettlement, isDebateRunning } = await import('../src/main/debate/debateEngine')
    const sessionRepo = await import('../src/main/db/repositories/sessionRepository')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }

    await startDebate(room.id, 'Please debate this', callbacks)

    expect(sessions.get('session-1')?.current_phase).toBe('settlement_pending')
    expect(isDebateRunning(room.id)).toBe(true)
    expect(hasPendingSettlement('session-1')).toBe(true)
    expect(settlements).toHaveLength(1)
    expect(settlements[0].status).toBe('pending')

    expect(abortDebate(room.id)).toMatchObject({
      success: true,
      aborted: true,
      roomId: room.id,
      sessionId: 'session-1'
    })

    expect(capturedSignal?.aborted).toBe(true)
    expect(settlements[0].status).toBe('vetoed')
    expect(hasPendingSettlement('session-1')).toBe(false)
    expect(sessions.get('session-1')?.status).toBe('aborted')
    expect(isDebateRunning(room.id)).toBe(false)
    expect(delayedProvider.generateModeratorFinalSummary).not.toHaveBeenCalled()
    expect(sessionRepo.finishSession).not.toHaveBeenCalled()
  })

  it('repairs an orphan database running session when there is no active run', async () => {
    const orphan: Session = {
      id: 'orphan-session',
      room_id: room.id,
      title: 'Orphan',
      user_question: 'stuck?',
      status: 'running',
      current_phase: 'expert_initial',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    sessions.set(orphan.id, orphan)
    messages.push({
      id: 'existing-message',
      session_id: orphan.id,
      round_index: 0,
      phase: 'expert_initial',
      speaker_id: null,
      speaker_name: '系统',
      speaker_role: 'system',
      content: 'existing transcript stays',
      structured_json: null,
      created_at: '2026-01-01T00:00:00.000Z'
    })

    const { abortDebate, isDebateRunning, validateRoomCanStart } = await import('../src/main/debate/debateEngine')

    const result = abortDebate(room.id)

    expect(result).toMatchObject({
      success: true,
      aborted: true,
      repaired: true,
      roomId: room.id,
      sessionId: orphan.id
    })
    expect(sessions.get(orphan.id)?.status).toBe('aborted')
    expect((sessions.get(orphan.id) as Session & { ended_at?: string })?.ended_at).toBeDefined()
    expect(messages.some((message) => message.content.includes('已清理卡住的运行状态'))).toBe(true)
    expect(messages.some((message) => message.content === 'existing transcript stays')).toBe(true)
    expect(isDebateRunning(room.id)).toBe(false)
    expect(validateRoomCanStart(room.id).valid).toBe(true)
  })

  it('repairs all orphan running sessions when the latest session is already finished', async () => {
    const oldRunningA: Session = {
      id: 'old-running-a',
      room_id: room.id,
      title: 'Old running A',
      user_question: 'stuck a?',
      status: 'running',
      current_phase: 'expert_initial',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    const oldRunningB: Session = {
      ...oldRunningA,
      id: 'old-running-b',
      title: 'Old running B',
      user_question: 'stuck b?',
      current_phase: 'voting'
    }
    const latestFinished: Session = {
      ...oldRunningA,
      id: 'latest-finished',
      title: 'Latest finished',
      user_question: 'done',
      status: 'finished',
      current_phase: 'moderator_final_summary',
      final_summary: 'done',
      created_at: '2026-01-01T00:00:02.000Z',
      updated_at: '2026-01-01T00:00:02.000Z'
    }
    sessions.set(oldRunningA.id, oldRunningA)
    sessions.set(oldRunningB.id, oldRunningB)
    sessions.set(latestFinished.id, latestFinished)

    const { abortDebate, isDebateRunning, validateRoomCanStart } = await import('../src/main/debate/debateEngine')

    expect(isDebateRunning(room.id)).toBe(true)
    const blockedStart = validateRoomCanStart(room.id)
    expect(blockedStart.valid).toBe(false)
    expect(blockedStart.errors.join('; ')).toContain('old-running-a')
    expect(blockedStart.errors.join('; ')).toContain('expert_initial')
    expect(blockedStart.errors.join('; ')).toContain('running')

    const result = abortDebate(room.id, latestFinished.id)

    expect(result).toMatchObject({
      success: true,
      aborted: true,
      repaired: true,
      roomId: room.id
    })
    expect(sessions.get(oldRunningA.id)?.status).toBe('aborted')
    expect(sessions.get(oldRunningB.id)?.status).toBe('aborted')
    expect(sessions.get(latestFinished.id)?.status).toBe('finished')
    expect(isDebateRunning(room.id)).toBe(false)
    expect(validateRoomCanStart(room.id).valid).toBe(true)
  })

  it('prioritizes the specified running session when aborting by session id', async () => {
    const otherRunning: Session = {
      id: 'other-running',
      room_id: room.id,
      title: 'Other running',
      user_question: 'other?',
      status: 'running',
      current_phase: 'expert_initial',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    const targetRunning: Session = {
      ...otherRunning,
      id: 'target-running',
      title: 'Target running',
      user_question: 'target?',
      current_phase: 'voting'
    }
    sessions.set(otherRunning.id, otherRunning)
    sessions.set(targetRunning.id, targetRunning)

    const { abortDebate } = await import('../src/main/debate/debateEngine')
    const sessionRepo = await import('../src/main/db/repositories/sessionRepository')

    const result = abortDebate(room.id, targetRunning.id)

    expect(result).toMatchObject({
      success: true,
      aborted: true,
      roomId: room.id,
      sessionId: targetRunning.id
    })
    expect(sessionRepo.abortSession).toHaveBeenNthCalledWith(
      1,
      targetRunning.id,
      expect.any(String)
    )
    expect(sessions.get(targetRunning.id)?.status).toBe('aborted')
    expect(sessions.get(otherRunning.id)?.status).toBe('aborted')
  })

  it('repairs every orphan database running session when there is no active run', async () => {
    const orphanA: Session = {
      id: 'orphan-a',
      room_id: room.id,
      title: 'Orphan A',
      user_question: 'stuck a?',
      status: 'running',
      current_phase: 'expert_initial',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    const orphanB: Session = {
      ...orphanA,
      id: 'orphan-b',
      title: 'Orphan B',
      user_question: 'stuck b?',
      current_phase: 'voting'
    }
    sessions.set(orphanA.id, orphanA)
    sessions.set(orphanB.id, orphanB)

    const { abortDebate, isDebateRunning, validateRoomCanStart } = await import('../src/main/debate/debateEngine')

    const result = abortDebate(room.id)

    expect(result).toMatchObject({
      success: true,
      aborted: true,
      repaired: true,
      roomId: room.id
    })
    expect(sessions.get(orphanA.id)?.status).toBe('aborted')
    expect(sessions.get(orphanB.id)?.status).toBe('aborted')
    expect(isDebateRunning(room.id)).toBe(false)
    expect(validateRoomCanStart(room.id).valid).toBe(true)
  })

  it('returns a noop success when there is no active or database running debate', async () => {
    const { abortDebate } = await import('../src/main/debate/debateEngine')

    expect(abortDebate('missing-room')).toMatchObject({
      success: true,
      aborted: false,
      noop: true,
      roomId: 'missing-room'
    })
  })

  it('repairs stale running sessions on app startup without deleting transcript messages', async () => {
    const stale: Session = {
      id: 'stale-session',
      room_id: room.id,
      title: 'Stale',
      user_question: 'left behind?',
      status: 'running',
      current_phase: 'expert_initial',
      final_summary: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
    sessions.set(stale.id, stale)
    messages.push({
      id: 'transcript-message',
      session_id: stale.id,
      round_index: 0,
      phase: 'expert_initial',
      speaker_id: 'expert-1',
      speaker_name: 'Expert 1',
      speaker_role: 'expert',
      content: 'saved transcript',
      structured_json: null,
      created_at: '2026-01-01T00:00:00.000Z'
    })

    const { repairStaleRunningDebates } = await import('../src/main/debate/debateEngine')

    const result = repairStaleRunningDebates()

    expect(result).toMatchObject({
      repairedCount: 1,
      repairedSessionIds: [stale.id]
    })
    expect(sessions.get(stale.id)?.status).toBe('aborted')
    expect(messages.some((message) => message.content === 'saved transcript')).toBe(true)
    expect(messages.some((message) => message.content.includes('应用启动时清理了上次未正常结束的辩论'))).toBe(true)
  })
})
