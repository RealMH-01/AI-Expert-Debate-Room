/**
 * Ranking Module - 排名计算
 *
 * 根据有效投票计算每个专家的排名。
 *
 * 排名规则：
 * - 按 scoreAvg 降序排列
 * - 同分时 influence 高者优先
 * - 如果 influence 也相同，按专家创建顺序（agentId 的创建顺序）
 * - 议事权只能用于同分排序，不能影响最终总结观点权重
 */

import type { RankingEntry, SingleVote } from '../voting/voteTypes'
import type { Agent } from '../../shared/types'

/**
 * 所有有效票的汇总结构
 */
interface VoteTally {
  agentId: string
  agentName: string
  influence: number
  scoreSum: number
  voteCount: number
  /** 用于同分排序的创建顺序索引 */
  creationOrder: number
}

/**
 * 根据有效投票计算排名
 *
 * @param validVotesMap - Map<targetAgentId, SingleVote[]> 所有指向该目标的有效票
 * @param aliveExperts - 存活专家列表（包含 influence 等属性）
 * @returns 排名列表，按名次升序
 */
export function calculateRanking(
  validVotesMap: Map<string, SingleVote[]>,
  aliveExperts: Agent[]
): RankingEntry[] {
  // 构建每个专家的得分汇总
  const tallies: VoteTally[] = aliveExperts.map((expert, index) => {
    const votesForExpert = validVotesMap.get(expert.id) || []
    const scoreSum = votesForExpert.reduce((sum, v) => sum + v.score, 0)
    const voteCount = votesForExpert.length

    return {
      agentId: expert.id,
      agentName: expert.name,
      influence: expert.influence,
      scoreSum,
      voteCount,
      creationOrder: index
    }
  })

  // 排序：scoreAvg 降序 -> influence 降序 -> creationOrder 升序
  tallies.sort((a, b) => {
    const avgA = a.voteCount > 0 ? a.scoreSum / a.voteCount : 0
    const avgB = b.voteCount > 0 ? b.scoreSum / b.voteCount : 0

    // 平均分降序
    if (avgB !== avgA) return avgB - avgA

    // 同分时 influence 高者优先（降序）
    if (b.influence !== a.influence) return b.influence - a.influence

    // 都相同时按创建顺序（升序）
    return a.creationOrder - b.creationOrder
  })

  // 转换为 RankingEntry
  return tallies.map((t, index) => ({
    agentId: t.agentId,
    agentName: t.agentName,
    scoreSum: t.scoreSum,
    scoreAvg: t.voteCount > 0 ? Math.round((t.scoreSum / t.voteCount) * 100) / 100 : 0,
    voteCount: t.voteCount,
    rank: index + 1,
    influence: t.influence
  }))
}
