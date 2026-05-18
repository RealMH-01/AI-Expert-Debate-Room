/**
 * Debate Engine - 辩论流程引擎
 *
 * 核心职责：推进一场完整的辩论会议流程。
 *
 * 本轮实现完整流程：
 * 1. validateRoomCanStart - 校验配置
 * 2. createSession - 创建会话
 * 3. runModeratorOpening - 主理人开场
 * 4. runInitialAnswers - 专家首轮回答
 * 5. runDebateRounds - 多轮辩论
 * 6. runVotingPhase - 匿名互投（新增）
 * 7. 等待用户应用/否决结算（settlement_pending 阶段）
 * 8. runFinalSummary - 主理人最终总结
 * 9. finishSession - 标记完成
 *
 * 关键铁律：
 * - 主理人无权审票
 * - 投票有效性只由 VoteValidator 根据客观规则判断
 * - 议事权只用于同分排序，不影响最终总结观点权重
 */

import type {
  Agent,
  RulesConfig,
  Session,
  Message,
  DebatePhase,
  ValidationResult
} from '../../shared/types'
import { DEFAULT_RULES_CONFIG } from '../../shared/types'
import type { DebateModelProvider, TranscriptEntry, DebateGenerateInput, DebateGenerateOutput, VoteGenerateOutput } from '../providers/base'
import { getProviderForAgent, validateProvidersReady } from '../providers/providerFactory'
import * as sessionRepo from '../db/repositories/sessionRepository'
import * as messageRepo from '../db/repositories/messageRepository'
import * as agentRepo from '../db/repositories/agentRepository'
import * as roomRepo from '../db/repositories/roomRepository'
import * as voteRepo from '../db/repositories/voteRepository'
import * as settlementRepo from '../db/repositories/settlementRepository'
import * as participantRepo from '../db/repositories/participantRepository'
import * as reviewRepo from '../db/repositories/reviewRepository'
import * as historyRepo from '../db/repositories/historyRepository'
import * as claimRepo from '../db/repositories/claimRepository'
import * as contextSummaryRepo from '../db/repositories/contextSummaryRepository'
import * as usageRepo from '../db/repositories/modelCallUsageRepository'
import { buildSessionReview } from '../review/sessionReviewBuilder'
import { generateSessionMarkdown } from '../export/markdownExporter'
import { getDatabase } from '../db/sqlite'
import { validateBallot } from '../voting/voteValidator'
import { calculateRanking } from '../scoring/ranking'
import { generateSettlementPreview, calculateInfluenceChange, calculatePrestigeChange } from '../scoring/hpSettlement'
import type { SingleVote, SettlementResult } from '../voting/voteTypes'
import { normalizeProviderDebateOutput } from '../claims/claimTracker'
import { buildSessionContextSummary } from '../context/contextCompressor'
import { trackModelCallUsage } from '../cost/usageTracker'

/**
 * 会议运行中的回调接口
 * 用于通知外部（IPC 层）每一条新消息
 */
export interface DebateEngineCallbacks {
  onMessage: (message: Message) => void
  onPhaseChange: (phase: DebatePhase, session: Session) => void
  onSessionFinished: (session: Session) => void
  onError: (error: string) => void
  onSettlementReady: (settlement: SettlementResult) => void
}

/**
 * 正在运行的会议集合 - 防止重复启动
 */
const runningSessions = new Set<string>()

/**
 * 等待用户确认结算的会议信息
 */
interface PendingSettlementInfo {
  session: Session
  moderatorProvider: DebateModelProvider
  moderator: Agent
  experts: Agent[]
  userQuestion: string
  rules: RulesConfig
  roomName: string
  totalRounds: number
  transcript: TranscriptEntry[]
  callbacks: DebateEngineCallbacks
  settlementRecordId: string
  settlementResult: SettlementResult
}

const pendingSettlements = new Map<string, PendingSettlementInfo>()

/**
 * 校验会议室是否可以启动辩论
 */
export function validateRoomCanStart(roomId: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const room = roomRepo.getRoomById(roomId)
  if (!room) {
    return { valid: false, errors: ['会议室不存在'], warnings: [] }
  }

  // 检查主理人
  const moderator = agentRepo.getModerator(roomId)
  if (!moderator) {
    errors.push('会议室没有主理人，无法启动')
  } else {
    if (!moderator.provider || !moderator.model) {
      errors.push('主理人未配置 Provider/Model，无法启动')
    }
  }

  // 检查专家
  const experts = agentRepo.getExperts(roomId).filter((e) => e.status === 'active')
  if (experts.length < 2) {
    errors.push(`至少需要 2 个活跃专家才能启动（当前: ${experts.length}）`)
  }
  if (experts.length < 3) {
    warnings.push('建议至少 3 个专家才能完整体验互相审查和后续 HP 机制')
  }

  // 检查专家 provider/model
  for (const expert of experts) {
    if (!expert.provider || !expert.model) {
      errors.push(`专家"${expert.name}"未配置 Provider/Model，无法启动`)
    }
  }

  // 检查规则
  let rules: RulesConfig = DEFAULT_RULES_CONFIG
  try {
    if (room.rules_json) {
      rules = JSON.parse(room.rules_json)
    }
  } catch {
    // use default
  }

  if (rules.min_debate_rounds < 3) {
    errors.push('最少辩论轮数不能小于 3（已自动校正为 3）')
  }

  // 检查是否已有运行中的会议
  const runningSession = sessionRepo.getRunningSession(roomId)
  if (runningSession) {
    errors.push('当前会议室已有运行中的会议，请等待结束后再启动')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 启动一场辩论会议
 *
 * 这是入口方法，执行完整流程。
 * 通过 callbacks 实时通知每一步进展。
 */
export async function startDebate(
  roomId: string,
  userQuestion: string,
  callbacks: DebateEngineCallbacks
): Promise<Session | null> {
  // 再次校验
  const validation = validateRoomCanStart(roomId)
  if (!validation.valid) {
    callbacks.onError(validation.errors.join('; '))
    return null
  }

  // 获取所有必要数据
  const room = roomRepo.getRoomById(roomId)!
  const moderator = agentRepo.getModerator(roomId)!
  const experts = agentRepo.getExperts(roomId).filter((e) => e.status === 'active')

  // === 校验真实 Provider 的 API Key 是否已配置 ===
  const allAgents = [moderator, ...experts]
  const providerErrors = validateProvidersReady(allAgents)
  if (providerErrors.length > 0) {
    callbacks.onError(providerErrors.join('\n'))
    return null
  }

  // 解析规则
  let rules: RulesConfig = DEFAULT_RULES_CONFIG
  try {
    if (room.rules_json) {
      rules = JSON.parse(room.rules_json)
    }
  } catch {
    // use default
  }
  // 强制最少 3 轮
  const minDebateRounds = Math.max(3, rules.min_debate_rounds)

  // Provider 路由：不再使用全局单一 Provider
  // 每个 agent 根据自身配置使用对应 Provider（由 getProviderForAgent 处理）
  // 主理人的 Provider
  const moderatorProvider: DebateModelProvider = getProviderForAgent(moderator)

  // 创建 Session
  const title = `${room.name} - ${userQuestion.slice(0, 30)}${userQuestion.length > 30 ? '...' : ''}`
  let session = sessionRepo.createSession(roomId, title, userQuestion)

  // Save participant snapshots at session start (moderator + experts)
  participantRepo.insertParticipants(session.id, [moderator, ...experts])

  // 标记正在运行
  if (runningSessions.has(roomId)) {
    callbacks.onError('当前会议室已有运行中的会议流程')
    return null
  }
  runningSessions.add(roomId)

  // 用于累积 transcript
  const transcript: TranscriptEntry[] = []

  try {
    // === Step 1: 主理人开场 ===
    session = await runModeratorOpening(
      session,
      moderatorProvider,
      moderator,
      experts,
      userQuestion,
      rules,
      room.name,
      transcript,
      callbacks
    )

    // === Step 2: 专家首轮独立回答 ===
    session = await runInitialAnswers(
      session,
      moderator,
      experts,
      userQuestion,
      rules,
      room.name,
      transcript,
      callbacks
    )

    // === Step 3: 多轮辩论 ===
    for (let round = 1; round <= minDebateRounds; round++) {
      session = await runDebateRound(
        session,
        moderatorProvider,
        moderator,
        experts,
        userQuestion,
        rules,
        room.name,
        round,
        transcript,
        callbacks
      )
    }

    // === Step 4: 投票阶段 ===
    const votingResult = await runVotingPhase(
      session,
      experts,
      userQuestion,
      rules,
      minDebateRounds,
      transcript,
      callbacks
    )

    // === Step 5: 如果投票阶段生成了 settlement preview，等待用户确认 ===
    // 如果 settlement 不是 skipped，引擎在此暂停（session 进入 settlement_pending 阶段）
    // 用户通过 IPC 调用 applySettlement / vetoSettlement 后再继续最终总结
    if (votingResult && votingResult.status === 'pending') {
      // 保存到数据库
      const settlementRecord = settlementRepo.insertSettlement({
        sessionId: session.id,
        roundIndex: minDebateRounds,
        settlementJson: JSON.stringify(votingResult)
      })

      // 更新 settlement 中的 ID
      votingResult.sessionId = session.id

      // 通知 renderer
      callbacks.onSettlementReady({
        ...votingResult,
        sessionId: session.id
      })

      // 存储 pending session info 以便后续继续
      pendingSettlements.set(session.id, {
        session,
        moderatorProvider,
        moderator,
        experts,
        userQuestion,
        rules,
        roomName: room.name,
        totalRounds: minDebateRounds,
        transcript,
        callbacks,
        settlementRecordId: settlementRecord.id,
        settlementResult: votingResult
      })

      // 此处不 finish session，等待用户操作
      return session
    }

    // === 如果投票被跳过，直接进入最终总结 ===
    // === Step 6: 主理人最终总结 ===
    session = await runFinalSummary(
      session,
      moderatorProvider,
      moderator,
      experts,
      userQuestion,
      rules,
      room.name,
      minDebateRounds,
      transcript,
      callbacks
    )

    // === Step 7: 标记完成 ===
    callbacks.onSessionFinished(session)

    return session
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    console.error('[DebateEngine] 辩论过程出错:', errorMsg)
    sessionRepo.failSession(session.id, errorMsg)
    callbacks.onError(`辩论过程出错: ${errorMsg}`)
    return null
  } finally {
    runningSessions.delete(roomId)
  }
}

// ====== 各阶段实现 ======

function saveClaimsAndAttacks(
  meetingId: string,
  roundIndex: number,
  expertId: string,
  sourceMessageId: string,
  normalized: ReturnType<typeof normalizeProviderDebateOutput>
): void {
  try {
    if (normalized.claims.length > 0) {
      claimRepo.insertClaimsForMessage({
        meetingId,
        roundIndex,
        speakerExpertId: expertId,
        sourceMessageId,
        claims: normalized.claims
      })
    }

    if (normalized.attacks.length > 0) {
      claimRepo.insertAttacksForMessage({
        meetingId,
        roundIndex,
        attackerExpertId: expertId,
        sourceMessageId,
        attacks: normalized.attacks
      })
    }
  } catch (error) {
    console.error('[DebateEngine] Claim/attack tracking failed:', error)
  }
}

function providerLabel(agent: Agent, provider: DebateModelProvider): string {
  return agent.provider || provider.name || 'unknown'
}

function modelLabel(agent: Agent, provider: DebateModelProvider): string {
  return agent.model || provider.name || 'unknown'
}

async function trackDebateCall(
  sessionId: string,
  phase: DebatePhase,
  roundIndex: number,
  agent: Agent,
  provider: DebateModelProvider,
  input: DebateGenerateInput,
  call: () => Promise<DebateGenerateOutput>
): Promise<DebateGenerateOutput> {
  return trackModelCallUsage(
    {
      meetingId: sessionId,
      phase,
      roundIndex,
      role: input.role,
      expertId: input.role === 'expert' ? agent.id : null,
      provider: providerLabel(agent, provider),
      model: modelLabel(agent, provider),
      inputText: input
    },
    call,
    (record) => usageRepo.insertModelCallUsage(record),
    (output) => output.content
  )
}

async function trackVoteCall(
  sessionId: string,
  roundIndex: number,
  voter: Agent,
  provider: DebateModelProvider,
  input: Parameters<DebateModelProvider['generateExpertVote']>[0],
  call: () => Promise<VoteGenerateOutput>
): Promise<VoteGenerateOutput> {
  return trackModelCallUsage(
    {
      meetingId: sessionId,
      phase: 'voting',
      roundIndex,
      role: 'expert',
      expertId: voter.id,
      provider: providerLabel(voter, provider),
      model: modelLabel(voter, provider),
      inputText: input
    },
    call,
    (record) => usageRepo.insertModelCallUsage(record),
    (output) => output.rawJson
  )
}

async function runModeratorOpening(
  session: Session,
  provider: DebateModelProvider,
  moderator: Agent,
  experts: Agent[],
  userQuestion: string,
  rules: RulesConfig,
  roomName: string,
  transcript: TranscriptEntry[],
  callbacks: DebateEngineCallbacks
): Promise<Session> {
  const phase: DebatePhase = 'moderator_opening'
  session = sessionRepo.updateSessionPhase(session.id, phase)!
  callbacks.onPhaseChange(phase, session)

  const input: DebateGenerateInput = {
    role: 'moderator',
    phase,
    agent: moderator,
    userQuestion,
    roundIndex: 0,
    visibleTranscript: transcript,
    otherExperts: experts,
    rules,
    roomName
  }

  const output = await trackDebateCall(
    session.id,
    phase,
    0,
    moderator,
    provider,
    input,
    () => provider.generateModeratorOpening(input)
  )

  const message = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex: 0,
    phase,
    speakerId: moderator.id,
    speakerName: moderator.name,
    speakerRole: 'moderator',
    content: output.content,
    structuredJson: output.structuredJson ? JSON.stringify(output.structuredJson) : null
  })

  transcript.push({
    speakerName: moderator.name,
    speakerRole: 'moderator',
    phase,
    roundIndex: 0,
    content: output.content
  })

  callbacks.onMessage(message)
  return session
}

async function runInitialAnswers(
  session: Session,
  moderator: Agent,
  experts: Agent[],
  userQuestion: string,
  rules: RulesConfig,
  roomName: string,
  transcript: TranscriptEntry[],
  callbacks: DebateEngineCallbacks
): Promise<Session> {
  const phase: DebatePhase = 'expert_initial'
  session = sessionRepo.updateSessionPhase(session.id, phase)!
  callbacks.onPhaseChange(phase, session)

  // 关键：首轮独立回答——所有专家使用同一份首轮前的 transcript 快照，
  // 避免第 1 位专家的回答污染第 2 位专家的生成输入。
  const initialVisibleTranscript = [...transcript]

  for (const expert of experts) {
    const otherExperts = experts.filter((e) => e.id !== expert.id)

    const input: DebateGenerateInput = {
      role: 'expert',
      phase,
      agent: expert,
      userQuestion,
      roundIndex: 0,
      visibleTranscript: initialVisibleTranscript,
      otherExperts,
      rules,
      roomName
    }

    // 使用该专家自身配置的 Provider
    const expertProvider = getProviderForAgent(expert)

    try {
      const output = await trackDebateCall(
        session.id,
        phase,
        0,
        expert,
        expertProvider,
        input,
        () => expertProvider.generateExpertInitialAnswer(input)
      )
      const normalized = normalizeProviderDebateOutput(output)

      const message = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: 0,
        phase,
        speakerId: expert.id,
        speakerName: expert.name,
        speakerRole: 'expert',
        content: normalized.message,
        structuredJson: normalized.structuredJson ? JSON.stringify(normalized.structuredJson) : null
      })

      saveClaimsAndAttacks(session.id, 0, expert.id, message.id, normalized)

      // 追加到最终 transcript（供后续辩论轮使用），但不影响本轮其他专家
      transcript.push({
        speakerName: expert.name,
        speakerRole: 'expert',
        phase,
        roundIndex: 0,
        content: normalized.message
      })

      callbacks.onMessage(message)
    } catch (error: unknown) {
      // 单个专家失败：记录失败消息，继续其他专家
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.error(`[DebateEngine] 专家 "${expert.name}" 首轮回答失败:`, errorMsg)

      const failMessage = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: 0,
        phase,
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[发言失败] ${expert.name} 首轮回答生成失败: ${errorMsg}`,
        structuredJson: JSON.stringify({ type: 'expert_call_failed', agentId: expert.id, error: errorMsg })
      })
      callbacks.onMessage(failMessage)
    }
  }

  return session
}

async function runDebateRound(
  session: Session,
  moderatorProvider: DebateModelProvider,
  moderator: Agent,
  experts: Agent[],
  userQuestion: string,
  rules: RulesConfig,
  roomName: string,
  roundIndex: number,
  transcript: TranscriptEntry[],
  callbacks: DebateEngineCallbacks
): Promise<Session> {
  const debatePhase: DebatePhase = 'debate_round'
  session = sessionRepo.updateSessionPhase(session.id, debatePhase)!
  callbacks.onPhaseChange(debatePhase, session)

  // 每个专家发言一次
  for (const expert of experts) {
    const otherExperts = experts.filter((e) => e.id !== expert.id)

    const input: DebateGenerateInput = {
      role: 'expert',
      phase: debatePhase,
      agent: expert,
      userQuestion,
      roundIndex,
      visibleTranscript: transcript,
      otherExperts,
      rules,
      roomName
    }

    // 使用该专家自身配置的 Provider
    const expertProvider = getProviderForAgent(expert)

    try {
      const output = await trackDebateCall(
        session.id,
        debatePhase,
        roundIndex,
        expert,
        expertProvider,
        input,
        () => expertProvider.generateExpertDebateTurn(input)
      )
      const normalized = normalizeProviderDebateOutput(output)

      const message = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex,
        phase: debatePhase,
        speakerId: expert.id,
        speakerName: expert.name,
        speakerRole: 'expert',
        content: normalized.message,
        structuredJson: normalized.structuredJson ? JSON.stringify(normalized.structuredJson) : null
      })

      saveClaimsAndAttacks(session.id, roundIndex, expert.id, message.id, normalized)

      transcript.push({
        speakerName: expert.name,
        speakerRole: 'expert',
        phase: debatePhase,
        roundIndex,
        content: normalized.message
      })

      callbacks.onMessage(message)
    } catch (error: unknown) {
      // 单个专家失败：记录失败消息，继续其他专家
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.error(`[DebateEngine] 专家 "${expert.name}" 第 ${roundIndex} 轮发言失败:`, errorMsg)

      const failMessage = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex,
        phase: debatePhase,
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[发言失败] ${expert.name} 第 ${roundIndex} 轮发言生成失败: ${errorMsg}`,
        structuredJson: JSON.stringify({ type: 'expert_call_failed', agentId: expert.id, round: roundIndex, error: errorMsg })
      })
      callbacks.onMessage(failMessage)
    }
  }

  // 主理人轮次总结
  const summaryPhase: DebatePhase = 'moderator_round_summary'
  session = sessionRepo.updateSessionPhase(session.id, summaryPhase)!
  callbacks.onPhaseChange(summaryPhase, session)

  const summaryInput: DebateGenerateInput = {
    role: 'moderator',
    phase: summaryPhase,
    agent: moderator,
    userQuestion,
    roundIndex,
    visibleTranscript: transcript,
    otherExperts: experts,
    rules,
    roomName
  }

  const summaryOutput = await trackDebateCall(
    session.id,
    summaryPhase,
    roundIndex,
    moderator,
    moderatorProvider,
    summaryInput,
    () => moderatorProvider.generateModeratorRoundSummary(summaryInput)
  )

  const summaryMessage = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex,
    phase: summaryPhase,
    speakerId: moderator.id,
    speakerName: moderator.name,
    speakerRole: 'moderator',
    content: summaryOutput.content,
    structuredJson: summaryOutput.structuredJson
      ? JSON.stringify(summaryOutput.structuredJson)
      : null
  })

  transcript.push({
    speakerName: moderator.name,
    speakerRole: 'moderator',
    phase: summaryPhase,
    roundIndex,
    content: summaryOutput.content
  })

  callbacks.onMessage(summaryMessage)
  return session
}

async function runFinalSummary(
  session: Session,
  provider: DebateModelProvider,
  moderator: Agent,
  experts: Agent[],
  userQuestion: string,
  rules: RulesConfig,
  roomName: string,
  totalRounds: number,
  transcript: TranscriptEntry[],
  callbacks: DebateEngineCallbacks
): Promise<Session> {
  const phase: DebatePhase = 'moderator_final_summary'
  session = sessionRepo.updateSessionPhase(session.id, phase)!
  callbacks.onPhaseChange(phase, session)

  const input: DebateGenerateInput = {
    role: 'moderator',
    phase,
    agent: moderator,
    userQuestion,
    roundIndex: totalRounds,
    visibleTranscript: transcript,
    otherExperts: experts,
    rules,
    roomName
  }

  const output = await trackDebateCall(
    session.id,
    phase,
    totalRounds,
    moderator,
    provider,
    input,
    () => provider.generateModeratorFinalSummary(input)
  )

  const message = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex: totalRounds,
    phase,
    speakerId: moderator.id,
    speakerName: moderator.name,
    speakerRole: 'moderator',
    content: output.content,
    structuredJson: output.structuredJson ? JSON.stringify(output.structuredJson) : null
  })

  transcript.push({
    speakerName: moderator.name,
    speakerRole: 'moderator',
    phase,
    roundIndex: totalRounds,
    content: output.content
  })

  callbacks.onMessage(message)

  // 更新 session 的 final_summary
  session = sessionRepo.finishSession(session.id, output.content)!

  // Update participant final states and generate review
  generateSessionReviewOnFinish(session.id, session.room_id)

  return session
}

/**
 * 检查某个 roomId 是否有正在运行的辩论
 */
export function isDebateRunning(roomId: string): boolean {
  return runningSessions.has(roomId)
}

/**
 * 检查某个 session 是否有待确认的结算
 * 先查内存，再回退到 SQLite（应对重启后内存丢失）
 */
export function hasPendingSettlement(sessionId: string): boolean {
  if (pendingSettlements.has(sessionId)) return true
  // 回退到 SQLite
  const dbRecord = settlementRepo.getPendingSettlement(sessionId)
  return !!dbRecord
}

/**
 * 获取某个 session 的待确认结算
 * 先查内存，再回退到 SQLite（应对重启后内存丢失）
 */
export function getPendingSettlementResult(sessionId: string): SettlementResult | null {
  const info = pendingSettlements.get(sessionId)
  if (info) return info.settlementResult

  // 回退到 SQLite：从 settlements 表中读取 pending 状态的记录
  const dbRecord = settlementRepo.getPendingSettlement(sessionId)
  if (!dbRecord) return null

  try {
    const parsed = JSON.parse(dbRecord.settlement_json) as SettlementResult
    // 确保 settlementId 可用
    return { ...parsed, sessionId: dbRecord.session_id }
  } catch {
    return null
  }
}

// ====== 投票阶段 ======

/**
 * 运行投票阶段
 *
 * 关键铁律：
 * - 投票默认匿名、同时进行
 * - 不把其他专家的投票结果传给当前专家
 * - 主理人无权审票
 * - VoteValidator 只做客观格式校验
 */
async function runVotingPhase(
  session: Session,
  experts: Agent[],
  userQuestion: string,
  rules: RulesConfig,
  totalRounds: number,
  transcript: TranscriptEntry[],
  callbacks: DebateEngineCallbacks
): Promise<SettlementResult | null> {
  // 获取当前存活专家
  const aliveExperts = experts.filter((e) => e.status === 'active')

  // 如果存活专家少于 threshold，跳过投票
  if (aliveExperts.length < rules.stop_settlement_when_alive_experts_less_than) {
    const phase: DebatePhase = 'voting'
    session = sessionRepo.updateSessionPhase(session.id, phase)!
    callbacks.onPhaseChange(phase, session)

    // 记录系统消息
    const skipMessage = messageRepo.insertMessage({
      sessionId: session.id,
      roundIndex: totalRounds,
      phase: 'voting',
      speakerId: null,
      speakerName: '系统',
      speakerRole: 'system',
      content: `存活专家 (${aliveExperts.length}) 少于 ${rules.stop_settlement_when_alive_experts_less_than} 人，停止投票和 HP 扣除。会议将直接进入总结阶段。`,
      structuredJson: null
    })
    callbacks.onMessage(skipMessage)

    // 插入 skipped settlement
    settlementRepo.insertSettlement({
      sessionId: session.id,
      roundIndex: totalRounds,
      settlementJson: JSON.stringify({
        status: 'skipped',
        skipReason: `存活专家不足 ${rules.stop_settlement_when_alive_experts_less_than} 人`,
        aliveExpertCount: aliveExperts.length
      }),
      status: 'skipped'
    })

    return null
  }

  // 进入投票阶段
  const phase: DebatePhase = 'voting'
  session = sessionRepo.updateSessionPhase(session.id, phase)!
  callbacks.onPhaseChange(phase, session)

  // 系统消息：进入投票阶段
  const votingStartMessage = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex: totalRounds,
    phase: 'voting',
    speakerId: null,
    speakerName: '系统',
    speakerRole: 'system',
    content: `辩论阶段结束。现在进入匿名互投阶段。${aliveExperts.length} 位存活专家将同时对其他专家进行评分。投票由系统规则引擎（VoteValidator）进行客观校验，主理人无权审票。`,
    structuredJson: null
  })
  callbacks.onMessage(votingStartMessage)

  // 收集所有投票
  const aliveExpertIds = aliveExperts.map((e) => e.id)
  const allValidVotes: Map<string, SingleVote[]> = new Map() // target -> votes

  for (const expert of aliveExperts) {
    allValidVotes.set(expert.id, [])
  }

  let hasInvalidVotes = false

  // 匿名同时投票：每个专家独立生成投票，不传入其他专家的投票结果
  for (const voter of aliveExperts) {
    const voterProvider = getProviderForAgent(voter)

    let voteOutput: { rawJson: string }
    try {
      const voteInput = {
        voter,
        aliveExperts,
        visibleTranscript: transcript,
        userQuestion
      }
      voteOutput = await trackVoteCall(
        session.id,
        totalRounds,
        voter,
        voterProvider,
        voteInput,
        () => voterProvider.generateExpertVote(voteInput)
      )
    } catch (error: unknown) {
      // 投票生成失败：记录系统消息，跳过此专家
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.error(`[DebateEngine] 专家 "${voter.name}" 投票生成失败:`, errorMsg)
      hasInvalidVotes = true
      const failMsg = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: totalRounds,
        phase: 'voting',
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[投票失败] ${voter.name} 的投票生成过程出错: ${errorMsg}。该专家本轮投票作废。`,
        structuredJson: JSON.stringify({ type: 'vote_generate_failed', voterId: voter.id, error: errorMsg })
      })
      callbacks.onMessage(failMsg)
      continue
    }

    // 使用 VoteValidator 进行客观校验
    const validationResult = validateBallot(voteOutput.rawJson, aliveExpertIds)

    if (!validationResult.parseable) {
      // 整个 JSON 无法解析：记录系统消息，不写 votes 表
      hasInvalidVotes = true
      const errorMsg = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: totalRounds,
        phase: 'voting',
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[投票格式错误] ${voter.name} 的投票 JSON 无法解析: ${validationResult.errors.join('; ')}。该专家本轮投票作废。`,
        structuredJson: JSON.stringify({
          type: 'vote_parse_error',
          voterId: voter.id,
          voterName: voter.name,
          errors: validationResult.errors
        })
      })
      callbacks.onMessage(errorMsg)
      continue
    }

    // 如果 ballot 级别有 errors（如漏投），整份 ballot 作废，不参与排名
    if (validationResult.errors.length > 0) {
      hasInvalidVotes = true

      // 保存所有票为 invalid
      for (const invalid of validationResult.invalidVotes) {
        if (invalid.vote.target) {
          voteRepo.insertVote({
            sessionId: session.id,
            roundIndex: totalRounds,
            voterAgentId: voter.id,
            targetAgentId: invalid.vote.target,
            score: invalid.vote.score ?? 0,
            reasonJson: invalid.vote.reason ? JSON.stringify(invalid.vote.reason) : null,
            valid: false,
            invalidReason: invalid.errors.join('; ')
          })
        }
      }

      // 记录系统消息
      const errorMsg = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: totalRounds,
        phase: 'voting',
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[投票作废] ${voter.name}: ${validationResult.errors.join('; ')}`,
        structuredJson: JSON.stringify({
          type: 'ballot_invalid',
          voterId: voter.id,
          voterName: voter.name,
          errors: validationResult.errors
        })
      })
      callbacks.onMessage(errorMsg)
      continue
    }

    // ballot 合法：保存有效票到数据库，参与排名
    for (const vote of validationResult.validVotes) {
      voteRepo.insertVote({
        sessionId: session.id,
        roundIndex: totalRounds,
        voterAgentId: voter.id,
        targetAgentId: vote.target,
        score: vote.score,
        reasonJson: JSON.stringify(vote.reason),
        valid: true,
        invalidReason: null
      })

      // 汇总到排名计算用的 map
      const existing = allValidVotes.get(vote.target) || []
      existing.push(vote)
      allValidVotes.set(vote.target, existing)
    }

    // 保存无效票到数据库（单票级别的无效，非 ballot 级别）
    for (const invalid of validationResult.invalidVotes) {
      if (invalid.vote.target) {
        hasInvalidVotes = true
        voteRepo.insertVote({
          sessionId: session.id,
          roundIndex: totalRounds,
          voterAgentId: voter.id,
          targetAgentId: invalid.vote.target,
          score: invalid.vote.score ?? 0,
          reasonJson: null,
          valid: false,
          invalidReason: invalid.errors.join('; ')
        })
      }
    }

    // 如果有单票级别无效或警告，记录系统消息
    if (validationResult.invalidVotes.length > 0 || validationResult.warnings.length > 0) {
      hasInvalidVotes = true
      const warnContent = [
        validationResult.invalidVotes.length > 0
          ? `${validationResult.invalidVotes.length} 张无效票`
          : '',
        validationResult.warnings.length > 0
          ? `警告: ${validationResult.warnings.join('; ')}`
          : ''
      ]
        .filter(Boolean)
        .join('。')

      const warnMsg = messageRepo.insertMessage({
        sessionId: session.id,
        roundIndex: totalRounds,
        phase: 'voting',
        speakerId: null,
        speakerName: '系统',
        speakerRole: 'system',
        content: `[投票校验] ${voter.name}: ${warnContent}`,
        structuredJson: null
      })
      callbacks.onMessage(warnMsg)
    }
  }

  // 投票完成系统消息
  const votingDoneContent = hasInvalidVotes
    ? '投票阶段完成。部分投票存在格式问题，已由 VoteValidator 标记为无效。'
    : '投票阶段完成。所有投票通过 VoteValidator 格式校验。'

  const votingDoneMessage = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex: totalRounds,
    phase: 'voting',
    speakerId: null,
    speakerName: '系统',
    speakerRole: 'system',
    content: votingDoneContent,
    structuredJson: null
  })
  callbacks.onMessage(votingDoneMessage)

  // 计算排名
  const rankings = calculateRanking(allValidVotes, aliveExperts)

  // 生成 HP 结算预览
  const settlementPreview = generateSettlementPreview(
    rankings,
    aliveExperts,
    rules,
    session.id,
    totalRounds
  )

  // 进入 settlement_pending 阶段
  const settlementPhase: DebatePhase = 'settlement_pending'
  session = sessionRepo.updateSessionPhase(session.id, settlementPhase)!
  callbacks.onPhaseChange(settlementPhase, session)

  // 系统消息：生成 HP 结算建议
  const settlementMessage = messageRepo.insertMessage({
    sessionId: session.id,
    roundIndex: totalRounds,
    phase: 'settlement_pending',
    speakerId: null,
    speakerName: '系统',
    speakerRole: 'system',
    content: `HP 结算建议已生成。等待用户确认：点击"应用结算"执行 HP 变化，或"否决本轮结算"保持 HP 不变。`,
    structuredJson: JSON.stringify(settlementPreview)
  })
  callbacks.onMessage(settlementMessage)

  return settlementPreview
}

// ====== 结算应用/否决 ======

/**
 * 应用 HP 结算
 *
 * 支持两种场景：
 * 1. 正常流程：从内存 pendingSettlements 获取完整上下文，应用后继续最终总结
 * 2. 重启恢复：内存为空，从 SQLite 读取 settlement_json，仅执行 HP 更新和完结 session
 *
 * 原子化：使用 SQLite transaction 确保 agent 更新 + 快照 + settlement 状态更新原子提交
 */
export async function applySettlement(sessionId: string): Promise<{
  success: boolean
  error?: string
  session?: Session
}> {
  const info = pendingSettlements.get(sessionId)

  if (info) {
    // ===== 正常流程：内存中有完整上下文 =====
    return applySettlementWithContext(sessionId, info)
  }

  // ===== 重启恢复：从 SQLite 读取 =====
  return applySettlementFromDb(sessionId)
}

/**
 * 正常流程的结算应用（内存有完整上下文）
 */
async function applySettlementWithContext(
  sessionId: string,
  info: PendingSettlementInfo
): Promise<{ success: boolean; error?: string; session?: Session }> {
  const {
    session,
    settlementRecordId,
    settlementResult,
    moderatorProvider,
    moderator,
    experts,
    userQuestion,
    rules,
    roomName,
    totalRounds,
    transcript,
    callbacks
  } = info

  try {
    const db = getDatabase()

    // 原子化：在 transaction 中执行所有 agent 更新、快照、settlement 状态变更
    const applyTxn = db.transaction(() => {
      for (const item of settlementResult.items) {
        const currentAgent = agentRepo.getAgentById(item.agentId)
        if (!currentAgent) continue

        const influenceChange = calculateInfluenceChange(
          item.rank,
          settlementResult.items.length,
          currentAgent.influence
        )
        const prestigeChange = calculatePrestigeChange(
          item.rank,
          settlementResult.items.length,
          currentAgent.prestige
        )

        const newHp = Math.max(0, item.hpAfter)
        const newInfluence = Math.max(0, currentAgent.influence + influenceChange)
        const newPrestige = Math.max(0, currentAgent.prestige + prestigeChange)
        const newStatus = newHp <= 0 ? 'hell_pool' : currentAgent.status

        agentRepo.updateExpert(item.agentId, {
          hp: newHp,
          influence: newInfluence,
          prestige: newPrestige,
          status: newStatus as 'active' | 'eliminated' | 'hell_pool'
        })

        settlementRepo.insertAgentSnapshot({
          sessionId,
          roundIndex: totalRounds,
          agentId: item.agentId,
          hp: newHp,
          influence: newInfluence,
          prestige: newPrestige,
          status: newStatus
        })
      }

      // 所有 agent 和 snapshot 更新成功后再标记 settlement 为 applied
      settlementRepo.updateSettlementStatus(settlementRecordId, 'applied')
    })

    applyTxn()

    // 事务成功后发送 UI 消息（不在事务内，因为非 DB 操作）
    for (const item of settlementResult.items) {
      if (item.enterHellPool) {
        const hellMsg = messageRepo.insertMessage({
          sessionId,
          roundIndex: totalRounds,
          phase: 'settlement_pending',
          speakerId: null,
          speakerName: '系统',
          speakerRole: 'system',
          content: `⚠️ ${item.agentName} HP 降至 0，已堕入地狱（Hell Pool）。该专家后续不可发言、不可投票。`,
          structuredJson: null
        })
        callbacks.onMessage(hellMsg)
      }
    }

    const appliedMsg = messageRepo.insertMessage({
      sessionId,
      roundIndex: totalRounds,
      phase: 'settlement_pending',
      speakerId: null,
      speakerName: '系统',
      speakerRole: 'system',
      content: '用户已确认应用本轮 HP 结算。专家 HP、议事权、威望已更新。',
      structuredJson: null
    })
    callbacks.onMessage(appliedMsg)

    // 继续最终总结
    const updatedExperts = agentRepo
      .getExperts(session.room_id)
      .filter((e) => e.status === 'active')
    const finalSession = await runFinalSummary(
      session,
      moderatorProvider,
      moderator,
      updatedExperts.length > 0 ? updatedExperts : experts,
      userQuestion,
      rules,
      roomName,
      totalRounds,
      transcript,
      callbacks
    )

    callbacks.onSessionFinished(finalSession)
    pendingSettlements.delete(sessionId)
    runningSessions.delete(session.room_id)

    return { success: true, session: finalSession }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMsg }
  }
}

/**
 * 重启恢复的结算应用（仅从 SQLite 读取，无法生成最终总结）
 * session 直接标记为 finished
 */
async function applySettlementFromDb(
  sessionId: string
): Promise<{ success: boolean; error?: string; session?: Session }> {
  const dbRecord = settlementRepo.getPendingSettlement(sessionId)
  if (!dbRecord) {
    return { success: false, error: '没有待确认的结算' }
  }

  let settlementResult: SettlementResult
  try {
    settlementResult = JSON.parse(dbRecord.settlement_json) as SettlementResult
  } catch {
    return { success: false, error: '结算数据解析失败' }
  }

  try {
    const db = getDatabase()

    const applyTxn = db.transaction(() => {
      for (const item of settlementResult.items) {
        const currentAgent = agentRepo.getAgentById(item.agentId)
        if (!currentAgent) continue

        const influenceChange = calculateInfluenceChange(
          item.rank,
          settlementResult.items.length,
          currentAgent.influence
        )
        const prestigeChange = calculatePrestigeChange(
          item.rank,
          settlementResult.items.length,
          currentAgent.prestige
        )

        const newHp = Math.max(0, item.hpAfter)
        const newInfluence = Math.max(0, currentAgent.influence + influenceChange)
        const newPrestige = Math.max(0, currentAgent.prestige + prestigeChange)
        const newStatus = newHp <= 0 ? 'hell_pool' : currentAgent.status

        agentRepo.updateExpert(item.agentId, {
          hp: newHp,
          influence: newInfluence,
          prestige: newPrestige,
          status: newStatus as 'active' | 'eliminated' | 'hell_pool'
        })

        settlementRepo.insertAgentSnapshot({
          sessionId,
          roundIndex: dbRecord.round_index,
          agentId: item.agentId,
          hp: newHp,
          influence: newInfluence,
          prestige: newPrestige,
          status: newStatus
        })
      }

      settlementRepo.updateSettlementStatus(dbRecord.id, 'applied')
    })

    applyTxn()

    // 记录系统消息
    messageRepo.insertMessage({
      sessionId,
      roundIndex: dbRecord.round_index,
      phase: 'settlement_pending',
      speakerId: null,
      speakerName: '系统',
      speakerRole: 'system',
      content:
        '用户已确认应用本轮 HP 结算（重启恢复）。专家 HP、议事权、威望已更新。会议将直接完结。',
      structuredJson: null
    })

    // 直接完结 session（无法生成最终总结，因为辩论上下文已丢失）
    const finalSession = sessionRepo.finishSession(
      sessionId,
      '[重启恢复] HP 结算已应用。辩论上下文在重启中丢失，无法生成最终总结。'
    )

    // Generate review
    if (finalSession) {
      generateSessionReviewOnFinish(sessionId, finalSession.room_id)
    }

    return { success: true, session: finalSession }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMsg }
  }
}

/**
 * 否决 HP 结算
 *
 * 支持两种场景：
 * 1. 正常流程：从内存获取上下文，否决后继续最终总结
 * 2. 重启恢复：从 SQLite 读取，否决后直接完结 session
 */
export async function vetoSettlement(sessionId: string): Promise<{
  success: boolean
  error?: string
  session?: Session
}> {
  const info = pendingSettlements.get(sessionId)

  if (info) {
    return vetoSettlementWithContext(sessionId, info)
  }

  return vetoSettlementFromDb(sessionId)
}

/**
 * 正常流程的否决
 */
async function vetoSettlementWithContext(
  sessionId: string,
  info: PendingSettlementInfo
): Promise<{ success: boolean; error?: string; session?: Session }> {
  const {
    session,
    settlementRecordId,
    moderatorProvider,
    moderator,
    experts,
    userQuestion,
    rules,
    roomName,
    totalRounds,
    transcript,
    callbacks
  } = info

  try {
    const db = getDatabase()

    // 原子化：否决状态 + 快照
    const vetoTxn = db.transaction(() => {
      settlementRepo.updateSettlementStatus(settlementRecordId, 'vetoed')

      for (const expert of experts) {
        settlementRepo.insertAgentSnapshot({
          sessionId,
          roundIndex: totalRounds,
          agentId: expert.id,
          hp: expert.hp,
          influence: expert.influence,
          prestige: expert.prestige,
          status: expert.status
        })
      }
    })

    vetoTxn()

    // 系统消息
    const vetoMsg = messageRepo.insertMessage({
      sessionId,
      roundIndex: totalRounds,
      phase: 'settlement_pending',
      speakerId: null,
      speakerName: '系统',
      speakerRole: 'system',
      content: '用户否决本轮 HP 结算。专家 HP 保持不变。投票记录已保留，便于复盘。',
      structuredJson: null
    })
    callbacks.onMessage(vetoMsg)

    // 继续最终总结
    const finalSession = await runFinalSummary(
      session,
      moderatorProvider,
      moderator,
      experts,
      userQuestion,
      rules,
      roomName,
      totalRounds,
      transcript,
      callbacks
    )

    callbacks.onSessionFinished(finalSession)
    pendingSettlements.delete(sessionId)
    runningSessions.delete(session.room_id)

    return { success: true, session: finalSession }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMsg }
  }
}

/**
 * 重启恢复的否决
 */
async function vetoSettlementFromDb(
  sessionId: string
): Promise<{ success: boolean; error?: string; session?: Session }> {
  const dbRecord = settlementRepo.getPendingSettlement(sessionId)
  if (!dbRecord) {
    return { success: false, error: '没有待确认的结算' }
  }

  try {
    const db = getDatabase()

    const session = sessionRepo.getSessionById(sessionId)
    if (!session) {
      return { success: false, error: '会议不存在' }
    }

    // 获取当前专家快照
    const experts = agentRepo.getExperts(session.room_id)

    const vetoTxn = db.transaction(() => {
      settlementRepo.updateSettlementStatus(dbRecord.id, 'vetoed')

      for (const expert of experts) {
        settlementRepo.insertAgentSnapshot({
          sessionId,
          roundIndex: dbRecord.round_index,
          agentId: expert.id,
          hp: expert.hp,
          influence: expert.influence,
          prestige: expert.prestige,
          status: expert.status
        })
      }
    })

    vetoTxn()

    // 记录系统消息
    messageRepo.insertMessage({
      sessionId,
      roundIndex: dbRecord.round_index,
      phase: 'settlement_pending',
      speakerId: null,
      speakerName: '系统',
      speakerRole: 'system',
      content:
        '用户否决本轮 HP 结算（重启恢复）。专家 HP 保持不变。会议将直接完结。',
      structuredJson: null
    })

    // 直接完结 session
    const finalSession = sessionRepo.finishSession(
      sessionId,
      '[重启恢复] HP 结算已否决。辩论上下文在重启中丢失，无法生成最终总结。'
    )

    // Generate review
    if (finalSession) {
      generateSessionReviewOnFinish(sessionId, finalSession.room_id)
    }

    return { success: true, session: finalSession }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMsg }
  }
}

// ====== Review 生成 ======

/**
 * 在 session 完成后生成结构化复盘和 Markdown
 * 同时更新参与者的最终状态
 */
function generateSessionReviewOnFinish(sessionId: string, roomId: string): void {
  try {
    // Update participant final states
    const currentExperts = agentRepo.getExperts(roomId)
    const currentModerator = agentRepo.getModerator(roomId)
    const allAgents = currentModerator
      ? [currentModerator, ...currentExperts]
      : currentExperts

    for (const agent of allAgents) {
      participantRepo.updateParticipantFinalState(
        sessionId,
        agent.id,
        agent.hp,
        agent.status
      )
    }

    // Generate review
    const detail = historyRepo.getSessionFullDetail(sessionId)
    if (!detail) return

    const reviewData = buildSessionReview(detail)
    generateContextSummaryOnFinish(detail, reviewData)

    const refreshedDetail = historyRepo.getSessionFullDetail(sessionId) ?? detail
    const reviewJson = JSON.stringify(reviewData)
    const markdown = generateSessionMarkdown(refreshedDetail, reviewData)

    reviewRepo.insertReview({
      sessionId,
      reviewJson,
      markdown
    })

    console.log(`[DebateEngine] 会议 ${sessionId} 复盘已生成`)
  } catch (error) {
    console.error('[DebateEngine] 生成复盘失败:', error)
    // Don't throw - review generation failure shouldn't break the session
  }
}

function generateContextSummaryOnFinish(
  detail: historyRepo.SessionFullDetail,
  reviewData: ReturnType<typeof buildSessionReview>
): void {
  try {
    const detailForSummary = {
      ...detail,
      review: {
        id: 'pending-review',
        session_id: detail.session.id,
        review_json: JSON.stringify(reviewData),
        markdown: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
    const summary = buildSessionContextSummary(detailForSummary)
    contextSummaryRepo.insertContextSummary(summary)
    console.log(`[DebateEngine] Session ${detail.session.id} context summary generated`)
  } catch (error) {
    console.error('[DebateEngine] Context summary generation failed:', error)
  }
}
