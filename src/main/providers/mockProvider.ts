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
  DebateGenerateOutput,
  VoteGenerateInput,
  VoteGenerateOutput
} from './base'
import {
  mockModeratorOpening,
  mockExpertInitialAnswer,
  mockExpertDebateTurn,
  mockModeratorRoundSummary,
  mockModeratorFinalSummary,
  mockExpertVote
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
function wrapOutput(
  content: string,
  structuredJson?: Record<string, unknown>
): DebateGenerateOutput {
  return {
    content,
    structuredJson,
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
    return wrapOutput(content, buildMockInitialStructure(input, content))
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    await simulateDelay()
    const content = mockExpertDebateTurn(input)
    return wrapOutput(content, buildMockDebateStructure(input, content))
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

  async generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput> {
    await simulateDelay()
    const rawJson = mockExpertVote(input)
    return {
      rawJson,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    }
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

function buildMockInitialStructure(
  input: DebateGenerateInput,
  content: string
): Record<string, unknown> {
  const domain = input.agent.domain || '通用领域'
  const stance = input.agent.stance || '独立判断'

  return {
    message: content,
    claims: [
      { claim_text: `${input.agent.name}认为该议题需要先从${domain}角度识别核心矛盾。` },
      { claim_text: `${input.agent.name}主张采用分阶段推进方案，而不是一次性解决所有问题。` },
      { claim_text: `${input.agent.name}的基本立场是${stance}，并要求方案保留约束条件。` }
    ],
    attacks: []
  }
}

function buildMockDebateStructure(
  input: DebateGenerateInput,
  content: string
): Record<string, unknown> {
  const target = input.otherExperts[0] ?? null
  const domain = input.agent.domain || '通用领域'

  return {
    message: content,
    claims: [
      { claim_text: `${input.agent.name}在第${input.roundIndex}轮补充：方案需要加入风险评估环节。` },
      { claim_text: `${input.agent.name}认为从${domain}角度看，执行路径必须有可验证节点。` }
    ],
    attacks: target
      ? [
          {
            target_expert_id: target.id,
            target_claim_text: `${target.name}上一轮方案对关键变量的处理不充分。`,
            attack_text: `${input.agent.name}质疑${target.name}的论证存在证据不足和可执行性问题。`,
            attack_dimensions: ['evidence', 'feasibility']
          }
        ]
      : []
  }
}
