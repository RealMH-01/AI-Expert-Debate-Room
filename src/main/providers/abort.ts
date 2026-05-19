export type AbortReason = 'external' | 'timeout'

export class DebateAbortError extends Error {
  constructor(message = 'debate_aborted: 用户已停止辩论') {
    super(message)
    this.name = 'DebateAbortError'
  }
}

export function isDebateAbortError(error: unknown): error is DebateAbortError {
  return error instanceof Error && error.name === 'DebateAbortError'
}

export function createCombinedAbortSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  signal: AbortSignal
  cleanup: () => void
  getAbortReason: () => AbortReason | null
} {
  const controller = new AbortController()
  let abortReason: AbortReason | null = null

  const abortFromExternal = (): void => {
    if (controller.signal.aborted) return
    abortReason = 'external'
    const reason = externalSignal?.reason
    controller.abort(isDebateAbortError(reason) ? reason : new DebateAbortError())
  }

  const timeoutId = setTimeout(() => {
    if (controller.signal.aborted) return
    abortReason = 'timeout'
    controller.abort()
  }, timeoutMs)

  if (externalSignal?.aborted) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    },
    getAbortReason: () => abortReason
  }
}
