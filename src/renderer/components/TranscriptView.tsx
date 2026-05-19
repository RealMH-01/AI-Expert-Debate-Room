/**
 * TranscriptView - 会议聊天流视图
 *
 * 显示辩论过程中的所有消息，并增强长会话下的可读性。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, DebatePhase } from '../../shared/types'
import {
  formatCurrentTranscriptPhaseTitle,
  formatTranscriptPhaseTitle,
  getSpeakerColor,
  getStructuredJsonCounts,
  shouldCollapseTranscriptMessage
} from '../utils/transcriptDisplay'

interface TranscriptViewProps {
  messages: Message[]
  currentPhase: DebatePhase | null
}

const SCROLL_BOTTOM_THRESHOLD_PX = 100
const COLLAPSED_PREVIEW_CHARS = 720
const COLLAPSED_PREVIEW_LINES = 8

function isExpertMessage(message: Message): boolean {
  return message.speaker_role !== 'moderator' && message.speaker_role !== 'system'
}

/** 获取消息气泡的 CSS class */
function getMessageClass(message: Message): string {
  const classes = ['transcript-message']

  if (message.speaker_role === 'system') {
    classes.push('message-system')
    if (isSystemAlertMessage(message)) {
      classes.push('message-system-alert')
    }
  } else if (message.speaker_role === 'moderator') {
    classes.push('message-moderator')
  } else {
    classes.push('message-expert')
  }

  return classes.join(' ')
}

function isSystemAlertMessage(message: Message): boolean {
  const content = message.content.toLowerCase()
  return (
    content.includes('error') ||
    content.includes('failed') ||
    content.includes('abort') ||
    content.includes('错误') ||
    content.includes('失败') ||
    content.includes('中止') ||
    content.includes('停止')
  )
}

function getSpeakerMarker(message: Message): string {
  if (message.speaker_role === 'moderator') {
    return '主'
  }

  if (message.speaker_role === 'system') {
    return '系'
  }

  return (message.speaker_name || '?').trim().slice(0, 1).toUpperCase() || '?'
}

function getRoleLabel(message: Message): string {
  if (message.speaker_role === 'moderator') {
    return '主理人'
  }

  if (message.speaker_role === 'system') {
    return '系统'
  }

  return '专家'
}

function getCollapsedContent(content: string): string {
  const lines = content.split('\n')
  if (lines.length > COLLAPSED_PREVIEW_LINES) {
    return `${lines.slice(0, COLLAPSED_PREVIEW_LINES).join('\n').trimEnd()}\n...`
  }

  return `${content.slice(0, COLLAPSED_PREVIEW_CHARS).trimEnd()}\n...`
}

function isNearScrollBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ messages, currentPhase }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set())
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showNewMessageButton, setShowNewMessageButton] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      const element = scrollRef.current
      if (!element) {
        return
      }

      element.scrollTo({ top: element.scrollHeight, behavior })
      setIsNearBottom(true)
      setShowNewMessageButton(false)
    })
  }, [])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }

    const nextIsNearBottom = isNearScrollBottom(element)
    setIsNearBottom(nextIsNearBottom)
    if (nextIsNearBottom) {
      setShowNewMessageButton(false)
    }
  }, [])

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current
    const hasNewMessages = messages.length > previousMessageCount
    previousMessageCountRef.current = messages.length

    if (messages.length === 0) {
      setShowNewMessageButton(false)
      setIsNearBottom(true)
      return
    }

    if (!hasNewMessages) {
      return
    }

    if (previousMessageCount === 0 || isNearBottom) {
      scrollToBottom('auto')
      return
    }

    setShowNewMessageButton(true)
  }, [messages.length, isNearBottom, scrollToBottom])

  const toggleExpanded = useCallback((messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }, [])

  if (messages.length === 0) {
    return (
      <div className="transcript-empty">
        <p className="placeholder-text">辩论消息将在这里显示...</p>
      </div>
    )
  }

  let lastPhaseKey = ''

  return (
    <div className="transcript-view-wrap">
      <div className="transcript-view" ref={scrollRef} onScroll={handleScroll}>
        {messages.map((message) => {
          const phaseKey = `${message.phase}-${message.round_index}`
          const showDivider = phaseKey !== lastPhaseKey
          lastPhaseKey = phaseKey

          const expertMessage = isExpertMessage(message)
          const messageStyle = expertMessage
            ? ({ '--speaker-color': getSpeakerColor(message) } as React.CSSProperties)
            : undefined
          const shouldCollapse = shouldCollapseTranscriptMessage(message)
          const isExpanded = expandedMessageIds.has(message.id)
          const displayContent = shouldCollapse && !isExpanded
            ? getCollapsedContent(message.content)
            : message.content
          const structuredCounts = expertMessage
            ? getStructuredJsonCounts(message.structured_json)
            : null

          return (
            <React.Fragment key={message.id}>
              {showDivider && (
                <div className="transcript-phase-divider">
                  <span className="divider-label">
                    {formatTranscriptPhaseTitle(message.phase, message.round_index)}
                  </span>
                </div>
              )}
              <div className={getMessageClass(message)} style={messageStyle}>
                <div className="message-header">
                  <span className="message-speaker-mark" aria-hidden="true">
                    {getSpeakerMarker(message)}
                  </span>
                  <span className="message-speaker">
                    {message.speaker_name || '未知发言人'}
                  </span>
                  <span className="message-role-badge">
                    {getRoleLabel(message)}
                  </span>
                  {structuredCounts && (
                    <span className="message-structured-counts">
                      主张 {structuredCounts.claims} · 攻击 {structuredCounts.attacks}
                    </span>
                  )}
                </div>
                <div className="message-content">
                  {renderMarkdownLite(displayContent)}
                </div>
                {shouldCollapse && (
                  <button
                    type="button"
                    className="message-collapse-toggle"
                    onClick={() => toggleExpanded(message.id)}
                  >
                    {isExpanded ? '收起' : '展开全文'}
                  </button>
                )}
              </div>
            </React.Fragment>
          )
        })}

        {currentPhase && (
          <div className="transcript-phase-indicator">
            <span className="phase-dot" />
            当前阶段: {formatCurrentTranscriptPhaseTitle(currentPhase)}
          </div>
        )}
      </div>

      {showNewMessageButton && (
        <button
          type="button"
          className="transcript-new-message-button"
          onClick={() => scrollToBottom('smooth')}
        >
          有新消息 ↓
        </button>
      )}
    </div>
  )
}

/**
 * 简化的 Markdown 渲染
 * 只处理标题、加粗、列表和分割线。
 */
function renderMarkdownLite(content: string): React.ReactNode {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('# ')) {
      elements.push(
        <h3 key={i} className="md-h1">
          {line.slice(2)}
        </h3>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h4 key={i} className="md-h2">
          {line.slice(3)}
        </h4>
      )
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={i} className="md-li">
          {renderInline(line.slice(2))}
        </li>
      )
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={i} className="md-li md-ol">
          {renderInline(line.replace(/^\d+\.\s/, ''))}
        </li>
      )
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="md-hr" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="md-spacer" />)
    } else {
      elements.push(
        <p key={i} className="md-p">
          {renderInline(line)}
        </p>
      )
    }
  }

  return <div className="md-content">{elements}</div>
}

/** 行内格式化：加粗 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/)
  if (parts.length === 1) return text

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export default TranscriptView
