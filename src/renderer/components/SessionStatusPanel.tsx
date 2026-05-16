/**
 * SessionStatusPanel - 会议状态面板
 *
 * 显示当前会议的状态信息。
 * 包含状态、阶段进度、消息数量等。
 */

import React from 'react'
import type { Session, DebatePhase } from '../../shared/types'

interface SessionStatusPanelProps {
  session: Session | null
  messageCount: number
  isRunning: boolean
}

/** 阶段进度映射 */
const PHASE_PROGRESS: Record<DebatePhase, number> = {
  moderator_opening: 10,
  expert_initial: 25,
  debate_round: 60,
  moderator_round_summary: 70,
  moderator_final_summary: 95
}

/** 状态显示配置 */
const STATUS_CONFIG = {
  preparing: { label: '准备中', className: 'status-preparing' },
  running: { label: '运行中', className: 'status-running' },
  finished: { label: '已完成', className: 'status-finished' },
  failed: { label: '失败', className: 'status-failed' }
} as const

const SessionStatusPanel: React.FC<SessionStatusPanelProps> = ({
  session,
  messageCount,
  isRunning
}) => {
  if (!session) {
    return null
  }

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.preparing
  const phase = session.current_phase as DebatePhase | null
  const progress = phase ? PHASE_PROGRESS[phase] || 0 : 0

  return (
    <div className="session-status-panel">
      <div className="session-status-header">
        <span className={`session-status-badge ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
        <span className="session-message-count">{messageCount} 条消息</span>
      </div>

      {/* 进度条 */}
      {isRunning && (
        <div className="session-progress-bar">
          <div
            className="session-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 阶段信息 */}
      {phase && (
        <div className="session-phase-info">
          当前阶段: {getPhaseLabel(phase)}
        </div>
      )}

      {/* 完成信息 */}
      {session.status === 'finished' && (
        <div className="session-finished-info">
          会议已完成。所有消息已保存到数据库。
        </div>
      )}

      {/* 失败信息 */}
      {session.status === 'failed' && session.final_summary && (
        <div className="session-error-info">
          {session.final_summary}
        </div>
      )}
    </div>
  )
}

function getPhaseLabel(phase: DebatePhase): string {
  const labels: Record<DebatePhase, string> = {
    moderator_opening: '主理人开场',
    expert_initial: '专家首轮回答',
    debate_round: '辩论轮',
    moderator_round_summary: '主理人轮次总结',
    moderator_final_summary: '主理人最终总结'
  }
  return labels[phase] || phase
}

export default SessionStatusPanel
