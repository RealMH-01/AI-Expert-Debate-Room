/**
 * 触底反弹层级配置
 */
export interface ComebackTier {
  /** 当专家 HP <= 此值时触发该层级，必须按升序排列 */
  hpAtOrBelow: number;
  /** 正向回血的倍率 */
  multiplier: number;
  /** 单轮回血上限 */
  maxGain: number;
}

/**
 * 触底反弹配置
 */
export interface ComebackBonusConfig {
  enabled: boolean;
  /** 必须按 hpAtOrBelow 升序排列，且 hpAtOrBelow 不允许重复 */
  tiers: ComebackTier[];
}

/**
 * 结算公式集合
 * key = 当前存活专家人数 (3-7)
 * value = 按排名顺序的 HP 变化数组，zero-based（index 0 = 第1名）
 *
 * 注意：
 * - 类型层面使用 Record<number, number[]>
 * - defaultRulesConfig.formulas 使用数字字面量 key：3、4、5、6、7
 * - 不要改成 Map
 */
export type SettlementFormulas = Record<number, number[]>;

/**
 * 结算模式
 */
export type SettlementMode = 'per-round' | 'per-cycle';

/**
 * 完整的赛制规则配置
 */
export interface RulesConfig {
  /** 初始 HP，默认 100 */
  hpInitial: number;
  /** HP 上限，默认 100 */
  hpCap: number;
  /** 结算模式：per-round 每轮结算，per-cycle 每 N 轮结算一次 */
  settlementMode: SettlementMode;
  /** per-cycle 模式下几轮结算一次，默认 3 */
  settlementCycleRounds: number;
  /** 按存活人数分档的结算公式 */
  formulas: SettlementFormulas;
  /** 保护期结算次数（前 N 次结算受保护），默认 2 */
  protectionSettlementCount: number;
  /** 保护期负向 HP 变化的缩减系数，默认 0.5（减半），用法：Math.trunc(baseHpChange * protectionReduction) */
  protectionReduction: number;
  /** 连续垫底触发阈值，默认 3 */
  consecutiveLastThreshold: number;
  /** 连续垫底额外惩罚值，默认 -8 */
  consecutiveLastPenalty: number;
  /** 触底反弹配置 */
  comebackBonus: ComebackBonusConfig;
  /** 最大轮数安全阀，默认 20 */
  maxRounds: number;
  /** speaking_right 范围，默认 [-5, 5] */
  speakingRightRange: [number, number];
}
