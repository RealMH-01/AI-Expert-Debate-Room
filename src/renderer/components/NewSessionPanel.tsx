/**
 * NewSessionPanel - 新会议发起面板
 *
 * 用户输入问题并启动模拟辩论。
 * 包含校验提示、公共素材和启动按钮。
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { DebateAttachmentInput, ValidationResult } from '../../shared/types'
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_TEXT_BYTES,
  byteLength,
  isSupportedAttachmentName,
  validateDebateAttachments
} from '../../shared/attachments'
import {
  estimateRoughTokens,
  finalizeNewSessionDraft,
  getReadyDebateAttachments,
  getSessionAttachmentStats,
  readNewSessionDraft,
  writeNewSessionDraft
} from '../utils/newSessionInput'

interface NewSessionPanelProps {
  roomId: string
  isRunning: boolean
  isAborting?: boolean
  onStartDebate: (question: string, attachments?: DebateAttachmentInput[]) => Promise<boolean> | boolean
  onAbortDebate?: () => void
  validation: ValidationResult | null
}

type AttachmentCardStatus = 'ready' | 'unsupported' | 'too_large' | 'read_error'

interface LocalAttachmentCard {
  id: string
  originalName: string
  mimeType?: string | null
  sizeBytes: number
  charCount: number
  contentText: string
  status: AttachmentCardStatus
  message: string
}

const NewSessionPanel: React.FC<NewSessionPanelProps> = ({
  roomId,
  isRunning,
  isAborting = false,
  onStartDebate,
  onAbortDebate,
  validation
}) => {
  const [question, setQuestion] = useState(() => readNewSessionDraft(roomId))
  const [attachments, setAttachments] = useState<LocalAttachmentCard[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const skipNextDraftSaveRef = useRef(false)

  useEffect(() => {
    skipNextDraftSaveRef.current = true
    setQuestion(readNewSessionDraft(roomId))
    setAttachments([])
    setStartError(null)
    setIsDragging(false)
    setIsStarting(false)
  }, [roomId])

  useEffect(() => {
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false
      return
    }

    writeNewSessionDraft(roomId, question)
  }, [roomId, question])

  const attachmentStats = useMemo(() => getSessionAttachmentStats(attachments), [attachments])
  const questionCharCount = question.length
  const roughTokenCount = estimateRoughTokens(question)
  const inputDisabled = isRunning || isStarting
  const canStart =
    validation?.valid === true &&
    question.trim().length > 0 &&
    !isRunning &&
    !isAborting

  const handleStart = useCallback(async () => {
    if (!canStart || isStarting) return

    setIsStarting(true)
    setStartError(null)

    const readyAttachments = getReadyDebateAttachments(attachments)
    try {
      const didStart = await onStartDebate(
        question.trim(),
        readyAttachments.length > 0 ? readyAttachments : undefined
      )
      finalizeNewSessionDraft(roomId, didStart)

      if (didStart) {
        setQuestion('')
        setAttachments([])
      } else {
        setStartError('启动失败，请检查错误提示后重试。')
      }
    } catch (error) {
      setStartError(error instanceof Error ? error.message : '启动失败，请稍后重试。')
    } finally {
      setIsStarting(false)
    }
  }, [attachments, canStart, isStarting, onStartDebate, question, roomId])

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    const newCards: LocalAttachmentCard[] = []
    let totalTextBytes = attachments
      .filter((attachment) => attachment.status === 'ready')
      .reduce((sum, attachment) => sum + byteLength(attachment.contentText), 0)

    for (const file of files) {
      const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`

      if (!isSupportedAttachmentName(file.name)) {
        newCards.push(createRejectedCard(file, id, 'unsupported', '不支持，当前仅支持 .txt/.md/.markdown/.json/.csv'))
        continue
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        newCards.push(createRejectedCard(file, id, 'too_large', '过大，单个文件最大 200KB'))
        continue
      }

      try {
        const contentText = await file.text()
        const nextTotal = totalTextBytes + byteLength(contentText)
        if (nextTotal > MAX_TOTAL_ATTACHMENT_TEXT_BYTES) {
          newCards.push({
            ...createRejectedCard(file, id, 'too_large', '过大，公共素材总文本最大 300KB'),
            charCount: contentText.length
          })
          continue
        }

        const validation = validateDebateAttachments([
          {
            originalName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
            contentText
          }
        ])
        if (!validation.valid) {
          newCards.push(createRejectedCard(file, id, 'read_error', validation.errors.join('；')))
          continue
        }

        totalTextBytes = nextTotal
        newCards.push({
          id,
          originalName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          charCount: contentText.length,
          contentText,
          status: 'ready',
          message: '已读取'
        })
      } catch {
        newCards.push(createRejectedCard(file, id, 'read_error', '读取失败'))
      }
    }

    setAttachments((prev) => [...prev, ...newCards])
  }, [attachments])

  const handleChooseFiles = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        void addFiles(event.target.files)
      }
      event.target.value = ''
    },
    [addFiles]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (!inputDisabled && event.dataTransfer.files.length > 0) {
        void addFiles(event.dataTransfer.files)
      }
    },
    [addFiles, inputDisabled]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && event.ctrlKey && canStart) {
        event.preventDefault()
        void handleStart()
      }
    },
    [canStart, handleStart]
  )

  return (
    <div className="config-section new-session-panel">
      <div className="section-title">开始新讨论</div>

      {validation && !validation.valid && (
        <div className="session-validation-errors">
          {validation.errors.map((err, i) => (
            <div key={i} className="validation-item error">
              ✗ {err}
            </div>
          ))}
        </div>
      )}
      {validation && validation.warnings.length > 0 && (
        <div className="session-validation-warnings">
          {validation.warnings.map((warn, i) => (
            <div key={i} className="validation-item warning">
              ⚠ {warn}
            </div>
          ))}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">讨论问题</label>
        <textarea
          className="form-textarea new-session-question"
          placeholder="请输入要讨论的问题，例如：请根据我上传的人物设定和第三章草稿，分析女主在这一章里的动机是否成立，节奏是否拖沓，以及哪些桥段需要重写。"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={8}
          disabled={inputDisabled}
        />
        <div className="session-input-stats">
          <span>问题：{questionCharCount} 字符 · 约 {roughTokenCount} tokens</span>
          <span>
            公共素材：{attachmentStats.readyCount} 个文件 · {formatBytes(attachmentStats.readyTextBytes)} 文本
            {attachmentStats.rejectedCount > 0 ? ` · ${attachmentStats.rejectedCount} 个已拒绝` : ''}
          </span>
        </div>
        <span className="form-hint">Ctrl+Enter 快速启动，Enter 正常换行</span>
      </div>

      <div className="form-group">
        <div className="attachment-label-row">
          <label className="form-label">公共素材：所有专家和主持人都能看到</label>
          {attachments.length > 0 && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => setAttachments([])}
              disabled={inputDisabled}
            >
              清空素材
            </button>
          )}
        </div>
        <div className="attachment-limit-hint">
          支持 .txt/.md/.markdown/.json/.csv · 单文件最大 200KB · 总文本最大 300KB ·
          已就绪 {attachmentStats.readyCount} 个，已拒绝 {attachmentStats.rejectedCount} 个
        </div>
        <div
          className={`attachment-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            if (!inputDisabled) setIsDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!inputDisabled) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="attachment-file-input"
            multiple
            accept=".txt,.md,.markdown,.json,.csv"
            onChange={handleFileInputChange}
            disabled={inputDisabled}
          />
          <button
            type="button"
            className="btn btn-small"
            onClick={handleChooseFiles}
            disabled={inputDisabled}
          >
            选择文本文件
          </button>
          <span className="attachment-drop-hint">或拖拽到这里</span>
        </div>

        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`attachment-card status-${attachment.status}`}>
                <div className="attachment-card-main">
                  <div className="attachment-name">{attachment.originalName}</div>
                  <div className="attachment-meta">
                    {formatBytes(attachment.sizeBytes)} · {attachment.charCount} 字符 · {formatAttachmentStatus(attachment.status)}
                  </div>
                  <div className="attachment-message">{attachment.message}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => removeAttachment(attachment.id)}
                  disabled={inputDisabled}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="session-start-actions">
        <button
          className="btn btn-primary btn-full"
          onClick={() => void handleStart()}
          disabled={!canStart || isStarting}
        >
          {isStarting ? '正在启动...' : isRunning ? '辩论进行中...' : '开始模拟辩论'}
        </button>
        {startError && (
          <div className="session-start-error">{startError}</div>
        )}
      </div>

      {isRunning && onAbortDebate && (
        <button
          className="btn btn-secondary btn-full"
          onClick={onAbortDebate}
          disabled={isAborting}
        >
          {isAborting ? '正在停止...' : '停止辩论'}
        </button>
      )}

      {isRunning && (
        <div className="session-running-hint">
          辩论正在进行中，请查看下方聊天记录...
        </div>
      )}
    </div>
  )
}

export default NewSessionPanel

function createRejectedCard(
  file: File,
  id: string,
  status: Exclude<AttachmentCardStatus, 'ready'>,
  message: string
): LocalAttachmentCard {
  return {
    id,
    originalName: file.name,
    mimeType: file.type || null,
    sizeBytes: file.size,
    charCount: 0,
    contentText: '',
    status,
    message
  }
}

function formatAttachmentStatus(status: AttachmentCardStatus): string {
  const map: Record<AttachmentCardStatus, string> = {
    ready: '已读取',
    unsupported: '不支持',
    too_large: '过大',
    read_error: '读取失败'
  }
  return map[status]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
