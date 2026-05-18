import { describe, expect, it } from 'vitest'

import { buildProviderModelOptions } from '../../src/shared/providers/modelOptions'

describe('Round 7 role model option merging', () => {
  it('merges static registry, cached refreshed models, and user custom models without promoting them', () => {
    const options = buildProviderModelOptions({
      providerId: 'qwen',
      cachedModels: [
        {
          provider_id: 'qwen',
          model_id: 'qwen3.6-plus',
          display_name: 'Qwen 3.6 Plus refreshed',
          status: 'active',
          source: 'official_api'
        },
        {
          provider_id: 'qwen',
          model_id: 'qwen-new-remote',
          display_name: 'Qwen New Remote',
          status: 'active',
          source: 'official_api'
        }
      ],
      customModelIds: ['my-custom-qwen']
    })

    expect(options.find((option) => option.apiModelId === 'qwen3.6-plus')?.status).toBe('active')
    expect(options.find((option) => option.apiModelId === 'qwen-new-remote')?.status).toBe('unverified')
    expect(options.find((option) => option.apiModelId === 'my-custom-qwen')?.status).toBe('unverified')
    expect(options.filter((option) => option.apiModelId === 'qwen3.6-plus')).toHaveLength(1)
  })
})
