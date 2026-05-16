/**
 * 中间面板：会议室配置区 + 辩论区
 *
 * 包含：
 * - 会议室基本信息编辑
 * - 主理人配置
 * - 专家列表与编辑
 * - 规则配置
 * - 辩论面板（新增）
 *
 * 使用 tab 切换"配置"和"辩论"视图。
 */

import React, { useState } from 'react'
import type { Room, Agent, RulesConfig } from '../../shared/types'
import RoomEditor from './RoomEditor'
import ModeratorEditor from './ModeratorEditor'
import ExpertList from './ExpertList'
import RulesEditor from './RulesEditor'
import DebatePanel from './DebatePanel'
import HistoryList from './HistoryList'
import SessionDetail from './SessionDetail'

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

type TabId = 'config' | 'debate' | 'history'

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
  const [activeTab, setActiveTab] = useState<TabId>('config')
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null)

  if (!room) {
    return (
      <div className="panel-center">
        {/* Even without a room, show history tab */}
        <div className="center-tabs">
          <button
            className={`center-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            配置
          </button>
          <button
            className={`center-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); setSelectedHistorySessionId(null) }}
          >
            历史记录
          </button>
        </div>
        <div className="center-scroll">
          {activeTab === 'history' ? (
            selectedHistorySessionId ? (
              <SessionDetail
                sessionId={selectedHistorySessionId}
                onBack={() => setSelectedHistorySessionId(null)}
              />
            ) : (
              <HistoryList
                onSelectSession={(id) => setSelectedHistorySessionId(id)}
              />
            )
          ) : (
            <div className="welcome-section">
              <h2>AI 专家修罗场会议室</h2>
              <p>
                请从左侧选择一个会议室，或新建一个会议室开始配置。
              </p>
              <p className="placeholder-text" style={{ marginTop: 16 }}>
                在会议室中你可以配置主理人、添加专家、设置辩论规则。
                <br />
                点击"历史记录"标签查看所有历史会议。
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="panel-center">
      {/* Tab 切换栏 */}
      <div className="center-tabs">
        <button
          className={`center-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          配置
        </button>
        <button
          className={`center-tab ${activeTab === 'debate' ? 'active' : ''}`}
          onClick={() => setActiveTab('debate')}
        >
          辩论
        </button>
        <button
          className={`center-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => { setActiveTab('history'); setSelectedHistorySessionId(null) }}
        >
          历史记录
        </button>
      </div>

      {/* 内容区 */}
      <div className="center-scroll">
        {activeTab === 'config' && (
          <>
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
          </>
        )}

        {activeTab === 'debate' && (
          <DebatePanel roomId={room.id} />
        )}

        {activeTab === 'history' && (
          selectedHistorySessionId ? (
            <SessionDetail
              sessionId={selectedHistorySessionId}
              onBack={() => setSelectedHistorySessionId(null)}
            />
          ) : (
            <HistoryList
              onSelectSession={(id) => setSelectedHistorySessionId(id)}
            />
          )
        )}
      </div>
    </div>
  )
}

export default CenterPanel
