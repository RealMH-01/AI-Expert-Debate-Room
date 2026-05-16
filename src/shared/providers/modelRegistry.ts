/**
 * Model Registry - 集中式模型注册表
 *
 * Round 7：扩展七家模型供应商 Provider Adapter。
 *
 * 所有 model ID / API 参数依据来自官方开放平台文档：
 * - OpenAI: https://developers.openai.com/api/docs
 * - Anthropic: https://platform.claude.com/docs
 * - Google Gemini: https://ai.google.dev/gemini-api/docs
 * - DeepSeek: https://api-docs.deepseek.com
 * - Qwen / DashScope: https://help.aliyun.com/zh/model-studio
 * - 智谱 BigModel: https://docs.bigmodel.cn
 * - Moonshot / Kimi: https://platform.kimi.com/docs
 *
 * 模型状态规则：
 * - active: 官方文档确认 model ID 和 API 格式
 * - unverified: 可能存在但未完整确认
 * - stub: Adapter 未实现或关键 API 文档缺失
 */

// ============================================================
// Types
// ============================================================

export type ProviderId =
  | 'mock'
  | 'openai'
  | 'openai_compatible'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'qwen'
  | 'bigmodel'
  | 'moonshot';

export type ApiFormat =
  | 'mock'
  | 'openai_responses'
  | 'openai_chat_completions'
  | 'openai_compatible_chat_completions'
  | 'anthropic_messages'
  | 'gemini_generate_content';

export type AuthType =
  | 'none'
  | 'authorization_bearer'
  | 'x_api_key'
  | 'x_goog_api_key'
  | 'other';

export type ModelStatus = 'active' | 'unverified' | 'stub';

export type ModelCapability = {
  providerId: ProviderId;
  providerDisplayName: string;
  displayName: string;
  apiModelId: string;
  officialDocUrl: string;
  apiFormat: ApiFormat;
  defaultBaseUrl: string;
  authType: AuthType;
  supportsThinking: boolean | 'unknown';
  thinkingParam?: string;
  supportsStreaming: boolean | 'unknown';
  supportsJson: boolean | 'unknown';
  supportsVision: boolean | 'unknown';
  supportsToolCalling: boolean | 'unknown';
  status: ModelStatus;
  notes?: string;
};

export interface ProviderRegistryEntry {
  id: ProviderId;
  displayName: string;
  defaultBaseUrl: string;
  authType: AuthType;
  apiFormat: ApiFormat;
  requiresApiKey: boolean;
  officialDocUrl: string;
  notes?: string;
}

// ============================================================
// Provider Registry
// ============================================================

export const PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  {
    id: 'mock',
    displayName: 'Mock (测试)',
    defaultBaseUrl: '',
    authType: 'none',
    apiFormat: 'mock',
    requiresApiKey: false,
    officialDocUrl: ''
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_responses',
    requiresApiKey: true,
    officialDocUrl: 'https://developers.openai.com/api/docs'
  },
  {
    id: 'openai_compatible',
    displayName: 'OpenAI 兼容',
    defaultBaseUrl: '',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    requiresApiKey: true,
    officialDocUrl: '',
    notes: '用户自定义 OpenAI 兼容端点'
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    apiFormat: 'anthropic_messages',
    requiresApiKey: true,
    officialDocUrl: 'https://platform.claude.com/docs'
  },
  {
    id: 'google',
    displayName: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    apiFormat: 'gemini_generate_content',
    requiresApiKey: true,
    officialDocUrl: 'https://ai.google.dev/gemini-api/docs'
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    requiresApiKey: true,
    officialDocUrl: 'https://api-docs.deepseek.com'
  },
  {
    id: 'qwen',
    displayName: 'Qwen / 阿里百炼 / DashScope',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    requiresApiKey: true,
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio'
  },
  {
    id: 'bigmodel',
    displayName: '智谱 GLM / BigModel',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    requiresApiKey: true,
    officialDocUrl: 'https://docs.bigmodel.cn'
  },
  {
    id: 'moonshot',
    displayName: 'Kimi / Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    apiFormat: 'openai_compatible_chat_completions',
    requiresApiKey: true,
    officialDocUrl: 'https://platform.kimi.com/docs'
  }
];

// ============================================================
// Static Active Model Seeds
// ============================================================

export const MODEL_REGISTRY: ModelCapability[] = [
  // ============================
  // Mock
  // ============================
  {
    providerId: 'mock',
    providerDisplayName: 'Mock (测试)',
    displayName: 'Mock Basic',
    apiModelId: 'mock-basic',
    officialDocUrl: '',
    apiFormat: 'mock',
    defaultBaseUrl: '',
    authType: 'none',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false,
    status: 'active',
    notes: '基础 Mock 模型，用于测试'
  },
  {
    providerId: 'mock',
    providerDisplayName: 'Mock (测试)',
    displayName: 'Mock Critical Thinker',
    apiModelId: 'mock-critical',
    officialDocUrl: '',
    apiFormat: 'mock',
    defaultBaseUrl: '',
    authType: 'none',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false,
    status: 'active',
    notes: '支持深度思考的 Mock 模型'
  },
  {
    providerId: 'mock',
    providerDisplayName: 'Mock (测试)',
    displayName: 'Mock Creative',
    apiModelId: 'mock-creative',
    officialDocUrl: '',
    apiFormat: 'mock',
    defaultBaseUrl: '',
    authType: 'none',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false,
    status: 'active',
    notes: '创意型 Mock 模型'
  },

  // ============================
  // OpenAI - Active Seeds
  // Docs: https://developers.openai.com/api/docs/models
  // ============================
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-5.5',
    apiModelId: 'gpt-5.5',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'reasoning.effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'OpenAI flagship model for complex reasoning and coding.'
  },
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-5.4',
    apiModelId: 'gpt-5.4',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'reasoning.effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active'
  },
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-5.4 Mini',
    apiModelId: 'gpt-5.4-mini',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'reasoning.effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active'
  },
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-5.4 Nano',
    apiModelId: 'gpt-5.4-nano',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'reasoning.effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Low latency / low cost OpenAI option.'
  },
  // OpenAI legacy models - kept as unverified for backward compatibility with Round 6
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-4o (Legacy)',
    apiModelId: 'gpt-4o',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_chat_completions',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'unverified',
    notes: 'Legacy model from Round 6. May still work with existing API keys.'
  },
  {
    providerId: 'openai',
    providerDisplayName: 'OpenAI',
    displayName: 'GPT-4o Mini (Legacy)',
    apiModelId: 'gpt-4o-mini',
    officialDocUrl: 'https://developers.openai.com/api/docs/models',
    apiFormat: 'openai_chat_completions',
    defaultBaseUrl: 'https://api.openai.com/v1',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'unverified',
    notes: 'Legacy model from Round 6. May still work with existing API keys.'
  },

  // ============================
  // OpenAI Compatible - Custom
  // ============================
  {
    providerId: 'openai_compatible',
    providerDisplayName: 'OpenAI 兼容',
    displayName: '自定义模型',
    apiModelId: 'custom',
    officialDocUrl: '',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: '',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false,
    status: 'active',
    notes: 'OpenAI 兼容 API 的自定义模型，需在 Provider 设置中配置 baseUrl'
  },

  // ============================
  // Anthropic Claude - Active Seeds
  // Docs: https://platform.claude.com/docs/en/about-claude/models/overview
  // ============================
  {
    providerId: 'anthropic',
    providerDisplayName: 'Anthropic Claude',
    displayName: 'Claude Opus 4.7',
    apiModelId: 'claude-opus-4-7',
    officialDocUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type="adaptive"',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Use adaptive thinking. Manual extended thinking is not supported for Opus 4.7.'
  },
  {
    providerId: 'anthropic',
    providerDisplayName: 'Anthropic Claude',
    displayName: 'Claude Sonnet 4.6',
    apiModelId: 'claude-sonnet-4-6',
    officialDocUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type="adaptive" or thinking.type="enabled" + budget_tokens',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Prefer adaptive thinking. Manual extended thinking is legacy/deprecated where applicable.'
  },
  {
    providerId: 'anthropic',
    providerDisplayName: 'Anthropic Claude',
    displayName: 'Claude Haiku 4.5',
    apiModelId: 'claude-haiku-4-5-20251001',
    officialDocUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    apiFormat: 'anthropic_messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    authType: 'x_api_key',
    supportsThinking: true,
    thinkingParam: 'thinking.type="enabled" + budget_tokens',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Display name is Claude Haiku 4.5, but API model ID must be claude-haiku-4-5-20251001.'
  },

  // ============================
  // Google Gemini - Active Seeds
  // Docs: https://ai.google.dev/gemini-api/docs
  // ============================
  {
    providerId: 'google',
    providerDisplayName: 'Google Gemini',
    displayName: 'Gemini 2.5 Pro',
    apiModelId: 'gemini-2.5-pro',
    officialDocUrl: 'https://ai.google.dev/gemini-api/docs/models',
    apiFormat: 'gemini_generate_content',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    supportsThinking: true,
    thinkingParam: 'generationConfig.thinkingConfig.thinkingBudget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Gemini 2.5 series uses thinkingBudget, not thinkingLevel.'
  },
  {
    providerId: 'google',
    providerDisplayName: 'Google Gemini',
    displayName: 'Gemini 2.5 Flash',
    apiModelId: 'gemini-2.5-flash',
    officialDocUrl: 'https://ai.google.dev/gemini-api/docs/thinking',
    apiFormat: 'gemini_generate_content',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    supportsThinking: true,
    thinkingParam: 'generationConfig.thinkingConfig.thinkingBudget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active'
  },
  {
    providerId: 'google',
    providerDisplayName: 'Google Gemini',
    displayName: 'Gemini 2.5 Flash-Lite',
    apiModelId: 'gemini-2.5-flash-lite',
    officialDocUrl: 'https://ai.google.dev/gemini-api/docs/thinking',
    apiFormat: 'gemini_generate_content',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    supportsThinking: true,
    thinkingParam: 'generationConfig.thinkingConfig.thinkingBudget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active'
  },
  {
    providerId: 'google',
    providerDisplayName: 'Google Gemini',
    displayName: 'Gemini 3 Flash Preview',
    apiModelId: 'gemini-3-flash-preview',
    officialDocUrl: 'https://ai.google.dev/gemini-api/docs/thinking',
    apiFormat: 'gemini_generate_content',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'x_goog_api_key',
    supportsThinking: true,
    thinkingParam: 'generationConfig.thinkingConfig.thinkingLevel',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Preview model. Show Preview badge and do not make it default.'
  },

  // ============================
  // DeepSeek - Active Seeds
  // Docs: https://api-docs.deepseek.com
  // OpenAI-compatible format, base URL: https://api.deepseek.com
  // Thinking: thinking.type + reasoning_effort
  // IMPORTANT: In thinking mode, do NOT send temperature/top_p/presence_penalty/frequency_penalty
  // ============================
  {
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    displayName: 'DeepSeek V4 Pro',
    apiModelId: 'deepseek-v4-pro',
    officialDocUrl: 'https://api-docs.deepseek.com',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type + reasoning_effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Thinking mode returns reasoning_content. In thinking mode, temperature/top_p/presence_penalty/frequency_penalty should not be sent.'
  },
  {
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    displayName: 'DeepSeek V4 Flash',
    apiModelId: 'deepseek-v4-flash',
    officialDocUrl: 'https://api-docs.deepseek.com',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type + reasoning_effort',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Thinking mode returns reasoning_content. In thinking mode, temperature/top_p/presence_penalty/frequency_penalty should not be sent.'
  },
  // Legacy models kept as unverified per DeepSeek docs (deprecated 2026/07/24)
  {
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    displayName: 'DeepSeek Chat (Legacy)',
    apiModelId: 'deepseek-chat',
    officialDocUrl: 'https://api-docs.deepseek.com',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'unverified',
    notes: 'Will be deprecated on 2026/07/24. Maps to deepseek-v4-flash non-thinking mode.'
  },
  {
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    displayName: 'DeepSeek Reasoner (Legacy)',
    apiModelId: 'deepseek-reasoner',
    officialDocUrl: 'https://api-docs.deepseek.com',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.deepseek.com',
    authType: 'authorization_bearer',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: false,
    status: 'unverified',
    notes: 'Will be deprecated on 2026/07/24. Maps to deepseek-v4-flash thinking mode.'
  },

  // ============================
  // Qwen / DashScope - Active Seeds
  // Docs: https://help.aliyun.com/zh/model-studio
  // OpenAI-compatible format, base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
  // Auth: Authorization: Bearer <DASHSCOPE_API_KEY>
  // Thinking: enable_thinking + thinking_budget
  // ============================
  {
    providerId: 'qwen',
    providerDisplayName: 'Qwen / 阿里百炼 / DashScope',
    displayName: 'Qwen 3.6 Max Preview',
    apiModelId: 'qwen3.6-max-preview',
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model/',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'enable_thinking + thinking_budget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Qwen 3.6 Max Preview. 256k context. Strongest reasoning capability. Thinking via enable_thinking + thinking_budget.'
  },
  {
    providerId: 'qwen',
    providerDisplayName: 'Qwen / 阿里百炼 / DashScope',
    displayName: 'Qwen 3.6 Plus',
    apiModelId: 'qwen3.6-plus',
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model/',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'enable_thinking + thinking_budget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Qwen 3.6 Plus. 1M context. Thinking via enable_thinking + thinking_budget.'
  },
  {
    providerId: 'qwen',
    providerDisplayName: 'Qwen / 阿里百炼 / DashScope',
    displayName: 'Qwen 3.6 Flash',
    apiModelId: 'qwen3.6-flash',
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model/',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'enable_thinking + thinking_budget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Qwen 3.6 Flash. 1M context. Cost-effective option.'
  },
  {
    providerId: 'qwen',
    providerDisplayName: 'Qwen / 阿里百炼 / DashScope',
    displayName: 'Qwen Plus',
    apiModelId: 'qwen-plus',
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model/',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'enable_thinking + thinking_budget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Qwen Plus. Balanced performance and cost.'
  },
  {
    providerId: 'qwen',
    providerDisplayName: 'Qwen / 阿里百炼 / DashScope',
    displayName: 'QwQ Plus',
    apiModelId: 'qwq-plus',
    officialDocUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model/',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'enable_thinking + thinking_budget',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'QwQ Plus. Dedicated reasoning model. Thinking via enable_thinking + thinking_budget.'
  },

  // ============================
  // BigModel / 智谱 GLM - Active Seeds
  // Docs: https://docs.bigmodel.cn
  // OpenAI-compatible format, base URL: https://open.bigmodel.cn/api/paas/v4
  // Auth: Authorization: Bearer <API_KEY>
  // Thinking: thinking.type = "enabled" | "disabled"
  // ============================
  {
    providerId: 'bigmodel',
    providerDisplayName: '智谱 GLM / BigModel',
    displayName: 'GLM-5.1',
    apiModelId: 'glm-5.1',
    officialDocUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.1',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'GLM-5.1 flagship. Thinking via thinking.type="enabled"|"disabled".'
  },
  {
    providerId: 'bigmodel',
    providerDisplayName: '智谱 GLM / BigModel',
    displayName: 'GLM-5',
    apiModelId: 'glm-5',
    officialDocUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'GLM-5. Thinking via thinking.type="enabled"|"disabled".'
  },
  {
    providerId: 'bigmodel',
    providerDisplayName: '智谱 GLM / BigModel',
    displayName: 'GLM-5 Turbo',
    apiModelId: 'glm-5-turbo',
    officialDocUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5-turbo',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'GLM-5 Turbo. Fast and cost-effective. Thinking via thinking.type="enabled"|"disabled".'
  },
  {
    providerId: 'bigmodel',
    providerDisplayName: '智谱 GLM / BigModel',
    displayName: 'GLM-4.7',
    apiModelId: 'glm-4.7',
    officialDocUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'GLM-4.7. Enhanced reasoning and agent capabilities.'
  },
  {
    providerId: 'bigmodel',
    providerDisplayName: '智谱 GLM / BigModel',
    displayName: 'GLM-4.6',
    apiModelId: 'glm-4.6',
    officialDocUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-4.6',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'GLM-4.6. Previous generation model.'
  },

  // ============================
  // Moonshot / Kimi - Active Seeds
  // Docs: https://platform.kimi.com/docs
  // OpenAI-compatible format, base URL: https://api.moonshot.cn/v1
  // Auth: Authorization: Bearer <MOONSHOT_API_KEY>
  // Thinking: thinking.type = "enabled" | "disabled"
  // Special: kimi-k2-thinking cannot disable thinking
  // ============================
  {
    providerId: 'moonshot',
    providerDisplayName: 'Kimi / Moonshot',
    displayName: 'Kimi K2.6',
    apiModelId: 'kimi-k2.6',
    officialDocUrl: 'https://platform.kimi.com/docs/models.md',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type="enabled"|"disabled"',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Kimi K2.6. 256k context. Supports thinking mode via thinking.type parameter.'
  },
  {
    providerId: 'moonshot',
    providerDisplayName: 'Kimi / Moonshot',
    displayName: 'Kimi K2.5',
    apiModelId: 'kimi-k2.5',
    officialDocUrl: 'https://platform.kimi.com/docs/models.md',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking.type="enabled"|"disabled"',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Kimi K2.5. 256k context.'
  },
  {
    providerId: 'moonshot',
    providerDisplayName: 'Kimi / Moonshot',
    displayName: 'Kimi K2 Thinking',
    apiModelId: 'kimi-k2-thinking',
    officialDocUrl: 'https://platform.kimi.com/docs/models.md',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    supportsThinking: true,
    thinkingParam: 'thinking always on (cannot disable)',
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Kimi K2 Thinking. Thinking is always on - cannot be disabled. Returns reasoning_content.'
  },
  {
    providerId: 'moonshot',
    providerDisplayName: 'Kimi / Moonshot',
    displayName: 'Moonshot V1 128K',
    apiModelId: 'moonshot-v1-128k',
    officialDocUrl: 'https://platform.kimi.com/docs/models.md',
    apiFormat: 'openai_compatible_chat_completions',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    authType: 'authorization_bearer',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsToolCalling: true,
    status: 'active',
    notes: 'Moonshot V1 128K. Long context model. No thinking mode.'
  }
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get all models for a given provider
 */
export function getModelsForProvider(providerId: ProviderId | string): ModelCapability[] {
  return MODEL_REGISTRY.filter((m) => m.providerId === providerId);
}

/**
 * Get active models for a given provider
 */
export function getActiveModelsForProvider(providerId: ProviderId | string): ModelCapability[] {
  return MODEL_REGISTRY.filter((m) => m.providerId === providerId && m.status === 'active');
}

/**
 * Find a specific model by provider + apiModelId
 */
export function findModelCapability(
  providerId: ProviderId | string,
  apiModelId: string
): ModelCapability | undefined {
  return MODEL_REGISTRY.find(
    (m) => m.providerId === providerId && m.apiModelId === apiModelId
  );
}

/**
 * Get a provider registry entry by ID
 */
export function getProviderEntry(providerId: ProviderId | string): ProviderRegistryEntry | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === providerId);
}

/**
 * Get all provider IDs
 */
export function getAllProviderIds(): ProviderId[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}

/**
 * Check if a model is allowed to be used for real meetings
 */
export function isModelUsableForMeeting(
  providerId: ProviderId | string,
  apiModelId: string,
  allowUnverified: boolean = false
): { allowed: boolean; reason?: string } {
  if (providerId === 'mock') {
    return { allowed: true };
  }

  const model = findModelCapability(providerId, apiModelId);

  // Unknown model - treat as unverified custom input
  if (!model) {
    if (allowUnverified) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Model "${apiModelId}" for provider "${providerId}" is not in the registry. Enable "Allow Unverified Models" to use custom model IDs.`
    };
  }

  if (model.status === 'stub') {
    return {
      allowed: false,
      reason: `Model "${model.displayName}" is a stub — adapter not implemented or key API docs missing.`
    };
  }

  if (model.status === 'unverified' && !allowUnverified) {
    return {
      allowed: false,
      reason: `Model "${model.displayName}" is unverified. Enable "Allow Unverified Models" and test connection first.`
    };
  }

  return { allowed: true };
}

/**
 * Get display badge for model status
 */
export function getStatusBadge(status: ModelStatus): { label: string; color: string } {
  switch (status) {
    case 'active':
      return { label: '✓', color: 'green' };
    case 'unverified':
      return { label: '?', color: 'orange' };
    case 'stub':
      return { label: '✗', color: 'red' };
  }
}
