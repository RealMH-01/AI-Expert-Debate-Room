export type ProviderId =
  | 'mock'
  | 'openai'
  | 'openai_compatible'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'qwen'
  | 'bigmodel'
  | 'moonshot'

export type ModelStatus = 'active' | 'unverified' | 'stub'

export type ApiFormat =
  | 'mock'
  | 'openai_responses'
  | 'openai_chat_completions'
  | 'openai_compatible_chat_completions'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'bigmodel_chat_completions'

export type AuthType =
  | 'none'
  | 'authorization_bearer'
  | 'x_api_key'
  | 'x_goog_api_key'
  | 'other'

export type ModelCapability = {
  providerId: ProviderId
  providerDisplayName: string
  displayName: string
  apiModelId: string
  officialDocUrl: string
  apiFormat: ApiFormat
  defaultBaseUrl: string
  authType: AuthType
  supportsThinking: boolean | 'unknown'
  thinkingParam?: string
  supportsStreaming: boolean | 'unknown'
  supportsJson: boolean | 'unknown'
  supportsVision: boolean | 'unknown'
  supportsToolCalling: boolean | 'unknown'
  status: ModelStatus
  notes?: string
}

export type ProviderDefinition = {
  id: ProviderId
  displayName: string
  defaultBaseUrl: string
  authType: AuthType
  apiFormat: ApiFormat
  adapterImplemented: boolean
  allowUnverifiedModelsDefault: boolean
  openaiCompatibleBaseUrl?: string
  defaultModelId?: string
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'mock',
    displayName: 'Mock',
    defaultBaseUrl: 'local://mock',
    authType: 'none',
    apiFormat: 'mock',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: true
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_responses',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  },
  {
    id: 'openai_compatible',
    displayName: 'OpenAI Compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: true
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    apiFormat: 'anthropic_messages',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  },
  {
    id: 'google',
    displayName: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    apiFormat: 'gemini_generate_content',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false,
    openaiCompatibleBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/'
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  },
  {
    id: 'qwen',
    displayName: 'Qwen / DashScope',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  },
  {
    id: 'bigmodel',
    displayName: '智谱 GLM / BigModel',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    apiFormat: 'bigmodel_chat_completions',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  },
  {
    id: 'moonshot',
    displayName: 'Kimi / Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    adapterImplemented: true,
    allowUnverifiedModelsDefault: false
  }
]

const docs = {
  openaiModels: 'https://developers.openai.com/api/docs/models',
  openaiResponses: 'https://developers.openai.com/api/reference/responses',
  anthropicModels: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  anthropicMessages: 'https://platform.claude.com/docs/en/api/messages',
  geminiModels: 'https://ai.google.dev/gemini-api/docs/models',
  geminiText: 'https://ai.google.dev/gemini-api/docs/text-generation',
  deepseek: 'https://api-docs.deepseek.com',
  qwenModels: 'https://help.aliyun.com/zh/model-studio/models',
  bigmodel: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.1',
  moonshotModels: 'https://platform.kimi.com/docs/models'
} as const

function model(
  providerId: ProviderId,
  apiModelId: string,
  displayName: string,
  overrides: Omit<ModelCapability, 'providerId' | 'providerDisplayName' | 'displayName' | 'apiModelId' | 'status'> & {
    status?: ModelStatus
  }
): ModelCapability {
  const provider = getProviderDefinition(providerId)
  if (!provider) throw new Error(`Unknown providerId: ${providerId}`)
  const streamingNote = overrides.supportsStreaming === true
    ? 'supportsStreaming means the official API supports streaming; current adapters may still consume non-streaming responses.'
    : ''
  const notes = [overrides.notes, streamingNote].filter(Boolean).join(' ')
  return {
    providerId,
    providerDisplayName: provider.displayName,
    displayName,
    apiModelId,
    status: overrides.status ?? 'active',
    ...overrides,
    notes: notes || overrides.notes
  }
}

export const ACTIVE_MODEL_SEED: ModelCapability[] = [
  ...['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'].map((id) =>
    model('openai', id, id, {
      officialDocUrl: docs.openaiModels,
      apiFormat: 'openai_responses',
      defaultBaseUrl: 'https://api.openai.com/v1',
      authType: 'authorization_bearer',
      supportsThinking: true,
      thinkingParam: 'reasoning.effort',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: true,
      supportsToolCalling: true
    })
  ),
  model('anthropic', 'claude-opus-4-7', 'Claude Opus 4.7', {
    officialDocUrl: docs.anthropicModels,
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    notes: 'Uses adaptive thinking.'
  }),
  model('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', {
    officialDocUrl: docs.anthropicModels,
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    notes: 'Prefers adaptive thinking; manual budget is legacy.'
  }),
  model('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', {
    officialDocUrl: docs.anthropicModels,
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type + budget_tokens',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    notes: 'API ID uses dated Claude Haiku 4.5 model ID.'
  }),
  ...['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].map((id) =>
    model('google', id, id, {
      officialDocUrl: docs.geminiModels,
      apiFormat: 'gemini_generate_content',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      authType: 'x_goog_api_key',
      supportsThinking: true,
      thinkingParam: 'generationConfig.thinkingConfig.thinkingBudget',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: true,
      supportsToolCalling: true
    })
  ),
  model('google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', {
    officialDocUrl: docs.geminiModels,
    apiFormat: 'gemini_generate_content',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    supportsThinking: true,
    thinkingParam: 'generationConfig.thinkingConfig.thinkingLevel',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    notes: 'Preview model; visible in the registry but not a default recommendation.'
  }),
  ...['deepseek-v4-pro', 'deepseek-v4-flash'].map((id) =>
    model('deepseek', id, id, {
      officialDocUrl: docs.deepseek,
      apiFormat: 'openai_compatible_chat_completions',
      defaultBaseUrl: 'https://api.deepseek.com',
      authType: 'authorization_bearer',
      supportsThinking: true,
      thinkingParam: 'thinking.type + reasoning_effort',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: false,
      supportsToolCalling: true
    })
  ),
  ...['qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.6-flash', 'qwen-plus', 'qwq-plus'].map((id) =>
    model('qwen', id, id, {
      officialDocUrl: docs.qwenModels,
      apiFormat: 'openai_compatible_chat_completions',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      authType: 'authorization_bearer',
      supportsThinking: true,
      thinkingParam: 'enable_thinking + thinking_budget',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: id === 'qwq-plus' ? false : 'unknown',
      supportsToolCalling: true,
      notes: id.includes('preview') ? 'Preview model; not a default recommendation.' : undefined
    })
  ),
  ...['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.6'].map((id) =>
    model('bigmodel', id, id, {
      officialDocUrl: docs.bigmodel,
      apiFormat: 'bigmodel_chat_completions',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      authType: 'authorization_bearer',
      supportsThinking: true,
      thinkingParam: 'thinking.type',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: false,
      supportsToolCalling: true
    })
  ),
  ...['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'moonshot-v1-128k'].map((id) =>
    model('moonshot', id, id, {
      officialDocUrl: docs.moonshotModels,
      apiFormat: 'openai_compatible_chat_completions',
      defaultBaseUrl: 'https://api.moonshot.cn/v1',
      authType: 'authorization_bearer',
      supportsThinking: id === 'moonshot-v1-128k' ? false : true,
      thinkingParam: id === 'moonshot-v1-128k' ? undefined : 'thinking.type',
      supportsStreaming: true,
      supportsJson: true,
      supportsVision: false,
      supportsToolCalling: true,
      notes: id === 'kimi-k2-thinking' ? 'Dedicated thinking model; thinking must not be disabled.' : undefined
    })
  ),
  model('mock', 'mock-basic', 'Mock Basic', {
    officialDocUrl: 'local://mock',
    apiFormat: 'mock',
    defaultBaseUrl: 'local://mock',
    authType: 'none',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false
  }),
  model('mock', 'mock-critical', 'Mock Critical Thinker', {
    officialDocUrl: 'local://mock',
    apiFormat: 'mock',
    defaultBaseUrl: 'local://mock',
    authType: 'none',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false
  }),
  model('mock', 'mock-creative', 'Mock Creative', {
    officialDocUrl: 'local://mock',
    apiFormat: 'mock',
    defaultBaseUrl: 'local://mock',
    authType: 'none',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false
  })
]

export const UNVERIFIED_MODEL_SEED: ModelCapability[] = [
  model('openai_compatible', 'custom', 'Custom OpenAI-compatible model', {
    officialDocUrl: 'user-provided',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: 'unknown',
    supportsStreaming: true,
    supportsJson: 'unknown',
    supportsVision: 'unknown',
    supportsToolCalling: 'unknown',
    status: 'unverified',
    notes: 'User-provided OpenAI-compatible model ID.'
  })
]

export const MODEL_REGISTRY: ModelCapability[] = [
  ...ACTIVE_MODEL_SEED,
  ...UNVERIFIED_MODEL_SEED
]

export const PROVIDER_IDS = PROVIDER_DEFINITIONS.map((provider) => provider.id)

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value)
}

export function getProviderDefinition(providerId: ProviderId | string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId)
}

export function getModelCapability(
  providerId: ProviderId | string,
  modelId: string
): ModelCapability | undefined {
  return MODEL_REGISTRY.find(
    (model) => model.providerId === providerId && model.apiModelId === modelId
  )
}

export function getModelsForProvider(providerId: ProviderId | string): ModelCapability[] {
  return MODEL_REGISTRY.filter((model) => model.providerId === providerId)
}

export function createCustomModelCapability(
  providerId: ProviderId,
  apiModelId: string
): ModelCapability {
  const provider = getProviderDefinition(providerId)
  if (!provider) {
    throw new Error(`Unknown providerId: ${providerId}`)
  }

  return {
    providerId,
    providerDisplayName: provider.displayName,
    displayName: apiModelId,
    apiModelId,
    officialDocUrl: 'user-provided',
    apiFormat: provider.apiFormat,
    defaultBaseUrl: provider.defaultBaseUrl,
    authType: provider.authType,
    supportsThinking: 'unknown',
    supportsStreaming: 'unknown',
    supportsJson: 'unknown',
    supportsVision: 'unknown',
    supportsToolCalling: 'unknown',
    status: 'unverified',
    notes: 'This model ID is user-provided and unverified by the built-in registry.'
  }
}

export function modelCanBeTested(modelCapability: Pick<ModelCapability, 'status'>): boolean {
  return modelCapability.status !== 'stub'
}
