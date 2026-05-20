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

export {
  buildDebateHpHint,
  buildDebatePromptMessages,
  buildDebateSystemPrompt,
  buildDebateUserMessage,
  buildVoteJsonExample,
  buildVotePromptMessages,
  buildVoteSystemPrompt,
  buildVoteUserMessage,
  formatExpertForPrompt,
  formatTargetExpertForVote,
  validateDebatePromptInput,
  validateVotePromptExperts,
  validateVotePromptInput
} from './prompt-templates'

export type {
  DebatePromptInput,
  PromptExpertInfo,
  PromptMessages,
  VotePromptInput
} from './prompt-templates'
