/**
 * HellPoolPanel - 地狱池面板
 *
 * 显示已堕入地狱的专家。
 * hell_pool 专家不可发言、不可投票。
 * 本轮不实现复活功能。
 */

import React from 'react'
import type { Agent } from '../../shared/types'

interface HellPoolPanelProps {
  hellPoolExperts: Agent[]
  aliveExperts: Agent[]
}

const HellPoolPanel: React.FC<HellPoolPanelProps> = ({ hellPoolExperts, aliveExperts }) => {
  return (
    <div className="hell-pool-panel">
      <h4>专家状态</h4>

      {/* 存活专家 */}
      <div className="experts-alive-section">
        <h5>🟢 存活 ({aliveExperts.length})</h5>
        {aliveExperts.length === 0 ? (
          <p className="no-experts">暂无存活专家</p>
        ) : (
          <ul className="expert-status-list">
            {aliveExperts.map((expert) => (
              <li key={expert.id} className="expert-status-item active">
                <span className="expert-name">{expert.name}</span>
                <span className="expert-hp">HP: {expert.hp}/{expert.max_hp}</span>
                <span className="expert-influence">议事权: {expert.influence}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Hell Pool 专家 */}
      {hellPoolExperts.length > 0 && (
        <div className="experts-hell-section">
          <h5>🔴 已堕入地狱 ({hellPoolExperts.length})</h5>
          <ul className="expert-status-list">
            {hellPoolExperts.map((expert) => (
              <li key={expert.id} className="expert-status-item hell">
                <span className="expert-name">{expert.name}</span>
                <span className="expert-hp-dead">HP: 0</span>
                <span className="expert-status-badge">已堕入地狱</span>
                <span className="expert-note">不可发言、不可投票</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default HellPoolPanel
