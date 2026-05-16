/**
 * Session Participant Repository
 *
 * 记录参加某场会议的专家/主理人在会议开始时的状态快照。
 * 用于历史详情还原，不受后续编辑影响。
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type { Agent } from '../../../shared/types'

export interface SessionParticipantRecord {
  id: string
  session_id: string
  agent_id: string
  role: string
  name: string
  provider: string | null
  model: string | null
  persona: string | null
  domain: string | null
  stance: string | null
  initial_hp: number
  final_hp: number | null
  initial_influence: number
  initial_prestige: number
  status: string
  created_at: string
}

/**
 * 批量保存参会者快照（session 创建时调用）
 */
export function insertParticipants(
  sessionId: string,
  agents: Agent[]
): SessionParticipantRecord[] {
  const db = getDatabase()
  const now = new Date().toISOString()
  const results: SessionParticipantRecord[] = []

  const stmt = db.prepare(
    `INSERT INTO session_participants (id, session_id, agent_id, role, name, provider, model, persona, domain, stance, initial_hp, final_hp, initial_influence, initial_prestige, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  )

  const insertTxn = db.transaction(() => {
    for (const agent of agents) {
      const id = uuidv4()
      stmt.run(
        id,
        sessionId,
        agent.id,
        agent.role,
        agent.name,
        agent.provider,
        agent.model,
        agent.persona,
        agent.domain,
        agent.stance,
        agent.hp,
        agent.influence,
        agent.prestige,
        agent.status,
        now
      )
      results.push({
        id,
        session_id: sessionId,
        agent_id: agent.id,
        role: agent.role,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        persona: agent.persona,
        domain: agent.domain,
        stance: agent.stance,
        initial_hp: agent.hp,
        final_hp: null,
        initial_influence: agent.influence,
        initial_prestige: agent.prestige,
        status: agent.status,
        created_at: now
      })
    }
  })

  insertTxn()
  return results
}

/**
 * 更新参会者最终状态（session 结束时调用）
 */
export function updateParticipantFinalState(
  sessionId: string,
  agentId: string,
  finalHp: number,
  status: string
): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE session_participants SET final_hp = ?, status = ? WHERE session_id = ? AND agent_id = ?'
  ).run(finalHp, status, sessionId, agentId)
}

/**
 * 获取某 session 的所有参会者
 */
export function getParticipantsBySession(
  sessionId: string
): SessionParticipantRecord[] {
  const db = getDatabase()
  return db
    .prepare(
      'SELECT * FROM session_participants WHERE session_id = ? ORDER BY role ASC, created_at ASC'
    )
    .all(sessionId) as SessionParticipantRecord[]
}
