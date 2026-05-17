/**
 * 单个专家编辑器
 *
 * 展开后显示专家的所有可编辑字段。
 */

import React, { useState, useEffect } from 'react'
import type { Agent } from '../../shared/types'
import { PROVIDERS, findModel } from '../../shared/modelCatalog'

interface ExpertEditorProps {
  expert: Agent
  onUpdate: (data: Partial<Agent>) => void
  onDelete: () => void
}

const ExpertEditor: React.FC<ExpertEditorProps> = ({ expert, onUpdate, onDelete }) => {
  const [name, setName] = useState(expert.name)
  const [provider, setProvider] = useState(expert.provider ?? '')
  const [model, setModel] = useState(expert.model ?? '')
  const [persona, setPersona] = useState(expert.persona ?? '')
  const [domain, setDomain] = useState(expert.domain ?? '')
  const [stance, setStance] = useState(expert.stance ?? '')
  const [memory, setMemory] = useState(expert.memory ?? '')
  const [aggression, setAggression] = useState(expert.aggression)
  const [thinkingEnabled, setThinkingEnabled] = useState(expert.thinking_enabled)
  const [supportsThinking, setSupportsThinking] = useState(expert.supports_thinking)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setName(expert.name)
    setProvider(expert.provider ?? '')
    setModel(expert.model ?? '')
    setPersona(expert.persona ?? '')
    setDomain(expert.domain ?? '')
    setStance(expert.stance ?? '')
    setMemory(expert.memory ?? '')
    setAggression(expert.aggression)
    setThinkingEnabled(expert.thinking_enabled)
    setSupportsThinking(expert.supports_thinking)
  }, [expert])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    setModel('')
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
    onUpdate({
      name: name.trim() || '专家',
      provider: provider || null,
      model: model || null,
      persona: persona || null,
      domain: domain || null,
      stance: stance || null,
      memory: memory || null,
      aggression,
      supports_thinking: supportsThinking,
      thinking_enabled: thinkingEnabled
    })
  }

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete()
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const selectedProviderModels = provider
    ? PROVIDERS.find((p) => p.id === provider)?.models ?? []
    : []

  return (
    <div className="expert-editor">
      <div className="form-group">
        <label className="form-label">名称 *</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="专家名称"
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
        <div className="form-hint warning">未选择模型</div>
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
        </div>
      )}

      <div className="form-group">
        <label className="form-label">人设 (Persona)</label>
        <textarea
          className="form-textarea"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="专家的角色设定和性格特征"
          rows={2}
        />
      </div>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">领域 (Domain)</label>
          <input
            className="form-input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="如：AI安全、经济学"
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">立场 (Stance)</label>
          <input
            className="form-input"
            value={stance}
            onChange={(e) => setStance(e.target.value)}
            placeholder="如：保守派、激进派"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">私有记忆 (Memory)</label>
        <textarea
          className="form-textarea"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder="专家的背景知识或特殊记忆"
          rows={2}
        />
      </div>

      <div className="form-group">
        <label className="form-label">攻击性 (Aggression): {aggression}</label>
        <input
          type="range"
          className="form-range"
          min="0"
          max="100"
          value={aggression}
          onChange={(e) => setAggression(Number(e.target.value))}
        />
        <div className="form-hint">0 = 温和, 100 = 极度攻击性</div>
      </div>

      <div className="expert-editor-actions">
        <button className="btn btn-primary btn-small" onClick={handleSave}>
          保存
        </button>
        <button
          className={`btn btn-danger btn-small ${confirmDelete ? 'confirm' : ''}`}
          onClick={handleDelete}
        >
          {confirmDelete ? '确认删除？' : '删除专家'}
        </button>
      </div>
    </div>
  )
}

export default ExpertEditor
