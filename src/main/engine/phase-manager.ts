import type {
  RoundPhase,
  RulesConfig,
  SessionStatus
} from '../../shared/types'

// ============================================================
// 数据库访问接口（依赖注入）
// ============================================================

/**
 * PhaseManager 所需的状态持久化接口。
 *
 * 本轮只定义接口，不直接访问 SQLite。
 * 后续 DB adapter 应将 roundPhase 映射到 sessions.current_phase。
 */
export interface PhaseDbAccess {
  /** 读取 Session 当前原始状态。DB 中可能存在旧状态或未知字符串。 */
  getSessionStatus(sessionId: string): SessionStatus | string

  /** 更新 Session 顶层状态。 */
  setSessionStatus(sessionId: string, status: SessionStatus): void

  /** 读取当前 round_index。 */
  getCurrentRoundIndex(sessionId: string): number

  /** 设置当前 round_index。 */
  setCurrentRoundIndex(sessionId: string, roundIndex: number): void

  /**
   * 读取当前 RoundPhase。
   *
   * 后续 DB adapter 应优先映射到 sessions.current_phase。
   * 如果 Session 不在 debate_loop，或 current_phase 为空，返回 null。
   */
  getRoundPhase(sessionId: string): RoundPhase | null

  /**
   * 设置当前 RoundPhase。
   *
   * 后续 DB adapter 应优先写入 sessions.current_phase。
   */
  setRoundPhase(sessionId: string, phase: RoundPhase): void

  /**
   * 清除当前 RoundPhase。
   *
   * 后续 DB adapter 应优先清空 sessions.current_phase。
   */
  clearRoundPhase(sessionId: string): void

  /** 获取 RulesConfig（已 merge 默认值）。 */
  getRulesConfig(sessionId: string): RulesConfig

  /** 获取当前存活专家数量。 */
  getAliveExpertCount(sessionId: string): number

  /**
   * 尝试获取 decision_lock。
   *
   * 实现方必须保证原子性，例如 SQLite transaction / BEGIN IMMEDIATE / compare-and-set。
   */
  tryAcquireDecisionLock(sessionId: string, roundIndex: number): boolean

  /** 释放 decision_lock。 */
  releaseDecisionLock(sessionId: string, roundIndex: number): void

  /** 标记 Session 为 completed，例如写 ended_at。 */
  markSessionCompleted(sessionId: string): void
}

// ============================================================
// 用户决策类型
// ============================================================

/**
 * 用户在 debate_loop 的 user_decision / manual_review 阶段可以执行的操作。
 *
 * 注意：不要命名为 UserDecisionAction，避免与 shared/types 中可能存在的同名类型冲突。
 */
export type PhaseUserDecisionAction =
  | { type: 'continue' }
  | { type: 'end_session' }
  | { type: 'inject_question'; content: string }
  | { type: 'revive_expert'; agentId: string }

/**
 * 用户决策执行结果。
 */
export interface UserDecisionResult {
  success: boolean
  /** 如果 success = false，说明原因。 */
  error?: string
  /** 决策后的下一个顶层状态。 */
  nextSessionStatus?: SessionStatus
  /** 决策后的下一个 RoundPhase。 */
  nextRoundPhase?: RoundPhase | null
  /** 决策后的 roundIndex。 */
  nextRoundIndex?: number
}

// ============================================================
// 状态转换结果
// ============================================================

/**
 * 状态转换结果。
 */
export interface PhaseTransitionResult {
  success: boolean
  error?: string
  previousStatus: SessionStatus | string
  newStatus: SessionStatus
  previousRoundPhase: RoundPhase | null
  newRoundPhase: RoundPhase | null
  roundIndex: number
}

type PhaseManagedSessionStatus =
  | 'preparing'
  | 'independent_answer'
  | 'debate_loop'
  | 'final_summary'
  | 'completed'
  | 'debate'
  | 'voting'
  | 'settlement_pending'
  | 'settled'
  | 'summary'

const PHASE_MANAGED_SESSION_STATUSES: readonly PhaseManagedSessionStatus[] = [
  'preparing',
  'independent_answer',
  'debate_loop',
  'final_summary',
  'completed',
  'debate',
  'voting',
  'settlement_pending',
  'settled',
  'summary'
]

function isPhaseManagedSessionStatus(
  status: SessionStatus | string
): status is PhaseManagedSessionStatus {
  return PHASE_MANAGED_SESSION_STATUSES.includes(status as PhaseManagedSessionStatus)
}

// ============================================================
// 旧状态映射
// ============================================================

/**
 * 将旧 SessionStatus 或未知 DB 字符串映射为可安全处理的新状态。
 *
 * 未知状态安全降级到 preparing，不抛错。
 */
export function mapLegacyStatus(status: SessionStatus | string): {
  mappedStatus: SessionStatus
  mappedRoundPhase: RoundPhase | null
  isLegacy: boolean
} {
  switch (status) {
    case 'preparing':
    case 'independent_answer':
    case 'debate_loop':
    case 'final_summary':
    case 'completed':
      return {
        mappedStatus: status,
        mappedRoundPhase: null,
        isLegacy: false
      }

    case 'debate':
      return {
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'speaking',
        isLegacy: true
      }

    case 'voting':
      return {
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'voting',
        isLegacy: true
      }

    case 'settlement_pending':
      return {
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'settlement',
        isLegacy: true
      }

    case 'settled':
      return {
        mappedStatus: 'debate_loop',
        mappedRoundPhase: 'user_decision',
        isLegacy: true
      }

    case 'summary':
      return {
        mappedStatus: 'final_summary',
        mappedRoundPhase: null,
        isLegacy: true
      }

    default:
      return {
        mappedStatus: 'preparing',
        mappedRoundPhase: null,
        isLegacy: true
      }
  }
}

// ============================================================
// 顶层状态流转验证
// ============================================================

/**
 * 合法顶层状态转换表。
 *
 * 正常流程：
 * preparing → independent_answer → debate_loop → final_summary → completed
 *
 * 不允许 debate_loop → completed，避免跳过 final_summary。
 */
const VALID_SESSION_TRANSITIONS: Record<PhaseManagedSessionStatus, SessionStatus[]> = {
  preparing: ['independent_answer'],
  independent_answer: ['debate_loop'],
  debate_loop: ['final_summary'],
  final_summary: ['completed'],
  completed: [],

  // 旧状态兼容：允许迁移到新体系或安全结束到 final_summary
  debate: ['debate_loop', 'final_summary'],
  voting: ['debate_loop', 'final_summary'],
  settlement_pending: ['debate_loop', 'final_summary'],
  settled: ['debate_loop', 'final_summary'],
  summary: ['final_summary']
}

/**
 * 检查顶层状态转换是否合法。
 */
export function isValidSessionTransition(
  from: SessionStatus | string,
  to: SessionStatus
): boolean {
  if (isPhaseManagedSessionStatus(from)) {
    const directAllowed = VALID_SESSION_TRANSITIONS[from]

    if (directAllowed.includes(to)) {
      return true
    }
  }

  const mappedFrom = mapLegacyStatus(from).mappedStatus
  const allowed = isPhaseManagedSessionStatus(mappedFrom)
    ? VALID_SESSION_TRANSITIONS[mappedFrom]
    : null

  return allowed ? allowed.includes(to) : false
}

// ============================================================
// RoundPhase 微循环流转
// ============================================================

/**
 * per-round 模式下 RoundPhase 的完整流转顺序。
 */
const PER_ROUND_PHASE_ORDER: RoundPhase[] = [
  'speaking',
  'round_summary',
  'voting',
  'settlement',
  'elimination_check',
  'user_decision'
]

/**
 * per-cycle 模式下，非结算轮只辩论和小结，不投票、不结算、不进入 user_decision。
 */
const PER_CYCLE_NON_SETTLEMENT_PHASE_ORDER: RoundPhase[] = [
  'speaking',
  'round_summary'
]

/**
 * per-cycle 模式下，结算轮和 per-round 一样走完整流程。
 */
const PER_CYCLE_SETTLEMENT_PHASE_ORDER: RoundPhase[] = PER_ROUND_PHASE_ORDER

/**
 * 判断在 per-cycle 模式下，给定 roundIndex 是否为结算轮。
 *
 * roundIndex 从 1 开始。
 */
export function isSettlementRound(roundIndex: number, cycleRounds: number): boolean {
  return cycleRounds > 0 && roundIndex > 0 && roundIndex % cycleRounds === 0
}

/**
 * 获取当前模式下，指定轮次的 RoundPhase 流转序列。
 */
export function getRoundPhaseSequence(
  rules: RulesConfig,
  roundIndex: number
): RoundPhase[] {
  if (rules.settlementMode === 'per-round') {
    return PER_ROUND_PHASE_ORDER
  }

  return isSettlementRound(roundIndex, rules.settlementCycleRounds)
    ? PER_CYCLE_SETTLEMENT_PHASE_ORDER
    : PER_CYCLE_NON_SETTLEMENT_PHASE_ORDER
}

/**
 * 获取当前 RoundPhase 的下一个 phase。
 *
 * 返回 null 表示当前 phase 已是本轮序列的最后一个。
 */
export function getNextRoundPhase(
  currentPhase: RoundPhase,
  phaseSequence: RoundPhase[]
): RoundPhase | null {
  const currentIndex = phaseSequence.indexOf(currentPhase)

  if (currentIndex === -1 || currentIndex === phaseSequence.length - 1) {
    return null
  }

  return phaseSequence[currentIndex + 1]
}

// ============================================================
// Phase Manager 核心类
// ============================================================

/**
 * Session / debate_loop 状态管理器。
 *
 * 本类只做状态流转，不调用 provider，不调用 HP 结算，不调用投票校验。
 */
export class PhaseManager {
  constructor(private readonly db: PhaseDbAccess) {}

  /**
   * 获取 Session 当前有效状态。
   *
   * 如果 DB 中是旧状态或未知状态，会进行运行时映射，但不会自动持久化。
   * 如需持久化旧状态映射，请调用 normalizeLegacyState。
   */
  getEffectiveState(sessionId: string): {
    sessionStatus: SessionStatus
    rawStatus: SessionStatus | string
    roundPhase: RoundPhase | null
    roundIndex: number
    isLegacy: boolean
  } {
    const rawStatus = this.db.getSessionStatus(sessionId)
    const { mappedStatus, mappedRoundPhase, isLegacy } = mapLegacyStatus(rawStatus)

    const roundPhase = isLegacy
      ? mappedRoundPhase
      : this.db.getRoundPhase(sessionId)

    const roundIndex = this.db.getCurrentRoundIndex(sessionId)

    return {
      sessionStatus: mappedStatus,
      rawStatus,
      roundPhase,
      roundIndex,
      isLegacy
    }
  }

  /**
   * 将旧状态持久化迁移为新状态体系。
   *
   * 如果当前 status 是旧状态或未知状态：
   * - 写回 mappedStatus
   * - mappedRoundPhase 存在时写入 current_phase
   * - mappedRoundPhase 为 null 时清除 current_phase
   */
  normalizeLegacyState(sessionId: string): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    if (!state.isLegacy) {
      return {
        success: true,
        previousStatus: state.rawStatus,
        newStatus: state.sessionStatus,
        previousRoundPhase: state.roundPhase,
        newRoundPhase: state.roundPhase,
        roundIndex: state.roundIndex
      }
    }

    this.db.setSessionStatus(sessionId, state.sessionStatus)

    if (state.roundPhase) {
      this.db.setRoundPhase(sessionId, state.roundPhase)
    } else {
      this.db.clearRoundPhase(sessionId)
    }

    return {
      success: true,
      previousStatus: state.rawStatus,
      newStatus: state.sessionStatus,
      previousRoundPhase: null,
      newRoundPhase: state.roundPhase,
      roundIndex: state.roundIndex
    }
  }

  /**
   * 启动 Session：preparing → independent_answer。
   */
  startSession(sessionId: string): PhaseTransitionResult {
    return this.transitionSessionStatus(sessionId, 'independent_answer')
  }

  /**
   * 独立回答完成后进入辩论循环：independent_answer → debate_loop。
   */
  enterDebateLoop(sessionId: string): PhaseTransitionResult {
    const result = this.transitionSessionStatus(sessionId, 'debate_loop')

    if (!result.success) {
      return result
    }

    this.db.setCurrentRoundIndex(sessionId, 1)
    this.db.setRoundPhase(sessionId, 'speaking')

    return {
      ...result,
      newRoundPhase: 'speaking',
      roundIndex: 1
    }
  }

  /**
   * 推进 RoundPhase 到下一阶段。
   *
   * per-round：
   * speaking → round_summary → voting → settlement → elimination_check → user_decision
   *
   * per-cycle 非结算轮：
   * speaking → round_summary → 自动进入下一轮 speaking
   *
   * 如果当前 phase 是完整序列最后一个 user_decision，则不自动推进，必须调用 handleUserDecision。
   */
  advanceRoundPhase(sessionId: string): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    if (state.sessionStatus !== 'debate_loop') {
      return {
        success: false,
        error: `Cannot advance round phase: session is in "${state.sessionStatus}", not "debate_loop"`,
        previousStatus: state.sessionStatus,
        newStatus: state.sessionStatus,
        previousRoundPhase: state.roundPhase,
        newRoundPhase: state.roundPhase,
        roundIndex: state.roundIndex
      }
    }

    if (!state.roundPhase) {
      return {
        success: false,
        error: 'Cannot advance round phase: no current round phase set',
        previousStatus: state.sessionStatus,
        newStatus: state.sessionStatus,
        previousRoundPhase: null,
        newRoundPhase: null,
        roundIndex: state.roundIndex
      }
    }

    const rules = this.db.getRulesConfig(sessionId)
    const phaseSequence = getRoundPhaseSequence(rules, state.roundIndex)
    const nextPhase = getNextRoundPhase(state.roundPhase, phaseSequence)

    if (nextPhase) {
      this.db.setRoundPhase(sessionId, nextPhase)

      return {
        success: true,
        previousStatus: state.sessionStatus,
        newStatus: state.sessionStatus,
        previousRoundPhase: state.roundPhase,
        newRoundPhase: nextPhase,
        roundIndex: state.roundIndex
      }
    }

    // per-cycle 非结算轮：round_summary 是最后阶段，完成后自动进入下一轮 speaking
    if (
      rules.settlementMode === 'per-cycle' &&
      !isSettlementRound(state.roundIndex, rules.settlementCycleRounds) &&
      state.roundPhase === 'round_summary'
    ) {
      return this.advanceToNextRound(sessionId, state.roundIndex)
    }

    return {
      success: false,
      error: `Round phase "${state.roundPhase}" is the last in sequence; use handleUserDecision if this is a decision phase`,
      previousStatus: state.sessionStatus,
      newStatus: state.sessionStatus,
      previousRoundPhase: state.roundPhase,
      newRoundPhase: state.roundPhase,
      roundIndex: state.roundIndex
    }
  }

  /**
   * 结算阶段后的淘汰检查完成后，根据结果决定下一步：
   * - 触发终局 → final_summary
   * - 未触发终局 → user_decision
   */
  handlePostElimination(
    sessionId: string,
    settlementResult: { triggersEndgame: boolean }
  ): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    if (settlementResult.triggersEndgame) {
      return this.triggerEndgame(sessionId)
    }

    this.db.setRoundPhase(sessionId, 'user_decision')

    return {
      success: true,
      previousStatus: state.sessionStatus,
      newStatus: state.sessionStatus,
      previousRoundPhase: state.roundPhase,
      newRoundPhase: 'user_decision',
      roundIndex: state.roundIndex
    }
  }

  /**
   * 投票阶段发现有效投票不足，进入 manual_review。
   */
  enterManualReview(sessionId: string): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    this.db.setRoundPhase(sessionId, 'manual_review')

    return {
      success: true,
      previousStatus: state.sessionStatus,
      newStatus: state.sessionStatus,
      previousRoundPhase: state.roundPhase,
      newRoundPhase: 'manual_review',
      roundIndex: state.roundIndex
    }
  }

  /**
   * 处理用户决策。
   *
   * 并发控制：通过 decision_lock 保证同一 session 同一 round 只接受一个 action。
   */
  handleUserDecision(
    sessionId: string,
    action: PhaseUserDecisionAction
  ): UserDecisionResult {
    const state = this.getEffectiveState(sessionId)

    if (state.sessionStatus !== 'debate_loop') {
      return {
        success: false,
        error: `Cannot handle user decision: session is in "${state.sessionStatus}", not "debate_loop"`
      }
    }

    if (state.roundPhase !== 'user_decision' && state.roundPhase !== 'manual_review') {
      return {
        success: false,
        error: `Cannot handle user decision: current round phase is "${state.roundPhase}", expected "user_decision" or "manual_review"`
      }
    }

    const validationError = validateDecisionAction(action)
    if (validationError) {
      return {
        success: false,
        error: validationError
      }
    }

    const lockAcquired = this.db.tryAcquireDecisionLock(sessionId, state.roundIndex)

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Another decision is already being processed for this round. Please wait.'
      }
    }

    try {
      return this.executeUserDecision(sessionId, state, action)
    } finally {
      this.db.releaseDecisionLock(sessionId, state.roundIndex)
    }
  }

  /**
   * 触发终局：进入 final_summary。
   */
  triggerEndgame(sessionId: string): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    this.db.clearRoundPhase(sessionId)
    this.db.setSessionStatus(sessionId, 'final_summary')

    return {
      success: true,
      previousStatus: state.sessionStatus,
      newStatus: 'final_summary',
      previousRoundPhase: state.roundPhase,
      newRoundPhase: null,
      roundIndex: state.roundIndex
    }
  }

  /**
   * 最终总结完成后，标记 Session 为 completed。
   */
  completeSession(sessionId: string): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)

    if (!isValidSessionTransition(state.rawStatus, 'completed')) {
      return {
        success: false,
        error: `Invalid session transition: "${state.rawStatus}" → "completed"`,
        previousStatus: state.rawStatus,
        newStatus: state.sessionStatus,
        previousRoundPhase: state.roundPhase,
        newRoundPhase: state.roundPhase,
        roundIndex: state.roundIndex
      }
    }

    this.db.clearRoundPhase(sessionId)
    this.db.setSessionStatus(sessionId, 'completed')
    this.db.markSessionCompleted(sessionId)

    return {
      success: true,
      previousStatus: state.sessionStatus,
      newStatus: 'completed',
      previousRoundPhase: state.roundPhase,
      newRoundPhase: null,
      roundIndex: state.roundIndex
    }
  }

  /**
   * 检查是否应触发终局。
   *
   * 注意：maxRounds 判断按“轮后检查”语义处理。
   * 即当前 roundIndex 已经完成时，如果 roundIndex >= maxRounds，应终局。
   * 用户点击 continue 时另用 nextRoundIndex > maxRounds 判断。
   */
  shouldTriggerEndgame(sessionId: string): {
    shouldEnd: boolean
    reason?: 'alive_below_threshold' | 'max_rounds_reached' | 'no_alive'
  } {
    const aliveCount = this.db.getAliveExpertCount(sessionId)

    if (aliveCount <= 0) {
      return { shouldEnd: true, reason: 'no_alive' }
    }

    if (aliveCount < 3) {
      return { shouldEnd: true, reason: 'alive_below_threshold' }
    }

    const rules = this.db.getRulesConfig(sessionId)
    const roundIndex = this.db.getCurrentRoundIndex(sessionId)

    if (roundIndex >= rules.maxRounds) {
      return { shouldEnd: true, reason: 'max_rounds_reached' }
    }

    return { shouldEnd: false }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private executeUserDecision(
    sessionId: string,
    state: ReturnType<PhaseManager['getEffectiveState']>,
    action: PhaseUserDecisionAction
  ): UserDecisionResult {
    switch (action.type) {
      case 'continue': {
        const result = this.advanceToNextRound(sessionId, state.roundIndex)

        return {
          success: result.success,
          error: result.error,
          nextSessionStatus: result.newStatus,
          nextRoundPhase: result.newRoundPhase,
          nextRoundIndex: result.roundIndex
        }
      }

      case 'end_session': {
        const result = this.triggerEndgame(sessionId)

        return {
          success: result.success,
          error: result.error,
          nextSessionStatus: result.newStatus,
          nextRoundPhase: result.newRoundPhase,
          nextRoundIndex: result.roundIndex
        }
      }

      case 'inject_question': {
        this.db.setRoundPhase(sessionId, 'speaking')

        return {
          success: true,
          nextSessionStatus: 'debate_loop',
          nextRoundPhase: 'speaking',
          nextRoundIndex: state.roundIndex
        }
      }

      case 'revive_expert': {
        const result = this.advanceToNextRound(sessionId, state.roundIndex)

        return {
          success: result.success,
          error: result.error,
          nextSessionStatus: result.newStatus,
          nextRoundPhase: result.newRoundPhase,
          nextRoundIndex: result.roundIndex
        }
      }
    }
  }

  private advanceToNextRound(
    sessionId: string,
    currentRoundIndex: number
  ): PhaseTransitionResult {
    const state = this.getEffectiveState(sessionId)
    const rules = this.db.getRulesConfig(sessionId)
    const nextRoundIndex = currentRoundIndex + 1

    if (nextRoundIndex > rules.maxRounds) {
      return this.triggerEndgame(sessionId)
    }

    this.db.setCurrentRoundIndex(sessionId, nextRoundIndex)
    this.db.setRoundPhase(sessionId, 'speaking')

    return {
      success: true,
      previousStatus: state.sessionStatus,
      newStatus: 'debate_loop',
      previousRoundPhase: state.roundPhase,
      newRoundPhase: 'speaking',
      roundIndex: nextRoundIndex
    }
  }

  private transitionSessionStatus(
    sessionId: string,
    targetStatus: SessionStatus
  ): PhaseTransitionResult {
    const currentRawStatus = this.db.getSessionStatus(sessionId)
    const currentEffective = mapLegacyStatus(currentRawStatus)
    const currentRoundPhase = this.db.getRoundPhase(sessionId)
    const roundIndex = this.db.getCurrentRoundIndex(sessionId)

    if (!isValidSessionTransition(currentRawStatus, targetStatus)) {
      return {
        success: false,
        error: `Invalid session transition: "${currentRawStatus}" → "${targetStatus}"`,
        previousStatus: currentRawStatus,
        newStatus: currentEffective.mappedStatus,
        previousRoundPhase: currentRoundPhase,
        newRoundPhase: currentRoundPhase,
        roundIndex
      }
    }

    this.db.setSessionStatus(sessionId, targetStatus)

    return {
      success: true,
      previousStatus: currentRawStatus,
      newStatus: targetStatus,
      previousRoundPhase: currentRoundPhase,
      newRoundPhase: currentRoundPhase,
      roundIndex
    }
  }
}

// ============================================================
// 决策校验
// ============================================================

/**
 * 校验用户决策参数是否合法。
 */
export function validateDecisionAction(
  action: PhaseUserDecisionAction
): string | null {
  switch (action.type) {
    case 'continue':
    case 'end_session':
      return null

    case 'inject_question':
      return action.content.trim() === ''
        ? 'inject_question requires non-empty content'
        : null

    case 'revive_expert':
      return action.agentId.trim() === ''
        ? 'revive_expert requires non-empty agentId'
        : null
  }
}
