/**
 * HistoryList - 历史会议列表
 *
 * 功能：
 * - 显示历史会议列表
 * - 搜索标题/问题
 * - 按 room 过滤
 * - 按时间倒序
 * - 删除（带确认）
 * - 点击进入详情
 */

import React, { useEffect, useState, useCallback } from 'react'

interface HistorySessionItem {
  id: string
  room_id: string
  room_name: string
  title: string
  user_question: string | null
  status: string
  created_at: string
  updated_at: string
  expert_count: number
  message_count: number
  has_votes: boolean
  has_settlement: boolean
  has_hell_pool: boolean
  final_summary: string | null
}

interface RoomFilter {
  id: string
  name: string
}

interface HistoryListProps {
  onSelectSession: (sessionId: string) => void
}

const HistoryList: React.FC<HistoryListProps> = ({ onSelectSession }) => {
  const [items, setItems] = useState<HistorySessionItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState<string>('')
  const [rooms, setRooms] = useState<RoomFilter[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [dbPath, setDbPath] = useState<string>('')

  // Load rooms for filter
  useEffect(() => {
    const loadRooms = async () => {
      const res = await window.api.historyGetRoomsForFilter()
      if (res.success && res.data) {
        setRooms(res.data)
      }
    }
    loadRooms()

    // Load DB path
    const loadDbPath = async () => {
      const res = await window.api.exportGetDbPath()
      if (res.success && res.data) {
        setDbPath(res.data)
      }
    }
    loadDbPath()
  }, [])

  // Load history list
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.historyGetList({
        search: search || undefined,
        roomId: roomFilter || undefined,
        limit: 100,
        offset: 0
      })
      if (res.success && res.data) {
        setItems(res.data.items as HistorySessionItem[])
        setTotal(res.data.total)
      }
    } catch (e) {
      console.error('加载历史失败:', e)
    } finally {
      setLoading(false)
    }
  }, [search, roomFilter])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Delete session
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      try {
        const res = await window.api.historyDeleteSession(id)
        if (res.success) {
          await loadHistory()
        }
      } catch (err) {
        console.error('删除失败:', err)
      }
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
      setTimeout(() => setConfirmDeleteId(null), 3000)
    }
  }

  // Export all data
  const handleExportAll = async () => {
    try {
      const res = await window.api.exportAllDataJson()
      if (res.success && res.data && !res.data.canceled) {
        alert(`全量数据已导出到: ${res.data.filePath}`)
      }
    } catch (e) {
      alert('导出失败: ' + (e as Error).message)
    }
  }

  const formatTime = (iso: string) => {
    if (!iso) return '未知'
    try {
      const d = new Date(iso)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return iso
    }
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      preparing: '准备中',
      running: '进行中',
      finished: '已完成',
      failed: '失败',
      aborted: '已中止'
    }
    return map[status] || status
  }

  return (
    <div className="history-list-container">
      <div className="history-header">
        <h3>历史会议</h3>
        <span className="history-count">共 {total} 场</span>
      </div>

      {/* 搜索和过滤 */}
      <div className="history-filters">
        <input
          type="text"
          className="form-input history-search"
          placeholder="搜索标题或问题关键词..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select history-room-filter"
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
        >
          <option value="">所有会议室</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* 列表 */}
      <div className="history-items">
        {loading ? (
          <div className="history-empty">加载中...</div>
        ) : items.length === 0 ? (
          <div className="history-empty">
            {search || roomFilter ? '没有匹配的会议记录' : '暂无历史会议。运行一场辩论后记录将出现在这里。'}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="history-item"
              onClick={() => onSelectSession(item.id)}
            >
              <div className="history-item-top">
                <span className="history-item-title">{item.title}</span>
                <span className={`history-item-status status-${item.status}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="history-item-meta">
                <span className="history-item-room">{item.room_name}</span>
                <span className="history-item-time">{formatTime(item.created_at)}</span>
              </div>
              {item.user_question && (
                <div className="history-item-question">
                  {item.user_question.length > 80
                    ? item.user_question.slice(0, 80) + '...'
                    : item.user_question}
                </div>
              )}
              <div className="history-item-badges">
                <span className="history-badge">{item.expert_count} 专家</span>
                <span className="history-badge">{item.message_count} 消息</span>
                {item.has_votes && <span className="history-badge badge-vote">有投票</span>}
                {item.has_settlement && <span className="history-badge badge-settle">有结算</span>}
                {item.has_hell_pool && <span className="history-badge badge-hell">有Hell Pool</span>}
              </div>
              <button
                className={`btn-delete-small ${confirmDeleteId === item.id ? 'confirm' : ''}`}
                onClick={(e) => handleDelete(item.id, e)}
                title={confirmDeleteId === item.id ? '再次点击确认删除' : '删除会议'}
              >
                {confirmDeleteId === item.id ? '确认删除?' : '×'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="history-footer">
        <div className="history-db-path">
          <span className="history-db-label">数据库: </span>
          <span className="history-db-value" title={dbPath}>
            {dbPath || '未知'}
          </span>
        </div>
        <button className="btn btn-small" onClick={handleExportAll}>
          导出全部数据
        </button>
      </div>
    </div>
  )
}

export default HistoryList
