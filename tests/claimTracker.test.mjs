import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeProviderDebateOutput,
  normalizeAttackDimensions
} from '../src/main/claims/claimTracker.ts'

test('normalizes structured provider output and keeps at most three readable claims', () => {
  const result = normalizeProviderDebateOutput({
    content: 'raw fallback',
    structuredJson: {
      message: '专家本轮发言正文',
      claims: [
        { claim_text: '第一条核心观点' },
        { claim_text: '第二条核心观点' },
        { claim_text: '第三条核心观点' },
        { claim_text: '第四条应被截断' }
      ],
      attacks: [
        {
          target_expert_id: 'expert-b',
          target_claim_text: '被攻击观点',
          attack_text: '这个推理缺少证据链。',
          attack_dimensions: ['logic', 'evidence', 'not-allowed']
        },
        {
          target_expert_id: 'expert-c',
          attack_text: '没有标注维度的攻击。'
        }
      ]
    }
  })

  assert.equal(result.message, '专家本轮发言正文')
  assert.deepEqual(
    result.claims.map((claim) => claim.claim_text),
    ['第一条核心观点', '第二条核心观点', '第三条核心观点']
  )
  assert.deepEqual(result.attacks[0].attack_dimensions, ['logic', 'evidence'])
  assert.deepEqual(result.attacks[1].attack_dimensions, ['unknown'])
})

test('parses JSON content and hides raw message when parsing fails', () => {
  const parsed = normalizeProviderDebateOutput({
    content: JSON.stringify({
      message: 'JSON 中的正文',
      claims: [{ claim_text: 'JSON 中的观点' }],
      attacks: []
    })
  })
  assert.equal(parsed.message, 'JSON 中的正文')
  assert.equal(parsed.claims[0].claim_text, 'JSON 中的观点')

  const fallback = normalizeProviderDebateOutput({
    content: '{ this is not valid json'
  })
  assert.match(fallback.message, /结构化输出解析失败/)
  assert.deepEqual(fallback.claims, [])
  assert.deepEqual(fallback.attacks, [])
  assert.equal(fallback.structuredJson.type, 'expert_output_parse_failed')
  assert.equal(fallback.structuredJson.hiddenFromTranscript, true)
})

test('normalizes attack dimensions to known labels or unknown', () => {
  assert.deepEqual(normalizeAttackDimensions(['risk', 'other', 'bad']), ['risk', 'other'])
  assert.deepEqual(normalizeAttackDimensions(['bad']), ['unknown'])
  assert.deepEqual(normalizeAttackDimensions(undefined), ['unknown'])
})
