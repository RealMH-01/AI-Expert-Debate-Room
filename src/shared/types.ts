/**
 * 共享类型定义
 *
 * Main Process 和 Renderer Process 共用的类型。
 * 遵循开发契约第七节类型定义。
 */

// ===== Room 类型 =====

export interface RulesConfig {
  /** 最少辩论轮数，不允许小于 3 */
  min_debate_rounds: number
  /** 初始 HP，默认 100 */
  initial_hp: number
  /** HP 上限，默认 100 */
  max_hp: number
  /** 单轮最大扣血，默认 20 */
  max_hp_loss_per_round: number
  /** 第一名回血，默认 3 */
  first_place_hp_gain: number
  /** 第二名回血，默认 1 */
  second_place_hp_gain: number
  /** 倒数第二扣血，默认 8 */
  second_last_hp_loss: number
  /** 倒数第一扣血，默认 15 */
  last_place_hp_loss: number
  /** 存活专家少于此人数时停止结算，默认 3 */
  stop_settlement_when_alive_experts_less_than: number
  /** 投票匿名，默认 true */
  voting_anonymous: boolean
  /** 允许用户否决结算，默认 true */
  allow_user_veto_settlement: boolean
  /** 议事权影响发言顺序，默认 true */
  influence_affects_speaking_order: boolean
  /** 议事权影响平票优势，默认 true */
  influence_affects_tie_break: boolean
  /** 议事权影响最终总结权重，铁律：必须 false */
  influence_affects_final_summary_weight: boolean
  /** 主理人可否审票，铁律：必须 false */
  moderator_can_validate_votes: boolean
}

/** 默认规则配置 */
export const DEFAULT_RULES_CONFIG: RulesConfig = {
  min_debate_rounds: 3,
  initial_hp: 100,
  max_hp: 100,
  max_hp_loss_per_round: 20,
  first_place_hp_gain: 3,
  second_place_hp_gain: 1,
  second_last_hp_loss: 8,
  last_place_hp_loss: 15,
  stop_settlement_when_alive_experts_less_than: 3,
  voting_anonymous: true,
  allow_user_veto_settlement: true,
  influence_affects_speaking_order: true,
  influence_affects_tie_break: true,
  influence_affects_final_summary_weight: false,
  moderator_can_validate_votes: false
}

export interface Room {
  id: string
  name: string
  description: string
  rules_json: string // JSON string of RulesConfig
  created_at: string
  updated_at: string
}

export interface RoomWithRules extends Omit<Room, 'rules_json'> {
  rules: RulesConfig
}

// ===== Agent 类型 =====

export type AgentRole = 'moderator' | 'expert'
export type AgentStatus = 'active' | 'eliminated' | 'hell_pool'

export interface Agent {
  id: string
  room_id: string
  role: AgentRole
  name: string
  provider: string | null
  model: string | null
  persona: string | null
  domain: string | null
  stance: string | null
  memory: string | null
  supports_thinking: number // 0 or 1 (SQLite boolean)
  thinking_enabled: number // 0 or 1
  hp: number
  max_hp: number
  influence: number
  prestige: number
  status: AgentStatus
  aggression: number // 0-100
  created_at: string
  updated_at: string
}

// ===== Model Catalog 类型 =====

export type ProviderId =
  | 'mock'
  | 'openai'
  | 'openai_compatible'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'qwen'
  | 'bigmodel'
  | 'moonshot'

export interface ModelInfo {
  provider: ProviderId
  model: string
  displayName: string
  supportsThinking: boolean
  supportsStreaming: boolean
  supportsJson: boolean
  supportsVision: boolean
  supportsToolCalling?: boolean
  status?: 'active' | 'unverified' | 'stub'
  apiFormat?: string
  defaultBaseUrl?: string
  notes: string
}

export interface ProviderInfo {
  id: ProviderId
  displayName: string
  models: ModelInfo[]
}

// ===== Session 类型 =====

export type SessionStatus = 'preparing' | 'running' | 'finished' | 'failed' | 'aborted'

export type DebatePhase =
  | 'moderator_opening'
  | 'expert_initial'
  | 'debate_round'
  | 'moderator_round_summary'
  | 'voting'
  | 'settlement_pending'
  | 'moderator_final_summary'

export interface Session {
  id: string
  room_id: string
  title: string
  user_question: string | null
  status: SessionStatus
  current_phase: DebatePhase | null
  final_summary: string | null
  created_at: string
  updated_at: string
}

// ===== Message 类型 =====

export interface Message {
  id: string
  session_id: string
  round_index: number
  phase: DebatePhase
  speaker_id: string | null
  speaker_name: string | null
  speaker_role: string | null
  content: string
  structured_json: string | null
  created_at: string
}

// ===== Debate Engine 类型 =====

export interface DebateStartParams {
  roomId: string
  userQuestion: string
}

export interface DebateSessionState {
  session: Session
  messages: Message[]
}

// ===== 投票 & 结算 共享类型（Renderer 使用） =====

export interface VoteReasonDisplay {
  attacked_what: string
  rebutted_what: string
  revised_what: string
  survived_claim: string
  main_weakness: string
}

export interface RankingEntryDisplay {
  agentId: string
  agentName: string
  scoreSum: number
  scoreAvg: number
  voteCount: number
  rank: number
  influence: number
}

export interface SettlementItemDisplay {
  agentId: string
  agentName: string
  rank: number
  hpBefore: number
  hpChange: number
  hpAfter: number
  enterHellPool: boolean
  reason: string
}

export interface SettlementResultDisplay {
  sessionId: string
  roundIndex: number
  rankings: RankingEntryDisplay[]
  items: SettlementItemDisplay[]
  status: 'pending' | 'applied' | 'vetoed' | 'skipped'
  skipReason?: string
  aliveExpertCount: number
  /** settlement record ID in database */
  settlementId?: string
}

// ===== 配置校验 =====

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
