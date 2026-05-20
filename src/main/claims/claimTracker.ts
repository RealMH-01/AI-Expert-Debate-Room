import type { DebateGenerateOutput } from '../providers/base'

export const ATTACK_DIMENSIONS = [
  'logic',
  'evidence',
  'feasibility',
  'consistency',
  'assumption',
  'risk',
  'creativity',
  'user_value',
  'other',
  'unknown'
] as const

export type AttackDimension = (typeof ATTACK_DIMENSIONS)[number]
export type ClaimStatus = 'active' | 'revised' | 'abandoned'
export type StructuredOutputErrorType =
  | 'json_parse_failed'
  | 'schema_failed'
  | 'output_truncated'
  | 'provider_incomplete'

export interface NormalizedClaimInput {
  claim_text: string
  status: ClaimStatus
  revised_from_claim_id: string | null
}

export interface NormalizedAttackInput {
  target_expert_id: string | null
  target_claim_id: string | null
  target_claim_text: string | null
  attack_text: string
  attack_dimensions: AttackDimension[]
}

export interface NormalizedProviderDebateOutput {
  message: string
  claims: NormalizedClaimInput[]
  attacks: NormalizedAttackInput[]
  structuredJson: Record<string, unknown> | null
  errorType?: StructuredOutputErrorType
  parseError?: string
}

export interface StructuredOutputRetryMetadata {
  attempted: boolean
  succeeded: boolean
  attempts: number
  previousErrorType?: StructuredOutputErrorType
  previousParseError?: string
}

const ATTACK_DIMENSION_SET = new Set<string>(ATTACK_DIMENSIONS)
const CLAIM_STATUSES = new Set<string>(['active', 'revised', 'abandoned'])
const RAW_OUTPUT_HEAD_LIMIT = 4000
const RAW_OUTPUT_TAIL_LIMIT = 1000

export function normalizeProviderDebateOutput(
  output: Pick<DebateGenerateOutput, 'content' | 'structuredJson'>
): NormalizedProviderDebateOutput {
  const parsed = output.structuredJson
    ? { value: output.structuredJson }
    : parseJsonObject(output.content)

  if (!parsed.value) {
    const errorType: StructuredOutputErrorType = 'json_parse_failed'
    const structuredJson = buildParseFailedStructuredJson(output.content, parsed.error, errorType)
    return {
      message: buildParseFailedMessage(errorType),
      claims: [],
      attacks: [],
      structuredJson,
      errorType,
      parseError: parsed.error
    }
  }

  const message = readString(parsed.value.message)
  if (!message) {
    const error = 'Parsed JSON is missing a non-empty message field'
    const errorType: StructuredOutputErrorType = 'schema_failed'
    return {
      message: buildParseFailedMessage(errorType),
      claims: [],
      attacks: [],
      structuredJson: buildParseFailedStructuredJson(output.content, error, errorType),
      errorType,
      parseError: error
    }
  }

  const claims = normalizeClaims(parsed.value.claims)
  const attacks = normalizeAttacks(parsed.value.attacks)

  return {
    message,
    claims,
    attacks,
    structuredJson: parsed.value
  }
}

export function attachStructuredOutputRetryMetadata(
  normalized: NormalizedProviderDebateOutput,
  retry: StructuredOutputRetryMetadata
): NormalizedProviderDebateOutput {
  const structuredJson = normalized.structuredJson
    ? { ...normalized.structuredJson, retry }
    : { retry }

  return {
    ...normalized,
    message: normalized.errorType
      ? buildParseFailedMessage(normalized.errorType, retry)
      : normalized.message,
    structuredJson
  }
}

export function normalizeClaims(value: unknown): NormalizedClaimInput[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item): NormalizedClaimInput | null => {
      if (!isRecord(item)) return null
      const claimText = readString(item.claim_text)
      if (!claimText) return null

      const statusRaw = readString(item.status)
      const status = statusRaw && CLAIM_STATUSES.has(statusRaw)
        ? (statusRaw as ClaimStatus)
        : 'active'

      return {
        claim_text: claimText,
        status,
        revised_from_claim_id: readString(item.revised_from_claim_id)
      }
    })
    .filter((claim): claim is NormalizedClaimInput => claim !== null)
    .slice(0, 3)
}

export function normalizeAttacks(value: unknown): NormalizedAttackInput[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item): NormalizedAttackInput | null => {
      if (!isRecord(item)) return null
      const attackText = readString(item.attack_text)
      if (!attackText) return null

      return {
        target_expert_id: readString(item.target_expert_id),
        target_claim_id: readString(item.target_claim_id),
        target_claim_text: readString(item.target_claim_text),
        attack_text: attackText,
        attack_dimensions: normalizeAttackDimensions(item.attack_dimensions)
      }
    })
    .filter((attack): attack is NormalizedAttackInput => attack !== null)
}

export function normalizeAttackDimensions(value: unknown): AttackDimension[] {
  if (!Array.isArray(value)) return ['unknown']

  const dimensions = value
    .map((item) => readString(item))
    .filter((item): item is AttackDimension => !!item && ATTACK_DIMENSION_SET.has(item))

  return dimensions.length > 0 ? [...new Set(dimensions)] : ['unknown']
}

function parseJsonObject(content: string): {
  value: Record<string, unknown> | null
  error?: string
} {
  const candidates = [content.trim()]
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    candidates.unshift(codeBlock[1].trim())
  }

  let lastError: string | undefined
  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) {
        return { value: parsed }
      }
      lastError = 'Parsed JSON is not an object'
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'JSON parse failed'
    }
  }

  return { value: null, error: lastError }
}

function buildParseFailedStructuredJson(
  raw: string,
  error: string | undefined,
  errorType: StructuredOutputErrorType
): Record<string, unknown> {
  const safeRaw = sanitizeRawOutput(raw)
  const rawHead = safeRaw.slice(0, RAW_OUTPUT_HEAD_LIMIT)
  const rawTail = safeRaw.length > RAW_OUTPUT_TAIL_LIMIT
    ? safeRaw.slice(-RAW_OUTPUT_TAIL_LIMIT)
    : safeRaw

  const structuredJson: Record<string, unknown> = {
    type: 'expert_output_parse_failed',
    errorType,
    hiddenFromTranscript: true,
    rawLength: raw.length,
    rawHead,
    rawTail,
    rawTruncatedForStorage: safeRaw.length > RAW_OUTPUT_HEAD_LIMIT || safeRaw.length > RAW_OUTPUT_TAIL_LIMIT,
    parseError: error ?? 'No JSON object found',
    error: error ?? 'No JSON object found'
  }

  return structuredJson
}

function buildParseFailedMessage(
  errorType: StructuredOutputErrorType,
  retry?: StructuredOutputRetryMetadata
): string {
  if (errorType === 'output_truncated') {
    return '[结构化输出解析失败] 模型输出达到上限导致 JSON 不完整。请缩短上下文或提高输出上限后重试。'
  }

  if (errorType === 'provider_incomplete') {
    return '[结构化输出解析失败] Provider 未完成本轮输出，系统已保留错误详情。请稍后重试。'
  }

  const retryText = retry?.attempted
    ? retry.succeeded
      ? '系统已自动重试并修复。'
      : '系统已自动重试 1 次，仍失败。'
    : '系统已保留错误详情。'
  const typeLabel = errorType === 'schema_failed' ? 'schema_failed' : 'json_parse_failed'
  return `[结构化输出解析失败] 专家返回了无法解析的结构化 JSON。错误类型: ${typeLabel}。${retryText}`
}

function sanitizeRawOutput(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ****')
    .replace(/(sk|sk-ant|sk-or|sk-proj|sk-live)-[A-Za-z0-9_-]{8,}/gi, '$1-****')
    .replace(/(api[_-]?key|x-api-key|x-goog-api-key|authorization|token|secret|auth)(["'\s:=]+)(["']?)[^"',\s}]+/gi, '$1$2$3****')
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
