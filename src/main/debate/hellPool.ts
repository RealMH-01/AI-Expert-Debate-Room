/**
 * Hell Pool Module - 地狱池管理
 *
 * 管理 HP <= 0 的专家状态。
 *
 * 核心规则：
 * - HP <= 0 时 agents.status 统一写为 'hell_pool'
 * - hell_pool 专家不能再参与后续投票和发言
 * - 本轮不做复活功能
 * - 专家可以死亡但不能被系统强行变蠢
 *   （即：不关闭 thinking、不削减 token、不修改 persona）
 */

import type { Agent } from '../../shared/types'
import * as agentRepo from '../db/repositories/agentRepository'

/**
 * 将专家送入 Hell Pool
 * 只修改 status 和 hp，不修改 persona / thinking_enabled 等属性
 */
export function sendToHellPool(agentId: string): Agent | undefined {
  return agentRepo.updateExpert(agentId, {
    status: 'hell_pool',
    hp: 0
  })
}

/**
 * 检查指定会议室中哪些专家在 Hell Pool
 */
export function getHellPoolExperts(roomId: string): Agent[] {
  const experts = agentRepo.getExperts(roomId)
  return experts.filter((e) => e.status === 'hell_pool')
}

/**
 * 获取存活专家列表
 */
export function getAliveExperts(roomId: string): Agent[] {
  const experts = agentRepo.getExperts(roomId)
  return experts.filter((e) => e.status === 'active')
}

/**
 * 判断是否应该停止投票和 HP 结算
 * 当存活专家少于 threshold 时返回 true
 */
export function shouldStopSettlement(roomId: string, threshold: number): boolean {
  const aliveCount = getAliveExperts(roomId).length
  return aliveCount < threshold
}
