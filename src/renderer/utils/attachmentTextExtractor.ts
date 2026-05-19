import {
  MAX_TOTAL_ATTACHMENT_TEXT_CHARS,
  SUPPORTED_ATTACHMENT_EXTENSIONS,
  formatAttachmentSizeLimit,
  getAttachmentKind,
  getAttachmentSizeLimitBytes,
  getUnsupportedAttachmentMessage,
  truncateExtractedText
} from '../../shared/attachments'

export interface ExtractedAttachmentText {
  contentText: string
  detectedKind: string
  warnings?: string[]
}

export interface TotalAttachmentTextCheck {
  allowed: boolean
  message?: string
}

type PptxXmlNode = string | number | boolean | null | PptxXmlNode[] | { [key: string]: PptxXmlNode }

export function getAttachmentAcceptValue(): string {
  return SUPPORTED_ATTACHMENT_EXTENSIONS.join(',')
}

export function canAddExtractedAttachmentText(
  currentTotalChars: number,
  nextText: string
): TotalAttachmentTextCheck {
  if (currentTotalChars + nextText.length <= MAX_TOTAL_ATTACHMENT_TEXT_CHARS) {
    return { allowed: true }
  }

  return {
    allowed: false,
    message: `过大，公共素材总文本最大 ${MAX_TOTAL_ATTACHMENT_TEXT_CHARS} 字符，已拒绝该文件`
  }
}

export async function extractAttachmentText(file: File): Promise<ExtractedAttachmentText> {
  const kind = getAttachmentKind(file.name)
  if (!kind) {
    throw new Error(getUnsupportedAttachmentMessage(file.name))
  }

  const sizeLimit = getAttachmentSizeLimitBytes(file.name)
  if (file.size > sizeLimit) {
    throw new Error(`${file.name} 过大，单个${kind.label}文件最大 ${formatAttachmentSizeLimit(sizeLimit)}`)
  }

  let rawText: string
  switch (kind.parser) {
    case 'docx':
      rawText = await extractDocxText(file)
      break
    case 'spreadsheet':
      rawText = await extractSpreadsheetText(file)
      break
    case 'pptx':
      rawText = await extractPptxText(file)
      break
    case 'pdf':
      rawText = await extractPdfText(file)
      break
    case 'text':
    default:
      rawText = await file.text()
      break
  }

  const trimmedText = rawText.trim()
  if (!trimmedText) {
    throw new Error('未提取到可用文本')
  }

  const truncated = truncateExtractedText(trimmedText)
  return {
    contentText: truncated.text,
    detectedKind: kind.label,
    warnings: truncated.warnings
  }
}

async function extractDocxText(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    let result: { value: string }
    try {
      result = await mammoth.extractRawText({ arrayBuffer })
    } catch (browserInputError) {
      const buffer = createNodeBuffer(arrayBuffer)
      if (!buffer) throw browserInputError
      result = await mammoth.extractRawText({ buffer } as Parameters<typeof mammoth.extractRawText>[0])
    }
    return result.value
  } catch (error) {
    throw new Error(`Word 文档解析失败：${getErrorMessage(error)}`)
  }
}

async function extractSpreadsheetText(file: File): Promise<string> {
  try {
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = xlsx.utils.sheet_to_csv(sheet, {
        FS: '\t',
        blankrows: false
      }).trim()
      return [`[Sheet: ${sheetName}]`, rows].filter(Boolean).join('\n')
    })
      .filter(Boolean)
      .join('\n\n')
  } catch (error) {
    throw new Error(`Excel 表格解析失败：${getErrorMessage(error)}`)
  }
}

async function extractPptxText(file: File): Promise<string> {
  try {
    const [{ default: JSZip }, { XMLParser }] = await Promise.all([
      import('jszip'),
      import('fast-xml-parser')
    ])
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const parser = new XMLParser({
      ignoreAttributes: true,
      preserveOrder: false,
      trimValues: true
    })
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort(compareSlidePaths)

    const slides: string[] = []
    for (const [index, path] of slidePaths.entries()) {
      const entry = zip.file(path)
      if (!entry) continue

      const xml = await entry.async('text')
      const parsed = parser.parse(xml) as PptxXmlNode
      const text = collectPptxText(parsed).join('\n').trim()
      if (text) {
        slides.push(`[Slide ${index + 1}]\n${text}`)
      }
    }

    return slides.join('\n\n')
  } catch (error) {
    throw new Error(`PPT 文稿解析失败：${getErrorMessage(error)}`)
  }
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (typeof window !== 'undefined') {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url
      ).toString()
    }
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer())
    }).promise
    const pages: string[] = []

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (pageText) {
        pages.push(`[Page ${pageIndex}]\n${pageText}`)
      }
    }

    const text = pages.join('\n\n').trim()
    if (!text) {
      throw new Error('该 PDF 可能是扫描件，暂不支持 OCR，请上传可复制文字的 PDF 或转成文本。')
    }
    return text
  } catch (error) {
    const message = getErrorMessage(error)
    if (message.includes('扫描件') || message.includes('OCR')) {
      throw new Error(message)
    }
    throw new Error(`PDF 文本提取失败：${message}`)
  }
}

function collectPptxText(node: PptxXmlNode): string[] {
  if (node == null) return []
  if (Array.isArray(node)) return node.flatMap((child) => collectPptxText(child))
  if (typeof node !== 'object') return []

  const values: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'a:t' || key.endsWith(':t')) && typeof value === 'string' && value.trim()) {
      values.push(value.trim())
    } else {
      values.push(...collectPptxText(value))
    }
  }
  return values
}

function compareSlidePaths(left: string, right: string): number {
  return getSlideNumber(left) - getSlideNumber(right)
}

function getSlideNumber(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/i)?.[1] ?? 0)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createNodeBuffer(arrayBuffer: ArrayBuffer): unknown | null {
  const bufferConstructor = (
    globalThis as typeof globalThis & {
      Buffer?: { from: (input: ArrayBuffer) => unknown }
    }
  ).Buffer
  return bufferConstructor ? bufferConstructor.from(arrayBuffer) : null
}
