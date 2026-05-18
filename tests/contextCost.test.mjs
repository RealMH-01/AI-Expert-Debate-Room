import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionContextSummary } from '../src/main/context/contextCompressor.ts'
import { estimateTokens } from '../src/main/cost/tokenEstimator.ts'
import { estimateModelCallCost } from '../src/main/cost/costEstimator.ts'
import { trackModelCallUsage } from '../src/main/cost/usageTracker.ts'

function makeMockDetail() {
  const messages = [
    {
      id: 'msg-1',
      session_id: 'session-1',
      round_index: 0,
      phase: 'expert_initial',
      speaker_id: 'expert-a',
      speaker_name: 'Expert A',
      speaker_role: 'expert',
      content: 'Expert A says staged rollout is safer.',
      structured_json: null,
      created_at: '2026-05-17T00:00:00.000Z'
    },
    {
      id: 'msg-2',
      session_id: 'session-1',
      round_index: 1,
      phase: 'moderator_final_summary',
      speaker_id: 'moderator-1',
      speaker_name: 'Moderator',
      speaker_role: 'moderator',
      content: 'Final summary keeps the original disagreement visible.',
      structured_json: null,
      created_at: '2026-05-17T00:01:00.000Z'
    }
  ]

  return {
    session: {
      id: 'session-1',
      room_id: 'room-1',
      title: 'Mock Session',
      user_question: 'Should we ship now?',
      status: 'finished',
      current_phase: 'moderator_final_summary',
      final_summary: 'Final summary keeps the original disagreement visible.',
      created_at: '2026-05-17T00:00:00.000Z',
      updated_at: '2026-05-17T00:02:00.000Z'
    },
    room_name: 'Mock Room',
    participants: [
      { agent_id: 'expert-a', role: 'expert', name: 'Expert A', status: 'active', initial_hp: 100, final_hp: 95 },
      { agent_id: 'expert-b', role: 'expert', name: 'Expert B', status: 'hell_pool', initial_hp: 100, final_hp: 0 }
    ],
    messages,
    votes: [
      { voter_agent_id: 'expert-a', target_agent_id: 'expert-b', score: 2, valid: 1, round_index: 1 }
    ],
    settlements: [
      {
        round_index: 1,
        status: 'applied',
        settlement_json: JSON.stringify({
          items: [
            { agentId: 'expert-a', agentName: 'Expert A', hpBefore: 100, hpChange: -5, hpAfter: 95, enterHellPool: false },
            { agentId: 'expert-b', agentName: 'Expert B', hpBefore: 10, hpChange: -15, hpAfter: 0, enterHellPool: true }
          ]
        })
      }
    ],
    snapshots: [],
    claims: [
      {
        id: 'claim-1',
        source_message_id: 'msg-1',
        speaker_expert_id: 'expert-a',
        round_index: 0,
        claim_text: 'Staged rollout is safer.',
        status: 'active'
      }
    ],
    attacks: [
      {
        id: 'attack-1',
        source_message_id: 'msg-1',
        attacker_expert_id: 'expert-a',
        target_expert_id: 'expert-b',
        target_claim_text: 'Ship immediately.',
        attack_text: 'Immediate shipping lacks rollback evidence.',
        attack_dimensions_json: JSON.stringify(['evidence'])
      }
    ],
    review: null
  }
}

test('builds a session context summary without mutating original messages', () => {
  const detail = makeMockDetail()
  const originalMessages = JSON.stringify(detail.messages)

  const summary = buildSessionContextSummary(detail)

  assert.equal(summary.meeting_id, 'session-1')
  assert.equal(summary.scope, 'session')
  assert.equal(summary.structured_summary.user_question, 'Should we ship now?')
  assert.deepEqual(summary.structured_summary.core_claims, ['Expert A: Staged rollout is safer.'])
  assert.equal(JSON.stringify(detail.messages), originalMessages)
})

test('estimates non-negative tokens for Chinese and English text', () => {
  assert.ok(estimateTokens('普通中文文本') >= 0)
  assert.ok(estimateTokens('Plain English text') >= 0)
  assert.equal(estimateTokens(''), 0)
})

test('estimates model call cost when pricing exists and returns null when missing', () => {
  const priced = estimateModelCallCost({
    provider: 'mock',
    model: 'mock-provider',
    inputTokens: 1000,
    outputTokens: 500
  })
  assert.equal(priced.estimatedCost, 0)
  assert.equal(priced.currency, 'USD')
  assert.equal(priced.pricingSource, 'static_config')

  const unknown = estimateModelCallCost({
    provider: 'unknown',
    model: 'not-configured',
    inputTokens: 1000,
    outputTokens: 500
  })
  assert.equal(unknown.estimatedCost, null)
  assert.equal(unknown.pricingSource, 'estimated')
})

test('tracks model usage and lets tracking persistence failures fall through safely', async () => {
  const saved = []
  const output = await trackModelCallUsage(
    {
      meetingId: 'session-1',
      phase: 'expert_initial',
      roundIndex: 0,
      role: 'expert',
      expertId: 'expert-a',
      provider: 'mock',
      model: 'mock-provider',
      inputText: 'prompt text'
    },
    async () => ({
      content: 'completion text',
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }
    }),
    async (record) => {
      saved.push(record)
    },
    (result) => result.content
  )

  assert.equal(output.content, 'completion text')
  assert.equal(saved.length, 1)
  assert.equal(saved[0].actual_input_tokens, 3)
  assert.equal(saved[0].actual_output_tokens, 4)

  const originalConsoleError = console.error
  console.error = () => {}
  let stillWorks
  try {
    stillWorks = await trackModelCallUsage(
      {
        meetingId: 'session-1',
        phase: 'expert_initial',
        roundIndex: 0,
        role: 'expert',
        expertId: 'expert-a',
        provider: 'mock',
        model: 'mock-provider',
        inputText: 'prompt text'
      },
      async () => ({ content: 'ok' }),
      async () => {
        throw new Error('database unavailable')
      },
      (result) => result.content
    )
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(stillWorks.content, 'ok')
})
