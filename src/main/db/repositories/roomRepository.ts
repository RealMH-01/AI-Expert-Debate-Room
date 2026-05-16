/**
 * Room Repository
 *
 * 数据访问层：会议室的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { Room, RulesConfig } from '../../../shared/types'
import { DEFAULT_RULES_CONFIG } from '../../../shared/types'

/**
 * 创建会议室
 */
export function createRoom(name: string, description?: string): Room {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()
  const rulesJson = JSON.stringify(DEFAULT_RULES_CONFIG)

  db.prepare(
    `INSERT INTO rooms (id, name, description, rules_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, description ?? '', rulesJson, now, now)

  return {
    id,
    name,
    description: description ?? '',
    rules_json: rulesJson,
    created_at: now,
    updated_at: now
  }
}

/**
 * 获取所有会议室列表
 */
export function getAllRooms(): Room[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC').all() as Room[]
}

/**
 * 根据 ID 获取会议室
 */
export function getRoomById(id: string): Room | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Room | undefined
}

/**
 * 更新会议室基础信息（名称和描述）
 */
export function updateRoom(id: string, name: string, description: string): Room | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(
    `UPDATE rooms SET name = ?, description = ?, updated_at = ? WHERE id = ?`
  ).run(name, description, now, id)

  return getRoomById(id)
}

/**
 * 更新会议室规则配置
 */
export function updateRoomRules(id: string, rules: RulesConfig): Room | undefined {
  const db = getDatabase()
  const now = new Date().toISOString()

  // 铁律强制校验
  const safeRules: RulesConfig = {
    ...rules,
    // 铁律字段强制覆盖
    influence_affects_final_summary_weight: false,
    moderator_can_validate_votes: false,
    // min_debate_rounds 不允许小于 3
    min_debate_rounds: Math.max(3, rules.min_debate_rounds),
    // max_hp_loss_per_round 不能超过 20
    max_hp_loss_per_round: Math.min(20, rules.max_hp_loss_per_round)
  }

  db.prepare(
    `UPDATE rooms SET rules_json = ?, updated_at = ? WHERE id = ?`
  ).run(JSON.stringify(safeRules), now, id)

  return getRoomById(id)
}

/**
 * 删除会议室（级联删除 agents）
 */
export function deleteRoom(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  return result.changes > 0
}
