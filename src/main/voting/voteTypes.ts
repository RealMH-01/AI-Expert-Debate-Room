/**
 * Vote Types - 投票相关类型定义
 *
 * 定义投票、验证结果、排名等核心数据结构。
 * 所有投票相关模块共用这些类型。
 */

/**
 * 投票理由结构
 * 每个字段对应客观事实记录，VoteValidator 只检查字段是否存在，
 * 不检查内容是否聪明/公正/正确。
 */
export interface VoteReason {
  /** 该专家攻击了什么关键问题 */
  attacked_what: string
  /** 该专家有效反驳了什么 */
  rebutted_what: string
  /** 该专家修正了什么 */
  revised_what: string
  /** 该专家最终哪些观点经受住攻击 */
  survived_claim: string
  /** 该专家仍然存在的主要弱点 */
  main_weakness: string
}

/**
 * 单票结构（一个投票者对一个目标的评分）
 */
export interface SingleVote {
  /** 被投目标 agent_id */
  target: string
  /** 评分 0-10 */
  score: number
  /** 投票理由 */
  reason: VoteReason
}

/**
 * 一个专家的完整投票 JSON（MockProvider 生成的结构）
 */
export interface ExpertVoteBallot {
  /** 投票者 agent_id */
  voter: string
  /** 对所有其他存活专家的投票 */
  votes: SingleVote[]
}

/**
 * VoteValidator 验证单票结果
 */
export interface SingleVoteValidation {
  /** 该票是否有效 */
  valid: boolean
  /** 该票对应的目标 */
  target: string | null
  /** 分数（即使无效也尽量保留原值） */
  score: number | null
  /** 无效原因列表 */
  errors: string[]
}

/**
 * VoteValidator 验证一个专家全部投票的结果
 */
export interface BallotValidationResult {
  /** 投票者 ID */
  voterId: string
  /** 有效票 */
  validVotes: SingleVote[]
  /** 无效票（带错误原因） */
  invalidVotes: Array<{ vote: Partial<SingleVote>; errors: string[] }>
  /** 整体错误（如 JSON 解析失败、voter 不存在等） */
  errors: string[]
  /** 警告（如漏投） */
  warnings: string[]
  /** 原始 JSON 是否可解析 */
  parseable: boolean
}

/**
 * 专家排名条目
 */
export interface RankingEntry {
  /** agent_id */
  agentId: string
  /** 专家名称（方便显示） */
  agentName: string
  /** 得分总和 */
  scoreSum: number
  /** 得分平均值 */
  scoreAvg: number
  /** 有效票数 */
  voteCount: number
  /** 排名（1-based） */
  rank: number
  /** 议事权（用于同分排序） */
  influence: number
}

/**
 * HP 结算单项
 */
export interface SettlementItem {
  agentId: string
  agentName: string
  rank: number
  hpBefore: number
  hpChange: number
  hpAfter: number
  /** 是否因此进入 Hell Pool */
  enterHellPool: boolean
  /** 变化原因 */
  reason: string
}

/**
 * HP 结算整体结果
 */
export interface SettlementResult {
  sessionId: string
  roundIndex: number
  /** 排名列表 */
  rankings: RankingEntry[]
  /** 每个专家的 HP 变化 */
  items: SettlementItem[]
  /** 结算状态 */
  status: 'pending' | 'applied' | 'vetoed' | 'skipped'
  /** 如果跳过，原因 */
  skipReason?: string
  /** 存活专家数 */
  aliveExpertCount: number
}

/**
 * 数据库 votes 表记录
 */
export interface VoteRecord {
  id: string
  session_id: string
  round_index: number
  voter_agent_id: string
  target_agent_id: string
  score: number
  reason_json: string | null
  valid: number // 0 or 1
  invalid_reason: string | null
  created_at: string
}

/**
 * 数据库 settlements 表记录
 */
export interface SettlementRecord {
  id: string
  session_id: string
  round_index: number
  settlement_json: string
  status: string
  created_at: string
  applied_at: string | null
}
