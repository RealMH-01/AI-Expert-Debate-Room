/**
 * 模型能力表（静态目录）
 *
 * 本模块定义所有可选模型池。
 * 这些模型只是可选项，不是默认分配。
 * 系统不能强制指定默认模型（铁律 R-2）。
 *
 * 注意：
 * - 本轮只做静态模型目录，不实现 Provider Adapter
 * - 不实现 API Key 配置
 * - 不实现真实模型请求
 * - 不测试真实模型连通性
 */

import type { ProviderInfo, ModelInfo, ProviderId } from './types'

/** 全部模型目录 */
export const MODEL_CATALOG: ModelInfo[] = [
  // === mock ===
  {
    provider: 'mock',
    model: 'mock-basic',
    displayName: 'Mock Basic',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: '基础 Mock 模型，用于测试'
  },
  {
    provider: 'mock',
    model: 'mock-critical',
    displayName: 'Mock Critical Thinker',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: '支持深度思考的 Mock 模型'
  },
  {
    provider: 'mock',
    model: 'mock-creative',
    displayName: 'Mock Creative',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: '创意型 Mock 模型'
  },

  // === openai ===
  {
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: 'OpenAI GPT-4o，多模态旗舰模型'
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: 'OpenAI GPT-4o Mini，性价比高'
  },
  {
    provider: 'openai',
    model: 'o1',
    displayName: 'o1',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: 'OpenAI o1，深度推理模型'
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    displayName: 'o3-mini',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: 'OpenAI o3-mini，高效推理模型'
  },

  // === openai_compatible (自定义兼容端点) ===
  {
    provider: 'openai_compatible',
    model: 'custom',
    displayName: '自定义模型',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: 'OpenAI 兼容 API 的自定义模型，需在 Provider 设置中配置 baseUrl'
  },

  // === anthropic ===
  {
    provider: 'anthropic',
    model: 'claude-opus-4.6',
    displayName: 'Claude Opus 4.6',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: 'Anthropic Claude Opus 4.6，支持 extended thinking'
  },

  // === gemini ===
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: 'Google Gemini 3.1 Pro'
  },

  // === deepseek ===
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: 'DeepSeek Chat，通用对话模型'
  },
  {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    displayName: 'DeepSeek Reasoner',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: 'DeepSeek Reasoner，深度推理模型'
  },

  // === qwen ===
  {
    provider: 'qwen',
    model: 'qwen-default',
    displayName: 'Qwen',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: '通义千问'
  },

  // === zhipu (智谱) ===
  {
    provider: 'zhipu',
    model: 'glm-default',
    displayName: 'GLM',
    supportsThinking: false,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    notes: '智谱 GLM'
  },

  // === kimi ===
  {
    provider: 'kimi',
    model: 'kimi-default',
    displayName: 'Kimi',
    supportsThinking: true,
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    notes: 'Moonshot Kimi'
  }
]

/** Provider 列表 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'mock',
    displayName: 'Mock (测试)',
    models: MODEL_CATALOG.filter((m) => m.provider === 'mock')
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    models: MODEL_CATALOG.filter((m) => m.provider === 'openai')
  },
  {
    id: 'openai_compatible',
    displayName: 'OpenAI 兼容',
    models: MODEL_CATALOG.filter((m) => m.provider === 'openai_compatible')
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    models: MODEL_CATALOG.filter((m) => m.provider === 'anthropic')
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    models: MODEL_CATALOG.filter((m) => m.provider === 'gemini')
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    models: MODEL_CATALOG.filter((m) => m.provider === 'deepseek')
  },
  {
    id: 'qwen',
    displayName: '通义千问 (Qwen)',
    models: MODEL_CATALOG.filter((m) => m.provider === 'qwen')
  },
  {
    id: 'zhipu',
    displayName: '智谱 (GLM)',
    models: MODEL_CATALOG.filter((m) => m.provider === 'zhipu')
  },
  {
    id: 'kimi',
    displayName: 'Kimi (Moonshot)',
    models: MODEL_CATALOG.filter((m) => m.provider === 'kimi')
  }
]

/**
 * 根据 provider + model 查找模型信息
 */
export function findModel(provider: ProviderId | string, model: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.provider === provider && m.model === model)
}

/**
 * 获取指定 Provider 的所有模型
 */
export function getModelsForProvider(providerId: ProviderId | string): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => m.provider === providerId)
}

/**
 * 获取所有 Provider ID 列表
 */
export function getAllProviderIds(): ProviderId[] {
  return PROVIDERS.map((p) => p.id)
}
