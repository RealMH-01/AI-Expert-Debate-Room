/**
 * 专家列表和编辑器
 *
 * 规则：
 * - 用户可以添加、编辑、删除专家
 * - 每个专家必须有 name
 * - 每个专家可选择 provider/model
 * - 支持 thinking 的模型默认开启 thinking
 * - HP 初始 100, max_hp 100
 * - 专家状态默认 active
 * - aggression 范围 0-100
 */

import React, { useState } from 'react'
import type { Agent } from '../../shared/types'
import ExpertEditor from './ExpertEditor'

interface ExpertListProps {
  experts: Agent[]
  onCreateExpert: () => void
  onUpdateExpert: (id: string, data: Partial<Agent>) => void
  onDeleteExpert: (id: string) => void
}

const ExpertList: React.FC<ExpertListProps> = ({
  experts,
  onCreateExpert,
  onUpdateExpert,
  onDeleteExpert
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <section className="config-section">
      <div className="section-header">
        <h3 className="section-title">专家配置 ({experts.length})</h3>
        <button className="btn btn-small btn-primary" onClick={onCreateExpert}>
          + 添加专家
        </button>
      </div>

      {experts.length === 0 ? (
        <p className="placeholder-text">
          暂无专家。点击"添加专家"按钮开始配置。
          <br />
          <span className="form-hint">建议至少配置 3 个专家以获得最佳辩论效果。</span>
        </p>
      ) : (
        <div className="expert-list">
          {experts.map((expert) => (
            <div key={expert.id} className="expert-card">
              <div
                className="expert-card-header"
                onClick={() =>
                  setExpandedId(expandedId === expert.id ? null : expert.id)
                }
              >
                <div className="expert-card-info">
                  <span className="expert-name">{expert.name}</span>
                  <span className="expert-meta">
                    {expert.provider && expert.model
                      ? `${expert.provider}/${expert.model}`
                      : '未选择模型'}
                  </span>
                </div>
                <div className="expert-card-badges">
                  <span className="badge badge-hp">HP {expert.hp}</span>
                  <span className={`badge ${expert.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {expert.status}
                  </span>
                  {expert.supports_thinking === 1 && expert.thinking_enabled === 1 && (
                    <span className="badge badge-thinking">思考</span>
                  )}
                </div>
                <span className="expand-icon">
                  {expandedId === expert.id ? '▼' : '▶'}
                </span>
              </div>

              {expandedId === expert.id && (
                <ExpertEditor
                  expert={expert}
                  onUpdate={(data) => onUpdateExpert(expert.id, data)}
                  onDelete={() => onDeleteExpert(expert.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default ExpertList
