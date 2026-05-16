/**
 * Session Review Builder
 *
 * 规则方式从已有消息、投票、结算中生成结构化复盘数据。
 * 不调用任何模型，纯粹基于数据库已有数据。
 */

import type {
  SessionFullDetail,
  SessionParticipant,
  SessionMessage,
  SessionVote,
  SessionSettlement,
  SessionSnapshot
} from '../db/repositories/historyRepository'

export interface ReviewData {
  question: string
  room_name: string
  mode: string
  participants: ReviewParticipant[]
  round_count: number
  core_disputes: string[]
  expert_positions: ReviewExpertPosition[]
  major_attacks: string[]
  revisions: string[]
  voting_summary: ReviewVotingSummary[]
  hp_changes: ReviewHpChange[]
  hell_pool: ReviewHellPoolEntry[]
  final_recommendation: string
  unresolved_questions: string[]
}

export interface ReviewParticipant {
  name: string
  role: string
  provider: string | null
  model: string | null
  persona: string | null
  domain: string | null
  stance: string | null
  initial_hp: number
  final_hp: number | null
  status: string
}

export interface ReviewExpertPosition {
  expert_name: string
  stance: string | null
  key_arguments: string[]
}

export interface ReviewVotingSummary {
  round_index: number
  voter_name: string
  target_name: string
  score: number
  valid: boolean
}

export interface ReviewHpChange {
  expert_name: string
  hp_before: number
  hp_change: number
  hp_after: number
  reason: string
}

export interface ReviewHellPoolEntry {
  expert_name: string
  hp_at_entry: number
  round_entered: number
}

/**
 * 从 session 完整数据构建结构化复盘
 */
export function buildSessionReview(detail: SessionFullDetail): ReviewData {
  const { session, room_name, participants, messages, votes, settlements, snapshots } = detail

  // 1. Participants
  const reviewParticipants = participants.map(
    (p): ReviewParticipant => ({
      name: p.name,
      role: p.role,
      provider: p.provider,
      model: p.model,
      persona: p.persona,
      domain: p.domain,
      stance: p.stance,
      initial_hp: p.initial_hp,
      final_hp: p.final_hp,
      status: p.status
    })
  )

  // 2. Round count
  const debateMessages = messages.filter((m) => m.phase === 'debate_round')
  const roundIndices = [...new Set(debateMessages.map((m) => m.round_index))]
  const round_count = roundIndices.length

  // 3. Expert positions - extract from initial answers
  const initialMessages = messages.filter(
    (m) => m.phase === 'expert_initial' && m.speaker_role === 'expert'
  )
  const expertPositions: ReviewExpertPosition[] = initialMessages.map((msg) => {
    const participant = participants.find((p) => p.agent_id === msg.speaker_id)
    return {
      expert_name: msg.speaker_name || '未知',
      stance: participant?.stance || null,
      key_arguments: extractKeyPoints(msg.content)
    }
  })

  // 4. Core disputes - extract from debate rounds
  const coreDisputes = extractCoreDisputes(messages)

  // 5. Major attacks - from debate content
  const majorAttacks = extractMajorAttacks(messages)

  // 6. Revisions
  const revisions = extractRevisions(messages)

  // 7. Voting summary
  const votingSummary = buildVotingSummary(votes, participants)

  // 8. HP changes
  const hpChanges = buildHpChanges(settlements, participants)

  // 9. Hell Pool
  const hellPool = buildHellPoolEntries(snapshots, participants)

  // 10. Final recommendation
  const finalSummaryMsg = messages.find(
    (m) => m.phase === 'moderator_final_summary' && m.speaker_role === 'moderator'
  )
  const final_recommendation =
    session.final_summary || finalSummaryMsg?.content || '无最终总结'

  // 11. Unresolved questions
  const unresolvedQuestions = extractUnresolvedQuestions(messages)

  return {
    question: session.user_question || '',
    room_name,
    mode: 'default',
    participants: reviewParticipants,
    round_count,
    core_disputes: coreDisputes,
    expert_positions: expertPositions,
    major_attacks: majorAttacks,
    revisions,
    voting_summary: votingSummary,
    hp_changes: hpChanges,
    hell_pool: hellPool,
    final_recommendation,
    unresolved_questions: unresolvedQuestions
  }
}

// ===== Helper functions =====

/**
 * 从消息内容提取关键要点（简单规则：取前 3 个有意义的句子片段）
 */
function extractKeyPoints(content: string): string[] {
  const sentences = content
    .split(/[。！？\.\!\?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
  return sentences.slice(0, 3)
}

/**
 * 从辩论消息中提取核心争议
 */
function extractCoreDisputes(messages: SessionMessage[]): string[] {
  const disputes: string[] = []
  const roundSummaries = messages.filter(
    (m) => m.phase === 'moderator_round_summary' && m.speaker_role === 'moderator'
  )

  for (const summary of roundSummaries) {
    const lines = summary.content.split('\n').filter((l) => l.trim().length > 5)
    // Take first meaningful line as dispute summary
    if (lines.length > 0) {
      disputes.push(`第${summary.round_index}轮: ${lines[0].replace(/^[#\-*\s]+/, '').trim()}`)
    }
  }

  if (disputes.length === 0) {
    disputes.push('无明确争议记录（请查看辩论详情）')
  }

  return disputes
}

/**
 * 从辩论消息中提取主要攻击
 */
function extractMajorAttacks(messages: SessionMessage[]): string[] {
  const attacks: string[] = []
  const debateMsgs = messages.filter(
    (m) => m.phase === 'debate_round' && m.speaker_role === 'expert'
  )

  for (const msg of debateMsgs) {
    // Look for attack-like content (contains "反驳", "不同意", "质疑" etc.)
    const content = msg.content
    if (
      content.includes('反驳') ||
      content.includes('不同意') ||
      content.includes('质疑') ||
      content.includes('attack') ||
      content.includes('disagree')
    ) {
      const firstLine = content.split('\n')[0].replace(/^[#\-*\s]+/, '').trim()
      if (firstLine.length > 10) {
        attacks.push(`${msg.speaker_name}(第${msg.round_index}轮): ${firstLine.slice(0, 80)}`)
      }
    }
  }

  if (attacks.length === 0) {
    // Fallback: list any debate messages as potential attacks
    for (const msg of debateMsgs.slice(0, 3)) {
      const firstLine = msg.content.split('\n')[0].replace(/^[#\-*\s]+/, '').trim()
      attacks.push(`${msg.speaker_name}(第${msg.round_index}轮): ${firstLine.slice(0, 80)}`)
    }
  }

  return attacks.slice(0, 10)
}

/**
 * 提取修正记录
 */
function extractRevisions(messages: SessionMessage[]): string[] {
  const revisions: string[] = []
  const debateMsgs = messages.filter(
    (m) => m.phase === 'debate_round' && m.speaker_role === 'expert'
  )

  for (const msg of debateMsgs) {
    if (
      msg.content.includes('修正') ||
      msg.content.includes('更新') ||
      msg.content.includes('revise') ||
      msg.content.includes('adjust')
    ) {
      const firstLine = msg.content.split('\n')[0].replace(/^[#\-*\s]+/, '').trim()
      if (firstLine.length > 10) {
        revisions.push(`${msg.speaker_name}: ${firstLine.slice(0, 80)}`)
      }
    }
  }

  return revisions.slice(0, 5)
}

/**
 * 构建投票摘要
 */
function buildVotingSummary(
  votes: SessionVote[],
  participants: SessionParticipant[]
): ReviewVotingSummary[] {
  const nameMap = new Map<string, string>()
  for (const p of participants) {
    nameMap.set(p.agent_id, p.name)
  }

  return votes.map((v) => ({
    round_index: v.round_index,
    voter_name: nameMap.get(v.voter_agent_id) || '未知',
    target_name: nameMap.get(v.target_agent_id) || '未知',
    score: v.score,
    valid: v.valid === 1
  }))
}

/**
 * 构建 HP 变化记录
 */
function buildHpChanges(
  settlements: SessionSettlement[],
  participants: SessionParticipant[]
): ReviewHpChange[] {
  const changes: ReviewHpChange[] = []
  const nameMap = new Map<string, string>()
  for (const p of participants) {
    nameMap.set(p.agent_id, p.name)
  }

  for (const s of settlements) {
    if (s.status !== 'applied') continue

    try {
      const data = JSON.parse(s.settlement_json)
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          changes.push({
            expert_name: item.agentName || nameMap.get(item.agentId) || '未知',
            hp_before: item.hpBefore ?? 0,
            hp_change: item.hpChange ?? 0,
            hp_after: item.hpAfter ?? 0,
            reason: item.reason || ''
          })
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return changes
}

/**
 * 构建 Hell Pool 条目
 */
function buildHellPoolEntries(
  snapshots: SessionSnapshot[],
  participants: SessionParticipant[]
): ReviewHellPoolEntry[] {
  const nameMap = new Map<string, string>()
  for (const p of participants) {
    nameMap.set(p.agent_id, p.name)
  }

  const entries: ReviewHellPoolEntry[] = []
  const seen = new Set<string>()

  for (const snap of snapshots) {
    if (snap.status === 'hell_pool' && !seen.has(snap.agent_id)) {
      seen.add(snap.agent_id)
      entries.push({
        expert_name: nameMap.get(snap.agent_id) || '未知',
        hp_at_entry: snap.hp,
        round_entered: snap.round_index
      })
    }
  }

  return entries
}

/**
 * 提取未解决问题
 */
function extractUnresolvedQuestions(messages: SessionMessage[]): string[] {
  const questions: string[] = []
  const finalSummary = messages.find(
    (m) => m.phase === 'moderator_final_summary' && m.speaker_role === 'moderator'
  )

  if (finalSummary) {
    const content = finalSummary.content
    // Look for question marks or "未解决", "待讨论" etc.
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.replace(/^[#\-*\s]+/, '').trim()
      if (
        (trimmed.includes('？') || trimmed.includes('?')) &&
        trimmed.length > 5
      ) {
        questions.push(trimmed)
      }
      if (
        (trimmed.includes('未解决') || trimmed.includes('待讨论') || trimmed.includes('unresolved')) &&
        trimmed.length > 5
      ) {
        questions.push(trimmed)
      }
    }
  }

  if (questions.length === 0) {
    questions.push('复盘未自动发现未解决问题（可手动补充）')
  }

  return questions.slice(0, 10)
}
