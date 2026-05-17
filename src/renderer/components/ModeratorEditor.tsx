/**
 * 主理人编辑器
 *
 * 规则：
 * - 用户选择 provider 和 model
 * - 如果模型 supportsThinking = true，则 thinking_enabled 默认 true
 * - 不能强制指定默认模型
 * - 一个 Room 只有一个主理人
 */

import React, { useState, useEffect } from 'react'
import type { Agent } from '../../shared/types'
import { PROVIDERS, findModel } from '../../shared/modelCatalog'

interface ModeratorEditorProps {
  moderator: Agent | null
  onUpsert: (data: Partial<Agent>) => void
}

const ModeratorEditor: React.FC<ModeratorEditorProps> = ({ moderator, onUpsert }) => {
  const [name, setName] = useState(moderator?.name ?? '主理人')
  const [provider, setProvider] = useState(moderator?.provider ?? '')
  const [model, setModel] = useState(moderator?.model ?? '')
  const [persona, setPersona] = useState(moderator?.persona ?? '')
  const [stance, setStance] = useState(moderator?.stance ?? '')
  const [memory, setMemory] = useState(moderator?.memory ?? '')
  const [thinkingEnabled, setThinkingEnabled] = useState(moderator?.thinking_enabled ?? 0)
  const [supportsThinking, setSupportsThinking] = useState(moderator?.supports_thinking ?? 0)

  useEffect(() => {
    setName(moderator?.name ?? '主理人')
    setProvider(moderator?.provider ?? '')
    setModel(moderator?.model ?? '')
    setPersona(moderator?.persona ?? '')
    setStance(moderator?.stance ?? '')
    setMemory(moderator?.memory ?? '')
    setThinkingEnabled(moderator?.thinking_enabled ?? 0)
    setSupportsThinking(moderator?.supports_thinking ?? 0)
  }, [moderator])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    setModel('') // 切换 provider 时重置 model
    setSupportsThinking(0)
    setThinkingEnabled(0) // 重置 thinking —— 直到选择了支持 thinking 的模型
  }

  const handleModelChange = (newModel: string) => {
    setModel(newModel)
    if (provider && newModel) {
      const modelInfo = findModel(provider, newModel)
      if (modelInfo) {
        const st = modelInfo.supportsThinking ? 1 : 0
        setSupportsThinking(st)
        // 如果模型支持 thinking，则默认开启；不支持则关闭
        setThinkingEnabled(st)
      }
    } else {
      // 清空模型选择时重置 thinking
      setSupportsThinking(0)
      setThinkingEnabled(0)
    }
  }

  const handleSave = () => {
    onUpsert({
      name: name.trim() || '主理人',
      provider: provider || null,
      model: model || null,
      persona: persona || null,
      stance: stance || null,
      memory: memory || null,
      supports_thinking: supportsThinking,
      thinking_enabled: thinkingEnabled
    })
  }

  const selectedProviderModels = provider
    ? PROVIDERS.find((p) => p.id === provider)?.models ?? []
    : []

  return (
    <section className="config-section">
      <h3 className="section-title">主理人配置</h3>

      <div className="form-group">
        <label className="form-label">名称</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="主理人名称"
        />
      </div>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">Provider</label>
          <select
            className="form-select"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            <option value="">-- 未选择 --</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group flex-1">
          <label className="form-label">Model</label>
          <select
            className="form-select"
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={!provider}
          >
            <option value="">-- 未选择 --</option>
            {selectedProviderModels.map((m) => (
              <option key={m.model} value={m.model}>
                {m.displayName} ({m.model}) [{m.status ?? 'active'}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {provider && model && (() => {
        const selected = findModel(provider, model)
        if (!selected) return null
        const badges = [
          selected.supportsThinking ? 'thinking' : '',
          selected.supportsJson ? 'json' : '',
          selected.supportsStreaming ? 'streaming' : '',
          selected.supportsToolCalling ? 'tools' : '',
          selected.supportsVision ? 'vision' : ''
        ].filter(Boolean)
        return (
          <div className="form-hint">
            Status: {selected.status ?? 'active'} {badges.length > 0 ? `· ${badges.join(' / ')}` : ''}
            {selected.notes ? ` · ${selected.notes}` : ''}
          </div>
        )
      })()}

      {!provider && (
        <div className="form-hint warning">未选择模型 — 会议室无法启动</div>
      )}

      {supportsThinking === 1 && (
        <div className="form-group">
          <label className="form-label-inline">
            <input
              type="checkbox"
              checked={thinkingEnabled === 1}
              onChange={(e) => setThinkingEnabled(e.target.checked ? 1 : 0)}
            />
            <span>启用深度思考 (Thinking)</span>
          </label>
          <div className="form-hint">该模型支持深度思考，默认开启</div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">人设 (Persona)</label>
        <textarea
          className="form-textarea"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="主理人的角色设定和行为指引"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">规则 / 立场</label>
        <textarea
          className="form-textarea"
          value={stance}
          onChange={(e) => setStance(e.target.value)}
          placeholder="主理人的控场规则或特殊指令"
          rows={2}
        />
      </div>

      <div className="form-group">
        <label className="form-label">私有记忆</label>
        <textarea
          className="form-textarea"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder="主理人的背景知识或记忆"
          rows={2}
        />
      </div>

      <button className="btn btn-primary" onClick={handleSave}>
        保存主理人配置
      </button>
    </section>
  )
}

export default ModeratorEditor
