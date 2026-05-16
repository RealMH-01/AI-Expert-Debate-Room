/**
 * Room IPC Handlers
 *
 * 处理渲染进程发来的会议室相关请求。
 * 路由到 roomRepository 执行数据库操作。
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import * as roomRepo from '../db/repositories/roomRepository'
import type { RulesConfig } from '../../shared/types'

export function registerRoomIpc(): void {
  // 获取所有会议室
  ipcMain.handle(IPC_CHANNELS.ROOM_GET_ALL, async () => {
    try {
      return { success: true, data: roomRepo.getAllRooms() }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取单个会议室
  ipcMain.handle(IPC_CHANNELS.ROOM_GET_BY_ID, async (_event, id: string) => {
    try {
      const room = roomRepo.getRoomById(id)
      if (!room) return { success: false, error: '会议室不存在' }
      return { success: true, data: room }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 创建会议室
  ipcMain.handle(
    IPC_CHANNELS.ROOM_CREATE,
    async (_event, params: { name: string; description?: string }) => {
      try {
        if (!params.name || params.name.trim() === '') {
          return { success: false, error: '会议室名称不能为空' }
        }
        const room = roomRepo.createRoom(params.name.trim(), params.description)
        return { success: true, data: room }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 更新会议室
  ipcMain.handle(
    IPC_CHANNELS.ROOM_UPDATE,
    async (_event, params: { id: string; name: string; description: string }) => {
      try {
        if (!params.name || params.name.trim() === '') {
          return { success: false, error: '会议室名称不能为空' }
        }
        const room = roomRepo.updateRoom(params.id, params.name.trim(), params.description)
        if (!room) return { success: false, error: '会议室不存在' }
        return { success: true, data: room }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 更新会议室规则
  ipcMain.handle(
    IPC_CHANNELS.ROOM_UPDATE_RULES,
    async (_event, params: { id: string; rules: RulesConfig }) => {
      try {
        const room = roomRepo.updateRoomRules(params.id, params.rules)
        if (!room) return { success: false, error: '会议室不存在' }
        return { success: true, data: room }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 删除会议室
  ipcMain.handle(IPC_CHANNELS.ROOM_DELETE, async (_event, id: string) => {
    try {
      const deleted = roomRepo.deleteRoom(id)
      return { success: true, data: deleted }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Room 处理器已注册')
}
