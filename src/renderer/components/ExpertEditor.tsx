/**
 * 单个专家编辑器
 *
 * Round 7 Phase 2: Enhanced per Section XIV.
 * - Capability badges (thinking/json/streaming/vision)
 * - Preview badge for preview models
 * - Custom model ID input with unverified warning
 * - Status badges for all model statuses
 */

import React, { useState, useEffect } from 'react'
import type { Agent } from '../../shared/types'
import { PROVIDERS, findModel } from '../../shared/modelCatalog'

interface ExpertEditorProps {
  expert: Agent
  onUpdate: (data: Partial<Agent>) => void
  onDelete: () => void
}

/** Capability badge component */
const CapBadge: React.FC<{ label: string; active: boolean; title?: string }> = ({ label, active, title }) => (
  <span
    title={title}
    style={{
      display: 'inline-block',
      padding: '1px 5px',
      margin: '0 2px',
      borderRadius: '3px',
      fontSize: '10px',
      fontWeight: 600,
      background: active ? '#1a73e8' : '#444',
      color: active ? '#fff' : '#888',
      opacity: active ? 1 : 0.5
    }}
  >
    {label}
  </span>
)

const ExpertEditor: React.FC<ExpertEditorProps> = ({ expert, onUpdate, onDelete }) => {
  const [name, setName] = useState(expert.name)
  const [provider, setProvider] = useState(expert.provider ?? '')
  const [model, setModel] = useState(expert.model ?? '')
  const [customModelId, setCustomModelId] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
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
    setUseCustomModel(false)
    setCustomModelId('')
  }, [expert])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    setModel('')
    setSupportsThinking(0)
    setThinkingEnabled(0)
    setUseCustomModel(false)
    setCustomModelId('')
  }

  const handleModelChange = (newModel: string) => {
    if (newModel === '__custom__') {
      setUseCustomModel(true)
      setModel('')
      return
    }
    setUseCustomModel(false)
    setCustomModelId('')
    setModel(newModel)
    if (provider && newModel) {
      const modelInfo = findModel(provider, newModel)
      if (modelInfo) {
        const st = modelInfo.supportsThinking ? 1 : 0
        setSupportsThinking(st)
        setThinkingEnabled(st)
      }
    } else {
      setSupportsThinking(0)
      setThinkingEnabled(0)
    }
  }

  const handleCustomModelConfirm = () => {
    if (customModelId.trim()) {
      setModel(customModelId.trim())
      setSupportsThinking(0)
      setThinkingEnabled(0)
    }
  }

  const handleSave = () => {
    onUpdate({
      name: name.trim() || '专家',
      provider: provider || null,
      model: (useCustomModel ? customModelId.trim() : model) || null,
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

  const currentModelInfo = model && provider ? findModel(provider, model) : null
  const isPreview = currentModelInfo?.notes?.toLowerCase().includes('preview') ||
    currentModelInfo?.displayName?.toLowerCase().includes('preview') || false

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
            value={useCustomModel ? '__custom__' : model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={!provider}
          >
            <option value="">-- 未选择 --</option>
            {selectedProviderModels.map((m) => {
              const statusLabel = m.status === 'unverified' ? ' ⚠️ unverified'
                : m.status === 'stub' ? ' ❌ stub' : ''
              return (
                <option
                  key={m.model}
                  value={m.model}
                  disabled={m.status === 'stub'}
                >
                  {m.displayName}{statusLabel}
                </option>
              )
            })}
            {provider && <option value="__custom__">自定义 Model ID...</option>}
          </select>
        </div>
      </div>

      {/* Custom model input */}
      {useCustomModel && provider && (
        <div className="form-group">
          <label className="form-label">自定义 Model ID</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="form-input"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              placeholder="输入完整的 model ID"
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary btn-small"
              onClick={handleCustomModelConfirm}
              disabled={!customModelId.trim()}
            >
              确认
            </button>
          </div>
          <div className="form-hint warning" style={{ color: '#f0a020' }}>
            ⚠️ 自定义模型永远为 unverified 状态。需在 Provider 设置中开启「允许 Unverified 模型」并通过连接测试后才可用于会议。
          </div>
        </div>
      )}

      {!provider && (
        <div className="form-hint warning">未选择模型</div>
      )}

      {/* Status & capability badges */}
      {model && currentModelInfo && (
        <div style={{ marginBottom: '8px' }}>
          {currentModelInfo.status === 'unverified' && (
            <div className="form-hint warning" style={{ color: '#f0a020', marginBottom: '4px' }}>
              ⚠️ 此模型为 unverified 状态，可能需要实测确认可用性。
            </div>
          )}
          {currentModelInfo.status === 'stub' && (
            <div className="form-hint warning" style={{ color: '#e04040', marginBottom: '4px' }}>
              ❌ 此模型为 stub 状态，适配器未实现，无法使用。
            </div>
          )}
          {isPreview && (
            <span style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#ff9800',
              color: '#fff',
              marginRight: '6px',
              marginBottom: '4px'
            }}>
              Preview
            </span>
          )}
          <div style={{ marginTop: '2px' }}>
            <CapBadge label="Thinking" active={currentModelInfo.supportsThinking} title="支持深度思考" />
            <CapBadge label="JSON" active={currentModelInfo.supportsJson} title="支持 JSON 输出" />
            <CapBadge label="Stream" active={currentModelInfo.supportsStreaming} title="支持流式输出" />
            <CapBadge label="Vision" active={currentModelInfo.supportsVision} title="支持视觉输入" />
          </div>
        </div>
      )}

      {model && !currentModelInfo && (
        <div className="form-hint warning" style={{ color: '#f0a020' }}>
          ⚠️ 自定义模型 "{model}" 不在模型注册表中，状态为 unverified。
        </div>
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
