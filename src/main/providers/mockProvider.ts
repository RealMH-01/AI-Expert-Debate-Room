/**
 * MockProvider - 模拟 Provider 实现
 *
 * 本轮唯一实现的 Provider。
 * 不调用任何真实 API，使用模板化内容生成辩论文本。
 * 根据 agent 的 persona、domain、phase 生成不同文本。
 *
 * 后续替换为真实 Provider 时只需实现 DebateModelProvider 接口。
 */

import type {
  DebateModelProvider,
  DebateGenerateInput,
  DebateGenerateOutput
} from './base'
import {
  mockModeratorOpening,
  mockExpertInitialAnswer,
  mockExpertDebateTurn,
  mockModeratorRoundSummary,
  mockModeratorFinalSummary
} from '../debate/prompts/mockTemplates'

/** 模拟网络延迟（毫秒） */
const MOCK_DELAY_MS = 200

/**
 * 模拟延迟，让 UI 有时间展示阶段性追加效果
 */
function simulateDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
}

/**
 * 包装输出结果
 */
function wrapOutput(content: string): DebateGenerateOutput {
  return {
    content,
    structuredJson: undefined,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }
  }
}

export class MockProvider implements DebateModelProvider {
  readonly name = 'mock'

  async generateModeratorOpening(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockModeratorOpening(input)
    return wrapOutput(content)
  }

  async generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockExpertInitialAnswer(input)
    return wrapOutput(content)
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockExpertDebateTurn(input)
    return wrapOutput(content)
  }

  async generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockModeratorRoundSummary(input)
    return wrapOutput(content)
  }

  async generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockModeratorFinalSummary(input)
    return wrapOutput(content)
  }
}

/** 单例 MockProvider */
let mockProviderInstance: MockProvider | null = null

export function getMockProvider(): MockProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockProvider()
  }
  return mockProviderInstance
}
