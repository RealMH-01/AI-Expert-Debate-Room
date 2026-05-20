export {
  calculateAverageScores,
  computeFinalRanking,
  findComebackTier,
  hasEnoughValidVoters,
  resolveRankingWithTies,
  settleRound
} from './hp-settlement'

export type {
  ExpertState,
  SettlementDbAccess,
  ValidVote
} from './hp-settlement'

export {
  getMinValidVoterCount,
  processExpertVote,
  processRoundVoting,
  validateVoteOutput
} from './vote-validator'

export type {
  RoundVoteResult,
  VoteAttemptInput,
  VoteDbAccess,
  VoteProcessResult,
  VoteProviderAccess
} from './vote-validator'

export {
  PhaseManager,
  getNextRoundPhase,
  getRoundPhaseSequence,
  isSettlementRound,
  isValidSessionTransition,
  mapLegacyStatus,
  validateDecisionAction
} from './phase-manager'

export type {
  PhaseDbAccess,
  PhaseTransitionResult,
  PhaseUserDecisionAction,
  UserDecisionResult
} from './phase-manager'
