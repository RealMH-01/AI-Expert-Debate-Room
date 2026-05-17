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
  parseError?: string
}

const ATTACK_DIMENSION_SET = new Set<string>(ATTACK_DIMENSIONS)
const CLAIM_STATUSES = new Set<string>(['active', 'revised', 'abandoned'])

export function normalizeProviderDebateOutput(
  output: Pick<DebateGenerateOutput, 'content' | 'structuredJson'>
): NormalizedProviderDebateOutput {
  const parsed = output.structuredJson
    ? { value: output.structuredJson }
    : parseJsonObject(output.content)

  if (!parsed.value) {
    return {
      message: output.content,
      claims: [],
      attacks: [],
      structuredJson: null,
      parseError: parsed.error
    }
  }

  const message = readString(parsed.value.message) || output.content
  const claims = normalizeClaims(parsed.value.claims)
  const attacks = normalizeAttacks(parsed.value.attacks)

  return {
    message,
    claims,
    attacks,
    structuredJson: {
      message,
      claims,
      attacks
    }
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

  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) {
        return { value: parsed }
      }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'JSON parse failed'
      }
    }
  }

  return { value: null }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
