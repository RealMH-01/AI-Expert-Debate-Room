/**
 * 右侧面板：规则摘要 + 配置校验 + 产品铁律提醒
 *
 * 校验只用于提示，不阻止保存草稿。
 */

import React, { useMemo } from 'react'
import type { Room, Agent, RulesConfig, ValidationResult } from '../../shared/types'
import { DEFAULT_RULES_CONFIG } from '../../shared/types'

interface RightPanelProps {
  room: Room | null
  moderator: Agent | null
  experts: Agent[]
}

/**
 * 执行配置校验
 */
function validateConfig(
  room: Room | null,
  moderator: Agent | null,
  experts: Agent[]
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!room) {
    return { valid: false, errors: ['请选择一个会议室'], warnings: [] }
  }

  // 会议室名称
  if (!room.name.trim()) {
    errors.push('会议室名称不能为空')
  }

  // 主理人校验
  if (!moderator) {
    errors.push('主理人必须存在')
  } else {
    if (!moderator.provider || !moderator.model) {
      errors.push('主理人必须选择 Provider 和 Model')
    }
  }

  // 专家校验
  if (experts.length < 2) {
    errors.push('至少需要 2 个专家')
  }
  if (experts.length < 3) {
    warnings.push('建议至少 3 个专家以获得最佳辩论效果')
  }

  for (const expert of experts) {
    if (!expert.name.trim()) {
      errors.push(`专家 ID ${expert.id.slice(0, 8)} 名称为空`)
    }
    if (!expert.provider || !expert.model) {
      warnings.push(`专家"${expert.name}"未选择模型`)
    }
  }

  // 规则校验
  let rules: RulesConfig = DEFAULT_RULES_CONFIG
  try {
    if (room.rules_json) {
      rules = JSON.parse(room.rules_json)
    }
  } catch {
    // use default
  }

  if (rules.min_debate_rounds < 3) {
    errors.push('最少辩论轮数不能小于 3')
  }
  if (rules.max_hp_loss_per_round > 20) {
    errors.push('单轮最大扣血不能超过 20')
  }
  if (rules.moderator_can_validate_votes !== false) {
    errors.push('铁律违反：moderator_can_validate_votes 必须为 false')
  }
  if (rules.influence_affects_final_summary_weight !== false) {
    errors.push('铁律违反：influence_affects_final_summary_weight 必须为 false')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

const RightPanel: React.FC<RightPanelProps> = ({ room, moderator, experts }) => {
  const validation = useMemo(
    () => validateConfig(room, moderator, experts),
    [room, moderator, experts]
  )

  // 解析规则
  let rules: RulesConfig = DEFAULT_RULES_CONFIG
  try {
    if (room?.rules_json) {
      rules = JSON.parse(room.rules_json)
    }
  } catch {
    // use default
  }

  if (!room) {
    return (
      <div className="panel-right">
        <div className="panel-title">配置状态</div>
        <div className="panel-body">
          <p className="placeholder-text">
            选择会议室后将在此显示配置校验结果。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-right">
      <div className="panel-title">配置状态</div>
      <div className="panel-body">
        {/* 配置校验结果 */}
        <div className="validation-section">
          <h4 className="subsection-title">
            {validation.valid ? '✓ 配置完整' : '⚠ 配置不完整'}
          </h4>

          {validation.errors.length > 0 && (
            <div className="validation-errors">
              {validation.errors.map((err, i) => (
                <div key={i} className="validation-item error">
                  ✗ {err}
                </div>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="validation-warnings">
              {validation.warnings.map((warn, i) => (
                <div key={i} className="validation-item warning">
                  ⚠ {warn}
                </div>
              ))}
            </div>
          )}

          {validation.valid && (
            <div className="validation-item success">
              所有配置满足启动条件
            </div>
          )}
        </div>

        {/* 当前规则摘要 */}
        <div className="rules-summary">
          <h4 className="subsection-title">规则摘要</h4>
          <ul className="summary-list">
            <li>辩论轮数: ≥{rules.min_debate_rounds}</li>
            <li>初始 HP: {rules.initial_hp}</li>
            <li>HP 上限: {rules.max_hp}</li>
            <li>单轮最大扣血: {rules.max_hp_loss_per_round}</li>
            <li>
              结算: 第一 +{rules.first_place_hp_gain} / 第二 +
              {rules.second_place_hp_gain} / 倒二 -{rules.second_last_hp_loss} / 倒一 -
              {rules.last_place_hp_loss}
            </li>
            <li>投票匿名: {rules.voting_anonymous ? '是' : '否'}</li>
          </ul>
        </div>

        {/* 当前配置概况 */}
        <div className="config-overview">
          <h4 className="subsection-title">配置概况</h4>
          <ul className="summary-list">
            <li>
              主理人:{' '}
              {moderator
                ? moderator.provider && moderator.model
                  ? `${moderator.name} (${moderator.provider}/${moderator.model})`
                  : `${moderator.name} (未选择模型)`
                : '未配置'}
            </li>
            <li>专家数量: {experts.length}</li>
            <li>
              已配置模型的专家:{' '}
              {experts.filter((e) => e.provider && e.model).length}/{experts.length}
            </li>
          </ul>
        </div>

        {/* 产品铁律提醒 */}
        <div className="iron-rules-reminder">
          <h4 className="subsection-title">产品铁律</h4>
          <ul className="summary-list iron">
            <li>R-1: 所有 AI 角色底层模型由使用者选择</li>
            <li>R-2: 系统不能强制指定默认模型</li>
            <li>R-9: 支持 thinking 的模型默认开启思考</li>
            <li>R-10: 失败惩罚不能关闭 thinking</li>
            <li>P-5: 议事权不影响最终总结中观点权重</li>
            <li>V-6: 主理人无权审票</li>
            <li>H-3: 单轮最大扣血 = 20</li>
          </ul>
        </div>

        {/* 模型能力说明 */}
        <div className="model-info">
          <h4 className="subsection-title">模型能力说明</h4>
          <p className="placeholder-text">
            支持 Thinking 的模型（标记 supportsThinking=true）
            在被选择时会自动启用深度思考模式。
            用户可以手动关闭，但系统不会因惩罚自动关闭。
          </p>
        </div>
      </div>
    </div>
  )
}

export default RightPanel
