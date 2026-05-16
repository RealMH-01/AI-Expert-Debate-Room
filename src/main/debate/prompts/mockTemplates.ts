/**
 * Mock 模板 - 辩论内容生成模板
 *
 * 用于 MockProvider 生成结构化的辩论内容。
 * 根据 agent 的 persona、domain、stance 和当前阶段生成不同文本。
 * 不追求智能，但追求结构清晰、像真实辩论。
 */

import type { DebateGenerateInput } from '../../providers/base'
import type { VoteGenerateInput } from '../../providers/base'

/**
 * 生成主理人开场白
 */
export function mockModeratorOpening(input: DebateGenerateInput): string {
  const { agent, userQuestion, otherExperts, rules, roomName } = input
  const expertNames = otherExperts.map((e) => e.name).join('、')

  return `# 会议开场

各位专家好，我是本次会议的主理人${agent.name}。

## 议题
${userQuestion}

## 会议室
${roomName}

## 参会专家
本次辩论有 ${otherExperts.length} 位专家参与：${expertNames}。

## 规则说明
- 本次辩论至少进行 ${rules.min_debate_rounds} 轮。
- 每位专家将先独立给出初始观点，然后进入多轮交叉辩论。
- 辩论结束后我将给出最终总结。

${agent.persona ? `我的主持风格：${agent.persona}` : ''}

请各位专家准备发言。我们先进入首轮独立回答阶段。`
}

/**
 * 生成专家首轮独立回答
 */
export function mockExpertInitialAnswer(input: DebateGenerateInput): string {
  const { agent, userQuestion, otherExperts } = input
  const domain = agent.domain || '通用领域'
  const persona = agent.persona || '理性分析型'
  const stance = agent.stance || '中立'
  const otherNames = otherExperts.map((e) => e.name).join('、')

  return `# ${agent.name} 的初始观点

## 我的核心观点
作为${domain}领域的专家，基于我的专业背景（${persona}），关于"${userQuestion}"这个问题，我认为：

核心论点：从${domain}视角出发，问题的关键在于找到平衡点。我的基本立场是"${stance}"。

## 我认为此问题的关键
1. 需要从${domain}角度系统分析问题的根本矛盾
2. 现有的主流方案都存在一定程度的片面性
3. 正确的解决方向应该综合多方面因素

## 我的具体建议
基于以上分析，我建议采取分阶段、渐进式的方案：
- 短期：先解决最紧迫的核心矛盾
- 中期：建立系统性的应对框架
- 长期：推动根本性的结构优化

## 预判其他专家可能的攻击点
考虑到其他专家（${otherNames}）的不同视角，我预判他们可能会质疑：
- 我的方案是否过于理想化
- 实施路径是否具有可操作性
- 是否忽略了某些关键约束条件

我对此已有准备，将在后续辩论中详细回应。`
}

/**
 * 生成专家辩论轮发言
 */
export function mockExpertDebateTurn(input: DebateGenerateInput): string {
  const { agent, roundIndex, visibleTranscript, otherExperts } = input
  const domain = agent.domain || '通用领域'
  const aggression = agent.aggression ?? 50

  // 找到其他专家最近的发言
  const otherExpertMessages = visibleTranscript.filter(
    (t) => t.speakerRole === 'expert' && t.speakerName !== agent.name
  )
  const latestOtherMessages = otherExpertMessages.slice(-otherExperts.length)

  // 随机选一个攻击对象
  const targetExpert =
    latestOtherMessages.length > 0
      ? latestOtherMessages[Math.floor(Math.random() * latestOtherMessages.length)]
      : null

  const aggressionText =
    aggression > 70 ? '我必须强烈指出' : aggression > 40 ? '我认为需要指出' : '我想温和地提出'

  return `# ${agent.name} - 第 ${roundIndex} 轮辩论

## 攻击观点
${
  targetExpert
    ? `${aggressionText}，${targetExpert.speakerName}的论述存在明显漏洞。从${domain}的专业视角来看：

- ${targetExpert.speakerName}忽视了关键变量的影响
- 其论证逻辑在"前提 → 结论"的推导中存在跳跃
- 所引用的依据在当前语境下的适用性值得商榷`
    : `第 ${roundIndex} 轮辩论中，我需要进一步巩固和深化我的核心论点。从${domain}视角出发，我发现前几轮讨论暴露出一些共性问题需要指出。`
}

## 回应质疑
针对可能的质疑，我的回应如下：
- 关于"方案可行性"的质疑：我补充具体的实施路径和约束条件
- 关于"证据不足"的质疑：我引入${domain}领域的经典案例和数据支撑
- 关于"视角片面"的质疑：我承认存在边界条件，但核心论点依然成立

## 修正与完善
经过前 ${roundIndex - 1} 轮讨论，我对自己的方案进行以下修正：
1. 原方案第二步需要增加风险评估环节
2. 时间线估计可以适当放宽 20%
3. 补充了对边缘情况的处理策略

## 本轮结论
综合以上分析，我的立场保持不变，但方案更加完善和务实。`
}

/**
 * 生成主理人轮次总结
 */
export function mockModeratorRoundSummary(input: DebateGenerateInput): string {
  const { agent, roundIndex, otherExperts, visibleTranscript } = input

  // 统计本轮各专家的发言
  const roundMessages = visibleTranscript.filter(
    (t) => t.roundIndex === roundIndex && t.speakerRole === 'expert'
  )
  const speakers = roundMessages.map((m) => m.speakerName).join('、')

  return `# 第 ${roundIndex} 轮总结 - ${agent.name}

## 本轮争议焦点
第 ${roundIndex} 轮辩论中，${speakers || otherExperts.map((e) => e.name).join('、')}围绕核心议题展开了激烈交锋。

主要争议点：
1. 方案的可行性与实施路径存在分歧
2. 对关键假设的有效性产生了正面碰撞
3. 不同领域视角之间的矛盾进一步显现

## 观点被攻击情况
- 多位专家的核心论点受到了不同角度的挑战
- 部分质疑具有实质性价值，推动了论证的深化
- 也有部分攻击未能击中要害

## 观点修正情况
- 有专家主动修正了自己方案的时间线
- 有专家补充了风险评估环节
- 总体而言，各方观点在碰撞中趋于完善

辩论将继续进入下一轮。`
}

/**
 * 生成主理人最终总结
 */
export function mockModeratorFinalSummary(input: DebateGenerateInput): string {
  const { agent, userQuestion, otherExperts, rules, visibleTranscript } = input
  const totalRounds = rules.min_debate_rounds
  const expertNames = otherExperts.map((e) => e.name).join('、')

  // 统计各专家发言次数
  const expertMessageCounts = otherExperts.map((e) => {
    const count = visibleTranscript.filter(
      (t) => t.speakerName === e.name && t.speakerRole === 'expert'
    ).length
    return `${e.name}(${count}次发言)`
  })

  return `# 最终总结 - ${agent.name}

## 议题回顾
用户提出的问题是："${userQuestion}"

## 辩论过程概述
本次辩论共进行了 ${totalRounds} 轮，参与专家：${expertNames}。
各专家发言统计：${expertMessageCounts.join('、')}。

## 核心争议梳理
经过多轮辩论，以下是被反复讨论的核心争议：

1. **方案优先级之争**：各专家在"先解决什么"上存在根本性分歧
2. **方法论之争**：定量分析 vs 定性判断的方法选择
3. **时间维度之争**：短期见效 vs 长期可持续的路线选择

## 形成的共识
尽管存在分歧，以下观点获得了多数认同：
- 问题确实需要多角度协同处理
- 纯粹的单一视角方案都存在不足
- 实施过程中需要动态调整

## 最终建议
综合各位专家的辩论内容，我作为主理人给出以下建议：

1. 采纳各专家方案中可行性最高的元素进行组合
2. 建立分阶段实施框架，允许中途修正
3. 保留不同专家的差异化视角作为风险对冲

## 注意事项
- 本总结仅是对辩论过程的客观梳理
- 每位专家的观点权重相等，不因议事权差异而区别对待
- 最终决策权在用户手中

---
会议结束。感谢各位专家的参与。`
}

/**
 * 生成专家投票 JSON
 *
 * 每个专家对其他所有存活专家评分 0-10。
 * 投票是匿名同时进行的，所以不传入其他专家的投票结果。
 * 生成结构化 JSON 字符串，交给 VoteValidator 校验。
 */
export function mockExpertVote(input: VoteGenerateInput): string {
  const { voter, aliveExperts } = input
  const targets = aliveExperts.filter((e) => e.id !== voter.id)

  const votes = targets.map((target, index) => {
    // 生成伪随机分数：基于名字 hashCode 模拟差异
    const baseScore = 5 + ((voter.name.length + target.name.length + index) % 5)
    const score = Math.min(10, Math.max(0, baseScore))

    return {
      target: target.id,
      score,
      reason: {
        attacked_what: `${target.name}针对核心前提提出了质疑，攻击了方案的可行性假设`,
        rebutted_what: `${target.name}成功反驳了关于时间线不合理的质疑`,
        revised_what: `${target.name}修正了初始方案中的风险评估部分`,
        survived_claim: `${target.name}关于分阶段实施的核心论点经受住了多轮攻击`,
        main_weakness: `${target.name}在成本估算和资源约束方面的论证仍然薄弱`
      }
    }
  })

  const ballot = {
    voter: voter.id,
    votes
  }

  return JSON.stringify(ballot, null, 2)
}
