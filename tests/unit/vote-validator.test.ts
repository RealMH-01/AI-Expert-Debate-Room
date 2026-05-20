import { describe, expect, it, vi } from 'vitest'

import {
  getMinValidVoterCount,
  processExpertVote,
  processRoundVoting,
  validateVoteOutput
} from '../../src/main/engine/vote-validator'
import type {
  VoteDbAccess,
  VoteProviderAccess
} from '../../src/main/engine/vote-validator'

const voterAgentId = 'agent_voter'
const aliveExpertIds = ['agent_voter', 'agent_a', 'agent_b', 'agent_c']

function voteEntry(targetAgentId: string, score = 5) {
  return {
    targetAgentId,
    score,
    reasons: {
      newArguments: `new argument for ${targetAgentId}`,
      rebuttalOrDefense: `rebuttal for ${targetAgentId}`,
      revisionOrIntegration: `revision for ${targetAgentId}`,
      overall: `overall for ${targetAgentId}`
    }
  }
}

function validVoteJson(voter = voterAgentId, aliveIds = aliveExpertIds): string {
  return JSON.stringify({
    votes: aliveIds.filter((id) => id !== voter).map((id) => voteEntry(id, 7))
  })
}

function createProvider(outputs: Array<string | Error>): VoteProviderAccess {
  const queue = [...outputs]

  return {
    requestVote: vi.fn(async () => {
      const next = queue.shift()
      if (next instanceof Error) {
        throw next
      }
      return next ?? validVoteJson()
    })
  }
}

function createDb(
  finalStatus: ReturnType<VoteDbAccess['getVoteFinalStatus']> = null
): VoteDbAccess {
  return {
    writeVoteAttempt: vi.fn(),
    writeValidVotes: vi.fn(),
    writeAbstained: vi.fn(),
    getVoteFinalStatus: vi.fn(() => finalStatus)
  }
}

describe('vote-validator', () => {
  describe('validateVoteOutput', () => {
    it('accepts strict JSON and preserves reasons', () => {
      const result = validateVoteOutput(validVoteJson(), voterAgentId, aliveExpertIds)

      expect(result).toMatchObject({ isValid: true, errors: [] })
      expect(result.validVotes).toHaveLength(3)
      expect(result.validVotes[0].reasons.overall).toBe('overall for agent_a')
    })

    it('rejects non-JSON and markdown-fenced JSON', () => {
      expect(validateVoteOutput('not json', voterAgentId, aliveExpertIds).errors[0]).toMatch(
        /JSON parse failed/
      )
      expect(
        validateVoteOutput(`\`\`\`json\n${validVoteJson()}\n\`\`\``, voterAgentId, aliveExpertIds)
          .errors[0]
      ).toMatch(/JSON parse failed/)
    })

    it('rejects invalid root and votes structures', () => {
      expect(validateVoteOutput('"not an object"', voterAgentId, aliveExpertIds).errors).toContain(
        'Root must be an object'
      )
      expect(
        validateVoteOutput(JSON.stringify({ votes: 'nope' }), voterAgentId, aliveExpertIds)
          .errors
      ).toContain('"votes" field must be an array')
      expect(
        validateVoteOutput(JSON.stringify({ votes: [voteEntry('agent_a')] }), voterAgentId, aliveExpertIds)
          .errors
      ).toContain('Expected 3 votes (one per other alive expert), got 1')
    })

    it('rejects self, unknown, duplicate, and missing targets', () => {
      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [voteEntry('agent_voter'), voteEntry('agent_a'), voteEntry('agent_b')]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/cannot vote for self/)]))

      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [voteEntry('agent_a'), voteEntry('agent_b'), voteEntry('agent_x')]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/not a valid alive expert/)]))

      const duplicateResult = validateVoteOutput(
        JSON.stringify({
          votes: [voteEntry('agent_a'), voteEntry('agent_a'), voteEntry('agent_b')]
        }),
        voterAgentId,
        aliveExpertIds
      )
      expect(duplicateResult.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/duplicate vote/),
          'Missing vote for expert: "agent_c"'
        ])
      )
    })

    it('rejects non-number, decimal, and out-of-range scores', () => {
      const nonNumber = { ...voteEntry('agent_a'), score: '5' }
      expect(
        validateVoteOutput(
          JSON.stringify({ votes: [nonNumber, voteEntry('agent_b'), voteEntry('agent_c')] }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/score: must be a number/)]))

      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [voteEntry('agent_a', 4.5), voteEntry('agent_b'), voteEntry('agent_c')]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/must be an integer/)]))

      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [voteEntry('agent_a', -1), voteEntry('agent_b', 11), voteEntry('agent_c')]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/must be 0-10/)]))
    })

    it('rejects missing or empty reason fields', () => {
      const missingReason = {
        targetAgentId: 'agent_a',
        score: 5,
        reasons: {
          newArguments: 'new',
          rebuttalOrDefense: 'rebuttal',
          overall: 'overall'
        }
      }
      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [missingReason, voteEntry('agent_b'), voteEntry('agent_c')]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/revisionOrIntegration/)]))

      expect(
        validateVoteOutput(
          JSON.stringify({
            votes: [
              {
                ...voteEntry('agent_a'),
                reasons: { ...voteEntry('agent_a').reasons, overall: ' ' }
              },
              voteEntry('agent_b'),
              voteEntry('agent_c')
            ]
          }),
          voterAgentId,
          aliveExpertIds
        ).errors
      ).toEqual(expect.arrayContaining([expect.stringMatching(/must not be empty/)]))
    })

    it('rejects invalid alive expert ID lists before parsing votes', () => {
      expect(validateVoteOutput(validVoteJson(), voterAgentId, ['agent_a']).errors).toEqual(
        expect.arrayContaining([
          'aliveExpertIds must contain at least 2 experts',
          'voterAgentId "agent_voter" is not in aliveExpertIds'
        ])
      )
      expect(
        validateVoteOutput(validVoteJson(), voterAgentId, ['agent_voter', 'agent_a', 'agent_a'])
          .errors
      ).toContain('aliveExpertIds contains duplicate IDs')
    })
  })

  describe('processExpertVote', () => {
    it('returns existing valid and abstained statuses without provider calls', async () => {
      const validProvider = createProvider([validVoteJson()])
      const validDb = createDb('valid')

      await expect(
        processExpertVote('session-1', 1, voterAgentId, aliveExpertIds, validProvider, validDb)
      ).resolves.toMatchObject({
        alreadyProcessed: true,
        status: 'valid',
        totalAttempts: 0
      })
      expect(validProvider.requestVote).not.toHaveBeenCalled()

      const abstainedProvider = createProvider([validVoteJson()])
      const abstainedDb = createDb('abstained')
      await expect(
        processExpertVote(
          'session-1',
          1,
          voterAgentId,
          aliveExpertIds,
          abstainedProvider,
          abstainedDb
        )
      ).resolves.toMatchObject({
        alreadyProcessed: true,
        status: 'abstained',
        validVotes: null
      })
      expect(abstainedProvider.requestVote).not.toHaveBeenCalled()
      expect(abstainedDb.writeValidVotes).not.toHaveBeenCalled()
    })

    it('writes valid votes on the first successful attempt', async () => {
      const provider = createProvider([validVoteJson()])
      const db = createDb()

      const result = await processExpertVote(
        'session-1',
        1,
        voterAgentId,
        aliveExpertIds,
        provider,
        db
      )

      expect(result).toMatchObject({
        status: 'valid',
        totalAttempts: 1,
        alreadyProcessed: false
      })
      expect(db.writeValidVotes).toHaveBeenCalledTimes(1)
      expect(db.writeAbstained).not.toHaveBeenCalled()
      expect(db.writeValidVotes).toHaveBeenCalledWith(
        'session-1',
        1,
        voterAgentId,
        expect.arrayContaining([expect.objectContaining({ reasons: expect.any(Object) })])
      )
      expect(vi.mocked(db.writeValidVotes).mock.calls[0]).toHaveLength(4)
    })

    it('retries failed validations and succeeds on the third attempt', async () => {
      const provider = createProvider(['not json', JSON.stringify({ votes: [] }), validVoteJson()])
      const db = createDb()

      const result = await processExpertVote(
        'session-1',
        1,
        voterAgentId,
        aliveExpertIds,
        provider,
        db
      )

      expect(result).toMatchObject({
        status: 'valid',
        totalAttempts: 3
      })
      expect(db.writeVoteAttempt).toHaveBeenCalledTimes(2)
      expect(db.writeValidVotes).toHaveBeenCalledTimes(1)
    })

    it('records three failed attempts then writes abstained', async () => {
      const provider = createProvider(['nope', JSON.stringify({ votes: [] }), 'still nope'])
      const db = createDb()

      const result = await processExpertVote(
        'session-1',
        1,
        voterAgentId,
        aliveExpertIds,
        provider,
        db
      )

      expect(result).toMatchObject({
        status: 'abstained',
        totalAttempts: 3
      })
      expect(db.writeVoteAttempt).toHaveBeenCalledTimes(3)
      expect(db.writeAbstained).toHaveBeenCalledWith('session-1', 1, voterAgentId)
    })

    it('records provider errors with attempt metadata and continues retrying', async () => {
      const provider = createProvider([new Error('provider down'), validVoteJson()])
      const db = createDb()

      const result = await processExpertVote(
        'session-1',
        2,
        voterAgentId,
        aliveExpertIds,
        provider,
        db
      )

      expect(result.status).toBe('valid')
      expect(db.writeVoteAttempt).toHaveBeenCalledWith({
        sessionId: 'session-1',
        roundIndex: 2,
        voterAgentId,
        attempt: 1,
        rawOutput: '',
        error: 'Provider request failed: provider down'
      })
    })
  })

  describe('processRoundVoting', () => {
    it('marks the threshold as met when all experts vote successfully', async () => {
      const provider = createProvider(aliveExpertIds.map((id) => validVoteJson(id)))
      const db = createDb()

      const result = await processRoundVoting('session-1', 1, aliveExpertIds, provider, db)

      expect(result).toMatchObject({
        validVoterCount: 4,
        minRequiredVoterCount: 2,
        meetsThreshold: true,
        requiresManualReview: false
      })
    })

    it('requires manual review when a 5-expert round has only one valid voter', async () => {
      const ids = ['agent_a', 'agent_b', 'agent_c', 'agent_d', 'agent_e']
      const provider = createProvider([
        validVoteJson('agent_a', ids),
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad'
      ])
      const db = createDb()

      const result = await processRoundVoting('session-1', 1, ids, provider, db)

      expect(result).toMatchObject({
        validVoterCount: 1,
        minRequiredVoterCount: 3,
        meetsThreshold: false,
        requiresManualReview: true
      })
    })

    it('does not require manual review when a 5-expert round has three valid voters', async () => {
      const ids = ['agent_a', 'agent_b', 'agent_c', 'agent_d', 'agent_e']
      const provider = createProvider([
        validVoteJson('agent_a', ids),
        validVoteJson('agent_b', ids),
        validVoteJson('agent_c', ids),
        'bad',
        'bad',
        'bad',
        'bad',
        'bad',
        'bad'
      ])
      const db = createDb()

      const result = await processRoundVoting('session-1', 1, ids, provider, db)

      expect(result).toMatchObject({
        validVoterCount: 3,
        minRequiredVoterCount: 3,
        meetsThreshold: true,
        requiresManualReview: false
      })
    })

    it('does not count existing abstained status as a valid voter', async () => {
      const db: VoteDbAccess = {
        writeVoteAttempt: vi.fn(),
        writeValidVotes: vi.fn(),
        writeAbstained: vi.fn(),
        getVoteFinalStatus: vi.fn((_sessionId, _roundIndex, voter) =>
          voter === 'agent_a' ? 'abstained' : null
        )
      }
      const ids = ['agent_a', 'agent_b', 'agent_c']
      const provider = createProvider([validVoteJson('agent_b', ids), validVoteJson('agent_c', ids)])

      const result = await processRoundVoting('session-1', 1, ids, provider, db)

      expect(result.validVoterCount).toBe(2)
      expect(result.expertResults[0]).toMatchObject({
        voterAgentId: 'agent_a',
        status: 'abstained'
      })
    })

    it('processes expert votes sequentially instead of concurrently', async () => {
      const events: string[] = []
      const ids = ['agent_a', 'agent_b', 'agent_c']
      const provider: VoteProviderAccess = {
        requestVote: vi.fn(async (_sessionId, _roundIndex, voter) => {
          events.push(`start:${voter}`)
          await Promise.resolve()
          events.push(`end:${voter}`)
          return validVoteJson(voter, ids)
        })
      }

      await processRoundVoting('session-1', 1, ids, provider, createDb())

      expect(events).toEqual([
        'start:agent_a',
        'end:agent_a',
        'start:agent_b',
        'end:agent_b',
        'start:agent_c',
        'end:agent_c'
      ])
    })
  })

  describe('getMinValidVoterCount', () => {
    it('returns the required threshold for 3-7 experts', () => {
      expect(getMinValidVoterCount(3)).toBe(2)
      expect(getMinValidVoterCount(4)).toBe(2)
      expect(getMinValidVoterCount(5)).toBe(3)
      expect(getMinValidVoterCount(6)).toBe(3)
      expect(getMinValidVoterCount(7)).toBe(4)
    })
  })
})
