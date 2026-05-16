/**
 * 应用根组件
 *
 * 三栏布局：
 * - 左侧：会议室列表
 * - 中间：会议室配置（主理人 + 专家）
 * - 右侧：规则摘要 + 配置校验
 */

import React, { useEffect, useState, useCallback } from 'react'
import LeftPanel from './components/LeftPanel'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import type { Room, Agent, RulesConfig } from '../shared/types'

const App: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [moderator, setModerator] = useState<Agent | null>(null)
  const [experts, setExperts] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [dbReady, setDbReady] = useState(false)

  // 初始化：检查数据库 + 加载会议室
  useEffect(() => {
    const init = async () => {
      try {
        const health = await window.api.healthCheck()
        setDbReady(health.status === 'ok')
        if (health.status === 'ok') {
          await loadRooms()
        }
      } catch (e) {
        console.error('初始化失败:', e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // 加载会议室列表
  const loadRooms = useCallback(async () => {
    const res = await window.api.roomGetAll()
    if (res.success && res.data) {
      setRooms(res.data)
    }
  }, [])

  // 选择会议室后加载相关数据
  useEffect(() => {
    if (!selectedRoomId) {
      setModerator(null)
      setExperts([])
      return
    }
    const loadRoomData = async () => {
      const [modRes, expRes] = await Promise.all([
        window.api.agentGetModerator(selectedRoomId),
        window.api.agentGetExperts(selectedRoomId)
      ])
      if (modRes.success) setModerator(modRes.data ?? null)
      if (expRes.success && expRes.data) setExperts(expRes.data)
    }
    loadRoomData()
  }, [selectedRoomId])

  // 创建会议室
  const handleCreateRoom = useCallback(async () => {
    const res = await window.api.roomCreate({ name: '新会议室' })
    if (res.success && res.data) {
      await loadRooms()
      setSelectedRoomId(res.data.id)
    }
  }, [loadRooms])

  // 更新会议室
  const handleUpdateRoom = useCallback(
    async (id: string, name: string, description: string) => {
      const res = await window.api.roomUpdate({ id, name, description })
      if (res.success) {
        await loadRooms()
      }
    },
    [loadRooms]
  )

  // 更新规则
  const handleUpdateRules = useCallback(
    async (id: string, rules: RulesConfig) => {
      const res = await window.api.roomUpdateRules({ id, rules })
      if (res.success) {
        await loadRooms()
      }
    },
    [loadRooms]
  )

  // 删除会议室
  const handleDeleteRoom = useCallback(
    async (id: string) => {
      const res = await window.api.roomDelete(id)
      if (res.success) {
        if (selectedRoomId === id) setSelectedRoomId(null)
        await loadRooms()
      }
    },
    [loadRooms, selectedRoomId]
  )

  // 更新主理人
  const handleUpsertModerator = useCallback(
    async (data: Partial<Agent>) => {
      if (!selectedRoomId) return
      const res = await window.api.agentUpsertModerator({
        roomId: selectedRoomId,
        data
      })
      if (res.success && res.data) {
        setModerator(res.data)
      }
    },
    [selectedRoomId]
  )

  // 创建专家
  const handleCreateExpert = useCallback(async () => {
    if (!selectedRoomId) return
    const res = await window.api.agentCreateExpert({
      roomId: selectedRoomId,
      data: { name: '新专家' }
    })
    if (res.success && res.data) {
      setExperts((prev) => [...prev, res.data!])
    }
  }, [selectedRoomId])

  // 更新专家
  const handleUpdateExpert = useCallback(async (id: string, data: Partial<Agent>) => {
    const res = await window.api.agentUpdateExpert({ id, data })
    if (res.success && res.data) {
      setExperts((prev) => prev.map((e) => (e.id === id ? res.data! : e)))
    }
  }, [])

  // 删除专家
  const handleDeleteExpert = useCallback(async (id: string) => {
    const res = await window.api.agentDelete(id)
    if (res.success) {
      setExperts((prev) => prev.filter((e) => e.id !== id))
    }
  }, [])

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-screen">加载中...</div>
      </div>
    )
  }

  if (!dbReady) {
    return (
      <div className="app-container">
        <div className="loading-screen error-screen">数据库连接失败</div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* 顶部标题栏 */}
      <header className="app-header">
        <h1>AI 专家修罗场会议室</h1>
        <div className="header-status">
          <span className="status-dot ok" />
          <span>系统就绪</span>
        </div>
      </header>

      {/* 三栏主内容 */}
      <div className="main-content">
        <LeftPanel
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onCreateRoom={handleCreateRoom}
          onDeleteRoom={handleDeleteRoom}
        />
        <CenterPanel
          room={selectedRoom}
          moderator={moderator}
          experts={experts}
          onUpdateRoom={handleUpdateRoom}
          onUpsertModerator={handleUpsertModerator}
          onCreateExpert={handleCreateExpert}
          onUpdateExpert={handleUpdateExpert}
          onDeleteExpert={handleDeleteExpert}
          onUpdateRules={handleUpdateRules}
        />
        <RightPanel
          room={selectedRoom}
          moderator={moderator}
          experts={experts}
        />
      </div>

      {/* 底部状态栏 */}
      <footer className="app-footer">
        <span>AI 专家修罗场会议室 v0.1.0</span>
        <span>会议室: {rooms.length} 个</span>
      </footer>
    </div>
  )
}

export default App
