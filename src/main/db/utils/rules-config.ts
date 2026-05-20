import type { RulesConfig } from '../../../shared/types/rules.types'
import {
  mergeWithDefaultRulesConfig,
  validateAndNormalizeTiers,
  validateRulesConfig
} from '../../../shared/constants/rules'

/**
 * 从数据库 rooms.rules_json 字段读取并解析为完整 RulesConfig。
 *
 * 处理逻辑：
 * 1. 如果 raw 为 null/undefined/空字符串，返回 mergeWithDefaultRulesConfig(undefined)
 * 2. 解析 JSON，如果失败，抛出可读错误
 * 3. merge defaultRulesConfig 填充缺失字段
 * 4. 校验 comebackBonus.tiers 升序；如果不是则自动排序并返回 warning
 * 5. 返回完整 RulesConfig
 *
 * @param raw rooms.rules_json 字段的原始值
 */
export function parseRulesJsonFromDb(raw: string | null | undefined): {
  config: RulesConfig
  warnings: string[]
} {
  const warnings: string[] = []

  if (!raw || raw.trim() === '') {
    return {
      config: mergeWithDefaultRulesConfig(undefined),
      warnings
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Failed to parse rooms.rules_json: ${
        error instanceof Error ? error.message : String(error)
      }. Raw value (first 200 chars): ${raw.slice(0, 200)}`
    )
  }

  const merged = mergeWithDefaultRulesConfig(parsed as Partial<RulesConfig>)

  const { normalized, warnings: tierWarnings } = validateAndNormalizeTiers(
    merged.comebackBonus.tiers
  )

  merged.comebackBonus.tiers = normalized
  warnings.push(...tierWarnings)

  return {
    config: merged,
    warnings
  }
}

/**
 * 在 Session 启动前校验 RulesConfig 是否合法。
 * 返回错误列表；如果非空，应阻止 Session 启动。
 */
export function validateRulesConfigForSession(config: RulesConfig): string[] {
  return validateRulesConfig(config)
}

/**
 * 将 RulesConfig 序列化为 JSON 字符串，用于写入 rooms.rules_json。
 */
export function serializeRulesJson(config: RulesConfig): string {
  return JSON.stringify(config)
}
