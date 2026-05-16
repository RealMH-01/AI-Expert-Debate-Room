/**
 * SettlementPreview - HP 结算预览面板
 *
 * 显示 HP 结算建议，并提供"应用结算"和"否决本轮结算"按钮。
 * 结算不会立刻生效 —— 用户拥有否决权。
 */

import React, { useState } from 'react'
import type { SettlementResultDisplay } from '../../shared/types'

interface SettlementPreviewProps {
  settlement: SettlementResultDisplay | null
  onApply: () => void
  onVeto: () => void
  visible: boolean
}

const SettlementPreview: React.FC<SettlementPreviewProps> = ({
  settlement,
  onApply,
  onVeto,
  visible
}) => {
  const [applying, setApplying] = useState(false)

  if (!visible || !settlement) return null

  if (settlement.status === 'skipped') {
    return (
      <div className="settlement-preview settlement-skipped">
        <h3>⏭️ HP 结算已跳过</h3>
        <p>{settlement.skipReason}</p>
      </div>
    )
  }

  if (settlement.status === 'applied') {
    return (
      <div className="settlement-preview settlement-applied">
        <h3>✅ HP 结算已应用</h3>
        <p>专家 HP、议事权、威望已更新。</p>
      </div>
    )
  }

  if (settlement.status === 'vetoed') {
    return (
      <div className="settlement-preview settlement-vetoed">
        <h3>🚫 HP 结算已被否决</h3>
        <p>专家 HP 保持不变。投票记录已保留，便于复盘。</p>
      </div>
    )
  }

  // status === 'pending'
  const handleApply = async () => {
    setApplying(true)
    onApply()
  }

  return (
    <div className="settlement-preview settlement-pending">
      <h3>⚖️ HP 结算建议（待确认）</h3>
      <p className="settlement-note">
        以下 HP 变化尚未生效。请选择"应用结算"执行变化，或"否决本轮结算"保持不变。
      </p>

      <table className="settlement-table">
        <thead>
          <tr>
            <th>名次</th>
            <th>专家</th>
            <th>HP 变化</th>
            <th>HP 之前</th>
            <th>HP 之后</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {settlement.items.map((item) => (
            <tr
              key={item.agentId}
              className={item.enterHellPool ? 'hell-pool-row' : ''}
            >
              <td>#{item.rank}</td>
              <td>{item.agentName}</td>
              <td
                className={
                  item.hpChange > 0
                    ? 'hp-gain'
                    : item.hpChange < 0
                      ? 'hp-loss'
                      : 'hp-neutral'
                }
              >
                {item.hpChange > 0 ? `+${item.hpChange}` : item.hpChange}
              </td>
              <td>{item.hpBefore}</td>
              <td>{item.hpAfter}</td>
              <td>
                {item.enterHellPool ? (
                  <span className="hell-pool-badge">⚠️ 将堕入地狱</span>
                ) : (
                  <span className="active-badge">存活</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="settlement-reason-note">
        {settlement.items.map((item) => (
          <span key={item.agentId} className="reason-item">
            {item.agentName}: {item.reason}
            <br />
          </span>
        ))}
      </p>

      <div className="settlement-actions">
        <button
          className="btn-apply-settlement"
          onClick={handleApply}
          disabled={applying}
        >
          {applying ? '应用中...' : '✅ 应用结算'}
        </button>
        <button
          className="btn-veto-settlement"
          onClick={onVeto}
          disabled={applying}
        >
          🚫 否决本轮结算
        </button>
      </div>
    </div>
  )
}

export default SettlementPreview
