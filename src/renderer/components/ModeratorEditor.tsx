/**
 * 主理人编辑器
 *
 * Round 7 Phase 2: Enhanced per Section XIV.
 * - Capability badges (thinking/json/streaming/tools/vision)
 * - Preview badge for preview models
 * - Custom model ID input with unverified warning
 * - Status badges for all model statuses
 */

import React, { useState, useEffect } from 'react'
import type { Agent } from '../../shared/types'
import { PROVIDERS, findModel } from '../../shared/modelCatalog'

interface ModeratorEditorProps {
  moderator: Agent | null
  onUpsert: (data: Partial<Agent>) => void
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

const ModeratorEditor: React.FC<ModeratorEditorProps> = ({ moderator, onUpsert }) => {
  const [name, setName] = useState(moderator?.name ?? '主理人')
  const [provider, setProvider] = useState(moderator?.provider ?? '')
  const [model, setModel] = useState(moderator?.model ?? '')
  const [customModelId, setCustomModelId] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
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
    setUseCustomModel(false)
    setCustomModelId('')
  }, [moderator])

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
    onUpsert({
      name: name.trim() || '主理人',
      provider: provider || null,
      model: (useCustomModel ? customModelId.trim() : model) || null,
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

  const currentModelInfo = model && provider ? findModel(provider, model) : null
  const isPreview = currentModelInfo?.notes?.toLowerCase().includes('preview') ||
    currentModelInfo?.displayName?.toLowerCase().includes('preview') || false

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
              placeholder="输入完整的 model ID，如 gpt-5.5-turbo"
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
        <div className="form-hint warning">未选择模型 — 会议室无法启动</div>
      )}

      {/* Status & capability badges */}
      {model && currentModelInfo && (
        <div style={{ marginBottom: '8px' }}>
          {/* Status badge */}
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
          {/* Preview badge */}
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
          {/* Capability badges */}
          <div style={{ marginTop: '2px' }}>
            <CapBadge label="Thinking" active={currentModelInfo.supportsThinking} title="支持深度思考" />
            <CapBadge label="JSON" active={currentModelInfo.supportsJson} title="支持 JSON 输出" />
            <CapBadge label="Stream" active={currentModelInfo.supportsStreaming} title="支持流式输出" />
            <CapBadge label="Vision" active={currentModelInfo.supportsVision} title="支持视觉输入" />
          </div>
        </div>
      )}

      {/* Custom model without registry info */}
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
