/**
 * Session 顶层状态
 * 保留旧状态以兼容历史数据
 */
export type SessionStatus =
  | 'preparing'
  | 'independent_answer'
  | 'debate_loop'
  | 'final_summary'
  | 'completed'
  // 以下为旧状态，保留兼容
  | 'debate'
  | 'voting'
  | 'settlement_pending'
  | 'settled'
  | 'summary';

/**
 * debate_loop 内部的每轮子状态
 */
export type RoundPhase =
  | 'speaking'
  | 'round_summary'
  | 'voting'
  | 'settlement'
  | 'elimination_check'
  | 'user_decision'
  | 'manual_review';

/**
 * 用户在 user_decision 阶段可执行的操作
 */
export type UserDecisionAction =
  | 'continue'
  | 'end_session'
  | 'revive_expert';

/**
 * 用户决策请求
 */
export interface UserDecisionRequest {
  sessionId: string;
  round: number;
  action: UserDecisionAction;
  /** action = revive_expert 时必须提供 */
  reviveAgentId?: string;
}
