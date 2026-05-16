/**
 * Debate Engine - 辩论流程引擎
 *
 * 核心职责：推进一场完整的辩论会议流程。
 *
 * 本轮实现基础顺序流程：
 * 1. validateRoomCanStart - 校验配置
 * 2. createSession - 创建会话
 * 3. runModeratorOpening - 主理人开场
 * 4. runInitialAnswers - 专家首轮回答
 * 5. runDebateRounds - 多轮辩论
 * 6. runFinalSummary - 主理人最终总结
 * 7. finishSession - 标记完成
 *
 * 设计说明：
 * - DebateEngine 在 Main Process / Node 侧运行
 * - 每个阶段拆成独立 method
 * - 后续可改为 phase + event queue 的事件化架构
 * - 通过回调 (onMessage) 通知 UI 层新消息产生
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
import type { DebateModelProvider, TranscriptEntry, DebateGenerateInput } from '../providers/base'
import { getMockProvider } from '../providers/mockProvider'
import * as sessionRepo from '../db/repositories/sessionRepository'
import * as messageRepo from '../db/repositories/messageRepository'
import * as agentRepo from '../db/repositories/agentRepository'
import * as roomRepo from '../db/repositories/roomRepository'

/**
 * 会议运行中的回调接口
 * 用于通知外部（IPC 层）每一条新消息
 */
export interface DebateEngineCallbacks {
  onMessage: (message: Message) => void
  onPhaseChange: (phase: DebatePhase, session: Session) => void
  onSessionFinished: (session: Session) => void
  onError: (error: string) => void
}

/**
 * 正在运行的会议集合 - 防止重复启动
 */
const runningSessions = new Set<string>()

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

  // 获取 Provider - 本轮统一使用 MockProvider
  const provider: DebateModelProvider = getMockProvider()

  // 创建 Session
  const title = `${room.name} - ${userQuestion.slice(0, 30)}${userQuestion.length > 30 ? '...' : ''}`
  let session = sessionRepo.createSession(roomId, title, userQuestion)

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
      provider,
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
      provider,
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
        provider,
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

    // === Step 4: 主理人最终总结 ===
    session = await runFinalSummary(
      session,
      provider,
      moderator,
      experts,
      userQuestion,
      rules,
      room.name,
      minDebateRounds,
      transcript,
      callbacks
    )

    // === Step 5: 标记完成 ===
    // session already finished in runFinalSummary
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

  const output = await provider.generateModeratorOpening(input)

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
  provider: DebateModelProvider,
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

  for (const expert of experts) {
    const otherExperts = experts.filter((e) => e.id !== expert.id)

    const input: DebateGenerateInput = {
      role: 'expert',
      phase,
      agent: expert,
      userQuestion,
      roundIndex: 0,
      visibleTranscript: transcript,
      otherExperts,
      rules,
      roomName
    }

    const output = await provider.generateExpertInitialAnswer(input)

    const message = messageRepo.insertMessage({
      sessionId: session.id,
      roundIndex: 0,
      phase,
      speakerId: expert.id,
      speakerName: expert.name,
      speakerRole: 'expert',
      content: output.content,
      structuredJson: output.structuredJson ? JSON.stringify(output.structuredJson) : null
    })

    transcript.push({
      speakerName: expert.name,
      speakerRole: 'expert',
      phase,
      roundIndex: 0,
      content: output.content
    })

    callbacks.onMessage(message)
  }

  return session
}

async function runDebateRound(
  session: Session,
  provider: DebateModelProvider,
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

    const output = await provider.generateExpertDebateTurn(input)

    const message = messageRepo.insertMessage({
      sessionId: session.id,
      roundIndex,
      phase: debatePhase,
      speakerId: expert.id,
      speakerName: expert.name,
      speakerRole: 'expert',
      content: output.content,
      structuredJson: output.structuredJson ? JSON.stringify(output.structuredJson) : null
    })

    transcript.push({
      speakerName: expert.name,
      speakerRole: 'expert',
      phase: debatePhase,
      roundIndex,
      content: output.content
    })

    callbacks.onMessage(message)
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

  const summaryOutput = await provider.generateModeratorRoundSummary(summaryInput)

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

  const output = await provider.generateModeratorFinalSummary(input)

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
  return session
}

/**
 * 检查某个 roomId 是否有正在运行的辩论
 */
export function isDebateRunning(roomId: string): boolean {
  return runningSessions.has(roomId)
}
