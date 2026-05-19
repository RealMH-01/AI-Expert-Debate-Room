import type { DebateAttachmentInput } from '../../shared/types'
import { byteLength } from '../../shared/attachments'

export type NewSessionAttachmentStatus = 'ready' | 'unsupported' | 'too_large' | 'read_error'

export interface NewSessionAttachmentLike {
  originalName: string
  mimeType?: string | null
  sizeBytes: number
  contentText: string
  status: NewSessionAttachmentStatus
}

export interface NewSessionAttachmentStats {
  readyCount: number
  rejectedCount: number
  readyTextBytes: number
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function estimateRoughTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

export function getNewSessionDraftKey(roomId: string): string {
  return `new-session-draft:${roomId}`
}

export function readNewSessionDraft(roomId: string, storage?: DraftStorage): string {
  const target = resolveDraftStorage(storage)
  if (!target) return ''

  try {
    return target.getItem(getNewSessionDraftKey(roomId)) ?? ''
  } catch (error) {
    warnDraftStorageError('read', error)
    return ''
  }
}

export function writeNewSessionDraft(
  roomId: string,
  question: string,
  storage?: DraftStorage
): void {
  const target = resolveDraftStorage(storage)
  if (!target) return

  try {
    const key = getNewSessionDraftKey(roomId)
    if (question.length === 0) {
      target.removeItem(key)
    } else {
      target.setItem(key, question)
    }
  } catch (error) {
    warnDraftStorageError('write', error)
  }
}

export function clearNewSessionDraft(roomId: string, storage?: DraftStorage): void {
  const target = resolveDraftStorage(storage)
  if (!target) return

  try {
    target.removeItem(getNewSessionDraftKey(roomId))
  } catch (error) {
    warnDraftStorageError('clear', error)
  }
}

export function finalizeNewSessionDraft(
  roomId: string,
  didStart: boolean,
  storage?: DraftStorage
): void {
  if (didStart) {
    clearNewSessionDraft(roomId, storage)
  }
}

export function getSessionAttachmentStats(
  attachments: NewSessionAttachmentLike[]
): NewSessionAttachmentStats {
  return attachments.reduce<NewSessionAttachmentStats>(
    (stats, attachment) => {
      if (attachment.status === 'ready') {
        stats.readyCount += 1
        stats.readyTextBytes += byteLength(attachment.contentText)
      } else {
        stats.rejectedCount += 1
      }
      return stats
    },
    { readyCount: 0, rejectedCount: 0, readyTextBytes: 0 }
  )
}

export function getReadyDebateAttachments(
  attachments: NewSessionAttachmentLike[]
): DebateAttachmentInput[] {
  return attachments
    .filter((attachment) => attachment.status === 'ready')
    .map((attachment) => ({
      originalName: attachment.originalName,
      mimeType: attachment.mimeType ?? null,
      sizeBytes: attachment.sizeBytes,
      contentText: attachment.contentText
    }))
}

function resolveDraftStorage(storage?: DraftStorage): DraftStorage | null {
  if (storage) return storage

  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage
    }
  } catch (error) {
    warnDraftStorageError('resolve', error)
  }

  return null
}

function warnDraftStorageError(action: string, error: unknown): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`Unable to ${action} new session draft`, error)
  }
}
