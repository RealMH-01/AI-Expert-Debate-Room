/**
 * Debate Model Provider - 抽象接口
 *
 * 定义了辩论引擎所需的高层 Provider 接口。
 * 本轮只实现 MockProvider，但接口设计允许后续替换真实 Provider。
 *
 * 设计原则：
 * - 贴近辩论引擎的业务需求，而非通用 ChatRequest
 * - Input 包含辩论上下文所需的所有信息
 * - Output 统一包含 content + 可选 structuredJson + usage
 */

import type { Agent, DebateAttachmentContext, DebatePhase, RulesConfig } from '../../shared/types'

/**
 * 投票生成输入
 */
export interface VoteGenerateInput {
  /** 当前投票的专家 */
  voter: Agent
  /** 所有存活专家（含 voter 自己） */
  aliveExperts: Agent[]
  /** 之前的辩论 transcript */
  visibleTranscript: TranscriptEntry[]
  /** 用户原始问题 */
  userQuestion: string
  signal?: AbortSignal
}

/**
 * 投票生成输出 - 原始 JSON 字符串
 */
export interface VoteGenerateOutput {
  /** 原始 JSON 字符串（交给 VoteValidator 校验） */
  rawJson: string
  /** Optional token usage returned by the provider. */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Provider 输入上下文
 * 包含辩论引擎推进流程所需的完整上下文
 */
export interface DebateGenerateInput {
  /** 角色类型 */
  role: 'moderator' | 'expert'
  /** 当前阶段 */
  phase: DebatePhase
  /** 当前发言的 Agent 信息 */
  agent: Agent
  /** 用户原始问题 */
  userQuestion: string
  /** 当前辩论轮次 (1-based) */
  roundIndex: number
  /** 已有的可见对话记录（之前的消息） */
  visibleTranscript: TranscriptEntry[]
  /** 其他参与辩论的专家信息 */
  otherExperts: Agent[]
  /** 会议室规则 */
  rules: RulesConfig
  /** 会议室名称 */
  roomName: string
  /** 本次会议所有参与者共享的公共素材 */
  attachments?: DebateAttachmentContext[]
  structuredOutputRetry?: {
    previousError?: string
    previousRawHead?: string
  }
  signal?: AbortSignal
}

/** 对话记录条目 */
export interface TranscriptEntry {
  speakerName: string
  speakerRole: string
  phase: DebatePhase
  roundIndex: number
  content: string
}

/**
 * Provider 输出结果
 */
export interface DebateGenerateOutput {
  /** 生成的文本内容 */
  content: string
  /** 可选的结构化 JSON（用于后续解析投票等） */
  structuredJson?: Record<string, unknown>
  /** 使用量统计（Mock 填 0） */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  providerFallback?: {
    responseFormat?: {
      from: 'json_object'
      to: 'text'
      reason: string
    }
  }
}

/**
 * DebateModelProvider 接口
 *
 * 每个方法对应辩论的一个阶段。
 * MockProvider 和未来的真实 Provider 都需要实现此接口。
 */
export interface DebateModelProvider {
  /** Provider 名称标识 */
  readonly name: string

  /** 生成主理人开场白 */
  generateModeratorOpening(input: DebateGenerateInput): Promise<DebateGenerateOutput>

  /** 生成专家首轮独立回答 */
  generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput>

  /** 生成专家辩论轮发言 */
  generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput>

  /** 生成主理人轮次总结（可选，每轮结束后） */
  generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput>

  /** 生成主理人最终总结 */
  generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput>

  /** 生成专家投票 JSON */
  generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput>
}
