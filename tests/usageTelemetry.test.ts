import { describe, expect, it } from 'vitest'
import { trackModelCallUsage } from '../src/main/cost/usageTracker'

describe('model call telemetry tracking', () => {
  it('persists non-sensitive timing fields without prompts or API keys', async () => {
    const saved: unknown[] = []

    await trackModelCallUsage(
      {
        meetingId: 'session-1',
        phase: 'expert_initial',
        roundIndex: 0,
        role: 'expert',
        expertId: 'expert-a',
        provider: 'bigmodel',
        model: 'glm-5.1',
        inputText: 'prompt includes sk-test-secret and should not be stored as telemetry'
      },
      async () => ({
        content: 'completion text',
        telemetry: {
          queueWaitMs: 12,
          requestDurationMs: 345,
          totalDurationMs: 357,
          timeoutMs: 300000,
          maxTokens: 16384,
          thinkingEnabled: true,
          responseFormat: 'json_object',
          finishReason: 'stop',
          fallback: {
            responseFormat: {
              reason: 'auth: Bearer sk-test-secret API key abc123'
            }
          }
        }
      }),
      async (record) => {
        saved.push(record)
      },
      (result) => result.content
    )

    expect(saved).toHaveLength(1)
    const record = saved[0] as Record<string, unknown>
    expect(record.queue_wait_ms).toBe(12)
    expect(record.request_duration_ms).toBe(345)
    expect(record.total_duration_ms).toBe(357)
    expect(record.timeout_ms).toBe(300000)
    expect(record.max_tokens).toBe(16384)
    expect(record.thinking_enabled).toBe(1)
    expect(record.response_format).toBe('json_object')
    expect(record.finish_reason).toBe('stop')

    const serialized = JSON.stringify(record)
    expect(serialized).not.toContain('sk-test-secret')
    expect(serialized).not.toContain('abc123')
    expect(serialized).not.toContain('prompt includes')
  })

  it('does not fail the model call when fallback telemetry cannot be serialized', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const saved: unknown[] = []

    const result = await trackModelCallUsage(
      {
        meetingId: 'session-1',
        phase: 'expert_initial',
        roundIndex: 0,
        role: 'expert',
        expertId: 'expert-a',
        provider: 'bigmodel',
        model: 'glm-5.1',
        inputText: 'prompt text'
      },
      async () => ({
        content: 'completion text',
        telemetry: {
          fallback: circular
        }
      }),
      async (record) => {
        saved.push(record)
      },
      (output) => output.content
    )

    expect(result.content).toBe('completion text')
    expect(saved).toHaveLength(1)
    expect((saved[0] as Record<string, unknown>).provider_fallback_json).toBe(
      '[unserializable telemetry fallback]'
    )
  })
})
