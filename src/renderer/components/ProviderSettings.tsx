/**
 * Provider Settings 组件
 *
 * Round 7 Phase 2: Enhanced per Section XIV.
 * - allowUnverifiedModels toggle
 * - lastTestStatus / lastTestAt display
 * - Custom model ID input with unverified warning
 * - Refresh models button
 * - Enhanced test result with error classification
 *
 * Security rules:
 * - API Key in UI uses maskedApiKey display
 * - Plaintext only shown during input; cleared after submit
 * - API Key sent via IPC to Main Process for storage
 * - Reading config via IPC only returns maskedApiKey / hasApiKey
 */

import React, { useState, useEffect, useCallback } from 'react'
import { PROVIDER_REGISTRY, type ProviderId } from '../../shared/providers/modelRegistry'

interface ProviderConfigSafe {
  providerId: string
  hasApiKey: boolean
  maskedApiKey: string
  baseUrl: string
  timeout: number
  enabled: boolean
  allowUnverifiedModels: boolean
  lastTestStatus?: 'success' | 'fail' | null
  lastTestError?: string | null
  lastTestAt?: string | null
}

interface ConnectionTestResult {
  success: boolean
  message: string
  latencyMs?: number
  errorType?: string
  httpStatus?: number
  testedAt: string
}

interface RefreshResult {
  providerId: string
  success: boolean
  models: Array<{ apiModelId: string; displayName?: string }>
  errorMessage?: string
  fetchedAt: string
}

/** Provider IDs that can be configured (all except mock) */
const configurableProviderIds = PROVIDER_REGISTRY
  .filter((p) => p.requiresApiKey)
  .map((p) => p.id)

const ProviderSettings: React.FC = () => {
  const [configs, setConfigs] = useState<ProviderConfigSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')
  const [formData, setFormData] = useState({
    apiKey: '',
    baseUrl: '',
    timeout: 60000,
    enabled: true,
    allowUnverifiedModels: false
  })
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null)

  const configurableProviders = PROVIDER_REGISTRY.filter((p) =>
    configurableProviderIds.includes(p.id)
  )

  // Load all configs
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

  // When selected provider changes, load its config
  useEffect(() => {
    const config = configs.find((c) => c.providerId === selectedProvider)
    if (config) {
      setFormData({
        apiKey: '',
        baseUrl: config.baseUrl,
        timeout: config.timeout,
        enabled: config.enabled,
        allowUnverifiedModels: config.allowUnverifiedModels
      })
    } else {
      setFormData({
        apiKey: '',
        baseUrl: '',
        timeout: 60000,
        enabled: true,
        allowUnverifiedModels: false
      })
    }
    setTestResult(null)
    setSaveMessage('')
    setRefreshResult(null)
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
        enabled: formData.enabled,
        allowUnverifiedModels: formData.allowUnverifiedModels
      })
      if (res.success) {
        setSaveMessage('配置已保存')
        setFormData((prev) => ({ ...prev, apiKey: '' }))
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

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.providerTestConnection(selectedProvider)
      if (res.success && res.data) {
        setTestResult(res.data)
        // Reload configs to pick up persisted test result
        await loadConfigs()
      } else {
        setTestResult({
          success: false,
          message: res.error || '测试失败',
          testedAt: new Date().toISOString()
        })
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: `异常: ${(e as Error).message}`,
        testedAt: new Date().toISOString()
      })
    } finally {
      setTesting(false)
    }
  }

  const handleRefreshModels = async () => {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const res = await window.api.providerRefreshModels(selectedProvider)
      if (res.success && res.data) {
        setRefreshResult(res.data)
      } else {
        setRefreshResult({
          providerId: selectedProvider,
          success: false,
          models: [],
          errorMessage: res.error || '刷新失败',
          fetchedAt: new Date().toISOString()
        })
      }
    } catch (e) {
      setRefreshResult({
        providerId: selectedProvider,
        success: false,
        models: [],
        errorMessage: `异常: ${(e as Error).message}`,
        fetchedAt: new Date().toISOString()
      })
    } finally {
      setRefreshing(false)
    }
  }

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
  const currentProviderEntry = PROVIDER_REGISTRY.find((p) => p.id === selectedProvider)

  if (loading) {
    return <div className="provider-settings loading">加载配置中...</div>
  }

  const getBaseUrlPlaceholder = (): string => {
    if (!currentProviderEntry) return ''
    return currentProviderEntry.defaultBaseUrl || '输入自定义 Base URL'
  }

  const getApiKeyHint = (): string => {
    switch (selectedProvider) {
      case 'anthropic':
        return 'Anthropic API Key (sk-ant-...)'
      case 'google':
        return 'Google Gemini API Key (AIza...)'
      case 'deepseek':
        return 'DeepSeek API Key'
      case 'qwen':
        return 'DashScope API Key (sk-...)'
      case 'bigmodel':
        return '智谱 BigModel API Key'
      case 'moonshot':
        return 'Moonshot API Key (sk-...)'
      default:
        return 'API Key (sk-...)'
    }
  }

  const formatTestTime = (iso: string | null | undefined): string => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return d.toLocaleString()
    } catch {
      return iso
    }
  }

  const getErrorTypeBadge = (errorType?: string): string => {
    switch (errorType) {
      case 'auth': return 'Auth Error'
      case 'permission': return 'Permission Denied'
      case 'rate_limit': return 'Rate Limited'
      case 'validation': return 'Validation Error'
      case 'network': return 'Network Error'
      case 'server': return 'Server Error'
      default: return 'Error'
    }
  }

  return (
    <div className="provider-settings">
      <h3>Provider 配置</h3>
      <p className="settings-hint">
        配置 AI Provider 的 API Key。配置后可在创建专家/主理人时选择对应模型。
      </p>

      {/* Provider selection */}
      <div className="form-group">
        <label className="form-label">选择 Provider</label>
        <select
          className="form-select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          {configurableProviders.map((p) => {
            const cfg = configs.find((c) => c.providerId === p.id)
            const statusIcon = cfg?.hasApiKey
              ? (cfg.lastTestStatus === 'success' ? ' ✓' : cfg.lastTestStatus === 'fail' ? ' ✗' : ' ✓')
              : ''
            return (
              <option key={p.id} value={p.id}>
                {p.displayName}{statusIcon}
              </option>
            )
          })}
        </select>
      </div>

      {/* Provider info */}
      {currentProviderEntry && (
        <div className="provider-info-bar" style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
          {currentProviderEntry.officialDocUrl && (
            <span>
              📖 <a href={currentProviderEntry.officialDocUrl} target="_blank" rel="noreferrer" style={{ color: '#6af' }}>
                官方文档
              </a>
            </span>
          )}
          {currentProviderEntry.notes && (
            <span style={{ marginLeft: '12px' }}>{currentProviderEntry.notes}</span>
          )}
        </div>
      )}

      {/* Current status with test result history */}
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
          {currentConfig.lastTestStatus && (
            <span style={{
              marginLeft: '8px',
              fontSize: '12px',
              color: currentConfig.lastTestStatus === 'success' ? '#4caf50' : '#f44336'
            }}>
              {currentConfig.lastTestStatus === 'success' ? '✓ 测试通过' : '✗ 测试失败'}
              {currentConfig.lastTestAt && (
                <span style={{ color: '#888', marginLeft: '4px' }}>
                  ({formatTestTime(currentConfig.lastTestAt)})
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Config form */}
      <div className="form-group">
        <label className="form-label">
          API Key {currentConfig?.hasApiKey ? '（已配置，留空保持不变）' : '（必填）'}
        </label>
        <input
          type="password"
          className="form-input"
          value={formData.apiKey}
          onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
          placeholder={currentConfig?.hasApiKey ? '留空保持当前 Key 不变' : getApiKeyHint()}
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Base URL（可选，留空使用默认）</label>
        <input
          className="form-input"
          value={formData.baseUrl}
          onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder={getBaseUrlPlaceholder()}
        />
        <div className="form-hint">
          自定义 API 端点。如使用代理或自托管服务，填写此处。
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

      {/* allowUnverifiedModels toggle */}
      <div className="form-group">
        <label className="form-label-inline">
          <input
            type="checkbox"
            checked={formData.allowUnverifiedModels}
            onChange={(e) => setFormData((prev) => ({ ...prev, allowUnverifiedModels: e.target.checked }))}
          />
          <span>允许使用 Unverified 模型</span>
        </label>
        <div className="form-hint" style={{ color: '#f0a020' }}>
          允许后可在会议中使用 unverified 状态的模型和自定义 model ID。需先通过连接测试。
        </div>
      </div>

      {/* Action buttons */}
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
        <button
          className="btn btn-secondary"
          onClick={handleRefreshModels}
          disabled={refreshing || !currentConfig?.hasApiKey}
          title="从 Provider API 刷新可用模型列表"
        >
          {refreshing ? '刷新中...' : '刷新模型列表'}
        </button>
        {currentConfig && (
          <button className="btn btn-danger btn-small" onClick={handleDelete}>
            删除配置
          </button>
        )}
      </div>

      {/* Save message */}
      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('失败') ? 'error' : 'success'}`}>
          {saveMessage}
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
          <strong>{testResult.success ? '✓ 连接成功' : '✗ 连接失败'}</strong>
          {testResult.errorType && !testResult.success && (
            <span style={{
              marginLeft: '8px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              background: '#ff5252',
              color: '#fff'
            }}>
              {getErrorTypeBadge(testResult.errorType)}
            </span>
          )}
          <p>{testResult.message}</p>
          {testResult.latencyMs !== undefined && (
            <p className="latency">延迟: {testResult.latencyMs}ms</p>
          )}
          {testResult.httpStatus && (
            <p style={{ fontSize: '12px', color: '#888' }}>HTTP Status: {testResult.httpStatus}</p>
          )}
        </div>
      )}

      {/* Refresh result */}
      {refreshResult && (
        <div className={`test-result ${refreshResult.success ? 'success' : 'error'}`}>
          <strong>
            {refreshResult.success
              ? `✓ 获取到 ${refreshResult.models.length} 个模型`
              : '✗ 刷新失败'}
          </strong>
          {refreshResult.errorMessage && <p>{refreshResult.errorMessage}</p>}
          {refreshResult.success && refreshResult.models.length > 0 && (
            <details style={{ marginTop: '4px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#888' }}>
                查看模型列表
              </summary>
              <ul style={{ fontSize: '12px', maxHeight: '200px', overflow: 'auto', margin: '4px 0', paddingLeft: '16px' }}>
                {refreshResult.models.map((m) => (
                  <li key={m.apiModelId}>{m.apiModelId}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default ProviderSettings
