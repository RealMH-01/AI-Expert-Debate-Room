/**
 * DebatePanel - 辩论面板
 *
 * 整合 NewSessionPanel + TranscriptView + SessionStatusPanel
 * + VotingResultPanel + SettlementPreview + HellPoolPanel。
 * 管理辩论事件监听和状态。
 */

import React, { useState, useEffect, useCallback } from 'react'
import type {
  Message,
  Session,
  ValidationResult,
  DebatePhase,
  SettlementResultDisplay,
  Agent,
  DebateAttachmentInput
} from '../../shared/types'
import NewSessionPanel from './NewSessionPanel'
import TranscriptView from './TranscriptView'
import SessionStatusPanel from './SessionStatusPanel'
import VotingResultPanel from './VotingResultPanel'
import SettlementPreview from './SettlementPreview'
import HellPoolPanel from './HellPoolPanel'

interface DebatePanelProps {
  roomId: string
}

const DebatePanel: React.FC<DebatePanelProps> = ({ roomId }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [currentPhase, setCurrentPhase] = useState<DebatePhase | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isAborting, setIsAborting] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 投票和结算状态
  const [settlement, setSettlement] = useState<SettlementResultDisplay | null>(null)
  const [hellPoolExperts, setHellPoolExperts] = useState<Agent[]>([])
  const [aliveExperts, setAliveExperts] = useState<Agent[]>([])

  // 加载专家状态
  const loadExpertStatus = useCallback(async () => {
    const aliveRes = await window.api.agentGetAliveExperts(roomId)
    if (aliveRes.success && aliveRes.data) {
      setAliveExperts(aliveRes.data)
    }
    const hellRes = await window.api.agentGetHellPoolExperts(roomId)
    if (hellRes.success && hellRes.data) {
      setHellPoolExperts(hellRes.data)
    }
  }, [roomId])

  const refreshRoomState = useCallback(async () => {
    const valRes = await window.api.debateValidate(roomId)
    if (valRes.success && valRes.data) {
      setValidation(valRes.data)
    }

    const runRes = await window.api.debateIsRunning(roomId)
    const isEngineRunning = runRes.success && runRes.data === true

    const sessRes = await window.api.sessionGetByRoom(roomId)
    let latestSession: Session | null = null
    if (sessRes.success && sessRes.data && sessRes.data.length > 0) {
      latestSession = sessRes.data[0]
      setSession(latestSession)
      setCurrentPhase(latestSession.current_phase as DebatePhase | null)

      const msgRes = await window.api.messageGetBySession(latestSession.id)
      if (msgRes.success && msgRes.data) {
        setMessages(msgRes.data)
      }

      const pendingRes = await window.api.settlementGetPending(latestSession.id)
      if (pendingRes.success && pendingRes.data) {
        setSettlement(pendingRes.data as SettlementResultDisplay)
      } else {
        setSettlement(null)
      }
    } else {
      setSession(null)
      setCurrentPhase(null)
      setMessages([])
      setSettlement(null)
    }

    setIsRunning(isEngineRunning || latestSession?.status === 'running')
    await loadExpertStatus()
  }, [loadExpertStatus, roomId])

  // 初始化：校验配置 + 检查运行状态
  useEffect(() => {
    void refreshRoomState()
  }, [refreshRoomState])

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
      setIsAborting(false)
      setCurrentPhase(sess.current_phase as DebatePhase | null)
      // 刷新专家状态
      loadExpertStatus()
    })

    const cleanupError = window.api.onDebateError((err: string) => {
      setError(err)
      setIsRunning(false)
      setIsAborting(false)
    })

    const cleanupSettlement = window.api.onSettlementReady(
      (data: SettlementResultDisplay) => {
        setSettlement(data)
      }
    )

    return () => {
      cleanupMessage()
      cleanupPhase()
      cleanupFinished()
      cleanupError()
      cleanupSettlement()
    }
  }, [loadExpertStatus])

  // 启动辩论
  const handleStartDebate = useCallback(
    async (question: string, attachments?: DebateAttachmentInput[]) => {
      setError(null)
      setNotice(null)
      setIsAborting(false)
      setMessages([])
      setSession(null)
      setCurrentPhase(null)
      setSettlement(null)

      try {
        const res = await window.api.debateStart({ roomId, userQuestion: question, attachments })
        if (res.success) {
          setIsRunning(true)
          return true
        }

        setError(res.error || '启动失败')
        return false
      } catch (error) {
        setError(error instanceof Error ? error.message : '启动失败')
        return false
      }
    },
    [roomId]
  )

  const handleAbortDebate = useCallback(async () => {
    setError(null)
    setNotice(null)
    setIsAborting(true)
    try {
      const res = await window.api.debateAbort({ roomId, sessionId: session?.id })
      if (res.success) {
        setIsRunning(false)
        setSettlement(null)
        if (res.data?.repaired) {
          setNotice('已清理卡住的运行状态，可以重新开始讨论。')
        } else if (res.data?.noop) {
          setNotice('当前没有正在运行的辩论，可以重新开始讨论。')
        }
      } else {
        setError(res.error || '停止辩论失败')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '停止辩论失败')
    } finally {
      await refreshRoomState()
      setIsAborting(false)
    }
  }, [roomId, session?.id, refreshRoomState])

  // 应用结算
  const handleApplySettlement = useCallback(async () => {
    if (!session) return
    const res = await window.api.settlementApply(session.id)
    if (res.success) {
      setSettlement((prev) => (prev ? { ...prev, status: 'applied' } : null))
      loadExpertStatus()
    } else {
      setError(res.error || '应用结算失败')
    }
  }, [session, loadExpertStatus])

  // 否决结算
  const handleVetoSettlement = useCallback(async () => {
    if (!session) return
    const res = await window.api.settlementVeto(session.id)
    if (res.success) {
      setSettlement((prev) => (prev ? { ...prev, status: 'vetoed' } : null))
    } else {
      setError(res.error || '否决结算失败')
    }
  }, [session])

  return (
    <div className="debate-panel">
      {/* 新会议发起 */}
      <NewSessionPanel
        roomId={roomId}
        isRunning={isRunning}
        isAborting={isAborting}
        onStartDebate={handleStartDebate}
        onAbortDebate={handleAbortDebate}
        validation={validation}
      />

      {/* 错误提示 */}
      {error && (
        <div className="debate-error-banner">
          ✗ {error}
        </div>
      )}
      {notice && (
        <div className="debate-info-banner">
          {notice}
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

      {/* 投票结果 */}
      {settlement && settlement.rankings && (
        <VotingResultPanel
          rankings={settlement.rankings}
          visible={currentPhase === 'settlement_pending' || currentPhase === 'moderator_final_summary' || settlement.status !== 'pending'}
        />
      )}

      {/* HP 结算预览 */}
      <SettlementPreview
        settlement={settlement}
        onApply={handleApplySettlement}
        onVeto={handleVetoSettlement}
        visible={!!settlement}
      />

      {/* Hell Pool 状态面板 */}
      {(hellPoolExperts.length > 0 || aliveExperts.length > 0) && (
        <HellPoolPanel
          hellPoolExperts={hellPoolExperts}
          aliveExperts={aliveExperts}
        />
      )}
    </div>
  )
}

export default DebatePanel
