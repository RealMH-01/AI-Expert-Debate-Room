import { describe, expect, it } from 'vitest'

import {
  buildAnthropicMessagesRequest,
  parseAnthropicSseEvents
} from '../../src/main/providers/adapters/AnthropicAdapter'
import {
  buildBigModelChatBody
} from '../../src/main/providers/adapters/BigModelAdapter'
import {
  buildDeepSeekChatBody,
  parseDeepSeekResponse
} from '../../src/main/providers/adapters/DeepSeekAdapter'
import {
  buildGeminiGenerateContentRequest
} from '../../src/main/providers/adapters/GeminiAdapter'
import {
  buildMoonshotChatBody,
  parseMoonshotResponse
} from '../../src/main/providers/adapters/MoonshotAdapter'
import {
  buildOpenAIResponsesBody
} from '../../src/main/providers/adapters/OpenAIAdapter'
import {
  buildQwenChatBody,
  parseQwenResponse
} from '../../src/main/providers/adapters/QwenAdapter'
import type { ProviderRequest } from '../../src/main/providers/types'

const baseRequest: ProviderRequest = {
  model: 'test-model',
  messages: [
    { role: 'system', content: 'System rules' },
    { role: 'user', content: 'Return exactly OK.' }
  ],
  temperature: 0.4,
  maxTokens: 64,
  responseFormat: 'json_object',
  thinking: { enabled: true, effort: 'medium', budgetTokens: 8192 }
}

describe('Round 7 adapter request mapping', () => {
  it('injects OpenAI GPT-5.x reasoning effort for Responses API', () => {
    const body = buildOpenAIResponsesBody({ ...baseRequest, model: 'gpt-5.5' })
    expect(body.model).toBe('gpt-5.5')
    expect(body.reasoning).toEqual({ effort: 'medium' })
  })

  it('maps Anthropic system prompt, version header needs, and thinking modes', () => {
    const opus = buildAnthropicMessagesRequest({ ...baseRequest, model: 'claude-opus-4-7' })
    const haiku = buildAnthropicMessagesRequest({
      ...baseRequest,
      model: 'claude-haiku-4-5-20251001'
    })

    expect(opus.headers['anthropic-version']).toBe('2023-06-01')
    expect(opus.body.system).toBe('System rules')
    expect(opus.body.messages).toEqual([{ role: 'user', content: 'Return exactly OK.' }])
    expect(opus.body.thinking).toEqual({ type: 'adaptive' })
    expect(haiku.body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
  })

  it('parses Anthropic thinking blocks from SSE events', () => {
    const parsed = parseAnthropicSseEvents([
      'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"reason "}}',
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"OK"}}'
    ].join('\n\n'))

    expect(parsed.text).toBe('OK')
    expect(parsed.reasoningText).toBe('reason ')
  })

  it('uses thinkingBudget only for Gemini 2.5 and thinkingLevel only for Gemini 3', () => {
    const gemini25 = buildGeminiGenerateContentRequest({
      ...baseRequest,
      model: 'gemini-2.5-pro',
      thinking: { enabled: true, effort: 'medium' }
    })
    const gemini3 = buildGeminiGenerateContentRequest({
      ...baseRequest,
      model: 'gemini-3-flash-preview',
      thinking: { enabled: true, effort: 'high' }
    })

    expect(gemini25.body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 8192 })
    expect(gemini25.body.generationConfig.thinkingConfig).not.toHaveProperty('thinkingLevel')
    expect(gemini3.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' })
    expect(gemini3.body.generationConfig.thinkingConfig).not.toHaveProperty('thinkingBudget')
  })

  it('injects DeepSeek thinking fields and omits sampling fields during thinking mode', () => {
    const body = buildDeepSeekChatBody(baseRequest)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
    expect(body).not.toHaveProperty('temperature')
    expect(parseDeepSeekResponse({
      choices: [{ message: { content: 'OK', reasoning_content: 'why' }, finish_reason: 'stop' }]
    }).reasoningText).toBe('why')
  })

  it('injects Qwen thinking controls and parses reasoning_content', () => {
    const body = buildQwenChatBody(baseRequest)
    expect(body.enable_thinking).toBe(true)
    expect(body.thinking_budget).toBe(8192)
    expect(parseQwenResponse({
      choices: [{ message: { content: 'OK', reasoning_content: 'qwen reason' }, finish_reason: 'stop' }]
    }).reasoningText).toBe('qwen reason')
  })

  it('injects BigModel thinking and json response_format', () => {
    const body = buildBigModelChatBody(baseRequest)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('uses Moonshot CN base behavior, handles Kimi thinking, and parses reasoning_content', () => {
    const k26 = buildMoonshotChatBody({ ...baseRequest, model: 'kimi-k2.6' })
    const thinking = buildMoonshotChatBody({
      ...baseRequest,
      model: 'kimi-k2-thinking',
      thinking: { enabled: false }
    })

    expect(k26.thinking).toEqual({ type: 'enabled' })
    expect(thinking).not.toEqual(expect.objectContaining({ thinking: { type: 'disabled' } }))
    expect(parseMoonshotResponse({
      choices: [{ message: { content: 'OK', reasoning_content: 'moon reason' }, finish_reason: 'stop' }]
    }).reasoningText).toBe('moon reason')
  })
})
