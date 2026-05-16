/**
 * Markdown Exporter
 *
 * 从 session 完整数据生成 Markdown 文件内容。
 * 逻辑独立成模块，不依赖 Renderer。
 * 文件写入在 Main Process 侧通过 fs 完成。
 */

import type {
  SessionFullDetail,
  SessionParticipant,
  SessionMessage,
  SessionVote,
  SessionSettlement
} from '../db/repositories/historyRepository'
import type { ReviewData } from '../review/sessionReviewBuilder'

/**
 * 生成完整的 Markdown 导出内容
 */
export function generateSessionMarkdown(
  detail: SessionFullDetail,
  reviewData?: ReviewData | null
): string {
  const { session, room_name, participants, messages, votes, settlements, review } = detail
  const lines: string[] = []

  // Title
  lines.push(`# ${session.title}`)
  lines.push('')

  // Basic info
  lines.push('## 基本信息')
  lines.push('')
  lines.push(`- **会议室**: ${room_name}`)
  lines.push(`- **开始时间**: ${formatTime(session.created_at)}`)
  lines.push(`- **结束时间**: ${formatTime(session.updated_at)}`)
  lines.push(`- **状态**: ${formatStatus(session.status)}`)

  const moderator = participants.find((p) => p.role === 'moderator')
  const experts = participants.filter((p) => p.role === 'expert')

  lines.push(
    `- **主理人**: ${moderator ? `${moderator.name} (${moderator.provider || '未知'}/${moderator.model || '未知'})` : '未知'}`
  )
  lines.push(`- **参会专家**: ${experts.length} 位`)
  lines.push('')

  // User question
  lines.push('## 用户问题')
  lines.push('')
  lines.push(`> ${session.user_question || '无'}`)
  lines.push('')

  // Rules summary (from session or review)
  lines.push('## 会议规则摘要')
  lines.push('')
  lines.push('- 最少辩论轮数: 3')
  lines.push('- 投票匿名: 是')
  lines.push('- 主理人无权审票')
  lines.push('- 议事权不影响最终总结观点权重')
  lines.push('')

  // Expert list
  lines.push('## 专家列表')
  lines.push('')
  lines.push('| 名称 | Provider/Model | 人设摘要 | 初始HP | 最终HP | 状态 |')
  lines.push('|------|---------------|---------|--------|--------|------|')

  for (const expert of experts) {
    const persona = expert.persona ? expert.persona.slice(0, 30) + (expert.persona.length > 30 ? '...' : '') : '-'
    const providerModel =
      expert.provider && expert.model ? `${expert.provider}/${expert.model}` : '-'
    lines.push(
      `| ${expert.name} | ${providerModel} | ${persona} | ${expert.initial_hp} | ${expert.final_hp ?? '-'} | ${expert.status} |`
    )
  }
  lines.push('')

  // Moderator opening
  const openingMsg = messages.find(
    (m) => m.phase === 'moderator_opening' && m.speaker_role === 'moderator'
  )
  if (openingMsg) {
    lines.push('## 主理人开场')
    lines.push('')
    lines.push(openingMsg.content)
    lines.push('')
  }

  // Expert initial answers
  const initialMsgs = messages.filter(
    (m) => m.phase === 'expert_initial' && m.speaker_role === 'expert'
  )
  if (initialMsgs.length > 0) {
    lines.push('## 专家首轮回答')
    lines.push('')
    for (const msg of initialMsgs) {
      lines.push(`### ${msg.speaker_name || '专家'}`)
      lines.push('')
      lines.push(msg.content)
      lines.push('')
    }
  }

  // Debate rounds
  const debateMsgs = messages.filter((m) => m.phase === 'debate_round')
  const roundSummaries = messages.filter((m) => m.phase === 'moderator_round_summary')
  const roundIndices = [
    ...new Set([...debateMsgs, ...roundSummaries].map((m) => m.round_index))
  ].sort((a, b) => a - b)

  if (roundIndices.length > 0) {
    lines.push('## 辩论记录')
    lines.push('')

    for (const roundIdx of roundIndices) {
      lines.push(`### 第 ${roundIdx} 轮`)
      lines.push('')

      const roundDebateMsgs = debateMsgs.filter((m) => m.round_index === roundIdx)
      for (const msg of roundDebateMsgs) {
        lines.push(`**${msg.speaker_name || '专家'}** (${msg.speaker_role || ''})`)
        lines.push('')
        lines.push(msg.content)
        lines.push('')
      }

      const roundSummary = roundSummaries.find(
        (m) => m.round_index === roundIdx && m.speaker_role === 'moderator'
      )
      if (roundSummary) {
        lines.push(`**主理人第${roundIdx}轮小结**`)
        lines.push('')
        lines.push(roundSummary.content)
        lines.push('')
      }
    }
  }

  // Voting results
  if (votes.length > 0) {
    lines.push('## 投票结果')
    lines.push('')

    const validVotes = votes.filter((v) => v.valid === 1)
    const invalidVotes = votes.filter((v) => v.valid !== 1)

    if (validVotes.length > 0) {
      lines.push('### 有效票')
      lines.push('')
      lines.push('| 投票者 | 被投者 | 分数 |')
      lines.push('|--------|--------|------|')

      for (const v of validVotes) {
        const voterName = findParticipantName(participants, v.voter_agent_id)
        const targetName = findParticipantName(participants, v.target_agent_id)
        lines.push(`| ${voterName} | ${targetName} | ${v.score} |`)
      }
      lines.push('')
    }

    if (invalidVotes.length > 0) {
      lines.push('### 无效票')
      lines.push('')
      for (const v of invalidVotes) {
        const voterName = findParticipantName(participants, v.voter_agent_id)
        const targetName = findParticipantName(participants, v.target_agent_id)
        lines.push(
          `- ${voterName} -> ${targetName}: 分数 ${v.score}, 原因: ${v.invalid_reason || '未知'}`
        )
      }
      lines.push('')
    }
  }

  // HP Settlement
  const appliedSettlements = settlements.filter((s) => s.status === 'applied')
  const vetoedSettlements = settlements.filter((s) => s.status === 'vetoed')
  const skippedSettlements = settlements.filter((s) => s.status === 'skipped')

  if (settlements.length > 0) {
    lines.push('## HP 结算')
    lines.push('')

    for (const s of appliedSettlements) {
      lines.push(`### 第 ${s.round_index} 轮结算（已应用）`)
      lines.push('')
      appendSettlementItems(lines, s, participants)
    }

    for (const s of vetoedSettlements) {
      lines.push(`### 第 ${s.round_index} 轮结算（已否决）`)
      lines.push('')
      lines.push('*用户否决了本轮结算，HP 保持不变。*')
      lines.push('')
    }

    for (const s of skippedSettlements) {
      lines.push(`### 第 ${s.round_index} 轮结算（已跳过）`)
      lines.push('')
      try {
        const data = JSON.parse(s.settlement_json)
        lines.push(`*跳过原因: ${data.skipReason || '未知'}*`)
      } catch {
        lines.push('*跳过原因: 未知*')
      }
      lines.push('')
    }
  }

  // Hell Pool
  const hellParticipants = participants.filter((p) => p.status === 'hell_pool')
  if (hellParticipants.length > 0) {
    lines.push('## Hell Pool')
    lines.push('')
    for (const p of hellParticipants) {
      lines.push(`- **${p.name}**: HP 降至 0，已堕入地狱。不可发言、不可投票。`)
    }
    lines.push('')
  }

  // Final summary
  const finalMsg = messages.find(
    (m) => m.phase === 'moderator_final_summary' && m.speaker_role === 'moderator'
  )
  if (finalMsg || session.final_summary) {
    lines.push('## 最终总结')
    lines.push('')
    lines.push(finalMsg?.content || session.final_summary || '')
    lines.push('')
  }

  // Structured review
  const parsedReview = reviewData || parseReview(review?.review_json)
  if (parsedReview) {
    lines.push('## 结构化复盘')
    lines.push('')

    if (parsedReview.core_disputes.length > 0) {
      lines.push('### 核心争议')
      for (const d of parsedReview.core_disputes) {
        lines.push(`- ${d}`)
      }
      lines.push('')
    }

    if (parsedReview.expert_positions.length > 0) {
      lines.push('### 专家立场')
      for (const p of parsedReview.expert_positions) {
        lines.push(`- **${p.expert_name}** (${p.stance || '无明确立场'})`)
        for (const arg of p.key_arguments) {
          lines.push(`  - ${arg}`)
        }
      }
      lines.push('')
    }

    if (parsedReview.major_attacks.length > 0) {
      lines.push('### 主要攻击')
      for (const a of parsedReview.major_attacks) {
        lines.push(`- ${a}`)
      }
      lines.push('')
    }

    if (parsedReview.hp_changes.length > 0) {
      lines.push('### HP 变化汇总')
      lines.push('| 专家 | 变化前 | 变化量 | 变化后 | 原因 |')
      lines.push('|------|--------|--------|--------|------|')
      for (const h of parsedReview.hp_changes) {
        const changeStr =
          h.hp_change > 0 ? `+${h.hp_change}` : `${h.hp_change}`
        lines.push(
          `| ${h.expert_name} | ${h.hp_before} | ${changeStr} | ${h.hp_after} | ${h.reason} |`
        )
      }
      lines.push('')
    }
  }

  // Unresolved questions
  if (parsedReview && parsedReview.unresolved_questions.length > 0) {
    lines.push('## 未解决问题')
    lines.push('')
    for (const q of parsedReview.unresolved_questions) {
      lines.push(`- ${q}`)
    }
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push('')
  lines.push(
    `*本文件由「AI 专家修罗场会议室」自动生成，导出时间: ${new Date().toISOString()}*`
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * 生成导出文件名
 */
export function generateExportFilename(title: string): string {
  const date = new Date().toISOString().split('T')[0]
  const safeName = title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
  return `${safeName}-${date}.md`
}

// ===== Helpers =====

function formatTime(isoStr: string): string {
  if (!isoStr) return '未知'
  try {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return isoStr
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    preparing: '准备中',
    running: '进行中',
    finished: '已完成',
    failed: '失败'
  }
  return map[status] || status
}

function findParticipantName(participants: SessionParticipant[], agentId: string): string {
  const p = participants.find((pp) => pp.agent_id === agentId)
  return p?.name || '未知'
}

function appendSettlementItems(
  lines: string[],
  settlement: SessionSettlement,
  participants: SessionParticipant[]
): void {
  try {
    const data = JSON.parse(settlement.settlement_json)
    if (data.items && Array.isArray(data.items)) {
      lines.push('| 专家 | 排名 | HP变化前 | HP变化量 | HP变化后 | 进入Hell Pool |')
      lines.push('|------|------|----------|----------|----------|---------------|')
      for (const item of data.items) {
        const changeStr =
          item.hpChange > 0 ? `+${item.hpChange}` : `${item.hpChange}`
        lines.push(
          `| ${item.agentName || '未知'} | ${item.rank} | ${item.hpBefore} | ${changeStr} | ${item.hpAfter} | ${item.enterHellPool ? '是' : '否'} |`
        )
      }
      lines.push('')
    }
  } catch {
    lines.push('*结算数据解析失败*')
    lines.push('')
  }
}

function parseReview(json: string | null | undefined): ReviewData | null {
  if (!json) return null
  try {
    return JSON.parse(json) as ReviewData
  } catch {
    return null
  }
}
