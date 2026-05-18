import { describe, expect, it } from 'vitest'

import { normalizeProviderDebateOutput } from '../src/main/claims/claimTracker'
import type { DebateGenerateInput } from '../src/main/providers/base'
import { BaseAdapter } from '../src/main/providers/adapters/BaseAdapter'
import type { ProviderRequest, ProviderResponse } from '../src/main/providers/types'
import { DEFAULT_RULES_CONFIG, type Agent } from '../src/shared/types'
import type { ProviderId } from '../src/shared/providers/modelRegistry'

const agent: Agent = {
  id: 'expert-a',
  room_id: 'room-1',
  role: 'expert',
  name: 'Expert A',
  provider: 'openai',
  model: 'gpt-5.5',
  persona: null,
  domain: null,
  stance: null,
  memory: null,
  supports_thinking: 1,
  thinking_enabled: 0,
  hp: 100,
  max_hp: 100,
  influence: 0,
  prestige: 0,
  status: 'active',
  aggression: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
}

const debateInput: DebateGenerateInput = {
  role: 'expert',
  phase: 'expert_initial',
  agent,
  userQuestion: 'How should we decide?',
  roundIndex: 0,
  visibleTranscript: [],
  otherExperts: [],
  rules: DEFAULT_RULES_CONFIG,
  roomName: 'Room'
}

class CapturingAdapter extends BaseAdapter {
  requests: ProviderRequest[] = []
  nextResponse: Partial<ProviderResponse> = {}

  constructor(options: { providerId: ProviderId; model: string; thinkingEnabled?: boolean }) {
    super(options)
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(request)
    return {
      text: 'plain provider text',
      providerId: 'openai',
      model: request.model,
      finishReason: 'stop',
      ...this.nextResponse
    }
  }
}

describe('JSON debate output handling', () => {
  it('extracts message, claims, and attacks from legal JSON content', () => {
    const normalized = normalizeProviderDebateOutput({
      content: JSON.stringify({
        message: 'Visible answer',
        claims: [{ claim_text: 'Claim A' }],
        attacks: [{ attack_text: 'Attack A', attack_dimensions: ['logic'] }]
      })
    })

    expect(normalized.message).toBe('Visible answer')
    expect(normalized.claims).toEqual([
      { claim_text: 'Claim A', status: 'active', revised_from_claim_id: null }
    ])
    expect(normalized.attacks[0]).toMatchObject({
      attack_text: 'Attack A',
      attack_dimensions: ['logic']
    })
    expect(normalized.structuredJson?.message).toBe('Visible answer')
  })

  it('parses fenced JSON content', () => {
    const normalized = normalizeProviderDebateOutput({
      content: [
        '```json',
        JSON.stringify({ message: 'Fenced answer', claims: [], attacks: [] }),
        '```'
      ].join('\n')
    })

    expect(normalized.message).toBe('Fenced answer')
    expect(normalized.parseError).toBeUndefined()
  })

  it('hides raw content when JSON parsing fails', () => {
    const raw = '{"message":"partial answer","claims":[{"claim_text":"unfinished"}]'
    const normalized = normalizeProviderDebateOutput({ content: raw })

    expect(normalized.message).not.toBe(raw)
    expect(normalized.message).toContain('结构化输出解析失败')
    expect(normalized.claims).toEqual([])
    expect(normalized.attacks).toEqual([])
    expect(normalized.structuredJson).toMatchObject({
      type: 'expert_output_parse_failed',
      hiddenFromTranscript: true,
      rawLength: raw.length
    })
  })

  it('treats length finishReason as an output_truncated error', async () => {
    const adapter = new CapturingAdapter({ providerId: 'openai', model: 'gpt-5.5' })
    adapter.nextResponse = {
      text: '{"message":"partial"',
      finishReason: 'length'
    }

    await expect(adapter.generateExpertInitialAnswer(debateInput)).rejects.toThrow('output_truncated')
  })

  it('requests 16384 tokens and JSON mode for expert phases when supported', async () => {
    const adapter = new CapturingAdapter({ providerId: 'openai', model: 'gpt-5.5' })

    await adapter.generateExpertInitialAnswer(debateInput)

    expect(adapter.requests[0].maxTokens).toBe(16384)
    expect(adapter.requests[0].responseFormat).toBe('json_object')
  })

  it('falls back to prompt-only JSON for unverified JSON capability and DeepSeek thinking', async () => {
    const custom = new CapturingAdapter({ providerId: 'openai_compatible', model: 'custom' })
    const deepseekThinking = new CapturingAdapter({
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true
    })

    await custom.generateExpertInitialAnswer(debateInput)
    await deepseekThinking.generateExpertDebateTurn({
      ...debateInput,
      phase: 'debate_round',
      roundIndex: 1
    })

    expect(custom.requests[0].responseFormat).toBe('text')
    expect(deepseekThinking.requests[0].responseFormat).toBe('text')
    expect(custom.requests[0].maxTokens).toBe(16384)
    expect(deepseekThinking.requests[0].maxTokens).toBe(16384)
  })
})
