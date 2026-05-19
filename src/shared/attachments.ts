import type { DebateAttachmentInput } from './types'

export type AttachmentParserKind = 'text' | 'docx' | 'spreadsheet' | 'pptx' | 'pdf'
export type AttachmentSizeTier = 'text' | 'document'

export interface AttachmentKind {
  extension: string
  label: string
  parser: AttachmentParserKind
  sizeTier: AttachmentSizeTier
}

export const MAX_TEXT_ATTACHMENT_SIZE_BYTES = 1024 * 1024
export const MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_EXTRACTED_ATTACHMENT_CHARS = 100_000
export const MAX_TOTAL_ATTACHMENT_TEXT_CHARS = 300_000

export const SUPPORTED_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.docx',
  '.xlsx',
  '.xls',
  '.pptx',
  '.pdf',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.sql',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
  '.toml',
  '.ini',
  '.env',
  '.gitignore'
] as const

export const TEXT_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm'
] as const

export const CODE_ATTACHMENT_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.sql',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
  '.toml',
  '.ini',
  '.env',
  '.gitignore'
] as const

export const LEGACY_OFFICE_EXTENSIONS = ['.doc', '.ppt', '.wps', '.et', '.dps'] as const
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const
export const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z'] as const
export const AUDIO_VIDEO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm'
] as const

export const MAX_ATTACHMENT_SIZE_BYTES = MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES
export const MAX_TOTAL_ATTACHMENT_TEXT_BYTES = MAX_TOTAL_ATTACHMENT_TEXT_CHARS

const ATTACHMENT_KIND_BY_EXTENSION: Record<string, AttachmentKind> = {
  '.txt': { extension: '.txt', label: '文本', parser: 'text', sizeTier: 'text' },
  '.md': { extension: '.md', label: 'Markdown', parser: 'text', sizeTier: 'text' },
  '.markdown': { extension: '.markdown', label: 'Markdown', parser: 'text', sizeTier: 'text' },
  '.json': { extension: '.json', label: 'JSON', parser: 'text', sizeTier: 'text' },
  '.jsonl': { extension: '.jsonl', label: 'JSONL', parser: 'text', sizeTier: 'text' },
  '.csv': { extension: '.csv', label: 'CSV', parser: 'text', sizeTier: 'text' },
  '.tsv': { extension: '.tsv', label: 'TSV', parser: 'text', sizeTier: 'text' },
  '.log': { extension: '.log', label: '日志', parser: 'text', sizeTier: 'text' },
  '.yaml': { extension: '.yaml', label: 'YAML', parser: 'text', sizeTier: 'text' },
  '.yml': { extension: '.yml', label: 'YAML', parser: 'text', sizeTier: 'text' },
  '.xml': { extension: '.xml', label: 'XML', parser: 'text', sizeTier: 'text' },
  '.html': { extension: '.html', label: 'HTML', parser: 'text', sizeTier: 'text' },
  '.htm': { extension: '.htm', label: 'HTML', parser: 'text', sizeTier: 'text' },
  '.docx': { extension: '.docx', label: 'Word', parser: 'docx', sizeTier: 'document' },
  '.xlsx': { extension: '.xlsx', label: 'Excel', parser: 'spreadsheet', sizeTier: 'document' },
  '.xls': { extension: '.xls', label: 'Excel', parser: 'spreadsheet', sizeTier: 'document' },
  '.pptx': { extension: '.pptx', label: 'PPT', parser: 'pptx', sizeTier: 'document' },
  '.pdf': { extension: '.pdf', label: 'PDF', parser: 'pdf', sizeTier: 'document' }
}

for (const extension of CODE_ATTACHMENT_EXTENSIONS) {
  ATTACHMENT_KIND_BY_EXTENSION[extension] = {
    extension,
    label: '代码',
    parser: 'text',
    sizeTier: 'text'
  }
}

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
  return getAttachmentKind(fileName) !== null
}

export function getAttachmentKind(fileName: string): AttachmentKind | null {
  return ATTACHMENT_KIND_BY_EXTENSION[getAttachmentExtension(fileName)] ?? null
}

export function getAttachmentSizeLimitBytes(fileName: string): number {
  const kind = getAttachmentKind(fileName)
  return kind?.sizeTier === 'document'
    ? MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES
    : MAX_TEXT_ATTACHMENT_SIZE_BYTES
}

export function getUnsupportedAttachmentMessage(fileName: string): string {
  const extension = getAttachmentExtension(fileName)
  if (includesExtension(LEGACY_OFFICE_EXTENSIONS, extension)) {
    return `${fileName} 暂不支持旧版 Office/WPS 专有格式，请另存为 .docx/.xlsx/.pptx 或 PDF 后上传。`
  }
  if (includesExtension(IMAGE_EXTENSIONS, extension)) {
    return `${fileName} 当前暂不支持 OCR，请上传可复制文字的 PDF 或文本文件。`
  }
  if (includesExtension(ARCHIVE_EXTENSIONS, extension)) {
    return `${fileName} 当前暂不支持压缩包，请解压后上传其中的文档文件。`
  }
  if (includesExtension(AUDIO_VIDEO_EXTENSIONS, extension)) {
    return `${fileName} 当前暂不支持音视频资料，请上传可提取文字的文档、表格、PDF 或文本文件。`
  }
  return `${fileName} 暂不支持该格式，请上传 Word、PDF、Excel、PPT、Markdown、CSV、日志、代码等可提取文字的资料。`
}

export function formatAttachmentSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${bytes / 1024 / 1024}MB`
  if (bytes >= 1024) return `${bytes / 1024}KB`
  return `${bytes}B`
}

export function truncateExtractedText(text: string): { text: string; warnings: string[] } {
  if (text.length <= MAX_EXTRACTED_ATTACHMENT_CHARS) {
    return { text, warnings: [] }
  }

  return {
    text: text.slice(0, MAX_EXTRACTED_ATTACHMENT_CHARS),
    warnings: [`已截断到前 ${MAX_EXTRACTED_ATTACHMENT_CHARS} 字符，原始提取文本 ${text.length} 字符。`]
  }
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

    const kind = getAttachmentKind(originalName)
    if (!kind) {
      errors.push(getUnsupportedAttachmentMessage(originalName))
      return
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      errors.push(`${originalName} 文件大小不正确`)
      return
    }

    const sizeLimit = getAttachmentSizeLimitBytes(originalName)
    if (sizeBytes > sizeLimit) {
      errors.push(`${originalName} 过大，单个${kind.label}文件最大 ${formatAttachmentSizeLimit(sizeLimit)}`)
      return
    }

    if (contentText.trim().length === 0) {
      errors.push(`${originalName} 未提取到可用文本`)
      return
    }

    if (contentText.length > MAX_EXTRACTED_ATTACHMENT_CHARS) {
      errors.push(`${originalName} 提取文本过大，单个文件最多 ${MAX_EXTRACTED_ATTACHMENT_CHARS} 字符`)
      return
    }

    totalTextBytes += contentText.length
    if (totalTextBytes > MAX_TOTAL_ATTACHMENT_TEXT_CHARS) {
      errors.push(`公共素材总文本过大，总上限为 ${MAX_TOTAL_ATTACHMENT_TEXT_CHARS} 字符`)
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

function includesExtension<const T extends readonly string[]>(extensions: T, extension: string): boolean {
  return extensions.includes(extension as T[number])
}
