/**
 * 投票理由结构
 */
export interface VoteReasons {
  /** 本轮提出了什么有效新论点 */
  newArguments: string;
  /** 成功反驳或防守了什么 */
  rebuttalOrDefense: string;
  /** 是否修正/吸收/整合了他人观点 */
  revisionOrIntegration: string;
  /** 总体评价一句话 */
  overall: string;
}

/**
 * 单条投票
 */
export interface VoteEntry {
  targetAgentId: string;
  /** 0-10 整数 */
  score: number;
  reasons: VoteReasons;
}

/**
 * 投票输出格式（AI 专家返回的 JSON 结构）
 */
export interface VoteOutput {
  votes: VoteEntry[];
}

/**
 * 投票校验结果
 */
export interface VoteValidationResult {
  isValid: boolean;
  errors: string[];
  /** 校验通过的投票条目 */
  validVotes: VoteEntry[];
}

/**
 * 投票尝试记录（用于 vote_attempts 表）
 */
export interface VoteAttemptRecord {
  id: string;
  sessionId: string;
  round: number;
  voterId: string;
  attempt: number;
  rawOutput: string;
  error: string | null;
  createdAt: string;
}

/**
 * 投票最终状态
 */
export type VoteFinalStatus = 'valid' | 'abstained';

/**
 * 单个投票者的处理结果
 */
export interface VoteProcessResult {
  voterId: string;
  status: VoteFinalStatus;
  votes?: VoteEntry[];
  attempts: number;
}

/**
 * 本轮投票汇总
 */
export interface RoundVoteSummary {
  sessionId: string;
  round: number;
  totalAlive: number;
  validVoterCount: number;
  abstainedVoterIds: string[];
  /** 有效投票人数是否足够：>= max(2, ceil(aliveCount * 0.5)) */
  quorumMet: boolean;
  /** quorum 不足时进入 manual_review，不自动结算 */
  needsManualReview: boolean;
}
