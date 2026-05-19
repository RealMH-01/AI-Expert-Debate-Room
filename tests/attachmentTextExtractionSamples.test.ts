import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

import { extractAttachmentText } from '../src/renderer/utils/attachmentTextExtractor'

describe('attachment text extraction with representative in-memory samples', () => {
  it('extracts text from txt and csv files', async () => {
    await expect(extractAttachmentText(textFile('notes.txt', 'plain notes'))).resolves.toMatchObject({
      contentText: 'plain notes',
      detectedKind: '文本'
    })

    await expect(extractAttachmentText(textFile('table.csv', 'name,value\nalpha,1'))).resolves.toMatchObject({
      contentText: 'name,value\nalpha,1',
      detectedKind: 'CSV'
    })
  })

  it('extracts text from docx, xlsx, pptx, and copyable pdf files', async () => {
    const [docx, xlsx, pptx, pdf] = await Promise.all([
      createDocxFile('Word sample text'),
      createXlsxFile('Sheet sample text'),
      createPptxFile('Slide sample text'),
      createPdfFile('Hello PDF')
    ])

    await expect(extractAttachmentText(docx)).resolves.toMatchObject({
      contentText: 'Word sample text',
      detectedKind: 'Word'
    })
    await expect(extractAttachmentText(xlsx)).resolves.toMatchObject({
      contentText: expect.stringContaining('[Sheet: Sheet1]'),
      detectedKind: 'Excel'
    })
    await expect(extractAttachmentText(xlsx)).resolves.toMatchObject({
      contentText: expect.stringContaining('Sheet sample text')
    })
    await expect(extractAttachmentText(pptx)).resolves.toMatchObject({
      contentText: '[Slide 1]\nSlide sample text',
      detectedKind: 'PPT'
    })
    await expect(extractAttachmentText(pdf)).resolves.toMatchObject({
      contentText: expect.stringContaining('Hello PDF'),
      detectedKind: 'PDF'
    })
  })
})

function textFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' })
}

async function createDocxFile(text: string): Promise<File> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.folder('_rels')?.file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  zip.folder('word')?.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body></w:document>`
  )
  const content = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([content], 'report.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

function createXlsxFile(text: string): File {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Title'], [text]]), 'Sheet1')
  const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new File([content], 'table.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

async function createPptxFile(text: string): Promise<File> {
  const zip = new JSZip()
  zip.folder('ppt')?.folder('slides')?.file(
    'slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  )
  const content = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([content], 'slides.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  })
}

function createPdfFile(text: string): File {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${text.length + 35} >>
stream
BT /F1 24 Tf 50 100 Td (${text}) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${405 + String(text.length + 35).length - 2}
%%EOF`
  return new File([new TextEncoder().encode(pdf)], 'paper.pdf', { type: 'application/pdf' })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
