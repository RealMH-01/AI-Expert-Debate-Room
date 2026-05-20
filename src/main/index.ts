/**
 * Electron Main Process 入口
 *
 * 职责：
 * 1. 创建主窗口
 * 2. 初始化 SQLite 数据库
 * 3. 运行数据库迁移
 * 4. 注册 IPC 处理器
 */

import { app, shell, BrowserWindow, dialog } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './db/sqlite'
import { runMigrations } from './db/migrations'
import { registerHealthIpc } from './ipc/health.ipc'
import { registerRoomIpc } from './ipc/room.ipc'
import { registerAgentIpc } from './ipc/agent.ipc'
import { registerDebateIpc } from './ipc/debate.ipc'
import { registerSettlementIpc } from './ipc/settlement.ipc'
import { registerHistoryIpc } from './ipc/history.ipc'
import { registerExportIpc } from './ipc/export.ipc'
import { registerProviderIpc } from './ipc/provider.ipc'
import { registerMemoryIpc } from './ipc/memory.ipc'
import { registerAttachmentIpc } from './ipc/attachment.ipc'
import { repairStaleRunningDebates } from './debate/debateEngine'

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message
  }

  return String(error)
}

function writeStartupError(source: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  const message = `[${timestamp}] ${source}\n${formatStartupError(error)}\n\n`

  try {
    const logPath = join(app.getPath('userData'), 'startup-error.log')
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, message, 'utf8')
  } catch (logError) {
    console.error('[Startup] Failed to write startup-error.log', logError)
  }
}

process.on('uncaughtException', (error) => {
  console.error('[Startup] Uncaught exception', error)
  writeStartupError('uncaughtException', error)
  dialog.showErrorBox('AI Expert Debate Room startup error', formatStartupError(error))
})

process.on('unhandledRejection', (reason) => {
  console.error('[Startup] Unhandled rejection', reason)
  writeStartupError('unhandledRejection', reason)
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'AI 专家修罗场会议室',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // TODO(security): sandbox: false 是为了兼容 preload 中使用 Node.js API (contextBridge/ipcRenderer)。
      // 后续安全加固时应优先改为 sandbox: true 或移除此显式设置，
      // 届时需要将 preload 改为仅使用 Electron 沙箱兼容的 API。
      sandbox: false,
      // 安全设置：不开启 nodeIntegration
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  let fallbackTimer: NodeJS.Timeout | null = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[Main] Window was not ready after 8 seconds; showing fallback window')
      mainWindow.show()
    }
  }, 8000)

  mainWindow.on('ready-to-show', () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    const error = new Error(
      `Renderer failed to load: ${errorCode} ${errorDescription} ${validatedURL}`
    )
    console.error('[Main] Renderer failed to load', error)
    writeStartupError('did-fail-load', error)

    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  // 外部链接在默认浏览器中打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 根据环境加载不同资源
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 应用启动
app.whenReady().then(() => {
  // 设置 app user model id (Windows)
  electronApp.setAppUserModelId('com.ai-expert-debate-room')

  // 开发环境中 F12 打开 DevTools
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  console.log('[Main] 正在初始化数据库...')
  try {
    const db = initDatabase()
    runMigrations(db)
    const repairResult = repairStaleRunningDebates()
    if (repairResult.repairedCount > 0) {
      console.warn(
        `[Main] 已清理 ${repairResult.repairedCount} 个上次未正常结束的运行中会议`
      )
    }
    console.log('[Main] 数据库初始化完成')
  } catch (error) {
    console.error('[Main] Database initialization failed', error)
    writeStartupError('database initialization failed', error)
    dialog.showErrorBox('AI Expert Debate Room startup error', formatStartupError(error))
  }

  // 注册 IPC 处理器
  registerHealthIpc()
  registerRoomIpc()
  registerAgentIpc()
  registerDebateIpc()
  registerSettlementIpc()
  registerHistoryIpc()
  registerExportIpc()
  registerProviderIpc()
  registerMemoryIpc()
  registerAttachmentIpc()

  // 创建主窗口
  createWindow()

  app.on('activate', () => {
    // macOS: 点击 dock 图标时如果没有窗口则新建
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前关闭数据库
app.on('before-quit', () => {
  closeDatabase()
})
