import type { DebateAttachmentInput } from './types'

export const SUPPORTED_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv'
] as const

export const MAX_ATTACHMENT_SIZE_BYTES = 200 * 1024
export const MAX_TOTAL_ATTACHMENT_TEXT_BYTES = 300 * 1024

export interface AttachmentValidationResult {
  valid: boolean
  attachments: DebateAttachmentInput[]
  errors: string[]
}

export function getAttachmentExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  return dotIndex >= 0 ? normalized.slice(dotIndex) : ''
}

export function isSupportedAttachmentName(fileName: string): boolean {
  return SUPPORTED_ATTACHMENT_EXTENSIONS.includes(
    getAttachmentExtension(fileName) as (typeof SUPPORTED_ATTACHMENT_EXTENSIONS)[number]
  )
}

export function validateDebateAttachments(
  rawAttachments: unknown
): AttachmentValidationResult {
  if (rawAttachments == null) {
    return { valid: true, attachments: [], errors: [] }
  }

  if (!Array.isArray(rawAttachments)) {
    return { valid: false, attachments: [], errors: ['公共素材格式不正确'] }
  }

  const attachments: DebateAttachmentInput[] = []
  const errors: string[] = []
  let totalTextBytes = 0

  rawAttachments.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`第 ${index + 1} 个公共素材格式不正确`)
      return
    }

    const originalName = typeof raw.originalName === 'string' ? raw.originalName.trim() : ''
    const mimeType =
      typeof raw.mimeType === 'string'
        ? raw.mimeType
        : raw.mimeType == null
          ? null
          : String(raw.mimeType)
    const sizeBytes = typeof raw.sizeBytes === 'number' ? raw.sizeBytes : Number(raw.sizeBytes)
    const contentText = typeof raw.contentText === 'string' ? raw.contentText : ''

    if (!originalName) {
      errors.push(`第 ${index + 1} 个公共素材缺少文件名`)
      return
    }

    if (!isSupportedAttachmentName(originalName)) {
      errors.push(`${originalName} 不支持，当前仅支持 .txt/.md/.markdown/.json/.csv`)
      return
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      errors.push(`${originalName} 文件大小不正确`)
      return
    }

    const textBytes = byteLength(contentText)
    if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES || textBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      errors.push(`${originalName} 过大，单个文件最大 200KB`)
      return
    }

    totalTextBytes += textBytes
    if (totalTextBytes > MAX_TOTAL_ATTACHMENT_TEXT_BYTES) {
      errors.push('公共素材总文本过大，总上限为 300KB')
      return
    }

    attachments.push({
      originalName,
      mimeType,
      sizeBytes,
      contentText
    })
  })

  return {
    valid: errors.length === 0,
    attachments: errors.length === 0 ? attachments : [],
    errors
  }
}

export function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  return encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, 'x').length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
