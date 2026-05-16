/**
 * HP Settlement Engine - HP 结算引擎
 *
 * 核心规则：
 * - 第一名 +first_place_hp_gain（默认 +3），不超过 max_hp
 * - 第二名 +second_place_hp_gain（默认 +1），不超过 max_hp
 * - 中间名次 HP 不变
 * - 倒数第二 -second_last_hp_loss（默认 -8），仅当存活专家 >= 4 时触发
 * - 倒数第一 -last_place_hp_loss（默认 -15）
 * - 单轮扣血不得超过 max_hp_loss_per_round（默认 20）
 * - HP <= 0 状态变为 hell_pool
 * - hell_pool 专家不再参与后续投票和发言
 * - 存活专家少于 stop_settlement_when_alive_experts_less_than 时不做结算
 * - 胜者回血必须小于失败扣血（由默认规则保证：+3 < 8、+3 < 15）
 *
 * 存活专家数为 3 时的特殊规则：
 * - 第一名 +3
 * - 第二名 +1
 * - 第三名 -15（即 last_place_hp_loss）
 * - 不触发倒数第二 -8（倒数第二只在 >= 4 人时触发）
 */

import type { RankingEntry, SettlementItem, SettlementResult } from '../voting/voteTypes'
import type { RulesConfig, Agent } from '../../shared/types'
import { DEFAULT_RULES_CONFIG } from '../../shared/types'

/**
 * 生成 HP 结算预览（不立即生效）
 *
 * @param rankings - 排名列表
 * @param aliveExperts - 存活专家（含 HP 信息）
 * @param rules - 规则配置
 * @param sessionId - 当前会议 ID
 * @param roundIndex - 当前轮次
 * @returns SettlementResult（status = 'pending'）
 */
export function generateSettlementPreview(
  rankings: RankingEntry[],
  aliveExperts: Agent[],
  rules: RulesConfig | null,
  sessionId: string,
  roundIndex: number
): SettlementResult {
  const r = rules || DEFAULT_RULES_CONFIG
  const aliveCount = aliveExperts.length

  // 检查是否应跳过结算
  if (aliveCount < r.stop_settlement_when_alive_experts_less_than) {
    return {
      sessionId,
      roundIndex,
      rankings,
      items: [],
      status: 'skipped',
      skipReason: `存活专家 (${aliveCount}) 少于 ${r.stop_settlement_when_alive_experts_less_than} 人，停止 HP 结算`,
      aliveExpertCount: aliveCount
    }
  }

  // 构建 agent 查找表
  const agentMap = new Map<string, Agent>()
  for (const expert of aliveExperts) {
    agentMap.set(expert.id, expert)
  }

  const items: SettlementItem[] = []

  for (const entry of rankings) {
    const agent = agentMap.get(entry.agentId)
    if (!agent) continue

    const hpBefore = agent.hp
    let hpChange = 0
    let reason = '中间名次，HP 不变'

    const totalExperts = rankings.length

    if (entry.rank === 1) {
      // 第一名回血
      hpChange = r.first_place_hp_gain
      reason = `第一名 +${r.first_place_hp_gain} HP`
    } else if (entry.rank === 2) {
      // 第二名回血
      hpChange = r.second_place_hp_gain
      reason = `第二名 +${r.second_place_hp_gain} HP`
    } else if (entry.rank === totalExperts) {
      // 倒数第一
      hpChange = -r.last_place_hp_loss
      reason = `倒数第一 -${r.last_place_hp_loss} HP`
    } else if (entry.rank === totalExperts - 1 && totalExperts >= 4) {
      // 倒数第二（仅 >=4 人时触发）
      hpChange = -r.second_last_hp_loss
      reason = `倒数第二 -${r.second_last_hp_loss} HP`
    }

    // 限制单轮最大扣血
    if (hpChange < 0 && Math.abs(hpChange) > r.max_hp_loss_per_round) {
      hpChange = -r.max_hp_loss_per_round
      reason += ` (限制最大扣血 ${r.max_hp_loss_per_round})`
    }

    // 限制回血上限
    let hpAfter = hpBefore + hpChange
    if (hpAfter > r.max_hp) {
      hpAfter = r.max_hp
      hpChange = hpAfter - hpBefore
    }

    // 检查是否进入 Hell Pool
    const enterHellPool = hpAfter <= 0

    items.push({
      agentId: entry.agentId,
      agentName: entry.agentName,
      rank: entry.rank,
      hpBefore,
      hpChange,
      hpAfter: Math.max(hpAfter, 0), // 显示时不显示负数
      enterHellPool,
      reason
    })
  }

  return {
    sessionId,
    roundIndex,
    rankings,
    items,
    status: 'pending',
    aliveExpertCount: aliveCount
  }
}

/**
 * 计算 influence（议事权）变化
 * 简单规则：第一名 +1 influence，倒数第一 -1 influence（最低 0）
 */
export function calculateInfluenceChange(rank: number, totalExperts: number, currentInfluence: number): number {
  if (rank === 1) return 1
  if (rank === totalExperts) return currentInfluence > 0 ? -1 : 0
  return 0
}

/**
 * 计算 prestige（威望）变化
 * 简单规则：第一名 +2 prestige，第二名 +1，倒数第一 -1（最低 0）
 */
export function calculatePrestigeChange(rank: number, totalExperts: number, currentPrestige: number): number {
  if (rank === 1) return 2
  if (rank === 2) return 1
  if (rank === totalExperts) return currentPrestige > 0 ? -1 : 0
  return 0
}
