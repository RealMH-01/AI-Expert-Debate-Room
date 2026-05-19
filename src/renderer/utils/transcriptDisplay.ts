import type { DebatePhase, Message } from '../../shared/types'

export const TRANSCRIPT_SPEAKER_COLORS = [
  '#4a9eff',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#64748b',
  '#eab308'
] as const

export const LONG_MESSAGE_CHAR_LIMIT = 1200
export const LONG_MESSAGE_LINE_LIMIT = 12

const PHASE_LABELS: Record<DebatePhase, string> = {
  moderator_opening: '主理人开场',
  expert_initial: '专家首轮独立回答',
  debate_round: '辩论',
  moderator_round_summary: '轮次总结',
  voting: '投票',
  settlement_pending: '结算待确认',
  moderator_final_summary: '最终总结'
}

export interface StructuredJsonCounts {
  claims: number
  attacks: number
}

export function getSpeakerColorKey(message: Message): string {
  return message.speaker_id?.trim() || message.speaker_name?.trim() || 'unknown-speaker'
}

export function hashStringToPaletteIndex(value: string, paletteLength: number): number {
  if (paletteLength <= 0) {
    return 0
  }

  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }

  return Math.abs(hash) % paletteLength
}

export function getSpeakerColor(message: Message): string {
  return TRANSCRIPT_SPEAKER_COLORS[
    hashStringToPaletteIndex(getSpeakerColorKey(message), TRANSCRIPT_SPEAKER_COLORS.length)
  ]
}

export function isLongTranscriptMessage(content: string): boolean {
  return content.length > LONG_MESSAGE_CHAR_LIMIT || content.split('\n').length > LONG_MESSAGE_LINE_LIMIT
}

export function shouldCollapseTranscriptMessage(message: Message): boolean {
  if (message.speaker_role === 'system') {
    return false
  }

  return isLongTranscriptMessage(message.content)
}

export function formatTranscriptPhaseTitle(phase: DebatePhase, roundIndex?: number | null): string {
  if (phase === 'debate_round') {
    return `第 ${roundIndex ?? '-'} 轮辩论`
  }

  if (phase === 'moderator_round_summary') {
    return `第 ${roundIndex ?? '-'} 轮总结`
  }

  return PHASE_LABELS[phase] || phase
}

export function formatCurrentTranscriptPhaseTitle(phase: DebatePhase): string {
  if (phase === 'debate_round') {
    return '辩论轮'
  }

  if (phase === 'moderator_round_summary') {
    return '轮次总结'
  }

  return PHASE_LABELS[phase] || phase
}

export function getStructuredJsonCounts(structuredJson: string | null): StructuredJsonCounts | null {
  if (!structuredJson) {
    return null
  }

  try {
    const parsed = JSON.parse(structuredJson) as { claims?: unknown; attacks?: unknown }
    const claims = Array.isArray(parsed.claims) ? parsed.claims.length : 0
    const attacks = Array.isArray(parsed.attacks) ? parsed.attacks.length : 0

    if (claims === 0 && attacks === 0) {
      return null
    }

    return { claims, attacks }
  } catch {
    return null
  }
}
