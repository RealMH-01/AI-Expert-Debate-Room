import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Agent,
  DebateAttachmentContext,
  DebateAttachmentInput,
  DebatePhase,
  Message,
  Session
} from '../src/shared/types'
import { DEFAULT_RULES_CONFIG } from '../src/shared/types'

const sessions = new Map<string, Session>()
const messages: Message[] = []
const insertedAttachments: DebateAttachmentContext[] = []
const providerInputs: Array<{ phase: DebatePhase; attachments?: DebateAttachmentContext[] }> = []

const room = {
  id: 'room-1',
  name: 'Attachment Room',
  rules_json: JSON.stringify({
    ...DEFAULT_RULES_CONFIG,
    min_debate_rounds: 3,
    stop_settlement_when_alive_experts_less_than: 3
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

const provider = {
  name: 'capture',
  generateModeratorOpening: vi.fn((input: { phase: DebatePhase; attachments?: DebateAttachmentContext[] }) => {
    providerInputs.push(input)
    return Promise.resolve({ content: 'opening' })
  }),
  generateExpertInitialAnswer: vi.fn((input: { phase: DebatePhase; attachments?: DebateAttachmentContext[]; agent?: Agent }) => {
    providerInputs.push(input)
    return Promise.resolve({ content: 'initial answer' })
  }),
  generateExpertDebateTurn: vi.fn((input: { phase: DebatePhase; attachments?: DebateAttachmentContext[] }) => {
    providerInputs.push(input)
    return Promise.resolve({ content: 'debate turn' })
  }),
  generateModeratorRoundSummary: vi.fn((input: { phase: DebatePhase; attachments?: DebateAttachmentContext[] }) => {
    providerInputs.push(input)
    return Promise.resolve({ content: 'round summary' })
  }),
  generateModeratorFinalSummary: vi.fn((input: { phase: DebatePhase; attachments?: DebateAttachmentContext[] }) => {
    providerInputs.push(input)
    return Promise.resolve({ content: 'final summary' })
  }),
  generateExpertVote: vi.fn()
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
  getRunningSession: () => undefined,
  updateSessionPhase: (sessionId: string, phase: DebatePhase) => {
    const session = sessions.get(sessionId)!
    const updated = { ...session, current_phase: phase }
    sessions.set(sessionId, updated)
    return updated
  },
  failSession: vi.fn(),
  abortSession: vi.fn(),
  finishSession: vi.fn((sessionId: string, finalSummary: string) => {
    const session = sessions.get(sessionId)!
    const updated: Session = {
      ...session,
      status: 'finished',
      current_phase: 'moderator_final_summary',
      final_summary: finalSummary
    }
    sessions.set(sessionId, updated)
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
  getProviderForAgent: () => provider,
  validateProvidersReady: () => []
}))

vi.mock('../src/main/db/repositories/attachmentRepository', () => ({
  insertAttachmentsForSession: (sessionId: string, attachments: DebateAttachmentInput[]) => {
    const rows = attachments.map((attachment, index) => ({
      id: `attachment-${index + 1}`,
      sessionId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType ?? null,
      sizeBytes: attachment.sizeBytes,
      contentText: attachment.contentText,
      summaryText: null
    }))
    insertedAttachments.push(...rows)
    return rows
  }
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
  insertSettlement: vi.fn(() => ({
    id: 'settlement-1',
    session_id: 'session-1',
    round_index: 3,
    settlement_json: '{}',
    status: 'skipped',
    created_at: '2026-01-01T00:00:00.000Z',
    applied_at: null
  })),
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
vi.mock('../src/main/review/sessionReviewBuilder', () => ({ buildSessionReview: vi.fn(() => ({})) }))
vi.mock('../src/main/export/markdownExporter', () => ({ generateSessionMarkdown: vi.fn(() => '') }))
vi.mock('../src/main/db/sqlite', () => ({
  getDatabase: vi.fn(() => ({
    transaction: (callback: () => void) => callback
  }))
}))
vi.mock('../src/main/memory/projectMemory', () => ({ ensureMemorySuggestionsForMeeting: vi.fn() }))

describe('startDebate attachments', () => {
  beforeEach(() => {
    vi.resetModules()
    sessions.clear()
    messages.length = 0
    insertedAttachments.length = 0
    providerInputs.length = 0
    vi.clearAllMocks()
  })

  it('keeps the old no-attachment flow working', async () => {
    const { startDebate } = await import('../src/main/debate/debateEngine')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }

    const session = await startDebate(room.id, 'Please debate this', callbacks)

    expect(session?.status).toBe('finished')
    expect(insertedAttachments).toHaveLength(0)
    expect(providerInputs.every((input) => input.attachments == null)).toBe(true)
  })

  it('binds attachments to the created session and passes the same context to all speaking prompts', async () => {
    const { startDebate } = await import('../src/main/debate/debateEngine')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }
    const attachments: DebateAttachmentInput[] = [
      {
        originalName: 'outline.md',
        mimeType: 'text/markdown',
        sizeBytes: 9,
        contentText: '# Outline'
      }
    ]

    const session = await startDebate(room.id, 'Please debate this', callbacks, attachments)

    expect(session?.id).toBe('session-1')
    expect(insertedAttachments).toHaveLength(1)
    expect(insertedAttachments[0]).toMatchObject({
      sessionId: 'session-1',
      originalName: 'outline.md',
      contentText: '# Outline'
    })
    const speakingInputs = providerInputs.filter((input) => input.phase !== 'voting')
    expect(speakingInputs.length).toBeGreaterThan(0)
    for (const input of speakingInputs) {
      expect(input.attachments).toEqual(insertedAttachments)
    }
  })

  it('retries an expert initial answer once when JSON parsing fails and keeps the recovered output', async () => {
    const invalidJson = '{"message":"missing comma" "claims":[],"attacks":[]}'
    const recoveredJson = JSON.stringify({
      message: 'Recovered answer',
      claims: [{ claim_text: 'Recovered claim' }],
      attacks: []
    })
    const attemptsByAgent = new Map<string, number>()
    provider.generateExpertInitialAnswer.mockImplementation((input) => {
      const agentId = input.agent?.id ?? 'unknown'
      const attempts = attemptsByAgent.get(agentId) ?? 0
      attemptsByAgent.set(agentId, attempts + 1)
      if (agentId === 'expert-1' && attempts === 0) return Promise.resolve({ content: invalidJson })
      if (agentId === 'expert-1') return Promise.resolve({ content: recoveredJson })
      return Promise.resolve({ content: JSON.stringify({ message: 'Other answer', claims: [], attacks: [] }) })
    })

    const { startDebate } = await import('../src/main/debate/debateEngine')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }

    await startDebate(room.id, 'Please debate this', callbacks)

    const firstExpertMessage = messages.find(
      (message) => message.phase === 'expert_initial' && message.speaker_name === 'Expert 1'
    )
    expect(provider.generateExpertInitialAnswer).toHaveBeenCalledTimes(3)
    expect(firstExpertMessage?.content).toBe('Recovered answer')
    expect(JSON.parse(firstExpertMessage?.structured_json ?? '{}')).toMatchObject({
      message: 'Recovered answer',
      claims: [{ claim_text: 'Recovered claim' }],
      retry: {
        attempted: true,
        succeeded: true,
        attempts: 1
      }
    })
  })

  it('stores retry metadata and raw head/tail when expert initial retry still fails', async () => {
    const firstInvalid = '{"message":"first" "claims":[],"attacks":[]}'
    const secondInvalid = '{"message":"second" "claims":[],"attacks":[]}'
    const attemptsByAgent = new Map<string, number>()
    provider.generateExpertInitialAnswer.mockImplementation((input) => {
      const agentId = input.agent?.id ?? 'unknown'
      const attempts = attemptsByAgent.get(agentId) ?? 0
      attemptsByAgent.set(agentId, attempts + 1)
      if (agentId === 'expert-1' && attempts === 0) return Promise.resolve({ content: firstInvalid })
      if (agentId === 'expert-1') return Promise.resolve({ content: secondInvalid })
      return Promise.resolve({ content: JSON.stringify({ message: 'Other answer', claims: [], attacks: [] }) })
    })

    const { startDebate } = await import('../src/main/debate/debateEngine')
    const callbacks = {
      onMessage: vi.fn(),
      onPhaseChange: vi.fn(),
      onSessionFinished: vi.fn(),
      onError: vi.fn(),
      onSettlementReady: vi.fn()
    }

    await startDebate(room.id, 'Please debate this', callbacks)

    const failedMessage = messages.find(
      (message) => message.phase === 'expert_initial' && message.speaker_name === 'Expert 1'
    )
    const structured = JSON.parse(failedMessage?.structured_json ?? '{}')
    expect(failedMessage?.content).toContain('[结构化输出解析失败]')
    expect(structured).toMatchObject({
      type: 'expert_output_parse_failed',
      errorType: 'json_parse_failed',
      rawHead: secondInvalid,
      rawTail: secondInvalid,
      retry: {
        attempted: true,
        succeeded: false,
        attempts: 1
      }
    })
    expect(messages.some((message) => message.speaker_name === 'Expert 2')).toBe(true)
  })
})
