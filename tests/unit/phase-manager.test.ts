import { describe, expect, it, vi } from 'vitest'

import { defaultRulesConfig } from '../../src/shared/constants'
import {
  PhaseManager,
  getNextRoundPhase,
  getRoundPhaseSequence,
  isSettlementRound,
  isValidSessionTransition,
  mapLegacyStatus,
  validateDecisionAction
} from '../../src/main/engine/phase-manager'
import type { PhaseDbAccess } from '../../src/main/engine/phase-manager'
import type { RoundPhase, RulesConfig, SessionStatus } from '../../src/shared/types'

function cloneRules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return {
    ...defaultRulesConfig,
    ...overrides,
    formulas: {
      ...defaultRulesConfig.formulas,
      ...(overrides.formulas ?? {})
    },
    comebackBonus: {
      ...defaultRulesConfig.comebackBonus,
      ...(overrides.comebackBonus ?? {}),
      tiers:
        overrides.comebackBonus?.tiers?.map((tier) => ({ ...tier })) ??
        defaultRulesConfig.comebackBonus.tiers.map((tier) => ({ ...tier }))
    },
    speakingRightRange: overrides.speakingRightRange
      ? [...overrides.speakingRightRange]
      : [...defaultRulesConfig.speakingRightRange]
  }
}

function createPhaseDb(options: {
  status?: SessionStatus | string
  phase?: RoundPhase | null
  roundIndex?: number
  rules?: RulesConfig
  aliveCount?: number
  lockAcquired?: boolean
} = {}): PhaseDbAccess {
  let status = options.status ?? 'preparing'
  let phase = options.phase ?? null
  let roundIndex = options.roundIndex ?? 0
  let aliveCount = options.aliveCount ?? 5
  let rules = options.rules ?? cloneRules()

  return {
    getSessionStatus: vi.fn(() => status),
    setSessionStatus: vi.fn((_sessionId, nextStatus) => {
      status = nextStatus
    }),
    getCurrentRoundIndex: vi.fn(() => roundIndex),
    setCurrentRoundIndex: vi.fn((_sessionId, nextRoundIndex) => {
      roundIndex = nextRoundIndex
    }),
    getRoundPhase: vi.fn(() => phase),
    setRoundPhase: vi.fn((_sessionId, nextPhase) => {
      phase = nextPhase
    }),
    clearRoundPhase: vi.fn(() => {
      phase = null
    }),
    getRulesConfig: vi.fn(() => rules),
    getAliveExpertCount: vi.fn(() => aliveCount),
    tryAcquireDecisionLock: vi.fn(() => options.lockAcquired ?? true),
    releaseDecisionLock: vi.fn(),
    markSessionCompleted: vi.fn()
  }
}

describe('phase-manager', () => {
  describe('mapLegacyStatus', () => {
    it('does not map new statuses', () => {
      expect(mapLegacyStatus('debate_loop')).toEqual({
        mappedStatus: 'debate_loop',
        mappedRoundPhase: null,
        isLegacy: false
      })
    })

    it('maps legacy statuses to the new status and phase model', () => {
      expect(mapLegacyStatus('debate')).toMatchObject({
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'speaking',
        isLegacy: true
      })
      expect(mapLegacyStatus('voting')).toMatchObject({
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'voting'
      })
      expect(mapLegacyStatus('settlement_pending')).toMatchObject({
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'settlement'
      })
      expect(mapLegacyStatus('settled')).toMatchObject({
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'user_decision'
      })
      expect(mapLegacyStatus('summary')).toMatchObject({
        mappedStatus: 'final_summary',
        mappedRoundPhase: null
      })
    })

    it('safely downgrades unknown strings to preparing', () => {
      expect(mapLegacyStatus('mystery')).toEqual({
        mappedStatus: 'preparing',
        mappedRoundPhase: null,
        isLegacy: true
      })
    })
  })

  describe('isValidSessionTransition', () => {
    it('validates allowed and rejected top-level transitions', () => {
      expect(isValidSessionTransition('preparing', 'independent_answer')).toBe(true)
      expect(isValidSessionTransition('independent_answer', 'debate_loop')).toBe(true)
      expect(isValidSessionTransition('debate_loop', 'final_summary')).toBe(true)
      expect(isValidSessionTransition('final_summary', 'completed')).toBe(true)
      expect(isValidSessionTransition('debate_loop', 'completed')).toBe(false)
      expect(isValidSessionTransition('completed', 'preparing')).toBe(false)
      expect(isValidSessionTransition('debate', 'debate_loop')).toBe(true)
      expect(isValidSessionTransition('debate', 'final_summary')).toBe(true)
    })
  })

  describe('round phase helpers', () => {
    it('returns per-round and per-cycle phase sequences', () => {
      expect(getRoundPhaseSequence(cloneRules({ settlementMode: 'per-round' }), 1)).toEqual([
        'speaking',
        'round_summary',
        'voting',
        'settlement',
        'elimination_check',
        'user_decision'
      ])

      const perCycleRules = cloneRules({
        settlementMode: 'per-cycle',
        settlementCycleRounds: 3
      })
      expect(getRoundPhaseSequence(perCycleRules, 1)).toEqual(['speaking', 'round_summary'])
      expect(getRoundPhaseSequence(perCycleRules, 3)).toEqual([
        'speaking',
        'round_summary',
        'voting',
        'settlement',
        'elimination_check',
        'user_decision'
      ])
      expect(getRoundPhaseSequence(perCycleRules, 6)).toEqual([
        'speaking',
        'round_summary',
        'voting',
        'settlement',
        'elimination_check',
        'user_decision'
      ])
    })

    it('gets next phase or null at the end or for unknown phases', () => {
      const sequence: RoundPhase[] = ['speaking', 'round_summary', 'user_decision']

      expect(getNextRoundPhase('speaking', sequence)).toBe('round_summary')
      expect(getNextRoundPhase('user_decision', sequence)).toBeNull()
      expect(getNextRoundPhase('manual_review', sequence)).toBeNull()
    })

    it('detects settlement rounds for valid round and cycle numbers', () => {
      expect(isSettlementRound(3, 3)).toBe(true)
      expect(isSettlementRound(4, 3)).toBe(false)
      expect(isSettlementRound(0, 3)).toBe(false)
      expect(isSettlementRound(3, 0)).toBe(false)
    })
  })

  describe('validateDecisionAction', () => {
    it('validates decision action payloads', () => {
      expect(validateDecisionAction({ type: 'continue' })).toBeNull()
      expect(validateDecisionAction({ type: 'end_session' })).toBeNull()
      expect(validateDecisionAction({ type: 'inject_question', content: '' })).toMatch(
        /non-empty content/
      )
      expect(validateDecisionAction({ type: 'inject_question', content: 'new angle' })).toBeNull()
      expect(validateDecisionAction({ type: 'revive_expert', agentId: '' })).toMatch(
        /non-empty agentId/
      )
      expect(validateDecisionAction({ type: 'revive_expert', agentId: 'agent_a' })).toBeNull()
    })
  })

  describe('PhaseManager', () => {
    it('starts a session from preparing to independent_answer', () => {
      const db = createPhaseDb({ status: 'preparing' })
      const result = new PhaseManager(db).startSession('session-1')

      expect(result).toMatchObject({
        success: true,
        previousStatus: 'preparing',
        newStatus: 'independent_answer'
      })
      expect(db.setSessionStatus).toHaveBeenCalledWith('session-1', 'independent_answer')
    })

    it('enters debate loop at round 1 speaking phase', () => {
      const db = createPhaseDb({ status: 'independent_answer' })
      const result = new PhaseManager(db).enterDebateLoop('session-1')

      expect(result).toMatchObject({
        success: true,
        newStatus: 'debate_loop',
        newRoundPhase: 'speaking',
        roundIndex: 1
      })
      expect(db.setCurrentRoundIndex).toHaveBeenCalledWith('session-1', 1)
      expect(db.setRoundPhase).toHaveBeenCalledWith('session-1', 'speaking')
    })

    it('advances per-round speaking to round_summary', () => {
      const db = createPhaseDb({ status: 'debate_loop', phase: 'speaking', roundIndex: 1 })
      const result = new PhaseManager(db).advanceRoundPhase('session-1')

      expect(result).toMatchObject({
        success: true,
        previousRoundPhase: 'speaking',
        newRoundPhase: 'round_summary'
      })
      expect(db.setRoundPhase).toHaveBeenCalledWith('session-1', 'round_summary')
    })

    it('does not advance automatically from per-round user_decision', () => {
      const db = createPhaseDb({ status: 'debate_loop', phase: 'user_decision', roundIndex: 1 })
      const result = new PhaseManager(db).advanceRoundPhase('session-1')

      expect(result).toMatchObject({
        success: false,
        newRoundPhase: 'user_decision'
      })
      expect(db.setRoundPhase).not.toHaveBeenCalled()
    })

    it('auto-advances per-cycle non-settlement round_summary to next round speaking', () => {
      const db = createPhaseDb({
        status: 'debate_loop',
        phase: 'round_summary',
        roundIndex: 1,
        rules: cloneRules({ settlementMode: 'per-cycle', settlementCycleRounds: 3 })
      })
      const result = new PhaseManager(db).advanceRoundPhase('session-1')

      expect(result).toMatchObject({
        success: true,
        newRoundPhase: 'speaking',
        roundIndex: 2
      })
      expect(db.setCurrentRoundIndex).toHaveBeenCalledWith('session-1', 2)
    })

    it('handles continue, revive, injection, and explicit end decisions', () => {
      const continueDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'user_decision',
        roundIndex: 2
      })
      expect(new PhaseManager(continueDb).handleUserDecision('session-1', { type: 'continue' })).toMatchObject({
        success: true,
        nextRoundPhase: 'speaking',
        nextRoundIndex: 3
      })

      const reviveDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'manual_review',
        roundIndex: 2
      })
      expect(
        new PhaseManager(reviveDb).handleUserDecision('session-1', {
          type: 'revive_expert',
          agentId: 'agent_a'
        })
      ).toMatchObject({
        success: true,
        nextRoundPhase: 'speaking',
        nextRoundIndex: 3
      })

      const injectDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'manual_review',
        roundIndex: 2
      })
      expect(
        new PhaseManager(injectDb).handleUserDecision('session-1', {
          type: 'inject_question',
          content: 'focus on risk'
        })
      ).toMatchObject({
        success: true,
        nextRoundPhase: 'speaking',
        nextRoundIndex: 2
      })

      const endDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'user_decision',
        roundIndex: 2
      })
      expect(new PhaseManager(endDb).handleUserDecision('session-1', { type: 'end_session' })).toMatchObject({
        success: true,
        nextSessionStatus: 'final_summary',
        nextRoundPhase: null,
        nextRoundIndex: 2
      })
    })

    it('triggers endgame when continue would exceed maxRounds', () => {
      const db = createPhaseDb({
        status: 'debate_loop',
        phase: 'user_decision',
        roundIndex: 20,
        rules: cloneRules({ maxRounds: 20 })
      })

      const result = new PhaseManager(db).handleUserDecision('session-1', { type: 'continue' })

      expect(result).toMatchObject({
        success: true,
        nextSessionStatus: 'final_summary',
        nextRoundPhase: null,
        nextRoundIndex: 20
      })
      expect(db.clearRoundPhase).toHaveBeenCalledWith('session-1')
      expect(db.setSessionStatus).toHaveBeenCalledWith('session-1', 'final_summary')
    })

    it('rejects concurrent or invalid user decisions without changing state', () => {
      const lockedDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'user_decision',
        roundIndex: 1,
        lockAcquired: false
      })
      expect(new PhaseManager(lockedDb).handleUserDecision('session-1', { type: 'continue' })).toMatchObject({
        success: false,
        error: expect.stringMatching(/already being processed/)
      })
      expect(lockedDb.setRoundPhase).not.toHaveBeenCalled()
      expect(lockedDb.setCurrentRoundIndex).not.toHaveBeenCalled()

      const wrongPhaseDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'speaking',
        roundIndex: 1
      })
      expect(new PhaseManager(wrongPhaseDb).handleUserDecision('session-1', { type: 'continue' })).toMatchObject({
        success: false,
        error: expect.stringMatching(/expected "user_decision" or "manual_review"/)
      })

      const invalidInjectDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'manual_review',
        roundIndex: 1
      })
      expect(
        new PhaseManager(invalidInjectDb).handleUserDecision('session-1', {
          type: 'inject_question',
          content: ''
        })
      ).toMatchObject({ success: false })
      expect(invalidInjectDb.tryAcquireDecisionLock).not.toHaveBeenCalled()

      const invalidReviveDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'manual_review',
        roundIndex: 1
      })
      expect(
        new PhaseManager(invalidReviveDb).handleUserDecision('session-1', {
          type: 'revive_expert',
          agentId: ''
        })
      ).toMatchObject({ success: false })
      expect(invalidReviveDb.tryAcquireDecisionLock).not.toHaveBeenCalled()
    })

    it('normalizes legacy state and persists mapped status and phase', () => {
      const db = createPhaseDb({ status: 'debate', roundIndex: 4 })
      const result = new PhaseManager(db).normalizeLegacyState('session-1')

      expect(result).toMatchObject({
        success: true,
        previousStatus: 'debate',
        newStatus: 'debate_loop',
        newRoundPhase: 'speaking'
      })
      expect(db.setSessionStatus).toHaveBeenCalledWith('session-1', 'debate_loop')
      expect(db.setRoundPhase).toHaveBeenCalledWith('session-1', 'speaking')
    })

    it('clears phase when triggering endgame and when completing a session', () => {
      const endgameDb = createPhaseDb({
        status: 'debate_loop',
        phase: 'user_decision',
        roundIndex: 5
      })
      expect(new PhaseManager(endgameDb).triggerEndgame('session-1')).toMatchObject({
        success: true,
        newStatus: 'final_summary',
        newRoundPhase: null
      })
      expect(endgameDb.clearRoundPhase).toHaveBeenCalledWith('session-1')
      expect(endgameDb.setSessionStatus).toHaveBeenCalledWith('session-1', 'final_summary')

      const completeDb = createPhaseDb({
        status: 'final_summary',
        phase: 'user_decision',
        roundIndex: 5
      })
      expect(new PhaseManager(completeDb).completeSession('session-1')).toMatchObject({
        success: true,
        newStatus: 'completed',
        newRoundPhase: null
      })
      expect(completeDb.clearRoundPhase).toHaveBeenCalledWith('session-1')
      expect(completeDb.setSessionStatus).toHaveBeenCalledWith('session-1', 'completed')
      expect(completeDb.markSessionCompleted).toHaveBeenCalledWith('session-1')
    })

    it('reports endgame reasons from alive count and max rounds', () => {
      expect(
        new PhaseManager(createPhaseDb({ aliveCount: 0 })).shouldTriggerEndgame('session-1')
      ).toEqual({ shouldEnd: true, reason: 'no_alive' })
      expect(
        new PhaseManager(createPhaseDb({ aliveCount: 2 })).shouldTriggerEndgame('session-1')
      ).toEqual({ shouldEnd: true, reason: 'alive_below_threshold' })
      expect(
        new PhaseManager(
          createPhaseDb({
            aliveCount: 3,
            roundIndex: 20,
            rules: cloneRules({ maxRounds: 20 })
          })
        ).shouldTriggerEndgame('session-1')
      ).toEqual({ shouldEnd: true, reason: 'max_rounds_reached' })
      expect(
        new PhaseManager(
          createPhaseDb({
            aliveCount: 3,
            roundIndex: 2,
            rules: cloneRules({ maxRounds: 20 })
          })
        ).shouldTriggerEndgame('session-1')
      ).toEqual({ shouldEnd: false })
    })
  })
})
