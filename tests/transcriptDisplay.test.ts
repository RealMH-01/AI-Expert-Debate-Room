import { describe, expect, it } from 'vitest'

import type { Message } from '../src/shared/types'
import {
  getSpeakerColor,
  getSpeakerColorKey,
  getStructuredJsonCounts,
  hashStringToPaletteIndex,
  isLongTranscriptMessage,
  shouldCollapseTranscriptMessage,
  TRANSCRIPT_SPEAKER_COLORS,
  formatCurrentTranscriptPhaseTitle,
  formatTranscriptPhaseTitle
} from '../src/renderer/utils/transcriptDisplay'

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    session_id: 'session-1',
    round_index: 0,
    phase: 'expert_initial',
    speaker_id: 'expert-1',
    speaker_name: 'Expert One',
    speaker_role: 'expert',
    content: 'short answer',
    structured_json: null,
    created_at: '2026-05-19T00:00:00.000Z',
    ...overrides
  }
}

describe('transcript display helpers', () => {
  it('uses speaker id before speaker name for stable color keys', () => {
    const message = makeMessage({
      speaker_id: 'agent-a',
      speaker_name: 'Renamed Expert'
    })

    expect(getSpeakerColorKey(message)).toBe('agent-a')
    expect(getSpeakerColor(message)).toBe(getSpeakerColor(message))
  })

  it('falls back to speaker name and distributes speakers across the palette', () => {
    const nameOnly = makeMessage({ speaker_id: null, speaker_name: 'Name Only' })
    expect(getSpeakerColorKey(nameOnly)).toBe('Name Only')

    const indexes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((name) =>
      hashStringToPaletteIndex(name, TRANSCRIPT_SPEAKER_COLORS.length)
    )

    expect(new Set(indexes).size).toBeGreaterThan(1)
    for (const index of indexes) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(TRANSCRIPT_SPEAKER_COLORS.length)
    }
  })

  it('detects short and long transcript messages', () => {
    expect(isLongTranscriptMessage('short message')).toBe(false)
    expect(isLongTranscriptMessage('x'.repeat(1201))).toBe(true)
    expect(isLongTranscriptMessage(Array.from({ length: 13 }, (_, index) => `line ${index}`).join('\n'))).toBe(true)
  })

  it('does not collapse system messages by default', () => {
    expect(shouldCollapseTranscriptMessage(makeMessage({ content: 'x'.repeat(1201) }))).toBe(true)
    expect(
      shouldCollapseTranscriptMessage(
        makeMessage({ speaker_role: 'system', content: 'x'.repeat(1201) })
      )
    ).toBe(false)
  })

  it('formats phase titles with debate round context', () => {
    expect(formatTranscriptPhaseTitle('moderator_opening')).toBe('主理人开场')
    expect(formatTranscriptPhaseTitle('expert_initial')).toBe('专家首轮独立回答')
    expect(formatTranscriptPhaseTitle('debate_round', 1)).toBe('第 1 轮辩论')
    expect(formatTranscriptPhaseTitle('voting')).toBe('投票')
    expect(formatTranscriptPhaseTitle('settlement_pending')).toBe('结算待确认')
    expect(formatTranscriptPhaseTitle('moderator_final_summary')).toBe('最终总结')
  })

  it('formats current phase titles without placeholder round numbers', () => {
    expect(formatCurrentTranscriptPhaseTitle('debate_round')).toBe('辩论轮')
    expect(formatCurrentTranscriptPhaseTitle('moderator_round_summary')).toBe('轮次总结')
  })

  it('counts structured claims and attacks without throwing on invalid JSON', () => {
    expect(
      getStructuredJsonCounts(
        JSON.stringify({
          claims: [{ id: 1 }, { id: 2 }, { id: 3 }],
          attacks: [{ id: 1 }, { id: 2 }]
        })
      )
    ).toEqual({ claims: 3, attacks: 2 })

    expect(getStructuredJsonCounts('{not valid')).toBeNull()
    expect(getStructuredJsonCounts(null)).toBeNull()
  })
})
