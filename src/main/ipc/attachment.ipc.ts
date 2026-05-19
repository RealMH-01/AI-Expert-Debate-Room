import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import * as attachmentRepo from '../db/repositories/attachmentRepository'

export function registerAttachmentIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ATTACHMENT_GET_BY_SESSION, async (_event, sessionId: string) => {
    try {
      const attachments = attachmentRepo.getAttachmentsBySession(sessionId)
      return { success: true, data: attachments }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[IPC] Attachment handlers registered')
}
