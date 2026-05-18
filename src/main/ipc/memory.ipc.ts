import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { getDatabase } from '../db/sqlite'
import * as memory from '../memory/projectMemory'
import * as sessionRepo from '../db/repositories/sessionRepository'
import * as messageRepo from '../db/repositories/messageRepository'
import type { DebatePhase } from '../../shared/types'

export function registerMemoryIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_ACCEPT_SUGGESTION,
    async (_event, params: { suggestionId: string; editedContent?: string | null }) => {
      try {
        const item = memory.acceptMemorySuggestion(
          getDatabase(),
          params.suggestionId,
          params.editedContent
        )
        return { success: true, data: item }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_REJECT_SUGGESTION,
    async (_event, suggestionId: string) => {
      try {
        const suggestion = memory.rejectMemorySuggestion(getDatabase(), suggestionId)
        return { success: true, data: suggestion }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MEMORY_DISABLE_ITEM, async (_event, itemId: string) => {
    try {
      const item = memory.disableProjectMemoryItem(getDatabase(), itemId)
      return { success: true, data: item }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE_ITEM, async (_event, itemId: string) => {
    try {
      const item = memory.softDeleteProjectMemoryItem(getDatabase(), itemId)
      return { success: true, data: item }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.USER_INTERVENTION_CREATE,
    async (_event, params: {
      meetingId: string
      type: memory.UserInterventionType
      content: string
      targetExpertId?: string | null
      roundIndex?: number | null
    }) => {
      try {
        const db = getDatabase()
        const session = sessionRepo.getSessionById(params.meetingId)
        if (!session) return { success: false, error: 'Session not found' }

        const phase = session.current_phase || 'moderator_final_summary'
        const status = defaultInterventionStatus(params.type)
        const intervention = memory.createUserIntervention(db, {
          meetingId: params.meetingId,
          phase,
          roundIndex: params.roundIndex ?? null,
          type: params.type,
          content: params.content,
          targetExpertId: params.targetExpertId ?? null,
          status
        })

        if (params.type === 'add_information') {
          messageRepo.insertMessage({
            sessionId: params.meetingId,
            roundIndex: params.roundIndex ?? 0,
            phase: phase as DebatePhase,
            speakerId: null,
            speakerName: 'User intervention',
            speakerRole: 'user',
            content: `[User additional information]\n${params.content}`,
            structuredJson: JSON.stringify({
              type: 'user_intervention',
              interventionId: intervention.id,
              interventionType: params.type
            })
          })
        }

        return { success: true, data: intervention }
      } catch (error: unknown) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  console.log('[IPC] Memory handlers registered')
}

function defaultInterventionStatus(
  type: memory.UserInterventionType
): memory.UserInterventionStatus {
  if (type === 'note_only' || type === 'add_information') return 'applied'
  return 'pending'
}
