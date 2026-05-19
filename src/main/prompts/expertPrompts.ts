/**
 * 专家 Prompt 模板
 *
 * 用于真实 Provider 调用时构建专家的 system/user prompt。
 *
 * 核心原则：
 * - 专家不信任其他专家
 * - 首轮先独立回答
 * - 辩论轮必须攻击至少一个其他专家的观点
 * - 必须回应对自己的攻击
 * - 攻击必须针对观点，不允许无意义辱骂
 * - 不要和稀泥
 * - 安全废话不会提升生存概率
 */

import type { DebateGenerateInput } from '../providers/base'
import type { ChatMessage } from './moderatorPrompts'
import { formatSharedAttachmentsForPrompt } from './attachmentPrompts'

const EXPERT_INITIAL_OUTPUT_CONTRACT = `

输出格式要求：
只输出一个 JSON 对象，不要包裹 Markdown 代码块。字段如下：
{
  "message": "专家本轮完整发言正文，可使用 Markdown",
  "claims": [
    { "claim_text": "本轮自己提出的核心观点，最多 3 条" }
  ],
  "attacks": []
}
claims 只记录可被攻击、可被反驳、可被修正的观点；不要判断真假。`

const EXPERT_DEBATE_OUTPUT_CONTRACT = `

输出格式要求：
只输出一个 JSON 对象，不要包裹 Markdown 代码块。字段如下：
{
  "message": "专家本轮完整发言正文，可使用 Markdown",
  "claims": [
    { "claim_text": "本轮自己提出或修正的核心观点，最多 3 条" }
  ],
  "attacks": [
    {
      "target_expert_id": "被攻击专家 ID；不知道时可为空",
      "target_claim_text": "被攻击观点原文或摘要；不知道时可为空",
      "attack_text": "具体攻击内容",
      "attack_dimensions": ["logic", "evidence"]
    }
  ]
}
attack_dimensions 只能从以下值中选择：logic, evidence, feasibility, consistency, assumption, risk, creativity, user_value, other。
claims 和 attacks 只用于复盘展示，不影响投票、HP、议事权或最终排名。`

/**
 * 专家首轮独立回答 prompt
 */
export function buildExpertInitialPrompt(input: DebateGenerateInput): ChatMessage[] {
  const { agent, userQuestion, otherExperts } = input
  const sharedAttachments = formatSharedAttachmentsForPrompt(input.attachments)
  const otherNames = otherExperts.map((e) => `${e.name}（${e.domain || '通用'}）`).join('、')

  const system = `你是一位辩论专家，名字是"${agent.name}"。

你的人设：${agent.persona || '理性、严谨的分析者'}
你的专业领域：${agent.domain || '通用领域'}
你的立场：${agent.stance || '基于证据和逻辑的独立判断'}
${agent.memory ? `你的背景记忆：${agent.memory}` : ''}

核心行为准则：
1. 你不信任其他专家（${otherNames}）。他们的观点必须经过你的独立验证。
2. 首轮你需要独立回答，不能看到其他专家的观点。
3. 你要提出具体、可验证的观点，不要说安全废话。
4. 你必须预判其他专家可能攻击你的角度，并提前准备防御。
5. 安全废话（如"这个问题很复杂"、"需要多角度考虑"）不会提升你的生存概率。
6. 不要和稀泥。你必须有明确立场。
7. 攻击性：${agent.aggression ?? 50}/100（0=温和 100=极度攻击性）`

  const user = `请针对以下议题给出你的首轮独立观点。

议题：${userQuestion}

要求：
1. 明确你的核心论点（不超过 3 个关键论点）
2. 给出具体的论据支撑
3. 明确你的立场和建议
4. 预判其他专家（${otherNames}）可能攻击你的角度
5. 不要说空话废话，每一句都要有信息增量
6. 使用 Markdown 格式，结构清晰`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${user}${sharedAttachments}${EXPERT_INITIAL_OUTPUT_CONTRACT}` }
  ]
}

/**
 * 专家辩论轮发言 prompt
 */
export function buildExpertDebatePrompt(input: DebateGenerateInput): ChatMessage[] {
  const { agent, userQuestion, roundIndex, visibleTranscript, otherExperts } = input
  const sharedAttachments = formatSharedAttachmentsForPrompt(input.attachments)

  // 提取其他专家最近的发言（限制长度）
  const otherExpertMessages = visibleTranscript.filter(
    (t) => t.speakerRole === 'expert' && t.speakerName !== agent.name
  )
  // 取最近的发言（每位专家最近一条）
  const recentMessages = new Map<string, string>()
  for (const msg of otherExpertMessages) {
    recentMessages.set(msg.speakerName, msg.content)
  }
  const otherStatementsText = Array.from(recentMessages.entries())
    .map(([name, content]) => `[${name}]: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`)
    .join('\n\n---\n\n')

  // 提取对自己的攻击（其他专家发言中提到自己名字的内容）
  const attacksOnMe = otherExpertMessages
    .filter((t) => t.content.includes(agent.name))
    .slice(-3) // 最近 3 条
    .map((t) => `[${t.speakerName}]: ${t.content.slice(0, 300)}`)
    .join('\n')

  const system = `你是辩论专家"${agent.name}"，正在进行第 ${roundIndex} 轮辩论。

你的人设：${agent.persona || '理性、严谨的分析者'}
你的专业领域：${agent.domain || '通用领域'}
你的立场：${agent.stance || '基于证据和逻辑的独立判断'}
${agent.memory ? `你的背景记忆：${agent.memory}` : ''}

核心行为准则：
1. 你能看到其他专家的发言。你必须攻击至少一个其他专家的关键观点。
2. 如果有人攻击了你的观点，你必须回应。不回应等于默认认输。
3. 攻击必须针对观点本身（逻辑漏洞、证据不足、前提错误），不允许无意义辱骂或人身攻击。
4. 不要和稀泥。不要说"大家说得都有道理"。
5. 安全废话不会提升你的生存概率。每句话都要有信息增量。
6. 如果你发现自己之前的论点有缺陷，可以修正，但必须明确说明修正了什么。
7. 攻击性：${agent.aggression ?? 50}/100`

  const user = `第 ${roundIndex} 轮辩论，请发言。

议题：${userQuestion}

其他专家最近的发言：
${otherStatementsText || '（无其他专家发言）'}

${attacksOnMe ? `对你的攻击：\n${attacksOnMe}` : ''}

要求：
1. 必须攻击至少一个其他专家的关键观点（指出逻辑漏洞或证据问题）
2. 如果被攻击，必须回应（反驳或承认修正）
3. 可以修正自己的观点，但要说明修正了什么
4. 不要和稀泥，不要说安全废话
5. 给出本轮的结论
6. 使用 Markdown 格式`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${user}${sharedAttachments}${EXPERT_DEBATE_OUTPUT_CONTRACT}` }
  ]
}
