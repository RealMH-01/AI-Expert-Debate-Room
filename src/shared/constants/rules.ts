import type { ComebackTier, RulesConfig } from '../types/rules.types';

/**
 * 默认赛制规则配置
 */
export const defaultRulesConfig: RulesConfig = {
  hpInitial: 100,
  hpCap: 100,
  settlementMode: 'per-round',
  settlementCycleRounds: 3,
  formulas: {
    3: [5, -6, -20],
    4: [5, 1, -10, -20],
    5: [5, 2, -3, -12, -20],
    6: [5, 2, -3, -6, -12, -20],
    7: [5, 2, -2, -4, -7, -12, -20],
  },
  protectionSettlementCount: 2,
  protectionReduction: 0.5,
  consecutiveLastThreshold: 3,
  consecutiveLastPenalty: -8,
  comebackBonus: {
    enabled: true,
    tiers: [
      { hpAtOrBelow: 10, multiplier: 3, maxGain: 12 },
      { hpAtOrBelow: 20, multiplier: 2.5, maxGain: 10 },
      { hpAtOrBelow: 30, multiplier: 2, maxGain: 8 },
    ],
  },
  maxRounds: 20,
  speakingRightRange: [-5, 5],
};

/**
 * 克隆规则配置，避免复用 defaultRulesConfig 的嵌套引用
 */
function cloneRulesConfig(config: RulesConfig): RulesConfig {
  return {
    ...config,
    formulas: Object.fromEntries(
      Object.entries(config.formulas).map(([key, value]) => [Number(key), [...value]])
    ),
    comebackBonus: {
      ...config.comebackBonus,
      tiers: config.comebackBonus.tiers.map((tier) => ({ ...tier })),
    },
    speakingRightRange: [...config.speakingRightRange],
  };
}

/**
 * RulesConfig 校验：comebackBonus.tiers 必须按 hpAtOrBelow 升序，且不允许重复阈值。
 * 如果不是升序，排序后返回；同时返回 warning。
 * 如果存在非法值，返回以 Invalid 开头的 warning，validateRulesConfig 会将其视为 error。
 */
export function validateAndNormalizeTiers(
  tiers: ComebackTier[]
): { normalized: ComebackTier[]; warnings: string[] } {
  const warnings: string[] = [];
  const sorted = [...tiers].sort((a, b) => a.hpAtOrBelow - b.hpAtOrBelow);

  const isAlreadySorted = tiers.every(
    (tier, i) => tier.hpAtOrBelow === sorted[i]?.hpAtOrBelow
  );

  if (!isAlreadySorted) {
    warnings.push(
      'comebackBonus.tiers was not in ascending order by hpAtOrBelow; it has been auto-sorted.'
    );
  }

  const seen = new Set<number>();

  for (const tier of sorted) {
    if (seen.has(tier.hpAtOrBelow)) {
      warnings.push(`Invalid tier: duplicate hpAtOrBelow ${tier.hpAtOrBelow}`);
    }
    seen.add(tier.hpAtOrBelow);

    if (tier.hpAtOrBelow <= 0) {
      warnings.push(`Invalid tier: hpAtOrBelow must be > 0, got ${tier.hpAtOrBelow}`);
    }
    if (tier.multiplier <= 0) {
      warnings.push(`Invalid tier: multiplier must be > 0, got ${tier.multiplier}`);
    }
    if (tier.maxGain <= 0) {
      warnings.push(`Invalid tier: maxGain must be > 0, got ${tier.maxGain}`);
    }
  }

  return {
    normalized: sorted.map((tier) => ({ ...tier })),
    warnings,
  };
}

/**
 * 将部分 RulesConfig（可能来自旧数据）与 defaultRulesConfig 合并。
 * 缺失字段使用默认值。
 * 注意：这里必须深合并嵌套字段，避免旧 rules_config 只有部分 comebackBonus/formulas 时覆盖默认完整配置。
 */
export function mergeWithDefaultRulesConfig(
  partial: Partial<RulesConfig> | null | undefined
): RulesConfig {
  const defaults = cloneRulesConfig(defaultRulesConfig);

  if (!partial) {
    return defaults;
  }

  const comebackTiers =
    partial.comebackBonus?.tiers?.map((tier) => ({ ...tier })) ??
    defaults.comebackBonus.tiers.map((tier) => ({ ...tier }));

  const merged: RulesConfig = {
    hpInitial: partial.hpInitial ?? defaults.hpInitial,
    hpCap: partial.hpCap ?? defaults.hpCap,
    settlementMode: partial.settlementMode ?? defaults.settlementMode,
    settlementCycleRounds:
      partial.settlementCycleRounds ?? defaults.settlementCycleRounds,
    formulas: {
      ...defaults.formulas,
      ...(partial.formulas
        ? Object.fromEntries(
            Object.entries(partial.formulas).map(([key, value]) => [
              Number(key),
              [...value],
            ])
          )
        : {}),
    },
    protectionSettlementCount:
      partial.protectionSettlementCount ?? defaults.protectionSettlementCount,
    protectionReduction:
      partial.protectionReduction ?? defaults.protectionReduction,
    consecutiveLastThreshold:
      partial.consecutiveLastThreshold ?? defaults.consecutiveLastThreshold,
    consecutiveLastPenalty:
      partial.consecutiveLastPenalty ?? defaults.consecutiveLastPenalty,
    comebackBonus: {
      ...defaults.comebackBonus,
      ...(partial.comebackBonus ?? {}),
      tiers: comebackTiers,
    },
    maxRounds: partial.maxRounds ?? defaults.maxRounds,
    speakingRightRange: partial.speakingRightRange
      ? [...partial.speakingRightRange]
      : [...defaults.speakingRightRange],
  };

  return merged;
}

/**
 * 校验 RulesConfig 是否合法，返回错误列表。
 * 如果返回非空数组，应阻止 Session 启动。
 */
export function validateRulesConfig(config: RulesConfig): string[] {
  const errors: string[] = [];

  if (config.hpInitial <= 0) errors.push('hpInitial must be > 0');
  if (config.hpCap <= 0) errors.push('hpCap must be > 0');
  if (config.hpInitial > config.hpCap) errors.push('hpInitial must be <= hpCap');

  if (!['per-round', 'per-cycle'].includes(config.settlementMode)) {
    errors.push(`Invalid settlementMode: ${config.settlementMode}`);
  }

  if (config.settlementCycleRounds < 1) {
    errors.push('settlementCycleRounds must be >= 1');
  }

  for (let aliveCount = 3; aliveCount <= 7; aliveCount += 1) {
    const formula = config.formulas[aliveCount];

    if (!formula) {
      errors.push(`formulas missing key for aliveCount = ${aliveCount}`);
      continue;
    }

    if (formula.length !== aliveCount) {
      errors.push(
        `formulas[${aliveCount}] length must be ${aliveCount}, got ${formula.length}`
      );
    }

    if (formula[formula.length - 1] !== -20) {
      errors.push(`formulas[${aliveCount}] last value must be -20`);
    }
  }

  if (config.protectionSettlementCount < 0) {
    errors.push('protectionSettlementCount must be >= 0');
  }

  if (config.protectionReduction < 0 || config.protectionReduction > 1) {
    errors.push('protectionReduction must be between 0 and 1');
  }

  if (config.consecutiveLastThreshold < 1) {
    errors.push('consecutiveLastThreshold must be >= 1');
  }

  if (config.consecutiveLastPenalty > 0) {
    errors.push('consecutiveLastPenalty must be <= 0 (it is a penalty)');
  }

  if (config.maxRounds < 1) {
    errors.push('maxRounds must be >= 1');
  }

  if (config.speakingRightRange[0] >= config.speakingRightRange[1]) {
    errors.push('speakingRightRange[0] must be < speakingRightRange[1]');
  }

  const { warnings } = validateAndNormalizeTiers(config.comebackBonus.tiers);
  for (const warning of warnings) {
    if (warning.startsWith('Invalid')) {
      errors.push(warning);
    }
  }

  return errors;
}
