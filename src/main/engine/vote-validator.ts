import type {
  VoteEntry,
  VoteFinalStatus,
  VoteReasons,
  VoteValidationResult
} from '../../shared/types'

// ============================================================
// Configuration constants
// ============================================================

/** Maximum attempts: first try plus 2 retries. */
const MAX_ATTEMPTS = 3

/** Minimum accepted vote score. */
const MIN_SCORE = 0

/** Maximum accepted vote score. */
const MAX_SCORE = 10

// ============================================================
// Database access interfaces, injected by callers
// ============================================================

/**
 * Input for recording one vote attempt.
 *
 * This is not a full database row. A future DB adapter is responsible for
 * generating id and created_at, storing error in invalid_reason, then mapping
 * roundIndex and voterAgentId to the concrete vote_attempts columns.
 */
export interface VoteAttemptInput {
  sessionId: string
  roundIndex: number
  voterAgentId: string
  attempt: number
  rawOutput: string
  error: string | null
}

/**
 * Database access required by the vote validator.
 *
 * This interface intentionally avoids SQLite imports or real DB access.
 */
export interface VoteDbAccess {
  /** Writes one vote_attempt input; the DB adapter owns id and created_at. */
  writeVoteAttempt(record: VoteAttemptInput): void

  /**
   * Writes final valid votes.
   *
   * Each VoteEntry is one final score from voterAgentId to a target expert.
   * A future DB adapter should store vote.reasons in reason_json. If a final
   * vote already exists for the same voter and target, the adapter should apply
   * its idempotent write policy without throwing.
   */
  writeValidVotes(
    sessionId: string,
    roundIndex: number,
    voterAgentId: string,
    votes: VoteEntry[]
  ): void

  /**
   * Writes the final abstained marker.
   *
   * Abstained has no natural target expert. The storage location is left to a
   * future DB adapter and this interface does not assume writing to the votes
   * table.
   */
  writeAbstained(
    sessionId: string,
    roundIndex: number,
    voterAgentId: string
  ): void

  /**
   * Gets whether this voter already has a final status for the round.
   *
   * Returns 'valid' for final valid votes, 'abstained' for a final abstained
   * marker, or null when the voter has not been processed.
   */
  getVoteFinalStatus(
    sessionId: string,
    roundIndex: number,
    voterAgentId: string
  ): VoteFinalStatus | null
}

// ============================================================
// Provider interfaces, injected by callers
// ============================================================

/**
 * AI vote provider abstraction.
 *
 * This interface intentionally avoids importing or calling a real provider.
 */
export interface VoteProviderAccess {
  /**
   * Requests a raw vote output string from one expert.
   *
   * The returned string must be strict JSON. This validator does not extract
   * markdown code fences, repair malformed JSON, or use regex fallbacks.
   */
  requestVote(
    sessionId: string,
    roundIndex: number,
    voterAgentId: string
  ): Promise<string>
}

// ============================================================
// Core result types
// ============================================================

/**
 * Result of processing one expert's vote for a round.
 */
export interface VoteProcessResult {
  voterAgentId: string
  status: VoteFinalStatus
  /** Validated votes when this call newly succeeds with status 'valid'. */
  validVotes: VoteEntry[] | null
  /** Error summaries from all failed attempts. */
  attemptErrors: string[]
  /** Total attempts made; idempotent returns use 0. */
  totalAttempts: number
  /** Whether processing was skipped because a final status already existed. */
  alreadyProcessed: boolean
}

/**
 * Result of processing all expert votes for one round.
 */
export interface RoundVoteResult {
  sessionId: string
  roundIndex: number
  /** Per-expert vote processing results. */
  expertResults: VoteProcessResult[]
  /** Number of voters with final valid votes. */
  validVoterCount: number
  /** Minimum valid voter count required for automatic settlement. */
  minRequiredVoterCount: number
  /** Whether the valid voter threshold is satisfied. */
  meetsThreshold: boolean
  /** Whether the round should be routed to manual_review. */
  requiresManualReview: boolean
}

// ============================================================
// Vote validation
// ============================================================

/**
 * Validates one expert's raw vote output.
 *
 * Only strict JSON is accepted. Markdown code fences, partial JSON extraction,
 * and best-effort repairs are intentionally rejected.
 *
 * @param rawOutput Raw string returned by the provider.
 * @param voterAgentId Agent ID of the voter.
 * @param aliveExpertIds All currently alive expert IDs; must include the voter
 * and must not contain duplicates.
 */
export function validateVoteOutput(
  rawOutput: string,
  voterAgentId: string,
  aliveExpertIds: string[]
): VoteValidationResult {
  const precheckErrors = validateAliveExpertIds(voterAgentId, aliveExpertIds)
  if (precheckErrors.length > 0) {
    return {
      isValid: false,
      errors: precheckErrors,
      validVotes: []
    }
  }

  const errors: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch (error) {
    return {
      isValid: false,
      errors: [
        `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`
      ],
      validVotes: []
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      isValid: false,
      errors: ['Root must be an object'],
      validVotes: []
    }
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.votes)) {
    return {
      isValid: false,
      errors: ['"votes" field must be an array'],
      validVotes: []
    }
  }

  const votesArray = obj.votes as unknown[]
  const expectedTargets = aliveExpertIds.filter((id) => id !== voterAgentId)
  const expectedTargetsSet = new Set(expectedTargets)
  const expectedCount = expectedTargets.length

  if (votesArray.length !== expectedCount) {
    errors.push(
      `Expected ${expectedCount} votes (one per other alive expert), got ${votesArray.length}`
    )
  }

  const validVotes: VoteEntry[] = []
  const seenTargets = new Set<string>()

  for (let index = 0; index < votesArray.length; index += 1) {
    const item = votesArray[index]
    const prefix = `votes[${index}]`

    if (typeof item !== 'object' || item === null) {
      errors.push(`${prefix}: must be an object`)
      continue
    }

    const entry = item as Record<string, unknown>

    if (typeof entry.targetAgentId !== 'string' || entry.targetAgentId.trim() === '') {
      errors.push(`${prefix}.targetAgentId: must be a non-empty string`)
      continue
    }

    const targetAgentId = entry.targetAgentId

    if (targetAgentId === voterAgentId) {
      errors.push(`${prefix}.targetAgentId: cannot vote for self`)
      continue
    }

    if (!expectedTargetsSet.has(targetAgentId)) {
      errors.push(
        `${prefix}.targetAgentId: "${targetAgentId}" is not a valid alive expert`
      )
      continue
    }

    if (seenTargets.has(targetAgentId)) {
      errors.push(`${prefix}.targetAgentId: duplicate vote for "${targetAgentId}"`)
      continue
    }

    seenTargets.add(targetAgentId)

    if (typeof entry.score !== 'number') {
      errors.push(`${prefix}.score: must be a number`)
      continue
    }

    const score = entry.score

    if (!Number.isInteger(score)) {
      errors.push(`${prefix}.score: must be an integer, got ${score}`)
      continue
    }

    if (score < MIN_SCORE || score > MAX_SCORE) {
      errors.push(`${prefix}.score: must be ${MIN_SCORE}-${MAX_SCORE}, got ${score}`)
      continue
    }

    if (typeof entry.reasons !== 'object' || entry.reasons === null) {
      errors.push(`${prefix}.reasons: must be an object`)
      continue
    }

    const reasons = entry.reasons as Record<string, unknown>
    const reasonErrors = validateReasons(reasons, prefix)

    if (reasonErrors.length > 0) {
      errors.push(...reasonErrors)
      continue
    }

    validVotes.push({
      targetAgentId,
      score,
      reasons: {
        newArguments: String(reasons.newArguments),
        rebuttalOrDefense: String(reasons.rebuttalOrDefense),
        revisionOrIntegration: String(reasons.revisionOrIntegration),
        overall: String(reasons.overall)
      }
    })
  }

  for (const expectedTargetId of expectedTargets) {
    if (!seenTargets.has(expectedTargetId)) {
      errors.push(`Missing vote for expert: "${expectedTargetId}"`)
    }
  }

  const isValid = errors.length === 0 && validVotes.length === expectedCount

  return {
    isValid,
    errors,
    validVotes: isValid ? validVotes : []
  }
}

/**
 * Validates the alive expert ID list for voting.
 */
function validateAliveExpertIds(
  voterAgentId: string,
  aliveExpertIds: string[]
): string[] {
  const errors: string[] = []

  if (aliveExpertIds.length < 2) {
    errors.push('aliveExpertIds must contain at least 2 experts')
  }

  const uniqueIds = new Set(aliveExpertIds)
  if (uniqueIds.size !== aliveExpertIds.length) {
    errors.push('aliveExpertIds contains duplicate IDs')
  }

  if (!uniqueIds.has(voterAgentId)) {
    errors.push(`voterAgentId "${voterAgentId}" is not in aliveExpertIds`)
  }

  return errors
}

/**
 * Validates the four required fields in a VoteReasons object.
 */
function validateReasons(
  reasons: Record<string, unknown>,
  prefix: string
): string[] {
  const errors: string[] = []
  const requiredFields: Array<keyof VoteReasons> = [
    'newArguments',
    'rebuttalOrDefense',
    'revisionOrIntegration',
    'overall'
  ]

  for (const field of requiredFields) {
    const value = reasons[field]

    if (typeof value !== 'string') {
      errors.push(`${prefix}.reasons.${field}: must be a string`)
    } else if (value.trim() === '') {
      errors.push(`${prefix}.reasons.${field}: must not be empty`)
    }
  }

  return errors
}

// ============================================================
// Single-expert vote processing with retry
// ============================================================

/**
 * Processes one expert's vote by requesting provider output, validating it,
 * retrying failed attempts, and writing a final valid or abstained status.
 *
 * Idempotency: when getVoteFinalStatus returns 'valid' or 'abstained', this
 * returns that status without requesting the provider or writing anything.
 */
export async function processExpertVote(
  sessionId: string,
  roundIndex: number,
  voterAgentId: string,
  aliveExpertIds: string[],
  provider: VoteProviderAccess,
  db: VoteDbAccess
): Promise<VoteProcessResult> {
  const existingStatus = db.getVoteFinalStatus(sessionId, roundIndex, voterAgentId)

  if (existingStatus) {
    return {
      voterAgentId,
      status: existingStatus,
      validVotes: null,
      attemptErrors: [],
      totalAttempts: 0,
      alreadyProcessed: true
    }
  }

  const attemptErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let rawOutput: string

    try {
      rawOutput = await provider.requestVote(sessionId, roundIndex, voterAgentId)
    } catch (error) {
      const message = `Provider request failed: ${
        error instanceof Error ? error.message : String(error)
      }`

      attemptErrors.push(`Attempt ${attempt}: ${message}`)

      db.writeVoteAttempt({
        sessionId,
        roundIndex,
        voterAgentId,
        attempt,
        rawOutput: '',
        error: message
      })

      continue
    }

    const validation = validateVoteOutput(rawOutput, voterAgentId, aliveExpertIds)

    if (validation.isValid) {
      db.writeValidVotes(
        sessionId,
        roundIndex,
        voterAgentId,
        validation.validVotes
      )

      return {
        voterAgentId,
        status: 'valid',
        validVotes: validation.validVotes,
        attemptErrors,
        totalAttempts: attempt,
        alreadyProcessed: false
      }
    }

    const errorSummary = validation.errors.join('; ')
    attemptErrors.push(`Attempt ${attempt}: ${errorSummary}`)

    db.writeVoteAttempt({
      sessionId,
      roundIndex,
      voterAgentId,
      attempt,
      rawOutput,
      error: errorSummary
    })
  }

  db.writeAbstained(sessionId, roundIndex, voterAgentId)

  return {
    voterAgentId,
    status: 'abstained',
    validVotes: null,
    attemptErrors,
    totalAttempts: MAX_ATTEMPTS,
    alreadyProcessed: false
  }
}

// ============================================================
// Round vote processing
// ============================================================

/**
 * Processes every alive expert's vote in sequence for one round.
 *
 * Sequential processing avoids concurrent write conflicts. Callers can use
 * requiresManualReview to decide whether to continue to settlement.
 */
export async function processRoundVoting(
  sessionId: string,
  roundIndex: number,
  aliveExpertIds: string[],
  provider: VoteProviderAccess,
  db: VoteDbAccess
): Promise<RoundVoteResult> {
  const expertResults: VoteProcessResult[] = []

  for (const voterAgentId of aliveExpertIds) {
    const result = await processExpertVote(
      sessionId,
      roundIndex,
      voterAgentId,
      aliveExpertIds,
      provider,
      db
    )

    expertResults.push(result)
  }

  const validVoterCount = expertResults.filter(
    (result) => result.status === 'valid'
  ).length

  const minRequiredVoterCount = getMinValidVoterCount(aliveExpertIds.length)
  const meetsThreshold = validVoterCount >= minRequiredVoterCount

  return {
    sessionId,
    roundIndex,
    expertResults,
    validVoterCount,
    minRequiredVoterCount,
    meetsThreshold,
    requiresManualReview: !meetsThreshold
  }
}

// ============================================================
// Valid-voter threshold helper
// ============================================================

/**
 * Calculates the minimum number of valid voters required for settlement.
 */
export function getMinValidVoterCount(aliveCount: number): number {
  return Math.max(2, Math.ceil(aliveCount * 0.5))
}
