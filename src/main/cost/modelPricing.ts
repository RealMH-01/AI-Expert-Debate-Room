export interface ModelPricing {
  inputPer1M: number | null
  outputPer1M: number | null
  currency: string
  note?: string
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'mock:mock-provider': {
    inputPer1M: 0,
    outputPer1M: 0,
    currency: 'USD',
    note: 'Mock provider placeholder pricing.'
  },
  'openai:gpt-5.5': {
    inputPer1M: null,
    outputPer1M: null,
    currency: 'USD',
    note: 'Placeholder. Maintain manually; do not treat as billing truth.'
  },
  'openai_compatible:gpt-5.5': {
    inputPer1M: null,
    outputPer1M: null,
    currency: 'USD',
    note: 'Placeholder. Compatible providers vary by vendor.'
  }
}

export function findModelPricing(provider: string, model: string): ModelPricing | null {
  const keys = [
    `${provider}:${model}`,
    `${provider.split(':')[0]}:${model}`,
    provider.includes('/') ? provider.replace(/^openai_compatible:/, '') : ''
  ].filter(Boolean)

  for (const key of keys) {
    const pricing = MODEL_PRICING[key]
    if (pricing) return pricing
  }

  return null
}
