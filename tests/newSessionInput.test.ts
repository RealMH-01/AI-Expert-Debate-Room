import { describe, expect, it } from 'vitest'

import {
  clearNewSessionDraft,
  estimateRoughTokens,
  finalizeNewSessionDraft,
  getNewSessionDraftKey,
  getReadyDebateAttachments,
  getSessionAttachmentStats,
  readNewSessionDraft,
  writeNewSessionDraft
} from '../src/renderer/utils/newSessionInput'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const readyAttachment = {
  originalName: 'outline.md',
  mimeType: 'text/markdown',
  sizeBytes: 12,
  contentText: '# Outline',
  status: 'ready' as const
}

const rejectedAttachment = {
  originalName: 'draft.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  contentText: '',
  status: 'unsupported' as const
}

describe('new session input helpers', () => {
  it('estimates rough tokens from character count', () => {
    expect(estimateRoughTokens('')).toBe(0)
    expect(estimateRoughTokens('小说动机是否成立')).toBe(4)
    expect(estimateRoughTokens('a'.repeat(101))).toBe(51)
  })

  it('keeps draft keys isolated by room', () => {
    const storage = new MemoryStorage()

    writeNewSessionDraft('room-a', '第一间会议草稿', storage)
    writeNewSessionDraft('room-b', '第二间会议草稿', storage)

    expect(getNewSessionDraftKey('room-a')).toBe('new-session-draft:room-a')
    expect(readNewSessionDraft('room-a', storage)).toBe('第一间会议草稿')
    expect(readNewSessionDraft('room-b', storage)).toBe('第二间会议草稿')
  })

  it('clears a draft after successful start and preserves it after failed start', () => {
    const storage = new MemoryStorage()

    writeNewSessionDraft('room-a', '保留或清理的草稿', storage)
    finalizeNewSessionDraft('room-a', false, storage)
    expect(readNewSessionDraft('room-a', storage)).toBe('保留或清理的草稿')

    finalizeNewSessionDraft('room-a', true, storage)
    expect(readNewSessionDraft('room-a', storage)).toBe('')
  })

  it('allows explicit draft clearing', () => {
    const storage = new MemoryStorage()

    writeNewSessionDraft('room-a', '草稿', storage)
    clearNewSessionDraft('room-a', storage)

    expect(readNewSessionDraft('room-a', storage)).toBe('')
  })

  it('summarizes ready and rejected attachments without counting rejected text', () => {
    const stats = getSessionAttachmentStats([
      readyAttachment,
      { ...readyAttachment, originalName: 'notes.txt', contentText: '人物设定' },
      rejectedAttachment
    ])

    expect(stats.readyCount).toBe(2)
    expect(stats.rejectedCount).toBe(1)
    expect(stats.readyTextBytes).toBe(21)
  })

  it('returns only ready attachments for debate start input', () => {
    const inputs = getReadyDebateAttachments([
      readyAttachment,
      rejectedAttachment
    ])

    expect(inputs).toEqual([
      {
        originalName: 'outline.md',
        mimeType: 'text/markdown',
        sizeBytes: 12,
        contentText: '# Outline'
      }
    ])
  })
})
