/**
 * TranscriptView - 会议聊天流视图
 *
 * 显示辩论过程中的所有消息。
 * 根据 phase 和 speaker_role 显示不同样式。
 * 自动滚动到最新消息。
 */

import React, { useEffect, useRef } from 'react'
import type { Message, DebatePhase } from '../../shared/types'

interface TranscriptViewProps {
  messages: Message[]
  currentPhase: DebatePhase | null
}

/** 阶段显示名称映射 */
const PHASE_LABELS: Record<DebatePhase, string> = {
  moderator_opening: '主理人开场',
  expert_initial: '专家首轮回答',
  debate_round: '辩论轮',
  moderator_round_summary: '主理人轮次总结',
  voting: '匿名互投',
  settlement_pending: 'HP 结算',
  moderator_final_summary: '主理人最终总结'
}

/** 获取消息气泡的 CSS class */
function getMessageClass(msg: Message): string {
  const base = 'transcript-message'
  if (msg.speaker_role === 'system') {
    return `${base} message-system`
  }
  if (msg.speaker_role === 'moderator') {
    return `${base} message-moderator`
  }
  return `${base} message-expert`
}

/** 获取阶段分割线文本 */
function getPhaseDividerText(msg: Message): string {
  if (msg.phase === 'debate_round') {
    return `第 ${msg.round_index} 轮辩论`
  }
  if (msg.phase === 'moderator_round_summary') {
    return `第 ${msg.round_index} 轮总结`
  }
  return PHASE_LABELS[msg.phase as DebatePhase] || msg.phase
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ messages, currentPhase }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="transcript-empty">
        <p className="placeholder-text">辩论消息将在此显示...</p>
      </div>
    )
  }

  // 按阶段分组显示消息
  let lastPhaseKey = ''

  return (
    <div className="transcript-view" ref={scrollRef}>
      {messages.map((msg) => {
        const phaseKey = `${msg.phase}-${msg.round_index}`
        const showDivider = phaseKey !== lastPhaseKey
        lastPhaseKey = phaseKey

        return (
          <React.Fragment key={msg.id}>
            {showDivider && (
              <div className="transcript-phase-divider">
                <span className="divider-label">{getPhaseDividerText(msg)}</span>
              </div>
            )}
            <div className={getMessageClass(msg)}>
              <div className="message-header">
                <span className="message-speaker">
                  {msg.speaker_role === 'moderator' ? '🎯' : msg.speaker_role === 'system' ? '⚙️' : '💡'} {msg.speaker_name}
                </span>
                <span className="message-role-badge">
                  {msg.speaker_role === 'moderator' ? '主理人' : msg.speaker_role === 'system' ? '系统' : '专家'}
                </span>
              </div>
              <div className="message-content">
                {renderMarkdownLite(msg.content)}
              </div>
            </div>
          </React.Fragment>
        )
      })}

      {/* 当前阶段指示器 */}
      {currentPhase && (
        <div className="transcript-phase-indicator">
          <span className="phase-dot" />
          当前阶段: {PHASE_LABELS[currentPhase] || currentPhase}
        </div>
      )}
    </div>
  )
}

/**
 * 简化的 Markdown 渲染
 * 只处理标题、加粗、列表
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
  // Simple bold handling
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
