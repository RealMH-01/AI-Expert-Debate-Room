type SummaryScope = 'round' | 'session'

interface MinimalSessionDetail {
  session: {
    id: string
    title: string
    user_question: string | null
    final_summary: string | null
  }
  room_name: string
  participants: Array<{
    agent_id: string
    role: string
    name: string
    status: string
    initial_hp?: number
    final_hp?: number | null
  }>
  messages: Array<{
    id: string
    phase: string
    round_index: number
    speaker_id: string | null
    speaker_name: string | null
    speaker_role: string | null
    content: string
  }>
  votes: Array<{
    voter_agent_id: string
    target_agent_id: string
    score: number
    valid: number
    round_index: number
  }>
  settlements: Array<{
    round_index: number
    status: string
    settlement_json: string
  }>
  claims: Array<{
    source_message_id: string
    speaker_expert_id: string
    round_index: number
    claim_text: string
    status: string
    revised_from_claim_id?: string | null
  }>
  attacks: Array<{
    source_message_id: string
    attacker_expert_id: string
    target_expert_id: string | null
    target_claim_text: string | null
    attack_text: string
    attack_dimensions_json: string
    round_index: number
  }>
  review?: {
    review_json: string
  } | null
}

export interface ContextStructuredSummary {
  user_question: string
  meeting_topic: string
  core_claims: string[]
  key_attacks: string[]
  revisions: string[]
  vote_summary: string[]
  hp_summary: string[]
  hell_pool: string[]
  moderator_final_summary: string
  open_disagreements: string[]
}

export interface BuiltContextSummary {
  meeting_id: string
  scope: SummaryScope
  round_index: number | null
  summary_text: string
  structured_summary: ContextStructuredSummary
  source_message_ids: string[]
  created_by: 'system' | 'mock_provider' | 'provider'
}

export function buildSessionContextSummary(detail: MinimalSessionDetail): BuiltContextSummary {
  return buildContextSummary(detail, 'session', null)
}

export function buildRoundContextSummary(
  detail: MinimalSessionDetail,
  roundIndex: number
): BuiltContextSummary {
  return buildContextSummary(detail, 'round', roundIndex)
}

function buildContextSummary(
  detail: MinimalSessionDetail,
  scope: SummaryScope,
  roundIndex: number | null
): BuiltContextSummary {
  const messages = filterByScope(detail.messages, scope, roundIndex)
  const messageIds = new Set(messages.map((message) => message.id))
  const claims = detail.claims.filter((claim) =>
    scope === 'session' ? true : claim.round_index === roundIndex
  )
  const attacks = detail.attacks.filter((attack) =>
    scope === 'session' ? true : attack.round_index === roundIndex
  )
  const settlements = detail.settlements.filter((settlement) =>
    scope === 'session' ? true : settlement.round_index === roundIndex
  )
  const votes = detail.votes.filter((vote) =>
    scope === 'session' ? true : vote.round_index === roundIndex
  )
  const nameOf = buildNameLookup(detail.participants)

  const structured: ContextStructuredSummary = {
    user_question: detail.session.user_question || '',
    meeting_topic: detail.session.title || detail.room_name,
    core_claims: claims.slice(0, 24).map((claim) => {
      const speaker = nameOf(claim.speaker_expert_id)
      return `${speaker}: ${claim.claim_text}`
    }),
    key_attacks: attacks.slice(0, 24).map((attack) => {
      const attacker = nameOf(attack.attacker_expert_id)
      const target = attack.target_expert_id ? nameOf(attack.target_expert_id) : 'unbound target'
      const targetClaim = attack.target_claim_text ? ` Target claim: ${attack.target_claim_text}` : ''
      return `${attacker} -> ${target}: ${attack.attack_text}${targetClaim}`
    }),
    revisions: claims
      .filter((claim) => claim.status !== 'active' || claim.revised_from_claim_id)
      .map((claim) => `${nameOf(claim.speaker_expert_id)}: [${claim.status}] ${claim.claim_text}`),
    vote_summary: votes.slice(0, 30).map((vote) => {
      const validity = vote.valid === 1 ? 'valid' : 'invalid'
      return `Round ${vote.round_index}: ${nameOf(vote.voter_agent_id)} -> ${nameOf(vote.target_agent_id)} score ${vote.score} (${validity})`
    }),
    hp_summary: buildHpSummary(settlements),
    hell_pool: detail.participants
      .filter((participant) => participant.status === 'hell_pool')
      .map((participant) => `${participant.name}: final HP ${participant.final_hp ?? 0}`),
    moderator_final_summary: getFinalSummary(detail, messages),
    open_disagreements: extractOpenDisagreements(detail)
  }

  const summaryText = buildSummaryText(structured, scope, roundIndex)

  return {
    meeting_id: detail.session.id,
    scope,
    round_index: roundIndex,
    summary_text: summaryText,
    structured_summary: structured,
    source_message_ids: Array.from(messageIds),
    created_by: 'system'
  }
}

function filterByScope<T extends { round_index: number }>(
  rows: T[],
  scope: SummaryScope,
  roundIndex: number | null
): T[] {
  if (scope === 'session') return [...rows]
  return rows.filter((row) => row.round_index === roundIndex)
}

function buildNameLookup(participants: MinimalSessionDetail['participants']) {
  const names = new Map<string, string>()
  for (const participant of participants) {
    names.set(participant.agent_id, participant.name)
  }
  return (agentId: string): string => names.get(agentId) || agentId
}

function buildHpSummary(settlements: MinimalSessionDetail['settlements']): string[] {
  const result: string[] = []
  for (const settlement of settlements) {
    try {
      const parsed = JSON.parse(settlement.settlement_json) as {
        items?: Array<{
          agentName?: string
          hpBefore?: number
          hpChange?: number
          hpAfter?: number
          enterHellPool?: boolean
        }>
        skipReason?: string
      }
      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          const change = typeof item.hpChange === 'number' && item.hpChange > 0
            ? `+${item.hpChange}`
            : `${item.hpChange ?? 0}`
          result.push(
            `Round ${settlement.round_index} (${settlement.status}): ${item.agentName || 'unknown'} HP ${item.hpBefore ?? '?'} -> ${item.hpAfter ?? '?'} (${change})${item.enterHellPool ? ', Hell Pool' : ''}`
          )
        }
      } else if (parsed.skipReason) {
        result.push(`Round ${settlement.round_index} (${settlement.status}): skipped, ${parsed.skipReason}`)
      }
    } catch {
      result.push(`Round ${settlement.round_index} (${settlement.status}): settlement JSON unavailable`)
    }
  }
  return result
}

function getFinalSummary(
  detail: MinimalSessionDetail,
  messages: MinimalSessionDetail['messages']
): string {
  const finalMessage = [...messages]
    .reverse()
    .find((message) => message.phase === 'moderator_final_summary')
  return finalMessage?.content || detail.session.final_summary || ''
}

function extractOpenDisagreements(detail: MinimalSessionDetail): string[] {
  if (!detail.review?.review_json) return []
  try {
    const parsed = JSON.parse(detail.review.review_json) as { unresolved_questions?: unknown }
    if (!Array.isArray(parsed.unresolved_questions)) return []
    return parsed.unresolved_questions.map((item) => String(item)).filter(Boolean)
  } catch {
    return []
  }
}

function buildSummaryText(
  structured: ContextStructuredSummary,
  scope: SummaryScope,
  roundIndex: number | null
): string {
  const title = scope === 'round' ? `Round ${roundIndex} context summary` : 'Session context summary'
  const parts = [
    title,
    `Question: ${structured.user_question || 'N/A'}`,
    `Topic: ${structured.meeting_topic || 'N/A'}`
  ]

  appendSection(parts, 'Core claims', structured.core_claims)
  appendSection(parts, 'Key attacks', structured.key_attacks)
  appendSection(parts, 'Revisions', structured.revisions)
  appendSection(parts, 'Votes', structured.vote_summary)
  appendSection(parts, 'HP changes', structured.hp_summary)
  appendSection(parts, 'Hell Pool', structured.hell_pool)
  if (structured.moderator_final_summary) {
    parts.push(`Final summary: ${structured.moderator_final_summary}`)
  }
  appendSection(parts, 'Open disagreements', structured.open_disagreements)

  return parts.join('\n')
}

function appendSection(parts: string[], label: string, rows: string[]): void {
  if (rows.length === 0) return
  parts.push(`${label}:`)
  for (const row of rows) {
    parts.push(`- ${row}`)
  }
}
