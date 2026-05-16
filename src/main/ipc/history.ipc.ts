/**
 * History IPC Handlers
 *
 * 处理历史会议列表、详情查看、删除等请求。
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import * as historyRepo from '../db/repositories/historyRepository'
import * as reviewRepo from '../db/repositories/reviewRepository'

export function registerHistoryIpc(): void {
  // 获取历史会议列表
  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_LIST,
    async (
      _event,
      params: { search?: string; roomId?: string; limit?: number; offset?: number }
    ) => {
      try {
        const result = historyRepo.getHistoryList(params || {})
        return { success: true, data: result }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取会议完整详情
  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_DETAIL,
    async (_event, sessionId: string) => {
      try {
        const detail = historyRepo.getSessionFullDetail(sessionId)
        if (!detail) return { success: false, error: '会议不存在' }
        return { success: true, data: detail }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 删除历史会议
  ipcMain.handle(
    IPC_CHANNELS.HISTORY_DELETE_SESSION,
    async (_event, sessionId: string) => {
      try {
        const deleted = historyRepo.deleteSession(sessionId)
        if (!deleted) return { success: false, error: '会议不存在或删除失败' }
        return { success: true, data: true }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取可过滤的 room 列表
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET_ROOMS_FOR_FILTER, async () => {
    try {
      const rooms = historyRepo.getRoomsForFilter()
      return { success: true, data: rooms }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议 review
  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_REVIEW,
    async (_event, sessionId: string) => {
      try {
        const review = reviewRepo.getReviewBySession(sessionId)
        return { success: true, data: review ?? null }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  console.log('[IPC] History 处理器已注册')
}
