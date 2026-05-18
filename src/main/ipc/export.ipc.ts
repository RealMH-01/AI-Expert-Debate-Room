/**
 * Export IPC Handlers
 *
 * 处理 Markdown 导出、数据库路径查询、全量数据导出。
 * Markdown 生成和文件写入在 Main Process 侧完成。
 * 使用 Electron dialog.showSaveDialog 让用户选择保存路径。
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS } from './channels'
import * as historyRepo from '../db/repositories/historyRepository'
import { generateSessionMarkdown, generateExportFilename } from '../export/markdownExporter'
import { buildSessionReview } from '../review/sessionReviewBuilder'
import { getDatabasePath, getDatabase } from '../db/sqlite'

export function registerExportIpc(): void {
  // 导出 Markdown
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_MARKDOWN,
    async (_event, sessionId: string) => {
      try {
        const detail = historyRepo.getSessionFullDetail(sessionId)
        if (!detail) return { success: false, error: '会议不存在' }

        // Build review data for inclusion
        let reviewData = null
        if (detail.review) {
          try {
            reviewData = JSON.parse(detail.review.review_json)
          } catch {
            // ignore
          }
        }

        // Generate markdown
        const markdown = generateSessionMarkdown(detail, reviewData)
        const defaultFilename = generateExportFilename(detail.session.title)

        // Show save dialog
        const mainWindow = BrowserWindow.getAllWindows()[0]
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 Markdown',
          defaultPath: defaultFilename,
          filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })

        if (result.canceled || !result.filePath) {
          return { success: true, data: { canceled: true } }
        }

        // Write file
        fs.writeFileSync(result.filePath, markdown, 'utf-8')

        return {
          success: true,
          data: {
            canceled: false,
            filePath: result.filePath,
            size: Buffer.byteLength(markdown, 'utf-8')
          }
        }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取数据库文件路径
  ipcMain.handle(IPC_CHANNELS.EXPORT_GET_DB_PATH, async () => {
    try {
      const dbPath = getDatabasePath()
      return { success: true, data: dbPath }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 导出全部数据为 JSON
  ipcMain.handle(IPC_CHANNELS.EXPORT_ALL_DATA_JSON, async () => {
    try {
      const db = getDatabase()

      // 获取 settings 并过滤敏感信息
      const settingsRaw = db.prepare('SELECT * FROM settings').all() as Array<{
        key: string
        value_json: string
        updated_at: string
      }>
      const settingsSafe = settingsRaw.map((s) => {
        if (s.key === 'provider_configs') {
          // 过滤 API Key
          try {
            const configs = JSON.parse(s.value_json || '[]')
            const safeConfigs = configs.map((c: Record<string, unknown>) => ({
              ...c,
              apiKey: c.apiKey ? '****REDACTED****' : '',
              defaultHeaders: {} // 过滤可能包含 Authorization 的 headers
            }))
            return { ...s, value_json: JSON.stringify(safeConfigs) }
          } catch {
            return { ...s, value_json: '[]' }
          }
        }
        return s
      })

      const data = {
        exportedAt: new Date().toISOString(),
        rooms: db.prepare('SELECT * FROM rooms').all(),
        agents: db.prepare('SELECT * FROM agents').all(),
        sessions: db.prepare('SELECT * FROM sessions').all(),
        messages: db.prepare('SELECT * FROM messages').all(),
        votes: db.prepare('SELECT * FROM votes').all(),
        settlements: db.prepare('SELECT * FROM settlements').all(),
        claims: db.prepare('SELECT * FROM claims').all(),
        attacks: db.prepare('SELECT * FROM attacks').all(),
        context_summaries: db.prepare('SELECT * FROM context_summaries').all(),
        model_call_usage: db.prepare('SELECT * FROM model_call_usage').all(),
        agent_snapshots: db.prepare('SELECT * FROM agent_snapshots').all(),
        session_participants: db.prepare('SELECT * FROM session_participants').all(),
        session_reviews: db.prepare('SELECT * FROM session_reviews').all(),
        settings: settingsSafe
      }

      const jsonStr = JSON.stringify(data, null, 2)

      // Show save dialog
      const mainWindow = BrowserWindow.getAllWindows()[0]
      const date = new Date().toISOString().split('T')[0]
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出全部数据',
        defaultPath: `debate-room-backup-${date}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, data: { canceled: true } }
      }

      fs.writeFileSync(result.filePath, jsonStr, 'utf-8')

      return {
        success: true,
        data: {
          canceled: false,
          filePath: result.filePath,
          size: Buffer.byteLength(jsonStr, 'utf-8')
        }
      }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Export 处理器已注册')
}
