/**
 * NewSessionPanel - 新会议发起面板
 *
 * 用户输入问题并启动模拟辩论。
 * 包含校验提示和启动按钮。
 */

import React, { useState, useCallback, useRef } from 'react'
import type { DebateAttachmentInput, ValidationResult } from '../../shared/types'
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_TEXT_BYTES,
  byteLength,
  isSupportedAttachmentName,
  validateDebateAttachments
} from '../../shared/attachments'

interface NewSessionPanelProps {
  roomId: string
  isRunning: boolean
  isAborting?: boolean
  onStartDebate: (question: string, attachments?: DebateAttachmentInput[]) => void
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
  const [question, setQuestion] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachmentCard[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleStart = useCallback(() => {
    if (question.trim() && !isRunning) {
      const readyAttachments = attachments
        .filter((attachment) => attachment.status === 'ready')
        .map((attachment) => ({
          originalName: attachment.originalName,
          mimeType: attachment.mimeType ?? null,
          sizeBytes: attachment.sizeBytes,
          contentText: attachment.contentText
        }))
      onStartDebate(question.trim(), readyAttachments.length > 0 ? readyAttachments : undefined)
    }
  }, [attachments, question, isRunning, onStartDebate])

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
      if (!isRunning && event.dataTransfer.files.length > 0) {
        void addFiles(event.dataTransfer.files)
      }
    },
    [addFiles, isRunning]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        handleStart()
      }
    },
    [handleStart]
  )

  const canStart = validation?.valid && question.trim().length > 0 && !isRunning

  return (
    <div className="config-section new-session-panel">
      <div className="section-title">开始新讨论</div>

      {/* 校验状态提示 */}
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

      {/* 问题输入 */}
      <div className="form-group">
        <label className="form-label">讨论问题</label>
        <textarea
          className="form-textarea"
          placeholder="请输入要讨论的问题，例如：如何设计一个高可用的分布式系统？"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={isRunning}
        />
        <span className="form-hint">Ctrl+Enter 快速启动</span>
      </div>

      {/* 公共素材 */}
      <div className="form-group">
        <label className="form-label">公共素材：所有专家和主理人都能看到</label>
        <div
          className={`attachment-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
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
            disabled={isRunning}
          />
          <button
            type="button"
            className="btn btn-small"
            onClick={handleChooseFiles}
            disabled={isRunning}
          >
            选择文本文件
          </button>
          <span className="attachment-drop-hint">或拖拽到这里，仅支持 .txt/.md/.markdown/.json/.csv</span>
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
                  disabled={isRunning}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 启动按钮 */}
      <button
        className="btn btn-primary btn-full"
        onClick={handleStart}
        disabled={!canStart}
      >
        {isRunning ? '辩论进行中...' : '开始模拟辩论'}
      </button>

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
