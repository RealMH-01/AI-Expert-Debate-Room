/**
 * 会议室基本信息编辑器
 */

import React, { useState, useEffect } from 'react'
import type { Room } from '../../shared/types'

interface RoomEditorProps {
  room: Room
  onUpdate: (id: string, name: string, description: string) => void
}

const RoomEditor: React.FC<RoomEditorProps> = ({ room, onUpdate }) => {
  const [name, setName] = useState(room.name)
  const [description, setDescription] = useState(room.description || '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setName(room.name)
    setDescription(room.description || '')
    setDirty(false)
  }, [room.id, room.name, room.description])

  const handleSave = () => {
    if (!name.trim()) return
    onUpdate(room.id, name.trim(), description)
    setDirty(false)
  }

  return (
    <section className="config-section">
      <h3 className="section-title">会议室配置</h3>
      <div className="form-group">
        <label className="form-label">名称 *</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
          placeholder="输入会议室名称"
        />
        {!name.trim() && <span className="form-error">名称不能为空</span>}
      </div>
      <div className="form-group">
        <label className="form-label">描述</label>
        <textarea
          className="form-textarea"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            setDirty(true)
          }}
          placeholder="可选：会议室描述"
          rows={2}
        />
      </div>
      {dirty && (
        <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
          保存会议室信息
        </button>
      )}
    </section>
  )
}

export default RoomEditor
