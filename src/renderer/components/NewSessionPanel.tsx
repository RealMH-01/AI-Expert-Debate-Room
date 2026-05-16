/**
 * NewSessionPanel - 新会议发起面板
 *
 * 用户输入问题并启动模拟辩论。
 * 包含校验提示和启动按钮。
 */

import React, { useState, useCallback } from 'react'
import type { ValidationResult } from '../../shared/types'

interface NewSessionPanelProps {
  roomId: string
  isRunning: boolean
  onStartDebate: (question: string) => void
  validation: ValidationResult | null
}

const NewSessionPanel: React.FC<NewSessionPanelProps> = ({
  roomId,
  isRunning,
  onStartDebate,
  validation
}) => {
  const [question, setQuestion] = useState('')

  const handleStart = useCallback(() => {
    if (question.trim() && !isRunning) {
      onStartDebate(question.trim())
    }
  }, [question, isRunning, onStartDebate])

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

      {/* 启动按钮 */}
      <button
        className="btn btn-primary btn-full"
        onClick={handleStart}
        disabled={!canStart}
      >
        {isRunning ? '辩论进行中...' : '开始模拟辩论'}
      </button>

      {isRunning && (
        <div className="session-running-hint">
          辩论正在进行中，请查看下方聊天记录...
        </div>
      )}
    </div>
  )
}

export default NewSessionPanel
