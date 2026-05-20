import React, { useCallback, useEffect, useState } from 'react'
import { PROVIDERS } from '../../shared/modelCatalog'

interface ProviderConfigSafe {
  providerId: string
  displayName?: string
  hasApiKey: boolean
  maskedApiKey: string
  maskedKey?: string
  baseUrl: string
  timeout: number
  maxConcurrency: number
  enabled: boolean
  allowUnverifiedModels: boolean
  lastTestStatus?: 'success' | 'failure'
  lastTestError?: string
  lastTestAt?: string
  lastTestedModel?: string
}

interface ConnectionTestResult {
  ok: boolean
  providerId: string
  model: string
  latencyMs?: number
  errorType?: string
  sanitizedMessage?: string
  testedAt: string
}

const ProviderSettings: React.FC = () => {
  const [configs, setConfigs] = useState<ProviderConfigSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState('openai')
  const [formData, setFormData] = useState({
    apiKey: '',
    baseUrl: '',
    timeout: 60000,
    maxConcurrency: 2,
    enabled: true,
    allowUnverifiedModels: false,
    testModel: ''
  })
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const selectedProviderInfo = PROVIDERS.find((provider) => provider.id === selectedProvider)
  const currentConfig = configs.find((config) => config.providerId === selectedProvider)

  const loadConfigs = useCallback(async () => {
    try {
      const res = await window.api.providerGetAllConfigs()
      if (res.success && res.data) setConfigs(res.data as ProviderConfigSafe[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  useEffect(() => {
    const config = configs.find((item) => item.providerId === selectedProvider)
    const providerInfo = PROVIDERS.find((provider) => provider.id === selectedProvider)
    setFormData({
      apiKey: '',
      baseUrl: config?.baseUrl || providerInfo?.models[0]?.defaultBaseUrl || '',
      timeout: config?.timeout ?? 60000,
      maxConcurrency: config?.maxConcurrency ?? (selectedProvider === 'bigmodel' ? 1 : 2),
      enabled: config?.enabled ?? true,
      allowUnverifiedModels: config?.allowUnverifiedModels ?? selectedProvider === 'openai_compatible',
      testModel: config?.lastTestedModel ?? ''
    })
    setTestResult(null)
    setSaveMessage('')
  }, [selectedProvider, configs])

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')
    try {
      const res = await window.api.providerSaveConfig({
        providerId: selectedProvider,
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl || undefined,
        timeout: formData.timeout,
        maxConcurrency: formData.maxConcurrency,
        enabled: formData.enabled,
        allowUnverifiedModels: formData.allowUnverifiedModels
      })
      setSaveMessage(res.success ? '配置已保存' : `保存失败: ${res.error}`)
      if (res.success) {
        setFormData((prev) => ({ ...prev, apiKey: '' }))
        await loadConfigs()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.providerTestConnection(selectedProvider, formData.testModel || undefined)
      if (res.success && res.data) {
        setTestResult(res.data as ConnectionTestResult)
      } else {
        setTestResult({
          ok: false,
          providerId: selectedProvider,
          model: formData.testModel,
          sanitizedMessage: res.error || '测试失败',
          testedAt: new Date().toISOString()
        })
      }
      await loadConfigs()
    } finally {
      setTesting(false)
    }
  }

  const handleRefreshModels = async () => {
    const res = await window.api.providerRefreshModels(selectedProvider)
    setSaveMessage(res.success ? '模型列表已刷新并缓存' : `刷新失败: ${res.error}`)
  }

  const handleDelete = async () => {
    if (!confirm(`确定删除 ${selectedProvider} 的配置？API Key 将被删除。`)) return
    const res = await window.api.providerDeleteConfig(selectedProvider)
    setSaveMessage(res.success ? '配置已删除' : `删除失败: ${res.error}`)
    await loadConfigs()
  }

  if (loading) return <div className="provider-settings loading">加载配置中...</div>

  return (
    <div className="provider-settings">
      <h3>Provider 配置</h3>
      <p className="settings-hint">
        API Key 只保存在主进程和本地 SQLite 设置中，界面只显示脱敏状态。
      </p>

      <div className="form-group">
        <label className="form-label">Provider</label>
        <select
          className="form-select"
          value={selectedProvider}
          onChange={(event) => setSelectedProvider(event.target.value)}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName}
              {configs.find((config) => config.providerId === provider.id)?.hasApiKey ? ' configured' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="provider-status">
        <span className={`status-badge ${formData.enabled ? 'enabled' : 'disabled'}`}>
          {formData.enabled ? 'enabled' : 'disabled'}
        </span>
        {currentConfig?.hasApiKey && (
          <span className="api-key-display">API Key: {currentConfig.maskedKey || currentConfig.maskedApiKey}</span>
        )}
        {currentConfig?.lastTestStatus && (
          <span className={`status-badge ${currentConfig.lastTestStatus === 'success' ? 'enabled' : 'disabled'}`}>
            test {currentConfig.lastTestStatus}
          </span>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">
          API Key {currentConfig?.hasApiKey ? '(留空保持不变)' : '(必填)'}
        </label>
        <input
          type="password"
          className="form-input"
          value={formData.apiKey}
          onChange={(event) => setFormData((prev) => ({ ...prev, apiKey: event.target.value }))}
          placeholder={currentConfig?.hasApiKey ? '留空保持当前 Key' : '输入 API Key'}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Base URL</label>
        <input
          className="form-input"
          value={formData.baseUrl}
          onChange={(event) => setFormData((prev) => ({ ...prev, baseUrl: event.target.value }))}
          placeholder={selectedProviderInfo?.models[0]?.defaultBaseUrl || 'Provider default'}
        />
      </div>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">Timeout (ms)</label>
          <input
            type="number"
            className="form-input"
            value={formData.timeout}
            min={5000}
            max={300000}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, timeout: Number(event.target.value) || 60000 }))
            }
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">Max concurrency</label>
          <input
            type="number"
            className="form-input"
            value={formData.maxConcurrency}
            min={1}
            max={10}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, maxConcurrency: Number(event.target.value) || 1 }))
            }
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label-inline">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(event) => setFormData((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            <span>Enable provider</span>
          </label>
          <label className="form-label-inline">
            <input
              type="checkbox"
              checked={formData.allowUnverifiedModels}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, allowUnverifiedModels: event.target.checked }))
              }
            />
            <span>Allow unverified models</span>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Custom / test model ID</label>
        <input
          className="form-input"
          value={formData.testModel}
          onChange={(event) => setFormData((prev) => ({ ...prev, testModel: event.target.value }))}
          placeholder="Optional model ID for connection test"
        />
        {formData.testModel && (
          <div className="form-hint warning">
            This model ID is user-provided and unverified by the built-in registry.
          </div>
        )}
      </div>

      <div className="provider-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || !currentConfig?.hasApiKey}>
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button className="btn btn-secondary" onClick={handleRefreshModels}>
          Refresh models
        </button>
        {currentConfig && (
          <button className="btn btn-danger btn-small" onClick={handleDelete}>
            删除配置
          </button>
        )}
      </div>

      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('失败') ? 'error' : 'success'}`}>
          {saveMessage}
        </div>
      )}

      {testResult && (
        <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
          <strong>{testResult.ok ? '连接成功' : '连接失败'}</strong>
          <p>{testResult.sanitizedMessage || `${testResult.providerId}/${testResult.model}`}</p>
          {testResult.latencyMs !== undefined && <p className="latency">延迟: {testResult.latencyMs}ms</p>}
        </div>
      )}
    </div>
  )
}

export default ProviderSettings
