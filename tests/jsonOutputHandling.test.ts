import { describe, expect, it } from 'vitest'

import { normalizeProviderDebateOutput } from '../src/main/claims/claimTracker'
import { buildExpertInitialPrompt } from '../src/main/prompts/expertPrompts'
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
  failJsonObjectOnce = false

  constructor(options: { providerId: ProviderId; model: string; thinkingEnabled?: boolean }) {
    super(options)
  }

  protected async send(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(request)
    if (this.failJsonObjectOnce && request.responseFormat === 'json_object') {
      this.failJsonObjectOnce = false
      throw new Error('validation: response_format json_object is not supported by this model')
    }
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
    expect(normalized.errorType).toBe('json_parse_failed')
    expect(normalized.parseError).toContain("Expected ',' or '}'")
    expect(normalized.claims).toEqual([])
    expect(normalized.attacks).toEqual([])
    expect(normalized.structuredJson).toMatchObject({
      type: 'expert_output_parse_failed',
      errorType: 'json_parse_failed',
      hiddenFromTranscript: true,
      rawLength: raw.length,
      parseError: expect.stringContaining("Expected ',' or '}'"),
      rawHead: raw,
      rawTail: raw,
      rawTruncatedForStorage: false
    })
  })

  it('marks JSON objects without message as schema failures', () => {
    const normalized = normalizeProviderDebateOutput({
      content: JSON.stringify({ claims: [{ claim_text: 'Claim without message' }], attacks: [] })
    })

    expect(normalized.errorType).toBe('schema_failed')
    expect(normalized.parseError).toBe('Parsed JSON is missing a non-empty message field')
    expect(normalized.structuredJson).toMatchObject({
      type: 'expert_output_parse_failed',
      errorType: 'schema_failed',
      parseError: 'Parsed JSON is missing a non-empty message field'
    })
  })

  it('keeps both head and tail when failed raw output is too long for storage preview', () => {
    const raw = `{ "message": "${'a'.repeat(5000)}" "claims": [] }`
    const normalized = normalizeProviderDebateOutput({ content: raw })

    expect(normalized.errorType).toBe('json_parse_failed')
    expect(normalized.structuredJson?.rawLength).toBe(raw.length)
    expect(normalized.structuredJson?.rawHead).toBe(raw.slice(0, 4000))
    expect(normalized.structuredJson?.rawTail).toBe(raw.slice(-1000))
    expect(normalized.structuredJson?.rawTruncatedForStorage).toBe(true)
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

  it('requests JSON mode for DeepSeek thinking when the model supports JSON', async () => {
    const deepseekThinking = new CapturingAdapter({
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true
    })

    await deepseekThinking.generateExpertInitialAnswer(debateInput)

    expect(deepseekThinking.requests[0].responseFormat).toBe('json_object')
    expect(deepseekThinking.requests[0].thinking?.enabled).toBe(true)
  })

  it('falls back to prompt-only JSON when json_object is explicitly unsupported', async () => {
    const adapter = new CapturingAdapter({
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true
    })
    adapter.failJsonObjectOnce = true

    const output = await adapter.generateExpertInitialAnswer(debateInput)

    expect(output.content).toBe('plain provider text')
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[0].responseFormat).toBe('json_object')
    expect(adapter.requests[1].responseFormat).toBe('text')
  })

  it('falls back to prompt-only JSON for unverified JSON capability', async () => {
    const custom = new CapturingAdapter({ providerId: 'openai_compatible', model: 'custom' })

    await custom.generateExpertInitialAnswer(debateInput)

    expect(custom.requests[0].responseFormat).toBe('text')
    expect(custom.requests[0].maxTokens).toBe(16384)
  })

  it('does not ask for Markdown outside the JSON object in expert initial prompts', () => {
    const messages = buildExpertInitialPrompt(debateInput)
    const userPrompt = messages.find((message) => message.role === 'user')?.content ?? ''

    expect(userPrompt).not.toContain('使用 Markdown 格式')
    expect(userPrompt).toContain('整个回复必须是一个可被 JSON.parse 解析的 JSON 对象')
    expect(userPrompt).toContain('Markdown 只允许出现在 message 字符串字段内部')
    expect(userPrompt).toContain('JSON 字段之间必须有逗号')
  })
})
