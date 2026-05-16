/**
 * VoteValidator - 投票验证器
 *
 * 核心铁律：
 * - 本模块是纯规则引擎，不依赖任何 AI / 主理人。
 * - 只做客观格式校验，不判断内容质量。
 * - 主理人无权审票。主理人不能决定某张票是否有效。
 *
 * VoteValidator 可以检查：
 * 1.  JSON 是否可解析
 * 2.  voter 是否存在
 * 3.  voter 是否存活
 * 4.  votes 是否是数组
 * 5.  target 是否存在
 * 6.  target 是否存活
 * 7.  target 是否不是 voter 自己
 * 8.  score 是否是合法数字
 * 9.  score 是否在范围内 (0-10)
 * 10. 是否重复投同一个 target
 * 11. 是否漏投某个应投 target
 * 12. reason 字段是否存在
 * 13. reason.attacked_what 是否存在
 * 14. reason.rebutted_what 是否存在
 * 15. reason.revised_what 是否存在
 * 16. reason.survived_claim 是否存在
 * 17. reason.main_weakness 是否存在
 *
 * VoteValidator 不能检查：
 * 1. 理由是否聪明
 * 2. 判断是否公正
 * 3. 被投专家是不是真的攻击了那些内容
 * 4. 投票是否报复
 * 5. 投票是否符合主理人口味
 * 6. 某个观点是否正确
 */

import type {
  ExpertVoteBallot,
  SingleVote,
  BallotValidationResult,
  SingleVoteValidation
} from './voteTypes'

/** 合法分数范围 */
const SCORE_MIN = 0
const SCORE_MAX = 10

/**
 * 验证一个专家的完整投票 ballot
 *
 * @param rawJson - 原始 JSON 字符串（MockProvider 生成）
 * @param aliveExpertIds - 当前存活专家 ID 列表
 * @param aliveExpertNames - 用于日志/错误信息的名称映射
 * @returns BallotValidationResult
 */
export function validateBallot(
  rawJson: string,
  aliveExpertIds: string[],
  _aliveExpertNames?: Map<string, string>
): BallotValidationResult {
  const result: BallotValidationResult = {
    voterId: '',
    validVotes: [],
    invalidVotes: [],
    errors: [],
    warnings: [],
    parseable: false
  }

  // === Rule 1: JSON 是否可解析 ===
  let ballot: ExpertVoteBallot
  try {
    ballot = JSON.parse(rawJson)
    result.parseable = true
  } catch (e) {
    result.errors.push(`JSON 解析失败: ${(e as Error).message}`)
    result.parseable = false
    return result
  }

  // === Rule 2: voter 是否存在 ===
  if (!ballot.voter || typeof ballot.voter !== 'string') {
    result.errors.push('voter 字段缺失或不是字符串')
    return result
  }
  result.voterId = ballot.voter

  // === Rule 3: voter 是否存活 ===
  if (!aliveExpertIds.includes(ballot.voter)) {
    result.errors.push(`voter "${ballot.voter}" 不在存活专家列表中`)
    return result
  }

  // === Rule 4: votes 是否是数组 ===
  if (!Array.isArray(ballot.votes)) {
    result.errors.push('votes 字段不是数组')
    return result
  }

  // 确定该投票者应该投哪些人
  const expectedTargets = aliveExpertIds.filter((id) => id !== ballot.voter)
  const seenTargets = new Set<string>()

  // 逐票验证
  for (const vote of ballot.votes) {
    const voteValidation = validateSingleVote(vote, ballot.voter, aliveExpertIds, seenTargets)
    if (voteValidation.valid) {
      result.validVotes.push(vote)
      if (voteValidation.target) {
        seenTargets.add(voteValidation.target)
      }
    } else {
      result.invalidVotes.push({
        vote: vote as Partial<SingleVote>,
        errors: voteValidation.errors
      })
      // 即使无效，如果 target 可识别，也标记已出现（用于重复检测）
      if (voteValidation.target && typeof voteValidation.target === 'string') {
        seenTargets.add(voteValidation.target)
      }
    }
  }

  // === Rule 11: 是否漏投某个应投 target ===
  // 漏投任一 target，整份 ballot 视为无效
  const missingTargets: string[] = []
  for (const expectedTarget of expectedTargets) {
    if (!seenTargets.has(expectedTarget)) {
      missingTargets.push(expectedTarget)
    }
  }

  if (missingTargets.length > 0) {
    // 整份 ballot 无效：漏投导致所有 validVotes 作废
    result.errors.push(
      `漏投 ${missingTargets.length} 个目标: ${missingTargets.join(', ')}。整份投票作废。`
    )
    // 将之前标记为 valid 的票全部移到 invalid
    for (const validVote of result.validVotes) {
      result.invalidVotes.push({
        vote: validVote,
        errors: ['因整份 ballot 漏投被作废']
      })
    }
    result.validVotes = []
  }

  return result
}

/**
 * 验证单票
 */
function validateSingleVote(
  vote: unknown,
  voterId: string,
  aliveExpertIds: string[],
  seenTargets: Set<string>
): SingleVoteValidation {
  const validation: SingleVoteValidation = {
    valid: true,
    target: null,
    score: null,
    errors: []
  }

  if (!vote || typeof vote !== 'object') {
    validation.valid = false
    validation.errors.push('票数据不是有效对象')
    return validation
  }

  const v = vote as Record<string, unknown>

  // === Rule 5: target 是否存在 ===
  if (!v.target || typeof v.target !== 'string') {
    validation.valid = false
    validation.errors.push('target 字段缺失或不是字符串')
    return validation
  }
  validation.target = v.target

  // === Rule 6: target 是否存活 ===
  if (!aliveExpertIds.includes(v.target)) {
    validation.valid = false
    validation.errors.push(`target "${v.target}" 不在存活专家列表中`)
    return validation
  }

  // === Rule 7: target 是否不是 voter 自己 ===
  if (v.target === voterId) {
    validation.valid = false
    validation.errors.push('不能投自己')
    return validation
  }

  // === Rule 10: 是否重复投同一个 target ===
  if (seenTargets.has(v.target)) {
    validation.valid = false
    validation.errors.push(`重复投票给 "${v.target}"`)
    return validation
  }

  // === Rule 8: score 是否是合法数字 ===
  if (v.score === undefined || v.score === null || typeof v.score !== 'number' || isNaN(v.score)) {
    validation.valid = false
    validation.errors.push('score 不是合法数字')
    return validation
  }
  validation.score = v.score

  // === Rule 9: score 是否在范围内 ===
  if (v.score < SCORE_MIN || v.score > SCORE_MAX) {
    validation.valid = false
    validation.errors.push(`score ${v.score} 超出范围 [${SCORE_MIN}, ${SCORE_MAX}]`)
    return validation
  }

  // score 必须是整数（规范化）
  if (!Number.isInteger(v.score)) {
    validation.valid = false
    validation.errors.push(`score ${v.score} 必须是整数`)
    return validation
  }

  // === Rule 12: reason 字段是否存在 ===
  if (!v.reason || typeof v.reason !== 'object') {
    validation.valid = false
    validation.errors.push('reason 字段缺失或不是对象')
    return validation
  }

  const reason = v.reason as Record<string, unknown>

  // === Rules 13-17: reason 子字段检查 ===
  const requiredReasonFields = [
    'attacked_what',
    'rebutted_what',
    'revised_what',
    'survived_claim',
    'main_weakness'
  ]

  for (const field of requiredReasonFields) {
    if (!reason[field] || typeof reason[field] !== 'string' || (reason[field] as string).trim() === '') {
      validation.valid = false
      validation.errors.push(`reason.${field} 缺失或为空`)
    }
  }

  return validation
}
