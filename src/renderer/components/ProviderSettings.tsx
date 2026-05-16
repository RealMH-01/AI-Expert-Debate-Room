/**
 * Provider Settings 组件
 *
 * 让用户配置真实 Provider 的 API Key、baseUrl 等。
 * 
 * 安全规则：
 * - API Key 在 UI 中用 maskedApiKey 显示
 * - 输入时显示明文（让用户确认），提交后立即清空显示
 * - 提交的 API Key 通过 IPC 发送到 Main Process 保存
 * - 读取配置时 IPC 只返回 maskedApiKey / hasApiKey
 *
 * TODO: 后续升级到系统 Keychain / Credential Manager
 */

import React, { useState, useEffect, useCallback } from 'react'
import { PROVIDERS } from '../../shared/modelCatalog'

interface ProviderConfigSafe {
  providerId: string
  hasApiKey: boolean
  maskedApiKey: string
  baseUrl: string
  timeout: number
  enabled: boolean
}

interface ConnectionTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

const ProviderSettings: React.FC = () => {
  const [configs, setConfigs] = useState<ProviderConfigSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')
  const [formData, setFormData] = useState({
    apiKey: '',
    baseUrl: '',
    timeout: 60000,
    enabled: true
  })
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // 第 6 轮可配置的真实 Provider 列表：只有 openai 和 openai_compatible
  // TODO: 第 7 轮扩展 anthropic/gemini/deepseek/qwen/zhipu/kimi
  const round6ProviderIds = ['openai', 'openai_compatible']
  const configurableProviders = PROVIDERS.filter((p) => round6ProviderIds.includes(p.id))

  // 加载所有配置
  const loadConfigs = useCallback(async () => {
    try {
      const res = await window.api.providerGetAllConfigs()
      if (res.success && res.data) {
        setConfigs(res.data)
      }
    } catch (e) {
      console.error('加载 Provider 配置失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // 当选择的 provider 变化时，加载对应配置
  useEffect(() => {
    const config = configs.find((c) => c.providerId === selectedProvider)
    if (config) {
      setFormData({
        apiKey: '', // 不显示明文，用户需要重新输入
        baseUrl: config.baseUrl,
        timeout: config.timeout,
        enabled: config.enabled
      })
    } else {
      setFormData({ apiKey: '', baseUrl: '', timeout: 60000, enabled: true })
    }
    setTestResult(null)
    setSaveMessage('')
  }, [selectedProvider, configs])

  // 保存配置
  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')
    try {
      const res = await window.api.providerSaveConfig({
        providerId: selectedProvider,
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl || undefined,
        timeout: formData.timeout,
        enabled: formData.enabled
      })
      if (res.success) {
        setSaveMessage('配置已保存')
        setFormData((prev) => ({ ...prev, apiKey: '' })) // 清空输入的明文
        await loadConfigs()
      } else {
        setSaveMessage(`保存失败: ${res.error}`)
      }
    } catch (e) {
      setSaveMessage(`保存异常: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // 测试连接
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.providerTestConnection(selectedProvider)
      if (res.success && res.data) {
        setTestResult(res.data)
      } else {
        setTestResult({ success: false, message: res.error || '测试失败' })
      }
    } catch (e) {
      setTestResult({ success: false, message: `异常: ${(e as Error).message}` })
    } finally {
      setTesting(false)
    }
  }

  // 删除配置
  const handleDelete = async () => {
    if (!confirm(`确定删除 ${selectedProvider} 的配置？API Key 将被永久删除。`)) return
    try {
      const res = await window.api.providerDeleteConfig(selectedProvider)
      if (res.success) {
        setSaveMessage('配置已删除')
        await loadConfigs()
      }
    } catch (e) {
      setSaveMessage(`删除失败: ${(e as Error).message}`)
    }
  }

  const currentConfig = configs.find((c) => c.providerId === selectedProvider)

  if (loading) {
    return <div className="provider-settings loading">加载配置中...</div>
  }

  return (
    <div className="provider-settings">
      <h3>Provider 配置</h3>
      <p className="settings-hint">
        配置真实 AI Provider 的 API Key。配置后可在创建专家/主理人时选择对应模型。
      </p>
      <p className="settings-hint warning">
        TODO: 当前 API Key 存储为本地 MVP 方案，后续将升级到系统 Keychain / Credential Manager。
      </p>

      {/* Provider 选择 */}
      <div className="form-group">
        <label className="form-label">选择 Provider</label>
        <select
          className="form-select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          {configurableProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
              {configs.find((c) => c.providerId === p.id)?.hasApiKey ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 当前状态 */}
      {currentConfig && (
        <div className="provider-status">
          <span className={`status-badge ${currentConfig.enabled ? 'enabled' : 'disabled'}`}>
            {currentConfig.enabled ? '已启用' : '已禁用'}
          </span>
          {currentConfig.hasApiKey && (
            <span className="api-key-display">
              API Key: {currentConfig.maskedApiKey}
            </span>
          )}
        </div>
      )}

      {/* 配置表单 */}
      <div className="form-group">
        <label className="form-label">
          API Key {currentConfig?.hasApiKey ? '（已配置，留空保持不变）' : '（必填）'}
        </label>
        <input
          type="password"
          className="form-input"
          value={formData.apiKey}
          onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
          placeholder={currentConfig?.hasApiKey ? '留空保持当前 Key 不变' : '输入 API Key'}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Base URL（可选，留空使用默认）</label>
        <input
          className="form-input"
          value={formData.baseUrl}
          onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder="https://api.openai.com"
        />
        <div className="form-hint">
          自定义 API 端点。如使用代理或 OpenAI 兼容服务，填写此处。
        </div>
      </div>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">超时时间 (ms)</label>
          <input
            type="number"
            className="form-input"
            value={formData.timeout}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, timeout: Number(e.target.value) || 60000 }))
            }
            min={5000}
            max={300000}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label-inline">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>启用此 Provider</span>
          </label>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="provider-actions">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing || !currentConfig?.hasApiKey}
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {currentConfig && (
          <button className="btn btn-danger btn-small" onClick={handleDelete}>
            删除配置
          </button>
        )}
      </div>

      {/* 保存消息 */}
      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('失败') ? 'error' : 'success'}`}>
          {saveMessage}
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
          <strong>{testResult.success ? '✓ 连接成功' : '✗ 连接失败'}</strong>
          <p>{testResult.message}</p>
          {testResult.latencyMs !== undefined && (
            <p className="latency">延迟: {testResult.latencyMs}ms</p>
          )}
        </div>
      )}
    </div>
  )
}

export default ProviderSettings
