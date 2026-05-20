import { describe, expect, it, vi } from 'vitest'

import { defaultRulesConfig } from '../../src/shared/constants'
import {
  calculateAverageScores,
  computeFinalRanking,
  findComebackTier,
  hasEnoughValidVoters,
  resolveRankingWithTies,
  settleRound
} from '../../src/main/engine/hp-settlement'
import type {
  ExpertState,
  SettlementDbAccess,
  ValidVote
} from '../../src/main/engine/hp-settlement'
import type { RoundSettlementResult, RulesConfig } from '../../src/shared/types'

function createExpert(
  agentId: string,
  currentHp = 100,
  overrides: Partial<ExpertState> = {}
): ExpertState {
  return {
    agentId,
    currentHp,
    hpCap: 100,
    speakingRight: 0,
    prestige: 0,
    consecutiveLastCount: 0,
    ...overrides
  }
}

function cloneRules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return {
    ...defaultRulesConfig,
    ...overrides,
    formulas: {
      ...defaultRulesConfig.formulas,
      ...(overrides.formulas ?? {})
    },
    comebackBonus: {
      ...defaultRulesConfig.comebackBonus,
      ...(overrides.comebackBonus ?? {}),
      tiers:
        overrides.comebackBonus?.tiers?.map((tier) => ({ ...tier })) ??
        defaultRulesConfig.comebackBonus.tiers.map((tier) => ({ ...tier }))
    },
    speakingRightRange: overrides.speakingRightRange
      ? [...overrides.speakingRightRange]
      : [...defaultRulesConfig.speakingRightRange]
  }
}

function votesForTargetScores(targetScores: Record<string, number>): ValidVote[] {
  const agentIds = Object.keys(targetScores)

  return agentIds.flatMap((voterAgentId) =>
    agentIds
      .filter((targetAgentId) => targetAgentId !== voterAgentId)
      .map((targetAgentId) => ({
        voterAgentId,
        targetAgentId,
        score: targetScores[targetAgentId]
      }))
  )
}

function createExistingSettlement(): RoundSettlementResult {
  return {
    sessionId: 'session-1',
    round: 1,
    isProtectionSettlement: false,
    results: [],
    eliminatedAgentIds: [],
    triggersEndgame: false,
    aliveCountAfter: 5
  }
}

function createDb(options: {
  experts?: ExpertState[]
  votes?: ValidVote[]
  rules?: RulesConfig
  completedSettlementCount?: number
  settlementExists?: boolean
  existingSettlement?: RoundSettlementResult
} = {}): SettlementDbAccess {
  const experts =
    options.experts ??
    ['agent_a', 'agent_b', 'agent_c', 'agent_d', 'agent_e'].map((id) =>
      createExpert(id)
    )

  return {
    settlementExists: vi.fn(() => options.settlementExists ?? false),
    getExistingSettlement: vi.fn(() => options.existingSettlement ?? createExistingSettlement()),
    getAliveExperts: vi.fn(() => experts),
    getValidVotes: vi.fn(() => options.votes ?? votesForTargetScores({
      agent_a: 10,
      agent_b: 8,
      agent_c: 6,
      agent_d: 4,
      agent_e: 2
    })),
    getRulesConfig: vi.fn(() => options.rules ?? cloneRules()),
    getCompletedSettlementCount: vi.fn(() => options.completedSettlementCount ?? 2),
    atomicWriteSettlement: vi.fn()
  }
}

function resultFor(result: RoundSettlementResult, agentId: string) {
  const item = result.results.find((candidate) => candidate.agentId === agentId)
  expect(item).toBeDefined()
  return item!
}

describe('hp-settlement', () => {
  describe('calculateAverageScores', () => {
    it('uses average scores and marks experts with no received votes', () => {
      const experts = [
        createExpert('agent_a'),
        createExpert('agent_b'),
        createExpert('agent_c')
      ]
      const scores = calculateAverageScores(
        [
          { voterAgentId: 'voter_1', targetAgentId: 'agent_a', score: 8 },
          { voterAgentId: 'voter_2', targetAgentId: 'agent_a', score: 6 },
          { voterAgentId: 'voter_3', targetAgentId: 'agent_b', score: 9 }
        ],
        experts
      )

      expect(scores.get('agent_a')).toBe(7)
      expect(scores.get('agent_b')).toBe(9)
      expect(scores.get('agent_c')).toBe(Number.NEGATIVE_INFINITY)
      expect(resolveRankingWithTies(scores, 3).map((entry) => entry.agentId)).toEqual([
        'agent_b',
        'agent_a',
        'agent_c'
      ])
    })
  })

  describe('resolveRankingWithTies', () => {
    it('assigns occupied formula indexes without ties', () => {
      const ranking = resolveRankingWithTies(
        new Map([
          ['agent_a', 10],
          ['agent_b', 8],
          ['agent_c', 6]
        ]),
        3
      )

      expect(ranking.map((entry) => entry.occupiedFormulaIndexes)).toEqual([
        [0],
        [1],
        [2]
      ])
      expect(ranking[2].isUniqueLast).toBe(true)
    })

    it('shares formula indexes for middle and last ties', () => {
      const middleTie = resolveRankingWithTies(
        new Map([
          ['agent_a', 10],
          ['agent_b', 8],
          ['agent_c', 8],
          ['agent_d', 4]
        ]),
        4
      )
      expect(middleTie.filter((entry) => entry.averageScore === 8)).toMatchObject([
        { agentId: 'agent_b', occupiedFormulaIndexes: [1, 2], displayRank: 2 },
        { agentId: 'agent_c', occupiedFormulaIndexes: [1, 2], displayRank: 2 }
      ])

      const lastTie = resolveRankingWithTies(
        new Map([
          ['agent_a', 10],
          ['agent_b', 8],
          ['agent_c', 4],
          ['agent_d', 4]
        ]),
        4
      )
      expect(lastTie.filter((entry) => entry.averageScore === 4)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ agentId: 'agent_c', isUniqueLast: false }),
          expect.objectContaining({ agentId: 'agent_d', isUniqueLast: false })
        ])
      )
    })

    it('shares all indexes for an all-way tie and sorts tied agent IDs stably', () => {
      const ranking = resolveRankingWithTies(
        new Map([
          ['agent_d', 5],
          ['agent_b', 5],
          ['agent_e', 5],
          ['agent_a', 5],
          ['agent_c', 5]
        ]),
        5
      )

      expect(ranking.map((entry) => entry.agentId)).toEqual([
        'agent_a',
        'agent_b',
        'agent_c',
        'agent_d',
        'agent_e'
      ])
      expect(ranking.every((entry) => entry.occupiedFormulaIndexes.join(',') === '0,1,2,3,4')).toBe(
        true
      )
      expect(ranking.every((entry) => entry.isUniqueLast === false)).toBe(true)
    })
  })

  describe('settleRound', () => {
    it('returns existing settlement idempotently without writing', () => {
      const existingSettlement = createExistingSettlement()
      const db = createDb({ settlementExists: true, existingSettlement })

      expect(settleRound('session-1', 1, db)).toBe(existingSettlement)
      expect(db.atomicWriteSettlement).not.toHaveBeenCalled()
      expect(db.getAliveExperts).not.toHaveBeenCalled()
    })

    it('triggers endgame without writing when fewer than 3 experts are alive', () => {
      const db = createDb({
        experts: [createExpert('agent_a'), createExpert('agent_b')]
      })

      const result = settleRound('session-1', 1, db)

      expect(result).toMatchObject({
        triggersEndgame: true,
        results: [],
        aliveCountAfter: 2
      })
      expect(db.atomicWriteSettlement).not.toHaveBeenCalled()
    })

    it('rejects unsupported alive counts and manual review cases', () => {
      expect(() =>
        settleRound(
          'session-1',
          1,
          createDb({
            experts: Array.from({ length: 8 }, (_, index) => createExpert(`agent_${index}`))
          })
        )
      ).toThrow(/exceeds maximum 7/)

      expect(() =>
        settleRound(
          'session-1',
          1,
          createDb({
            votes: [{ voterAgentId: 'agent_a', targetAgentId: 'agent_b', score: 8 }]
          })
        )
      ).toThrow(/Manual review required/)

      expect(() =>
        settleRound(
          'session-1',
          1,
          createDb({
            votes: votesForTargetScores({
              agent_a: 10,
              agent_b: 8,
              agent_c: 6,
              agent_d: 4,
              agent_e: 2
            }).filter((vote) => vote.targetAgentId !== 'agent_e')
          })
        )
      ).toThrow(/received no valid scores.*Manual review required/)
    })

    it('reduces negative HP changes during protection but keeps positive recovery unchanged', () => {
      const db = createDb({ completedSettlementCount: 0 })
      const result = settleRound('session-1', 1, db)

      expect(result.isProtectionSettlement).toBe(true)
      expect(resultFor(result, 'agent_a').baseHpChange).toBe(5)
      expect(resultFor(result, 'agent_c').baseHpChange).toBe(-1)
      expect(resultFor(result, 'agent_d').baseHpChange).toBe(-6)
      expect(resultFor(result, 'agent_e').baseHpChange).toBe(-10)
    })

    it('does not accumulate consecutive last count during protection', () => {
      const db = createDb({
        completedSettlementCount: 0,
        experts: [
          createExpert('agent_a'),
          createExpert('agent_b'),
          createExpert('agent_c'),
          createExpert('agent_d'),
          createExpert('agent_e', 100, { consecutiveLastCount: 2 })
        ]
      })

      const result = settleRound('session-1', 1, db)

      expect(resultFor(result, 'agent_e')).toMatchObject({
        nextConsecutiveLastCount: 2,
        extraPenalty: 0
      })
    })

    it('applies the third consecutive unique-last penalty outside protection', () => {
      const result = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a'),
            createExpert('agent_b'),
            createExpert('agent_c'),
            createExpert('agent_d'),
            createExpert('agent_e', 100, { consecutiveLastCount: 2 })
          ]
        })
      )

      expect(resultFor(result, 'agent_e')).toMatchObject({
        baseHpChange: -20,
        extraPenalty: -8,
        finalHpChange: -28,
        nextConsecutiveLastCount: 3
      })
    })

    it('resets consecutive last count for non-unique last ties', () => {
      const result = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a'),
            createExpert('agent_b'),
            createExpert('agent_c'),
            createExpert('agent_d', 100, { consecutiveLastCount: 2 }),
            createExpert('agent_e', 100, { consecutiveLastCount: 2 })
          ],
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 8,
            agent_c: 6,
            agent_d: 2,
            agent_e: 2
          })
        })
      )

      expect(resultFor(result, 'agent_d')).toMatchObject({
        baseHpChange: -16,
        nextConsecutiveLastCount: 0
      })
      expect(resultFor(result, 'agent_e').nextConsecutiveLastCount).toBe(0)
    })

    it('applies comeback tiers only to positive changes using pre-settlement HP and caps the result', () => {
      const experts = [
        createExpert('agent_a', 8, { hpCap: 15 }),
        createExpert('agent_b', 15, { hpCap: 20 }),
        createExpert('agent_c', 25, { hpCap: 30 }),
        createExpert('agent_d', 29, { hpCap: 100 }),
        createExpert('agent_e', 8, { hpCap: 100 })
      ]
      const result = settleRound(
        'session-1',
        3,
        createDb({
          experts,
          completedSettlementCount: 2,
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 9,
            agent_c: 8,
            agent_d: 7,
            agent_e: 1
          })
        })
      )

      expect(resultFor(result, 'agent_a')).toMatchObject({
        finalHpChange: 12,
        rawHpAfter: 20,
        clampedHp: 15
      })
      expect(resultFor(result, 'agent_b')).toMatchObject({
        finalHpChange: 5,
        rawHpAfter: 20,
        clampedHp: 20
      })
      expect(resultFor(result, 'agent_c').finalHpChange).toBe(-3)
      expect(resultFor(result, 'agent_d')).toMatchObject({
        baseHpChange: -12,
        finalHpChange: -12
      })
      expect(resultFor(result, 'agent_e')).toMatchObject({
        baseHpChange: -20,
        finalHpChange: -20
      })
    })

    it('covers the 20 and 30 HP comeback tiers with max-gain caps', () => {
      const rules = cloneRules({
        formulas: {
          5: [5, 5, 5, -12, -20]
        }
      })
      const result = settleRound(
        'session-1',
        3,
        createDb({
          rules,
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a', 15),
            createExpert('agent_b', 25),
            createExpert('agent_c', 80),
            createExpert('agent_d', 80),
            createExpert('agent_e', 80)
          ],
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 8,
            agent_c: 6,
            agent_d: 4,
            agent_e: 2
          })
        })
      )

      expect(resultFor(result, 'agent_a').finalHpChange).toBe(10)
      expect(resultFor(result, 'agent_b').finalHpChange).toBe(8)
    })

    it('clamps HP at zero, eliminates HP zero, and orders multiple eliminations by lower rank first', () => {
      const result = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a'),
            createExpert('agent_b'),
            createExpert('agent_c'),
            createExpert('agent_d', 12),
            createExpert('agent_e', 20)
          ]
        })
      )

      expect(resultFor(result, 'agent_d')).toMatchObject({
        rawHpAfter: 0,
        clampedHp: 0,
        eliminated: true
      })
      expect(resultFor(result, 'agent_e')).toMatchObject({
        rawHpAfter: 0,
        clampedHp: 0,
        eliminated: true
      })
      expect(result.eliminatedAgentIds).toEqual(['agent_e', 'agent_d'])
    })

    it('allows raw HP below zero before clamping', () => {
      const result = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a'),
            createExpert('agent_b'),
            createExpert('agent_c'),
            createExpert('agent_d'),
            createExpert('agent_e', 5)
          ]
        })
      )

      expect(resultFor(result, 'agent_e')).toMatchObject({
        rawHpAfter: -15,
        clampedHp: 0,
        eliminated: true
      })
    })

    it('averages tied formula slots and truncates toward zero', () => {
      const middleTie = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 8,
            agent_c: 8,
            agent_d: 4,
            agent_e: 1
          })
        })
      )
      expect(resultFor(middleTie, 'agent_b').baseHpChange === 0).toBe(true)
      expect(resultFor(middleTie, 'agent_c').baseHpChange === 0).toBe(true)

      const firstTie = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 10,
            agent_c: 6,
            agent_d: 4,
            agent_e: 1
          })
        })
      )
      expect(resultFor(firstTie, 'agent_a').baseHpChange).toBe(3)
      expect(resultFor(firstTie, 'agent_b').baseHpChange).toBe(3)

      const lastTie = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 8,
            agent_c: 6,
            agent_d: 2,
            agent_e: 2
          })
        })
      )
      expect(resultFor(lastTie, 'agent_d').baseHpChange).toBe(-16)
      expect(resultFor(lastTie, 'agent_e').baseHpChange).toBe(-16)
    })

    it('calculates speaking-right and prestige deltas from unique ranks', () => {
      const result = settleRound('session-1', 3, createDb({ completedSettlementCount: 2 }))

      expect(resultFor(result, 'agent_a')).toMatchObject({
        speakingRightChange: 1,
        prestigeChange: 2
      })
      expect(resultFor(result, 'agent_b')).toMatchObject({
        speakingRightChange: 0,
        prestigeChange: 1
      })
      expect(resultFor(result, 'agent_c')).toMatchObject({
        speakingRightChange: 0,
        prestigeChange: 0
      })
      expect(resultFor(result, 'agent_e')).toMatchObject({
        speakingRightChange: -1,
        prestigeChange: -1
      })
    })

    it('uses the formula for the current alive count', () => {
      const result = settleRound(
        'session-1',
        3,
        createDb({
          completedSettlementCount: 2,
          experts: [
            createExpert('agent_a'),
            createExpert('agent_b'),
            createExpert('agent_c'),
            createExpert('agent_d')
          ],
          votes: votesForTargetScores({
            agent_a: 10,
            agent_b: 8,
            agent_c: 6,
            agent_d: 2
          })
        })
      )

      expect(resultFor(result, 'agent_b').baseHpChange).toBe(1)
      expect(resultFor(result, 'agent_c').baseHpChange).toBe(-10)
    })

    it('uses completed settlement count, not round index, for per-cycle protection', () => {
      const rules = cloneRules({ settlementMode: 'per-cycle', settlementCycleRounds: 3 })
      const protectedResult = settleRound(
        'session-1',
        9,
        createDb({ rules, completedSettlementCount: 0 })
      )
      const unprotectedResult = settleRound(
        'session-1',
        9,
        createDb({ rules, completedSettlementCount: 2 })
      )

      expect(resultFor(protectedResult, 'agent_e').baseHpChange).toBe(-10)
      expect(resultFor(unprotectedResult, 'agent_e').baseHpChange).toBe(-20)
    })
  })

  describe('hasEnoughValidVoters', () => {
    it('enforces the minimum voter threshold for 3-7 alive experts', () => {
      const thresholds: Array<[number, number]> = [
        [3, 2],
        [4, 2],
        [5, 3],
        [6, 3],
        [7, 4]
      ]

      for (const [aliveCount, minRequired] of thresholds) {
        expect(hasEnoughValidVoters(minRequired - 1, aliveCount)).toBe(false)
        expect(hasEnoughValidVoters(minRequired, aliveCount)).toBe(true)
      }
    })
  })

  describe('findComebackTier', () => {
    it('finds the first matching comeback tier', () => {
      const tiers = defaultRulesConfig.comebackBonus.tiers

      expect(findComebackTier(8, tiers)?.hpAtOrBelow).toBe(10)
      expect(findComebackTier(15, tiers)?.hpAtOrBelow).toBe(20)
      expect(findComebackTier(25, tiers)?.hpAtOrBelow).toBe(30)
      expect(findComebackTier(80, tiers)).toBeUndefined()
    })
  })

  describe('computeFinalRanking', () => {
    it('sorts by survival, raw HP, last rank, prestige, speaking right, and agent ID', () => {
      const ranking = computeFinalRanking([
        {
          agentId: 'agent_dead_high',
          clampedHp: 0,
          rawHpAfter: 100,
          displayRank: 1,
          prestige: 0,
          speakingRight: 0
        },
        {
          agentId: 'agent_alive_low',
          clampedHp: 1,
          rawHpAfter: 1,
          displayRank: 5,
          prestige: 0,
          speakingRight: 0
        },
        {
          agentId: 'agent_alive_high',
          clampedHp: 10,
          rawHpAfter: 10,
          displayRank: 5,
          prestige: 0,
          speakingRight: 0
        },
        {
          agentId: 'agent_dead_rank',
          clampedHp: 0,
          rawHpAfter: -5,
          displayRank: 1,
          prestige: 0,
          speakingRight: 0
        },
        {
          agentId: 'agent_dead_prestige',
          clampedHp: 0,
          rawHpAfter: -5,
          displayRank: 2,
          prestige: 5,
          speakingRight: 0
        },
        {
          agentId: 'agent_dead_speaking',
          clampedHp: 0,
          rawHpAfter: -5,
          displayRank: 2,
          prestige: 5,
          speakingRight: 3
        },
        {
          agentId: 'agent_dead_alpha',
          clampedHp: 0,
          rawHpAfter: -5,
          displayRank: 2,
          prestige: 5,
          speakingRight: 3
        }
      ])

      expect(ranking.map((entry) => entry.agentId)).toEqual([
        'agent_alive_high',
        'agent_alive_low',
        'agent_dead_high',
        'agent_dead_rank',
        'agent_dead_alpha',
        'agent_dead_speaking',
        'agent_dead_prestige'
      ])
      expect(ranking[0]).toMatchObject({
        finalRank: 1,
        isAlive: true,
        finalHp: 10,
        lastRoundRank: 5
      })
    })

    it('orders all dead experts by raw HP when nobody survives', () => {
      expect(
        computeFinalRanking([
          {
            agentId: 'agent_a',
            clampedHp: 0,
            rawHpAfter: -10,
            displayRank: 1,
            prestige: 0,
            speakingRight: 0
          },
          {
            agentId: 'agent_b',
            clampedHp: 0,
            rawHpAfter: -1,
            displayRank: 5,
            prestige: 0,
            speakingRight: 0
          }
        ]).map((entry) => entry.agentId)
      ).toEqual(['agent_b', 'agent_a'])
    })
  })
})
