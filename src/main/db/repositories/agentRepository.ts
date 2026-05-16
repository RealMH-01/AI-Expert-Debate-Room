/**
 * Agent Repository
 *
 * 数据访问层：智能体（主理人 / 专家）的 CRUD 操作。
 * 所有数据库操作只在 Main Process 执行。
 *
 * 关键规则：
 * - 一个 Room 只能有一个 moderator。如果重复创建，应更新而不是创建多个。
 * - Expert 数量由使用者决定。
 * - HP 初始 100，max_hp 100。
 * - 专家状态默认 active。
 * - 系统不能强制指定默认模型（provider/model 可为空）。
 *
 * 重要：
 * - 更新时使用 !== undefined 判断，而非 ??。
 *   这允许用户明确传入 null 来清空字段（如取消选择模型）。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { Agent } from '../../../shared/types'

/**
 * 安全取值：如果 data 中明确设置了该字段（包括 null），则使用 data 值；
 * 否则沿用 existing 值。
 */
function resolve<T>(dataValue: T | undefined, existingValue: T): T {
  return dataValue !== undefined ? dataValue : existingValue
}

/**
 * 创建或更新主理人
 * 如果已存在 moderator，则更新；否则创建。
 */
export function upsertModerator(
  roomId: string,
  data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
): Agent {
  const db = getDatabase()
  const existing = db
    .prepare("SELECT * FROM agents WHERE room_id = ? AND role = 'moderator'")
    .get(roomId) as Agent | undefined

  const now = new Date().toISOString()

  if (existing) {
    // 更新现有主理人 — 使用 resolve 确保明确传入 null 能清空字段
    db.prepare(
      `UPDATE agents SET
        name = ?, provider = ?, model = ?, persona = ?,
        stance = ?, memory = ?, supports_thinking = ?,
        thinking_enabled = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      resolve(data.name, existing.name),
      resolve(data.provider, existing.provider),
      resolve(data.model, existing.model),
      resolve(data.persona, existing.persona),
      resolve(data.stance, existing.stance),
      resolve(data.memory, existing.memory),
      resolve(data.supports_thinking, existing.supports_thinking),
      resolve(data.thinking_enabled, existing.thinking_enabled),
      resolve(data.status, existing.status),
      now,
      existing.id
    )
    return getAgentById(existing.id)!
  } else {
    // 创建新的主理人
    const id = uuidv4()
    db.prepare(
      `INSERT INTO agents (id, room_id, role, name, provider, model, persona, stance, memory,
        supports_thinking, thinking_enabled, hp, max_hp, influence, prestige, status, aggression,
        created_at, updated_at)
       VALUES (?, ?, 'moderator', ?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 0, 0, 'active', 50, ?, ?)`
    ).run(
      id,
      roomId,
      data.name !== undefined ? data.name : '主理人',
      data.provider !== undefined ? data.provider : null,
      data.model !== undefined ? data.model : null,
      data.persona !== undefined ? data.persona : null,
      data.stance !== undefined ? data.stance : null,
      data.memory !== undefined ? data.memory : null,
      data.supports_thinking !== undefined ? data.supports_thinking : 0,
      data.thinking_enabled !== undefined ? data.thinking_enabled : 0,
      now,
      now
    )
    return getAgentById(id)!
  }
}

/**
 * 获取会议室的主理人
 */
export function getModerator(roomId: string): Agent | undefined {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM agents WHERE room_id = ? AND role = 'moderator'")
    .get(roomId) as Agent | undefined
}

/**
 * 创建专家
 */
export function createExpert(
  roomId: string,
  data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
): Agent {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO agents (id, room_id, role, name, provider, model, persona, domain, stance, memory,
      supports_thinking, thinking_enabled, hp, max_hp, influence, prestige, status, aggression,
      created_at, updated_at)
     VALUES (?, ?, 'expert', ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 0, 0, 'active', ?, ?, ?)`
  ).run(
    id,
    roomId,
    data.name !== undefined ? data.name : '专家',
    data.provider !== undefined ? data.provider : null,
    data.model !== undefined ? data.model : null,
    data.persona !== undefined ? data.persona : null,
    data.domain !== undefined ? data.domain : null,
    data.stance !== undefined ? data.stance : null,
    data.memory !== undefined ? data.memory : null,
    data.supports_thinking !== undefined ? data.supports_thinking : 0,
    data.thinking_enabled !== undefined ? data.thinking_enabled : 0,
    data.aggression !== undefined ? data.aggression : 50,
    now,
    now
  )

  return getAgentById(id)!
}

/**
 * 更新专家
 * 使用 resolve (!== undefined) 确保明确传入 null 时能清空字段
 */
export function updateExpert(
  id: string,
  data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
): Agent | undefined {
  const db = getDatabase()
  const existing = getAgentById(id)
  if (!existing) return undefined

  const now = new Date().toISOString()

  db.prepare(
    `UPDATE agents SET
      name = ?, provider = ?, model = ?, persona = ?, domain = ?, stance = ?, memory = ?,
      supports_thinking = ?, thinking_enabled = ?, hp = ?, max_hp = ?,
      influence = ?, prestige = ?, status = ?, aggression = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    resolve(data.name, existing.name),
    resolve(data.provider, existing.provider),
    resolve(data.model, existing.model),
    resolve(data.persona, existing.persona),
    resolve(data.domain, existing.domain),
    resolve(data.stance, existing.stance),
    resolve(data.memory, existing.memory),
    resolve(data.supports_thinking, existing.supports_thinking),
    resolve(data.thinking_enabled, existing.thinking_enabled),
    resolve(data.hp, existing.hp),
    resolve(data.max_hp, existing.max_hp),
    resolve(data.influence, existing.influence),
    resolve(data.prestige, existing.prestige),
    resolve(data.status, existing.status),
    resolve(data.aggression, existing.aggression),
    now,
    id
  )

  return getAgentById(id)
}

/**
 * 删除专家
 */
export function deleteAgent(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * 获取会议室的所有专家
 */
export function getExperts(roomId: string): Agent[] {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM agents WHERE room_id = ? AND role = 'expert' ORDER BY created_at ASC")
    .all(roomId) as Agent[]
}

/**
 * 获取会议室的所有 Agent（含主理人和专家）
 */
export function getAgentsByRoom(roomId: string): Agent[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM agents WHERE room_id = ? ORDER BY role ASC, created_at ASC')
    .all(roomId) as Agent[]
}

/**
 * 根据 ID 获取单个 Agent
 */
export function getAgentById(id: string): Agent | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined
}
