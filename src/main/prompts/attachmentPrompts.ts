import type { DebateAttachmentContext } from '../../shared/types'

export const MAX_ATTACHMENT_CHARS_PER_FILE = 12000
export const MAX_TOTAL_ATTACHMENT_CHARS_IN_PROMPT = 30000

export function formatSharedAttachmentsForPrompt(
  attachments?: DebateAttachmentContext[]
): string {
  if (!attachments || attachments.length === 0) return ''

  const parts: string[] = [
    '以下是本次会议所有参与者共享的公共素材，所有专家和主理人拥有相同访问权。'
  ]
  let remainingTotal = MAX_TOTAL_ATTACHMENT_CHARS_IN_PROMPT
  let totalWasTruncated = false

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index]
    if (remainingTotal <= 0) {
      totalWasTruncated = attachments
        .slice(index)
        .some((remainingAttachment) => remainingAttachment.contentText.length > 0)
      break
    }

    const originalText = attachment.contentText || ''
    const perFileLimit = Math.min(MAX_ATTACHMENT_CHARS_PER_FILE, remainingTotal)
    const clippedText = originalText.slice(0, perFileLimit)
    const wasTruncated = originalText.length > clippedText.length
    totalWasTruncated = totalWasTruncated || wasTruncated
    remainingTotal -= clippedText.length

    parts.push(
      [
        `【公共素材：${attachment.originalName}】`,
        `大小：${attachment.sizeBytes} bytes；字符数：${originalText.length}`,
        '内容：',
        clippedText,
        wasTruncated ? `[内容已截断，原始长度 ${originalText.length} 字符]` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  if (totalWasTruncated) {
    parts.push(`[公共素材总长度已截断，上限 ${MAX_TOTAL_ATTACHMENT_CHARS_IN_PROMPT} 字符]`)
  }

  return `\n\n${parts.join('\n\n---\n\n')}\n`
}
