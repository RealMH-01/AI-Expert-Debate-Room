/**
 * DebatePanel - 辩论面板
 *
 * 整合 NewSessionPanel + TranscriptView + SessionStatusPanel。
 * 管理辩论事件监听和状态。
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { Message, Session, ValidationResult, DebatePhase } from '../../shared/types'
import NewSessionPanel from './NewSessionPanel'
import TranscriptView from './TranscriptView'
import SessionStatusPanel from './SessionStatusPanel'

interface DebatePanelProps {
  roomId: string
}

const DebatePanel: React.FC<DebatePanelProps> = ({ roomId }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [currentPhase, setCurrentPhase] = useState<DebatePhase | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 初始化：校验配置 + 检查运行状态
  useEffect(() => {
    const init = async () => {
      // 校验
      const valRes = await window.api.debateValidate(roomId)
      if (valRes.success && valRes.data) {
        setValidation(valRes.data)
      }

      // 检查是否正在运行
      const runRes = await window.api.debateIsRunning(roomId)
      if (runRes.success) {
        setIsRunning(runRes.data === true)
      }

      // 加载最近的 session（如果有）
      const sessRes = await window.api.sessionGetByRoom(roomId)
      if (sessRes.success && sessRes.data && sessRes.data.length > 0) {
        const latestSession = sessRes.data[0]
        setSession(latestSession)
        setCurrentPhase(latestSession.current_phase as DebatePhase | null)

        // 加载该 session 的消息
        const msgRes = await window.api.messageGetBySession(latestSession.id)
        if (msgRes.success && msgRes.data) {
          setMessages(msgRes.data)
        }

        if (latestSession.status === 'running') {
          setIsRunning(true)
        }
      }
    }

    init()
  }, [roomId])

  // 监听辩论事件
  useEffect(() => {
    const cleanupMessage = window.api.onDebateMessage((msg: Message) => {
      setMessages((prev) => [...prev, msg])
    })

    const cleanupPhase = window.api.onDebatePhaseChange(
      (data: { phase: string; session: Session }) => {
        setCurrentPhase(data.phase as DebatePhase)
        setSession(data.session)
      }
    )

    const cleanupFinished = window.api.onDebateSessionFinished((sess: Session) => {
      setSession(sess)
      setIsRunning(false)
      setCurrentPhase(sess.current_phase as DebatePhase | null)
    })

    const cleanupError = window.api.onDebateError((err: string) => {
      setError(err)
      setIsRunning(false)
    })

    return () => {
      cleanupMessage()
      cleanupPhase()
      cleanupFinished()
      cleanupError()
    }
  }, [])

  // 启动辩论
  const handleStartDebate = useCallback(
    async (question: string) => {
      setError(null)
      setMessages([])
      setSession(null)
      setCurrentPhase(null)

      const res = await window.api.debateStart({ roomId, userQuestion: question })
      if (res.success) {
        setIsRunning(true)
      } else {
        setError(res.error || '启动失败')
      }
    },
    [roomId]
  )

  return (
    <div className="debate-panel">
      {/* 新会议发起 */}
      <NewSessionPanel
        roomId={roomId}
        isRunning={isRunning}
        onStartDebate={handleStartDebate}
        validation={validation}
      />

      {/* 错误提示 */}
      {error && (
        <div className="debate-error-banner">
          ✗ {error}
        </div>
      )}

      {/* 会议状态 */}
      <SessionStatusPanel
        session={session}
        messageCount={messages.length}
        isRunning={isRunning}
      />

      {/* 聊天流 */}
      {(messages.length > 0 || isRunning) && (
        <div className="debate-transcript-container">
          <TranscriptView messages={messages} currentPhase={currentPhase} />
        </div>
      )}
    </div>
  )
}

export default DebatePanel
