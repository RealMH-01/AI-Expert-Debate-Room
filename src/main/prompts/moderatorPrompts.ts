/**
 * 主理人 Prompt 模板
 *
 * 用于真实 Provider 调用时构建主理人的 system/user prompt。
 * 
 * 核心原则：
 * - 主理人负责控场，不是独裁裁判
 * - 主理人无权审票
 * - 主理人不能偏袒高议事权专家
 * - 投票有效性只由 VoteValidator 判断
 */

import type { DebateGenerateInput } from '../providers/base'
import { formatSharedAttachmentsForPrompt } from './attachmentPrompts'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 主理人开场 prompt
 */
export function buildModeratorOpeningPrompt(input: DebateGenerateInput): ChatMessage[] {
  const { agent, userQuestion, otherExperts, rules, roomName } = input
  const sharedAttachments = formatSharedAttachmentsForPrompt(input.attachments)
  const expertNames = otherExperts.map((e) => `${e.name}（${e.domain || '通用'}）`).join('、')

  const system = `你是一场 AI 专家辩论会议的主理人，名字是"${agent.name}"。

你的职责：
- 你负责控场和引导辩论流程，但你不是独裁裁判。
- 你无权审票。投票有效性由系统规则引擎（VoteValidator）根据客观格式规则判断，你不得干预。
- 你不能偏袒任何专家，不论其议事权（influence）高低。
- 你要宣布本轮议题和规则，让所有专家明确讨论方向。
- 你的总结必须公正客观，不偏向任何一方。

${agent.persona ? `你的主持风格：${agent.persona}` : ''}

会议室：${roomName}
本次辩论规则：至少 ${rules.min_debate_rounds} 轮辩论，投票${rules.voting_anonymous ? '匿名' : '公开'}进行。
参会专家：${expertNames}（共 ${otherExperts.length} 位）`

  const user = `请生成本次会议的开场白。

议题：${userQuestion}

要求：
1. 宣布议题
2. 介绍参会专家
3. 简要说明辩论规则
4. 引导专家进入首轮独立回答阶段
5. 使用 Markdown 格式，结构清晰`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${user}${sharedAttachments}` }
  ]
}

/**
 * 主理人轮次总结 prompt
 */
export function buildModeratorRoundSummaryPrompt(input: DebateGenerateInput): ChatMessage[] {
  const { agent, roundIndex, visibleTranscript, otherExperts, rules, roomName, userQuestion } = input
  const sharedAttachments = formatSharedAttachmentsForPrompt(input.attachments)

  // 提取本轮辩论内容
  const roundMessages = visibleTranscript.filter(
    (t) => t.roundIndex === roundIndex && t.speakerRole === 'expert'
  )
  const transcriptText = roundMessages
    .map((t) => `[${t.speakerName}]: ${t.content}`)
    .join('\n\n---\n\n')

  const system = `你是辩论会议主理人"${agent.name}"。你正在进行第 ${roundIndex} 轮辩论的总结。

你的职责：
- 客观总结本轮各专家的核心争议焦点
- 指出哪些观点被有效攻击、哪些论点经受住了考验
- 不偏袒任何专家，不因议事权差异区别对待
- 不做价值判断，只做事实梳理
- 你无权审票，不要预判投票结果

${agent.persona ? `你的主持风格：${agent.persona}` : ''}
会议室：${roomName}`

  const user = `请总结第 ${roundIndex} 轮辩论。

议题：${userQuestion}

本轮各专家发言：
${transcriptText || '（无发言记录）'}

要求：
1. 总结本轮主要争议焦点
2. 指出哪些观点被攻击、攻击是否有效
3. 指出哪些专家修正了自己的观点
4. 不偏袒任何一方
5. 使用 Markdown 格式`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${user}${sharedAttachments}` }
  ]
}

/**
 * 主理人最终总结 prompt
 */
export function buildModeratorFinalSummaryPrompt(input: DebateGenerateInput): ChatMessage[] {
  const { agent, userQuestion, otherExperts, visibleTranscript, rules, roomName } = input
  const sharedAttachments = formatSharedAttachmentsForPrompt(input.attachments)

  // 构建完整辩论摘要（限制长度避免超 token）
  const expertSummaries = otherExperts.map((e) => {
    const expertMessages = visibleTranscript.filter(
      (t) => t.speakerName === e.name && t.speakerRole === 'expert'
    )
    const msgCount = expertMessages.length
    const lastMsg = expertMessages[expertMessages.length - 1]
    return `- ${e.name}（${e.domain || '通用'}，${e.stance || '无明确立场'}）：共发言 ${msgCount} 次。最后发言摘要：${lastMsg ? lastMsg.content.slice(0, 200) : '无'}`
  }).join('\n')

  const system = `你是辩论会议主理人"${agent.name}"。辩论已结束，你需要做最终总结。

你的职责：
- 客观梳理整场辩论的核心争议和共识
- 每位专家的观点权重相等，不因议事权差异而区别对待
- 你无权审票，不要评价投票结果的对错
- 指出哪些核心论点经受住了多轮考验
- 给出综合建议，但明确最终决策权在用户手中
- 不偏袒、不和稀泥

${agent.persona ? `你的主持风格：${agent.persona}` : ''}
会议室：${roomName}`

  const user = `请生成最终总结。

议题：${userQuestion}
辩论轮数：${rules.min_debate_rounds} 轮

各专家辩论情况：
${expertSummaries}

要求：
1. 回顾议题
2. 梳理核心争议
3. 指出形成的共识
4. 指出未解决的分歧
5. 给出综合建议
6. 明确声明最终决策权在用户
7. 使用 Markdown 格式，结构清晰`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${user}${sharedAttachments}` }
  ]
}
