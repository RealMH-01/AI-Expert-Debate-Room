/**
 * Settlement IPC Handlers
 *
 * 处理用户应用/否决 HP 结算的请求。
 *
 * 核心铁律：
 * - 主理人无权审票
 * - 用户拥有 HP 结算生效前的否决权
 * - 否决后不能修改 HP
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  applySettlement,
  vetoSettlement,
  hasPendingSettlement,
  getPendingSettlementResult
} from '../debate/debateEngine'
import * as voteRepo from '../db/repositories/voteRepository'
import * as settlementRepo from '../db/repositories/settlementRepository'
import * as agentRepo from '../db/repositories/agentRepository'

export function registerSettlementIpc(): void {
  // 应用结算
  ipcMain.handle(IPC_CHANNELS.SETTLEMENT_APPLY, async (_event, sessionId: string) => {
    try {
      const result = await applySettlement(sessionId)
      return { success: result.success, data: result.session, error: result.error }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 否决结算
  ipcMain.handle(IPC_CHANNELS.SETTLEMENT_VETO, async (_event, sessionId: string) => {
    try {
      const result = await vetoSettlement(sessionId)
      return { success: result.success, data: result.session, error: result.error }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 检查是否有待确认结算
  ipcMain.handle(IPC_CHANNELS.SETTLEMENT_HAS_PENDING, async (_event, sessionId: string) => {
    try {
      return { success: true, data: hasPendingSettlement(sessionId) }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取待确认结算详情
  ipcMain.handle(IPC_CHANNELS.SETTLEMENT_GET_PENDING, async (_event, sessionId: string) => {
    try {
      const result = getPendingSettlementResult(sessionId)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取某会议的投票记录
  ipcMain.handle(IPC_CHANNELS.VOTES_GET_BY_SESSION, async (_event, sessionId: string) => {
    try {
      const votes = voteRepo.getVotesBySession(sessionId)
      return { success: true, data: votes }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取某会议的结算记录
  ipcMain.handle(IPC_CHANNELS.SETTLEMENTS_GET_BY_SESSION, async (_event, sessionId: string) => {
    try {
      const settlements = settlementRepo.getSettlementsBySession(sessionId)
      return { success: true, data: settlements }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议室存活专家
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_ALIVE_EXPERTS, async (_event, roomId: string) => {
    try {
      const experts = agentRepo.getExperts(roomId).filter((e) => e.status === 'active')
      return { success: true, data: experts }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议室 Hell Pool 专家
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_HELL_POOL_EXPERTS, async (_event, roomId: string) => {
    try {
      const experts = agentRepo.getExperts(roomId).filter((e) => e.status === 'hell_pool')
      return { success: true, data: experts }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Settlement 处理器已注册')
}
