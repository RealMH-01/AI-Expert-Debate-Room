import { findModelPricing } from './modelPricing'

export interface CostEstimateInput {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
}

export interface CostEstimateResult {
  estimatedCost: number | null
  currency: string
  pricingSource: 'static_config' | 'provider_usage' | 'estimated'
}

export function estimateModelCallCost(input: CostEstimateInput): CostEstimateResult {
  const pricing = findModelPricing(input.provider, input.model)
  if (!pricing || pricing.inputPer1M == null || pricing.outputPer1M == null) {
    return {
      estimatedCost: null,
      currency: pricing?.currency || 'USD',
      pricingSource: 'estimated'
    }
  }

  const inputCost = (Math.max(0, input.inputTokens) / 1_000_000) * pricing.inputPer1M
  const outputCost = (Math.max(0, input.outputTokens) / 1_000_000) * pricing.outputPer1M

  return {
    estimatedCost: Number((inputCost + outputCost).toFixed(8)),
    currency: pricing.currency,
    pricingSource: 'static_config'
  }
}
