/**
 * 中间面板：会议室配置区
 *
 * 包含：
 * - 会议室基本信息编辑
 * - 主理人配置
 * - 专家列表与编辑
 * - 规则配置
 */

import React from 'react'
import type { Room, Agent, RulesConfig } from '../../shared/types'
import RoomEditor from './RoomEditor'
import ModeratorEditor from './ModeratorEditor'
import ExpertList from './ExpertList'
import RulesEditor from './RulesEditor'

interface CenterPanelProps {
  room: Room | null
  moderator: Agent | null
  experts: Agent[]
  onUpdateRoom: (id: string, name: string, description: string) => void
  onUpsertModerator: (data: Partial<Agent>) => void
  onCreateExpert: () => void
  onUpdateExpert: (id: string, data: Partial<Agent>) => void
  onDeleteExpert: (id: string) => void
  onUpdateRules: (id: string, rules: RulesConfig) => void
}

const CenterPanel: React.FC<CenterPanelProps> = ({
  room,
  moderator,
  experts,
  onUpdateRoom,
  onUpsertModerator,
  onCreateExpert,
  onUpdateExpert,
  onDeleteExpert,
  onUpdateRules
}) => {
  if (!room) {
    return (
      <div className="panel-center">
        <div className="welcome-section">
          <h2>AI 专家修罗场会议室</h2>
          <p>
            请从左侧选择一个会议室，或新建一个会议室开始配置。
          </p>
          <p className="placeholder-text" style={{ marginTop: 16 }}>
            在会议室中你可以配置主理人、添加专家、设置辩论规则。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-center">
      <div className="center-scroll">
        {/* 会议室基本信息 */}
        <RoomEditor room={room} onUpdate={onUpdateRoom} />

        {/* 主理人配置 */}
        <ModeratorEditor moderator={moderator} onUpsert={onUpsertModerator} />

        {/* 专家列表 */}
        <ExpertList
          experts={experts}
          onCreateExpert={onCreateExpert}
          onUpdateExpert={onUpdateExpert}
          onDeleteExpert={onDeleteExpert}
        />

        {/* 规则配置 */}
        <RulesEditor room={room} onUpdateRules={onUpdateRules} />
      </div>
    </div>
  )
}

export default CenterPanel
