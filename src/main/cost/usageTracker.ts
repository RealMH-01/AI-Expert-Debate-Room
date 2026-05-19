import { randomUUID } from 'node:crypto'
import { estimateModelCallCost } from './costEstimator'
import { estimateTokens } from './tokenEstimator'

interface ProviderUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface UsageTrackMetadata {
  meetingId: string
  phase: string
  roundIndex: number | null
  role: 'moderator' | 'expert' | 'system'
  expertId: string | null
  provider: string
  model: string
  inputText: unknown
}

export interface ModelCallUsageRecordInput {
  id: string
  meeting_id: string
  phase: string
  round_index: number | null
  role: string
  expert_id: string | null
  provider: string
  model: string
  estimated_input_tokens: number
  estimated_output_tokens: number
  actual_input_tokens: number | null
  actual_output_tokens: number | null
  estimated_cost: number | null
  currency: string
  pricing_source: string
  request_started_at: string
  request_finished_at: string
  created_at: string
}

type PersistUsage = (record: ModelCallUsageRecordInput) => Promise<void> | void
type ExtractOutput<T> = (result: T) => unknown
type ExtractUsage<T> = (result: T) => ProviderUsage | undefined

export async function trackModelCallUsage<T>(
  metadata: UsageTrackMetadata,
  call: () => Promise<T>,
  persist: PersistUsage,
  extractOutput: ExtractOutput<T>,
  extractUsage: ExtractUsage<T> = defaultUsageExtractor
): Promise<T> {
  const requestStartedAt = new Date().toISOString()
  let result: T

  try {
    result = await call()
  } catch (error) {
    const requestFinishedAt = new Date().toISOString()
    await persistSafely(
      persist,
      buildUsageRecord(metadata, requestStartedAt, requestFinishedAt, '', undefined)
    )
    throw error
  }

  const requestFinishedAt = new Date().toISOString()
  await persistSafely(
    persist,
    buildUsageRecord(
      metadata,
      requestStartedAt,
      requestFinishedAt,
      extractOutput(result),
      extractUsage(result)
    )
  )

  return result
}

function buildUsageRecord(
  metadata: UsageTrackMetadata,
  requestStartedAt: string,
  requestFinishedAt: string,
  outputText: unknown,
  usage: ProviderUsage | undefined
): ModelCallUsageRecordInput {
  const estimatedInputTokens = estimateTokens(metadata.inputText)
  const estimatedOutputTokens = estimateTokens(outputText)
  const inputTokensForCost = usage?.promptTokens ?? estimatedInputTokens
  const outputTokensForCost = usage?.completionTokens ?? estimatedOutputTokens
  const cost = estimateModelCallCost({
    provider: metadata.provider,
    model: metadata.model,
    inputTokens: inputTokensForCost,
    outputTokens: outputTokensForCost
  })

  return {
    id: randomUUID(),
    meeting_id: metadata.meetingId,
    phase: metadata.phase,
    round_index: metadata.roundIndex,
    role: metadata.role,
    expert_id: metadata.expertId,
    provider: metadata.provider,
    model: metadata.model,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    actual_input_tokens: usage?.promptTokens ?? null,
    actual_output_tokens: usage?.completionTokens ?? null,
    estimated_cost: cost.estimatedCost,
    currency: cost.currency,
    pricing_source: usage ? 'provider_usage' : cost.pricingSource,
    request_started_at: requestStartedAt,
    request_finished_at: requestFinishedAt,
    created_at: new Date().toISOString()
  }
}

async function persistSafely(persist: PersistUsage, record: ModelCallUsageRecordInput): Promise<void> {
  try {
    await persist(record)
  } catch (error) {
    console.error('[UsageTracker] Failed to persist model call usage:', error)
  }
}

function defaultUsageExtractor<T>(result: T): ProviderUsage | undefined {
  const maybe = result as { usage?: ProviderUsage }
  return maybe?.usage
}
