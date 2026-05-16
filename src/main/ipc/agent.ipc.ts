/**
 * Agent IPC Handlers
 *
 * 处理渲染进程发来的智能体（主理人/专家）相关请求。
 * 路由到 agentRepository 执行数据库操作。
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import * as agentRepo from '../db/repositories/agentRepository'
import type { Agent } from '../../shared/types'

export function registerAgentIpc(): void {
  // 获取会议室的主理人
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_MODERATOR, async (_event, roomId: string) => {
    try {
      const moderator = agentRepo.getModerator(roomId)
      return { success: true, data: moderator || null }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 创建/更新主理人
  ipcMain.handle(
    IPC_CHANNELS.AGENT_UPSERT_MODERATOR,
    async (
      _event,
      params: {
        roomId: string
        data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
      }
    ) => {
      try {
        const moderator = agentRepo.upsertModerator(params.roomId, params.data)
        return { success: true, data: moderator }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取会议室所有专家
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_EXPERTS, async (_event, roomId: string) => {
    try {
      const experts = agentRepo.getExperts(roomId)
      return { success: true, data: experts }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 创建专家
  ipcMain.handle(
    IPC_CHANNELS.AGENT_CREATE_EXPERT,
    async (
      _event,
      params: {
        roomId: string
        data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
      }
    ) => {
      try {
        const expert = agentRepo.createExpert(params.roomId, params.data)
        return { success: true, data: expert }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 更新专家
  ipcMain.handle(
    IPC_CHANNELS.AGENT_UPDATE_EXPERT,
    async (
      _event,
      params: {
        id: string
        data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
      }
    ) => {
      try {
        const expert = agentRepo.updateExpert(params.id, params.data)
        if (!expert) return { success: false, error: '专家不存在' }
        return { success: true, data: expert }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 删除 Agent
  ipcMain.handle(IPC_CHANNELS.AGENT_DELETE, async (_event, id: string) => {
    try {
      const deleted = agentRepo.deleteAgent(id)
      return { success: true, data: deleted }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取单个 Agent
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_BY_ID, async (_event, id: string) => {
    try {
      const agent = agentRepo.getAgentById(id)
      if (!agent) return { success: false, error: 'Agent 不存在' }
      return { success: true, data: agent }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Agent 处理器已注册')
}
