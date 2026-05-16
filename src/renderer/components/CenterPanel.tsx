/**
 * 中间面板：会议聊天流占位 + 欢迎页面
 *
 * 显示数据库状态和应用信息
 */

import React from 'react'
import type { HealthCheckResult, AppInfoResult } from '../types/electron.d'

interface CenterPanelProps {
  healthResult: HealthCheckResult | null
  appInfo: AppInfoResult | null
  loading: boolean
}

const CenterPanel: React.FC<CenterPanelProps> = ({ healthResult, appInfo, loading }) => {
  return (
    <div className="panel-center">
      <div className="welcome-section">
        <h2>AI 专家修罗场会议室</h2>
        <p>
          本地桌面版 AI 专家对抗式会议程序。
          多个由不同 AI 模型驱动的"专家"角色通过多轮辩论、投票、HP 结算，
          产出经过压力测试的高质量答案。
        </p>

        {/* 数据库连接状态 */}
        <div style={{ marginTop: 24, width: '100%', maxWidth: 500 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 16,
            fontWeight: 500,
            marginBottom: 16
          }}>
            {loading ? (
              <>
                <span className="status-dot loading" />
                <span>正在检查数据库连接...</span>
              </>
            ) : healthResult?.status === 'ok' ? (
              <>
                <span className="status-dot ok" />
                <span style={{ color: 'var(--color-success)' }}>
                  {healthResult.message}
                </span>
              </>
            ) : (
              <>
                <span className="status-dot error" />
                <span style={{ color: 'var(--color-error)' }}>
                  {healthResult?.message ?? '数据库连接异常'}
                </span>
              </>
            )}
          </div>

          {/* 数据库路径显示 */}
          {appInfo && (
            <div>
              <span className="info-label" style={{ textAlign: 'center', display: 'block' }}>
                数据库路径
              </span>
              <div className="db-path-display">
                {appInfo.databasePath}
              </div>
            </div>
          )}
        </div>

        {/* 应用信息 */}
        {appInfo && (
          <div style={{ marginTop: 16, width: '100%', maxWidth: 500 }}>
            <ul className="info-list">
              <li>
                <span className="info-label">应用版本</span>
                <span className="info-value">{appInfo.version}</span>
              </li>
              <li>
                <span className="info-label">运行环境</span>
                <span className="info-value">{appInfo.environment}</span>
              </li>
              <li>
                <span className="info-label">数据库版本</span>
                <span className="info-value">v{appInfo.dbVersion}</span>
              </li>
              <li>
                <span className="info-label">数据表数量</span>
                <span className="info-value">{appInfo.tableCount} 个</span>
              </li>
              <li>
                <span className="info-label">Electron</span>
                <span className="info-value">v{appInfo.electronVersion}</span>
              </li>
              <li>
                <span className="info-label">Node.js</span>
                <span className="info-value">v{appInfo.nodeVersion}</span>
              </li>
              <li>
                <span className="info-label">平台</span>
                <span className="info-value">{appInfo.platform} / {appInfo.arch}</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default CenterPanel
