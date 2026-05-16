/**
 * 规则编辑器
 *
 * 允许用户编辑会议室的辩论规则。
 * 铁律字段不能被修改为违反规则的值。
 */

import React, { useState, useEffect } from 'react'
import type { Room, RulesConfig } from '../../shared/types'
import { DEFAULT_RULES_CONFIG } from '../../shared/types'

interface RulesEditorProps {
  room: Room
  onUpdateRules: (id: string, rules: RulesConfig) => void
}

const RulesEditor: React.FC<RulesEditorProps> = ({ room, onUpdateRules }) => {
  const [rules, setRules] = useState<RulesConfig>(DEFAULT_RULES_CONFIG)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    try {
      if (room.rules_json) {
        const parsed = JSON.parse(room.rules_json) as RulesConfig
        setRules({ ...DEFAULT_RULES_CONFIG, ...parsed })
      } else {
        setRules(DEFAULT_RULES_CONFIG)
      }
    } catch {
      setRules(DEFAULT_RULES_CONFIG)
    }
    setDirty(false)
  }, [room.id, room.rules_json])

  const updateField = <K extends keyof RulesConfig>(key: K, value: RulesConfig[K]) => {
    setRules((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = () => {
    // 铁律强制
    const safeRules: RulesConfig = {
      ...rules,
      influence_affects_final_summary_weight: false,
      moderator_can_validate_votes: false,
      min_debate_rounds: Math.max(3, rules.min_debate_rounds),
      max_hp_loss_per_round: Math.min(20, rules.max_hp_loss_per_round)
    }
    onUpdateRules(room.id, safeRules)
    setDirty(false)
  }

  return (
    <section className="config-section">
      <h3 className="section-title">会议规则配置</h3>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">最少辩论轮数 (≥3)</label>
          <input
            type="number"
            className="form-input"
            value={rules.min_debate_rounds}
            min={3}
            onChange={(e) =>
              updateField('min_debate_rounds', Math.max(3, Number(e.target.value)))
            }
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">初始 HP</label>
          <input
            type="number"
            className="form-input"
            value={rules.initial_hp}
            onChange={(e) => updateField('initial_hp', Number(e.target.value))}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">HP 上限</label>
          <input
            type="number"
            className="form-input"
            value={rules.max_hp}
            onChange={(e) => updateField('max_hp', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">单轮最大扣血 (≤20)</label>
          <input
            type="number"
            className="form-input"
            value={rules.max_hp_loss_per_round}
            max={20}
            onChange={(e) =>
              updateField('max_hp_loss_per_round', Math.min(20, Number(e.target.value)))
            }
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">存活人数低于此值停止结算</label>
          <input
            type="number"
            className="form-input"
            value={rules.stop_settlement_when_alive_experts_less_than}
            onChange={(e) =>
              updateField(
                'stop_settlement_when_alive_experts_less_than',
                Number(e.target.value)
              )
            }
          />
        </div>
      </div>

      <h4 className="subsection-title">HP 结算公式</h4>
      <div className="form-row">
        <div className="form-group flex-1">
          <label className="form-label">第一名回血</label>
          <input
            type="number"
            className="form-input"
            value={rules.first_place_hp_gain}
            onChange={(e) => updateField('first_place_hp_gain', Number(e.target.value))}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">第二名回血</label>
          <input
            type="number"
            className="form-input"
            value={rules.second_place_hp_gain}
            onChange={(e) => updateField('second_place_hp_gain', Number(e.target.value))}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">倒数第二扣血</label>
          <input
            type="number"
            className="form-input"
            value={rules.second_last_hp_loss}
            onChange={(e) => updateField('second_last_hp_loss', Number(e.target.value))}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">倒数第一扣血</label>
          <input
            type="number"
            className="form-input"
            value={rules.last_place_hp_loss}
            onChange={(e) => updateField('last_place_hp_loss', Number(e.target.value))}
          />
        </div>
      </div>

      <h4 className="subsection-title">投票与议事权</h4>
      <div className="form-group">
        <label className="form-label-inline">
          <input
            type="checkbox"
            checked={rules.voting_anonymous}
            onChange={(e) => updateField('voting_anonymous', e.target.checked)}
          />
          <span>投票匿名</span>
        </label>
      </div>
      <div className="form-group">
        <label className="form-label-inline">
          <input
            type="checkbox"
            checked={rules.allow_user_veto_settlement}
            onChange={(e) => updateField('allow_user_veto_settlement', e.target.checked)}
          />
          <span>允许用户否决结算</span>
        </label>
      </div>
      <div className="form-group">
        <label className="form-label-inline">
          <input
            type="checkbox"
            checked={rules.influence_affects_speaking_order}
            onChange={(e) => updateField('influence_affects_speaking_order', e.target.checked)}
          />
          <span>议事权影响发言顺序</span>
        </label>
      </div>
      <div className="form-group">
        <label className="form-label-inline">
          <input
            type="checkbox"
            checked={rules.influence_affects_tie_break}
            onChange={(e) => updateField('influence_affects_tie_break', e.target.checked)}
          />
          <span>议事权影响平票优势</span>
        </label>
      </div>

      {/* 铁律字段：不可编辑 */}
      <div className="iron-rules">
        <h4 className="subsection-title">铁律（不可修改）</h4>
        <div className="iron-rule-item">
          ✗ 议事权不影响最终总结权重 (influence_affects_final_summary_weight = false)
        </div>
        <div className="iron-rule-item">
          ✗ 主理人不可审票 (moderator_can_validate_votes = false)
        </div>
      </div>

      {dirty && (
        <button className="btn btn-primary" onClick={handleSave}>
          保存规则配置
        </button>
      )}
    </section>
  )
}

export default RulesEditor
