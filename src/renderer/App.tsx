/**
 * 应用根组件
 *
 * 三栏布局：
 * - 左侧：会议室 / 专家列表
 * - 中间：会议聊天流（当前为欢迎页 + 健康检查）
 * - 右侧：主理人 / 规则 / 状态面板
 */

import React, { useEffect, useState } from 'react'
import LeftPanel from './components/LeftPanel'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import type { HealthCheckResult, AppInfoResult } from './types/electron.d'

const App: React.FC = () => {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfoResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        setLoading(true)

        // 并行调用 healthCheck 和 getAppInfo
        const [health, info] = await Promise.all([
          window.api.healthCheck(),
          window.api.getAppInfo()
        ])

        setHealthResult(health)
        setAppInfo(info)
      } catch (error) {
        console.error('Failed to fetch app data:', error)
        setHealthResult({
          status: 'error',
          database: false,
          timestamp: new Date().toISOString(),
          message: '无法连接到主进程'
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="app-container">
      {/* 顶部标题栏 */}
      <header className="app-header">
        <h1>AI 专家修罗场会议室</h1>
        <div className="header-status">
          <span
            className={`status-dot ${loading ? 'loading' : healthResult?.status === 'ok' ? 'ok' : 'error'}`}
          />
          <span>
            {loading
              ? '连接中...'
              : healthResult?.status === 'ok'
                ? '系统就绪'
                : '系统异常'}
          </span>
        </div>
      </header>

      {/* 三栏主内容 */}
      <div className="main-content">
        <LeftPanel />
        <CenterPanel
          healthResult={healthResult}
          appInfo={appInfo}
          loading={loading}
        />
        <RightPanel />
      </div>

      {/* 底部状态栏 */}
      <footer className="app-footer">
        <span>
          {appInfo ? `${appInfo.appName} v${appInfo.version}` : '加载中...'}
        </span>
        <span>
          {appInfo
            ? `${appInfo.environment} | ${appInfo.platform}/${appInfo.arch}`
            : ''}
        </span>
      </footer>
    </div>
  )
}

export default App
