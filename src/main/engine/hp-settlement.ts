import type {
  ComebackTier,
  ExpertSettlementResult,
  FinalRankingEntry,
  RankingEntry,
  RoundSettlementResult,
  RulesConfig
} from '../../shared/types'

// ============================================================
// Types shared by the settlement engine, tests, and DB adapters
// ============================================================

/**
 * Expert state required by HP settlement.
 *
 * These are settlement-engine semantic fields mapped by a future DB adapter.
 * For example, speakingRight may come from influence, and hpCap may come from
 * agents.max_hp or rules.hpCap.
 */
export interface ExpertState {
  agentId: string
  currentHp: number
  hpCap: number
  speakingRight: number
  prestige: number
  consecutiveLastCount: number
}

/**
 * One valid vote.
 *
 * Corresponds to a votes.valid = 1 record.
 */
export interface ValidVote {
  voterAgentId: string
  targetAgentId: string
  score: number
}

/**
 * Database access interface injected into the settlement engine.
 *
 * This file intentionally defines only an interface. It does not access SQLite
 * or import any real database implementation.
 */
export interface SettlementDbAccess {
  /** Checks whether this session and round_index already have a settlement. */
  settlementExists(sessionId: string, roundIndex: number): boolean

  /** Gets the existing settlement for idempotent return. */
  getExistingSettlement(sessionId: string, roundIndex: number): RoundSettlementResult

  /** Gets all currently alive experts after DB fields are mapped to engine semantics. */
  getAliveExperts(sessionId: string): ExpertState[]

  /** Gets every valid vote in this round (votes.valid = 1 records). */
  getValidVotes(sessionId: string, roundIndex: number): ValidVote[]

  /** Gets this session's RulesConfig after defaults are merged and validated. */
  getRulesConfig(sessionId: string): RulesConfig

  /** Gets the number of completed settlements for protection-period checks. */
  getCompletedSettlementCount(sessionId: string): number

  /**
   * Atomically writes a settlement result.
   *
   * The concrete adapter should wrap all DB writes in a transaction, including:
   * settlement row, agent snapshots, HP/status updates, and eliminations.
   */
  atomicWriteSettlement(
    sessionId: string,
    roundIndex: number,
    result: RoundSettlementResult
  ): void
}

// ============================================================
// Core function
// ============================================================

/**
 * Settles one HP round.
 *
 * Idempotency: repeated calls for the same session + round_index return the
 * stored settlement and do not apply HP changes again.
 *
 * Guardrails: insufficient valid voters or any alive expert receiving no valid
 * score throws so the caller can route the round to manual_review.
 */
export function settleRound(
  sessionId: string,
  roundIndex: number,
  db: SettlementDbAccess
): RoundSettlementResult {
  if (db.settlementExists(sessionId, roundIndex)) {
    return db.getExistingSettlement(sessionId, roundIndex)
  }

  const aliveExperts = db.getAliveExperts(sessionId)
  const aliveCount = aliveExperts.length

  if (aliveCount < 3) {
    return {
      sessionId,
      round: roundIndex,
      isProtectionSettlement: false,
      results: [],
      eliminatedAgentIds: [],
      triggersEndgame: true,
      aliveCountAfter: aliveCount
    }
  }

  if (aliveCount > 7) {
    throw new Error(
      `[settleRound] aliveCount = ${aliveCount} exceeds maximum 7. ` +
        'This should have been blocked at Session start.'
    )
  }

  const rules = db.getRulesConfig(sessionId)
  const votes = db.getValidVotes(sessionId, roundIndex)

  const validVoterCount = new Set(votes.map((vote) => vote.voterAgentId)).size
  if (!hasEnoughValidVoters(validVoterCount, aliveCount)) {
    throw new Error(
      `[settleRound] Not enough valid voters: ${validVoterCount}/${aliveCount}. ` +
        'Manual review required.'
    )
  }

  const settlementCount = db.getCompletedSettlementCount(sessionId)
  const isProtection = settlementCount < rules.protectionSettlementCount

  const averageScores = calculateAverageScores(votes, aliveExperts)

  for (const [agentId, averageScore] of averageScores) {
    if (averageScore === Number.NEGATIVE_INFINITY) {
      throw new Error(
        `[settleRound] Agent ${agentId} received no valid scores. ` +
          'Manual review required.'
      )
    }
  }

  const ranking = resolveRankingWithTies(averageScores, aliveCount)

  const formula = rules.formulas[aliveCount]
  if (!formula || formula.length !== aliveCount) {
    throw new Error(
      `[settleRound] No valid formula for aliveCount = ${aliveCount}. ` +
        `formulas[${aliveCount}] = ${JSON.stringify(formula)}`
    )
  }

  const results: ExpertSettlementResult[] = ranking.map((entry) => {
    const expert = aliveExperts.find((candidate) => candidate.agentId === entry.agentId)
    if (!expert) {
      throw new Error(`[settleRound] Missing expert state for agentId ${entry.agentId}`)
    }

    return calculateExpertSettlement(entry, expert, formula, isProtection, rules)
  })

  const eliminatedAgentIds = results
    .filter((result) => result.eliminated)
    .sort((a, b) => b.displayRank - a.displayRank)
    .map((result) => result.agentId)

  const aliveCountAfter = aliveCount - eliminatedAgentIds.length
  const triggersEndgame = aliveCountAfter < 3

  const roundResult: RoundSettlementResult = {
    sessionId,
    round: roundIndex,
    isProtectionSettlement: isProtection,
    results,
    eliminatedAgentIds,
    triggersEndgame,
    aliveCountAfter
  }

  db.atomicWriteSettlement(sessionId, roundIndex, roundResult)

  return roundResult
}

// ============================================================
// Average scores
// ============================================================

/**
 * Calculates each alive expert's average received valid score.
 *
 * An expert with no received valid scores gets Number.NEGATIVE_INFINITY so the
 * caller can reject automatic settlement and require manual_review.
 */
export function calculateAverageScores(
  votes: ValidVote[],
  aliveExperts: ExpertState[]
): Map<string, number> {
  const scoreMap = new Map<string, number[]>()

  for (const expert of aliveExperts) {
    scoreMap.set(expert.agentId, [])
  }

  for (const vote of votes) {
    const targetScores = scoreMap.get(vote.targetAgentId)
    if (targetScores) {
      targetScores.push(vote.score)
    }
  }

  const averageMap = new Map<string, number>()

  for (const [agentId, scores] of scoreMap) {
    if (scores.length === 0) {
      averageMap.set(agentId, Number.NEGATIVE_INFINITY)
      continue
    }

    const sum = scores.reduce((total, score) => total + score, 0)
    averageMap.set(agentId, sum / scores.length)
  }

  return averageMap
}

// ============================================================
// Ranking with ties
// ============================================================

/**
 * Converts average scores to ranking entries.
 *
 * Higher average score ranks first. Tied experts share the corresponding
 * formula indexes, displayRank is one-based, and occupiedFormulaIndexes are
 * zero-based. Ties are ordered by agentId for stable output.
 */
export function resolveRankingWithTies(
  averageScores: Map<string, number>,
  aliveCount: number
): RankingEntry[] {
  const sorted = [...averageScores.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    .map(([agentId, averageScore]) => ({ agentId, averageScore }))

  const groups: Array<{ agentIds: string[]; averageScore: number }> = []

  for (const item of sorted) {
    const lastGroup = groups[groups.length - 1]

    if (lastGroup && lastGroup.averageScore === item.averageScore) {
      lastGroup.agentIds.push(item.agentId)
    } else {
      groups.push({
        agentIds: [item.agentId],
        averageScore: item.averageScore
      })
    }
  }

  const result: RankingEntry[] = []
  let currentIndex = 0

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]
    const occupiedFormulaIndexes: number[] = []

    for (let offset = 0; offset < group.agentIds.length; offset += 1) {
      occupiedFormulaIndexes.push(currentIndex + offset)
    }

    const displayRank = currentIndex + 1

    const isLastGroup = groupIndex === groups.length - 1
    const isFirstGroup = groupIndex === 0
    const isSecondGroup = groupIndex === 1

    const isUniqueLast = isLastGroup && group.agentIds.length === 1
    const isUniqueFirst = isFirstGroup && group.agentIds.length === 1
    const isUniqueSecond = isSecondGroup && group.agentIds.length === 1

    for (const agentId of group.agentIds) {
      result.push({
        agentId,
        averageScore: group.averageScore,
        displayRank,
        occupiedFormulaIndexes: [...occupiedFormulaIndexes],
        isUniqueLast,
        isUniqueFirst,
        isUniqueSecond
      })
    }

    currentIndex += group.agentIds.length
  }

  if (result.length !== aliveCount) {
    throw new Error(
      `[resolveRankingWithTies] ranking size ${result.length} does not match ` +
        `aliveCount ${aliveCount}`
    )
  }

  return result
}

// ============================================================
// Per-expert settlement
// ============================================================

/**
 * Calculates HP, speaking-right, prestige, and elimination changes for one expert.
 *
 * The returned speakingRightChange is a delta only. A future DB adapter should
 * apply rules.speakingRightRange clamping when it persists the new value.
 */
function calculateExpertSettlement(
  entry: RankingEntry,
  expert: ExpertState,
  formula: number[],
  isProtection: boolean,
  rules: RulesConfig
): ExpertSettlementResult {
  let baseHpChange: number

  if (entry.occupiedFormulaIndexes.length === 1) {
    baseHpChange = formula[entry.occupiedFormulaIndexes[0]]
  } else {
    const sum = entry.occupiedFormulaIndexes.reduce(
      (total, formulaIndex) => total + formula[formulaIndex],
      0
    )
    baseHpChange = Math.trunc(sum / entry.occupiedFormulaIndexes.length)
  }

  if (isProtection && baseHpChange < 0) {
    baseHpChange = Math.trunc(baseHpChange * rules.protectionReduction)
  }

  let nextConsecutiveLastCount: number

  if (isProtection) {
    nextConsecutiveLastCount = expert.consecutiveLastCount
  } else if (entry.isUniqueLast) {
    nextConsecutiveLastCount = expert.consecutiveLastCount + 1
  } else {
    nextConsecutiveLastCount = 0
  }

  let extraPenalty = 0

  if (
    entry.isUniqueLast &&
    !isProtection &&
    nextConsecutiveLastCount >= rules.consecutiveLastThreshold
  ) {
    extraPenalty = rules.consecutiveLastPenalty
  }

  let finalHpChange = baseHpChange + extraPenalty

  if (finalHpChange > 0 && rules.comebackBonus.enabled) {
    const matchedTier = findComebackTier(expert.currentHp, rules.comebackBonus.tiers)

    if (matchedTier) {
      finalHpChange = Math.min(
        Math.floor(finalHpChange * matchedTier.multiplier),
        matchedTier.maxGain
      )
    }
  }

  const rawHpAfter = expert.currentHp + finalHpChange
  const clampedHp = Math.max(0, Math.min(rawHpAfter, expert.hpCap))
  const eliminated = clampedHp <= 0

  let speakingRightChange = 0
  if (entry.isUniqueFirst) {
    speakingRightChange = 1
  } else if (entry.isUniqueLast) {
    speakingRightChange = -1
  }

  let prestigeChange = 0
  if (entry.isUniqueFirst) {
    prestigeChange = 2
  } else if (entry.isUniqueSecond) {
    prestigeChange = 1
  } else if (entry.isUniqueLast) {
    prestigeChange = -1
  }

  return {
    agentId: expert.agentId,
    displayRank: entry.displayRank,
    occupiedFormulaIndexes: entry.occupiedFormulaIndexes,
    baseHpChange,
    extraPenalty,
    finalHpChange,
    rawHpAfter,
    clampedHp,
    eliminated,
    nextConsecutiveLastCount,
    speakingRightChange,
    prestigeChange
  }
}

/**
 * Finds the comeback tier for pre-settlement HP.
 *
 * Tiers should be sorted by hpAtOrBelow ascending. The first tier where
 * currentHp <= hpAtOrBelow is returned.
 */
export function findComebackTier(
  currentHp: number,
  tiers: ComebackTier[]
): ComebackTier | undefined {
  for (const tier of tiers) {
    if (currentHp <= tier.hpAtOrBelow) {
      return tier
    }
  }

  return undefined
}

// ============================================================
// Valid-voter guard
// ============================================================

/**
 * Checks whether the round has enough distinct valid voters for automatic settlement.
 *
 * If this returns false, callers should route the round to manual_review instead
 * of applying HP settlement.
 */
export function hasEnoughValidVoters(validVoterCount: number, aliveCount: number): boolean {
  const minRequired = Math.max(2, Math.ceil(aliveCount * 0.5))
  return validVoterCount >= minRequired
}

// ============================================================
// Final ranking helper
// ============================================================

/**
 * Computes final endgame ranking entries.
 *
 * Sort order: alive experts first, rawHpAfter descending, last round displayRank
 * ascending, prestige descending, speakingRight descending, then agentId.
 */
export function computeFinalRanking(
  experts: Array<{
    agentId: string
    clampedHp: number
    rawHpAfter: number
    displayRank: number
    prestige: number
    speakingRight: number
  }>
): FinalRankingEntry[] {
  const sorted = [...experts].sort((a, b) => {
    const aAlive = a.clampedHp > 0 ? 1 : 0
    const bAlive = b.clampedHp > 0 ? 1 : 0

    if (aAlive !== bAlive) return bAlive - aAlive
    if (a.rawHpAfter !== b.rawHpAfter) return b.rawHpAfter - a.rawHpAfter
    if (a.displayRank !== b.displayRank) return a.displayRank - b.displayRank
    if (a.prestige !== b.prestige) return b.prestige - a.prestige
    if (a.speakingRight !== b.speakingRight) {
      return b.speakingRight - a.speakingRight
    }

    return a.agentId.localeCompare(b.agentId)
  })

  return sorted.map((expert, index) => ({
    agentId: expert.agentId,
    isAlive: expert.clampedHp > 0,
    rawHpAfter: expert.rawHpAfter,
    finalHp: expert.clampedHp,
    lastRoundRank: expert.displayRank,
    prestige: expert.prestige,
    speakingRight: expert.speakingRight,
    finalRank: index + 1
  }))
}
