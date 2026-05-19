import { describe, expect, it } from 'vitest'

import {
  MAX_EXTRACTED_ATTACHMENT_CHARS,
  MAX_TOTAL_ATTACHMENT_TEXT_CHARS,
  getAttachmentKind,
  getAttachmentSizeLimitBytes,
  getUnsupportedAttachmentMessage,
  isSupportedAttachmentName,
  truncateExtractedText
} from '../src/shared/attachments'
import {
  canAddExtractedAttachmentText,
  getAttachmentAcceptValue
} from '../src/renderer/utils/attachmentTextExtractor'

describe('attachment kind and support matrix', () => {
  it('recognizes common document, spreadsheet, presentation, pdf, text, and code formats', () => {
    expect(getAttachmentKind('notes.md')?.label).toBe('Markdown')
    expect(getAttachmentKind('events.jsonl')?.label).toBe('JSONL')
    expect(getAttachmentKind('report.docx')?.label).toBe('Word')
    expect(getAttachmentKind('sheet.xlsx')?.label).toBe('Excel')
    expect(getAttachmentKind('legacy.xls')?.label).toBe('Excel')
    expect(getAttachmentKind('deck.pptx')?.label).toBe('PPT')
    expect(getAttachmentKind('paper.pdf')?.label).toBe('PDF')
    expect(getAttachmentKind('server.log')?.label).toBe('日志')
    expect(getAttachmentKind('script.ts')?.label).toBe('代码')
    expect(isSupportedAttachmentName('.gitignore')).toBe(true)
  })

  it('keeps the file picker accept value aligned with supported extensions', () => {
    const accept = getAttachmentAcceptValue()

    expect(accept).toContain('.docx')
    expect(accept).toContain('.xlsx')
    expect(accept).toContain('.pptx')
    expect(accept).toContain('.pdf')
    expect(accept).toContain('.gitignore')
    expect(accept).not.toContain('.doc,')
  })

  it('returns specific guidance for unsupported legacy office, images, archives, and audio/video', () => {
    expect(getUnsupportedAttachmentMessage('draft.doc')).toContain('请另存为 .docx/.xlsx/.pptx 或 PDF 后上传')
    expect(getUnsupportedAttachmentMessage('slides.dps')).toContain('请另存为 .docx/.xlsx/.pptx 或 PDF 后上传')
    expect(getUnsupportedAttachmentMessage('scan.png')).toContain('暂不支持 OCR')
    expect(getUnsupportedAttachmentMessage('bundle.zip')).toContain('请解压后上传其中的文档文件')
    expect(getUnsupportedAttachmentMessage('meeting.mp4')).toContain('暂不支持音视频')
  })
})

describe('attachment limits', () => {
  it('uses 1MB for text/code files and 10MB for office/pdf files', () => {
    expect(getAttachmentSizeLimitBytes('notes.txt')).toBe(1024 * 1024)
    expect(getAttachmentSizeLimitBytes('script.ts')).toBe(1024 * 1024)
    expect(getAttachmentSizeLimitBytes('report.docx')).toBe(10 * 1024 * 1024)
    expect(getAttachmentSizeLimitBytes('paper.pdf')).toBe(10 * 1024 * 1024)
  })

  it('truncates extracted text to the single-file character limit with a clear warning', () => {
    const result = truncateExtractedText('x'.repeat(MAX_EXTRACTED_ATTACHMENT_CHARS + 5))

    expect(result.text).toHaveLength(MAX_EXTRACTED_ATTACHMENT_CHARS)
    expect(result.warnings.join('\n')).toContain(`已截断到前 ${MAX_EXTRACTED_ATTACHMENT_CHARS} 字符`)
  })

  it('rejects later files when the total extracted text limit would be exceeded', () => {
    const result = canAddExtractedAttachmentText(
      MAX_TOTAL_ATTACHMENT_TEXT_CHARS - 10,
      'x'.repeat(11)
    )

    expect(result.allowed).toBe(false)
    expect(result.message).toContain(`公共素材总文本最大 ${MAX_TOTAL_ATTACHMENT_TEXT_CHARS} 字符`)
  })
})
