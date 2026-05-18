export function estimateTokens(value: unknown): number {
  if (value == null) return 0
  const text = typeof value === 'string' ? value : stableStringify(value)
  if (!text) return 0
  return Math.max(0, Math.ceil(text.length / 4))
}

export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
