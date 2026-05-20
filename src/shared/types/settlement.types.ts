/**
 * 单个专家的单轮结算结果
 */
export interface ExpertSettlementResult {
  agentId: string;
  /** 展示排名，one-based（第1名 = 1） */
  displayRank: number;
  /** 该专家在公式数组中占据的索引位置，zero-based（第1名 = 0）；并列时包含多个 */
  occupiedFormulaIndexes: number[];
  /** 基础 HP 变化（已含保护期减免，并列平均） */
  baseHpChange: number;
  /** 连续垫底额外惩罚（0 或负值） */
  extraPenalty: number;
  /** 最终 HP 变化 = baseHpChange + extraPenalty（正值时可能被触底反弹放大） */
  finalHpChange: number;
  /** 结算前 HP + finalHpChange，可能为负 */
  rawHpAfter: number;
  /** clamp 到 [0, hpCap] 后的实际 HP */
  clampedHp: number;
  /** 是否被淘汰 */
  eliminated: boolean;
  /** 更新后的连续垫底计数 */
  nextConsecutiveLastCount: number;
  /** speaking_right 变化值 */
  speakingRightChange: number;
  /** prestige 变化值 */
  prestigeChange: number;
}

/**
 * 整轮结算结果
 */
export interface RoundSettlementResult {
  sessionId: string;
  round: number;
  isProtectionSettlement: boolean;
  results: ExpertSettlementResult[];
  /** 本轮被淘汰的专家 ID 列表（按排名低的先淘汰排序） */
  eliminatedAgentIds: string[];
  /** 结算后是否触发终局（存活 < 3） */
  triggersEndgame: boolean;
  /** 结算后的存活人数 */
  aliveCountAfter: number;
}

/**
 * 兼容别名：后续模块可直接引用 SettlementResult
 */
export type SettlementResult = RoundSettlementResult;

/**
 * 排名条目（内部使用）
 */
export interface RankingEntry {
  agentId: string;
  /** 该专家收到的有效评分平均值 */
  averageScore: number;
  /** 展示排名，one-based */
  displayRank: number;
  /** 在公式数组中占据的索引位置，zero-based */
  occupiedFormulaIndexes: number[];
  /** 是否为唯一末位 */
  isUniqueLast: boolean;
  /** 是否为唯一第1名 */
  isUniqueFirst: boolean;
  /** 是否为唯一第2名 */
  isUniqueSecond: boolean;
}

/**
 * 终局排名条目
 * 排序优先级：是否存活 > rawHpAfter > 本轮投票排名 > prestige > speaking_right > agent_id
 */
export interface FinalRankingEntry {
  agentId: string;
  isAlive: boolean;
  /** 未 clamp 的最终 HP，用于多人同时淘汰时排序 */
  rawHpAfter: number;
  /** clamp 后的最终 HP */
  finalHp: number;
  /** 最后一轮投票排名，one-based */
  lastRoundRank: number;
  prestige: number;
  speakingRight: number;
  /** 最终展示排名，one-based */
  finalRank: number;
}
