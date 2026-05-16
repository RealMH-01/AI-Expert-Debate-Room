/**
 * 左侧面板：会议室列表
 *
 * 功能：
 * - 展示所有会议室
 * - 新建会议室
 * - 选择会议室
 * - 删除会议室（带确认）
 */

import React, { useState } from 'react'
import type { Room } from '../../shared/types'

interface LeftPanelProps {
  rooms: Room[]
  selectedRoomId: string | null
  onSelectRoom: (id: string) => void
  onCreateRoom: () => void
  onDeleteRoom: (id: string) => void
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onCreateRoom,
  onDeleteRoom
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      onDeleteRoom(id)
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
      // 3 秒后取消确认状态
      setTimeout(() => setConfirmDeleteId(null), 3000)
    }
  }

  return (
    <div className="panel-left">
      <div className="panel-title">
        <span>会议室列表</span>
      </div>

      <div className="panel-body">
        <button className="btn btn-primary btn-full" onClick={onCreateRoom}>
          + 新建会议室
        </button>

        <div className="room-list">
          {rooms.length === 0 ? (
            <p className="placeholder-text" style={{ marginTop: 16, textAlign: 'center' }}>
              暂无会议室，点击上方按钮创建
            </p>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className={`room-item ${selectedRoomId === room.id ? 'active' : ''}`}
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="room-item-name">{room.name}</div>
                <div className="room-item-desc">
                  {room.description || '无描述'}
                </div>
                <button
                  className={`btn-delete-small ${confirmDeleteId === room.id ? 'confirm' : ''}`}
                  onClick={(e) => handleDelete(room.id, e)}
                  title={confirmDeleteId === room.id ? '再次点击确认删除' : '删除会议室'}
                >
                  {confirmDeleteId === room.id ? '确认?' : '×'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default LeftPanel
