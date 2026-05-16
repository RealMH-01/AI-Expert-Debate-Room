/**
 * 投票 Prompt 模板
 *
 * 用于真实 Provider 调用时构建专家投票的 prompt。
 *
 * 核心原则：
 * - 必须返回 JSON
 * - 不能投自己
 * - 必须包含结构化理由
 * - 如果 JSON 解析失败，VoteValidator 按无效票处理
 * - 主理人无权审票
 */

import type { VoteGenerateInput } from '../providers/base'
import type { ChatMessage } from './moderatorPrompts'

/**
 * 专家投票 prompt
 */
export function buildExpertVotePrompt(input: VoteGenerateInput): ChatMessage[] {
  const { voter, aliveExperts, visibleTranscript, userQuestion } = input
  const targets = aliveExperts.filter((e) => e.id !== voter.id)

  // 构建其他专家的辩论表现摘要
  const expertSummaries = targets.map((target) => {
    const messages = visibleTranscript.filter(
      (t) => t.speakerName === target.name && t.speakerRole === 'expert'
    )
    const msgCount = messages.length
    const lastMsg = messages[messages.length - 1]
    return `- ${target.name}（ID: ${target.id}）：共发言 ${msgCount} 次。最近发言：${lastMsg ? lastMsg.content.slice(0, 200) : '无'}`
  }).join('\n')

  const targetList = targets.map((t) => `  - ID: "${t.id}", 名字: "${t.name}"`).join('\n')

  const system = `你是辩论专家"${voter.name}"，现在需要对其他专家的辩论表现进行匿名评分。

评分原则：
1. 你不能给自己投票。
2. 每位目标专家评分 0-10 分（0 = 完全无贡献，10 = 极其出色）。
3. 评分必须基于辩论中的实际表现：攻击力度、反驳质量、观点修正、论点存活率。
4. 你必须给出结构化的评分理由。
5. 你的投票是匿名的，你看不到其他人的投票。
6. 不要给每个人打相同分数，必须有区分度。

你的人设：${voter.persona || '理性分析者'}
你的领域：${voter.domain || '通用'}
你的立场：${voter.stance || '独立判断'}`

  const user = `请对以下专家进行评分。

议题：${userQuestion}

需要评分的专家：
${targetList}

各专家辩论表现摘要：
${expertSummaries}

请严格返回以下 JSON 格式（不要包含任何其他文字，只返回 JSON）：

\`\`\`json
{
  "voter": "${voter.id}",
  "votes": [
    {
      "target": "目标专家ID",
      "score": 0-10的整数,
      "reason": {
        "attacked_what": "该专家攻击了什么观点",
        "rebutted_what": "该专家成功反驳了什么",
        "revised_what": "该专家修正了什么",
        "survived_claim": "该专家哪个核心论点经受住了考验",
        "main_weakness": "该专家最大的弱点是什么"
      }
    }
  ]
}
\`\`\`

重要：
- 必须对所有 ${targets.length} 位专家都评分
- target 必须使用专家的 ID（不是名字）
- score 必须是 0-10 的整数
- reason 的每个字段都必须填写
- 只返回 JSON，不要有其他文字`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}
