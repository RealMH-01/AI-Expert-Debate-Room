import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../sqlite'
import type {
  NormalizedAttackInput,
  NormalizedClaimInput
} from '../../claims/claimTracker'

export interface ClaimRecord {
  id: string
  meeting_id: string
  round_index: number
  speaker_expert_id: string
  source_message_id: string
  claim_text: string
  status: 'active' | 'revised' | 'abandoned'
  revised_from_claim_id: string | null
  created_at: string
  updated_at: string
}

export interface AttackRecord {
  id: string
  meeting_id: string
  round_index: number
  attacker_expert_id: string
  target_expert_id: string | null
  target_claim_id: string | null
  target_claim_text: string | null
  attack_text: string
  attack_dimensions_json: string
  source_message_id: string
  created_at: string
}

export function insertClaimsForMessage(params: {
  meetingId: string
  roundIndex: number
  speakerExpertId: string
  sourceMessageId: string
  claims: NormalizedClaimInput[]
}): ClaimRecord[] {
  const db = getDatabase()
  const now = new Date().toISOString()
  const insertedIds: string[] = []

  const insertTxn = db.transaction(() => {
    for (const claim of params.claims.slice(0, 3)) {
      const id = uuidv4()
      db.prepare(
        `INSERT INTO claims (
          id, meeting_id, round_index, speaker_expert_id, source_message_id,
          claim_text, status, revised_from_claim_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        params.meetingId,
        params.roundIndex,
        params.speakerExpertId,
        params.sourceMessageId,
        claim.claim_text,
        claim.status,
        claim.revised_from_claim_id,
        now,
        now
      )
      insertedIds.push(id)

      if (claim.revised_from_claim_id) {
        markClaimStatus(claim.revised_from_claim_id, 'revised')
      }
    }
  })

  insertTxn()
  return insertedIds.map((id) => getClaimById(id)).filter((c): c is ClaimRecord => !!c)
}

export function insertAttacksForMessage(params: {
  meetingId: string
  roundIndex: number
  attackerExpertId: string
  sourceMessageId: string
  attacks: NormalizedAttackInput[]
}): AttackRecord[] {
  const db = getDatabase()
  const now = new Date().toISOString()
  const insertedIds: string[] = []

  const insertTxn = db.transaction(() => {
    for (const attack of params.attacks) {
      const id = uuidv4()
      db.prepare(
        `INSERT INTO attacks (
          id, meeting_id, round_index, attacker_expert_id, target_expert_id,
          target_claim_id, target_claim_text, attack_text, attack_dimensions_json,
          source_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        params.meetingId,
        params.roundIndex,
        params.attackerExpertId,
        attack.target_expert_id,
        attack.target_claim_id,
        attack.target_claim_text,
        attack.attack_text,
        JSON.stringify(attack.attack_dimensions),
        params.sourceMessageId,
        now
      )
      insertedIds.push(id)
    }
  })

  insertTxn()
  return insertedIds.map((id) => getAttackById(id)).filter((a): a is AttackRecord => !!a)
}

export function markClaimStatus(
  claimId: string,
  status: 'active' | 'revised' | 'abandoned'
): void {
  const db = getDatabase()
  db.prepare('UPDATE claims SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    claimId
  )
}

export function getClaimById(id: string): ClaimRecord | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as ClaimRecord | undefined
}

export function getAttackById(id: string): AttackRecord | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM attacks WHERE id = ?').get(id) as AttackRecord | undefined
}

export function getClaimsByMeeting(meetingId: string): ClaimRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM claims WHERE meeting_id = ? ORDER BY round_index ASC, created_at ASC')
    .all(meetingId) as ClaimRecord[]
}

export function getAttacksByMeeting(meetingId: string): AttackRecord[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM attacks WHERE meeting_id = ? ORDER BY round_index ASC, created_at ASC')
    .all(meetingId) as AttackRecord[]
}
