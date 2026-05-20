/**
 * Debate IPC Handlers
 *
 * 处理渲染进程发来的辩论相关请求。
 * 关键设计：
 * - startDebate 是异步操作，通过 webContents.send 推送实时消息给渲染进程
 * - 其他操作（validate, getSession, getMessages）是同步查询
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from './channels'
import { validateRoomCanStart, startDebate, isDebateRunning, abortDebate } from '../debate/debateEngine'
import * as sessionRepo from '../db/repositories/sessionRepository'
import * as messageRepo from '../db/repositories/messageRepository'
import { validateDebateAttachments } from '../../shared/attachments'
import type { Session, Message, DebatePhase, DebateStartParams } from '../../shared/types'
import type { SettlementResult } from '../voting/voteTypes'

/** 辩论过程事件通道名 */
export const DEBATE_EVENTS = {
  NEW_MESSAGE: 'debate:event:new-message',
  PHASE_CHANGE: 'debate:event:phase-change',
  SESSION_FINISHED: 'debate:event:session-finished',
  ERROR: 'debate:event:error',
  SETTLEMENT_READY: 'debate:event:settlement-ready'
} as const

/**
 * 获取主窗口（用于推送事件）
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

/**
 * 向渲染进程推送事件
 */
function sendToRenderer(channel: string, data: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

export function registerDebateIpc(): void {
  // 校验会议室能否启动辩论
  ipcMain.handle(IPC_CHANNELS.DEBATE_VALIDATE, async (_event, roomId: string) => {
    try {
      const result = validateRoomCanStart(roomId)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 启动辩论（异步，通过事件推送进展）
  ipcMain.handle(
    IPC_CHANNELS.DEBATE_START,
    async (_event, params: DebateStartParams) => {
      try {
        const { roomId, userQuestion } = params

        if (!userQuestion || userQuestion.trim() === '') {
          return { success: false, error: '请输入讨论问题' }
        }

        // 异步启动辩论，不等待完成
        // 通过事件推送每一步进展
        const attachmentValidation = validateDebateAttachments(params.attachments)
        if (!attachmentValidation.valid) {
          return { success: false, error: attachmentValidation.errors.join('; ') }
        }

        const callbacks = {
          onMessage: (message: Message) => {
            sendToRenderer(DEBATE_EVENTS.NEW_MESSAGE, message)
          },
          onPhaseChange: (phase: DebatePhase, session: Session) => {
            sendToRenderer(DEBATE_EVENTS.PHASE_CHANGE, { phase, session })
          },
          onSessionFinished: (session: Session) => {
            sendToRenderer(DEBATE_EVENTS.SESSION_FINISHED, session)
          },
          onError: (error: string) => {
            sendToRenderer(DEBATE_EVENTS.ERROR, error)
          },
          onSettlementReady: (settlement: SettlementResult) => {
            sendToRenderer(DEBATE_EVENTS.SETTLEMENT_READY, settlement)
          }
        }

        // 启动但不 await（让 IPC 立即返回 session）
        const validationResult = validateRoomCanStart(roomId)
        if (!validationResult.valid) {
          return { success: false, error: validationResult.errors.join('; ') }
        }

        if (isDebateRunning(roomId)) {
          return { success: false, error: 'Current room still has an active debate in memory; please stop it before starting again.' }
        }

        // 开始辩论（fire-and-forget pattern）
        startDebate(
          roomId,
          userQuestion.trim(),
          callbacks,
          attachmentValidation.attachments
        ).catch((err) => {
          console.error('[DebateIPC] startDebate unexpected error:', err)
          sendToRenderer(DEBATE_EVENTS.ERROR, `辩论引擎异常: ${err.message}`)
        })

        // 立即返回成功，让渲染进程知道辩论已开始
        return { success: true, data: { started: true, roomId } }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 检查是否正在运行
  ipcMain.handle(
    IPC_CHANNELS.DEBATE_ABORT,
    async (_event, params: { roomId: string; sessionId?: string }) => {
      try {
        const result = abortDebate(params.roomId, params.sessionId)
        return { success: true, data: { ...result, requestedSessionId: params.sessionId } }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DEBATE_IS_RUNNING, async (_event, roomId: string) => {
    try {
      return { success: true, data: isDebateRunning(roomId) }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议信息
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_BY_ID, async (_event, sessionId: string) => {
    try {
      const session = sessionRepo.getSessionById(sessionId)
      if (!session) return { success: false, error: '会议不存在' }
      return { success: true, data: session }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议室的所有会议
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_BY_ROOM, async (_event, roomId: string) => {
    try {
      const sessions = sessionRepo.getSessionsByRoom(roomId)
      return { success: true, data: sessions }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取会议的所有消息
  ipcMain.handle(IPC_CHANNELS.MESSAGE_GET_BY_SESSION, async (_event, sessionId: string) => {
    try {
      const messages = messageRepo.getMessagesBySession(sessionId)
      return { success: true, data: messages }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Debate 处理器已注册')
}
