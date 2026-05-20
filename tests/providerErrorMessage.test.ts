import { describe, expect, it } from 'vitest'

describe('provider error messages', () => {
  it('classifies timeout separately and explains BigModel timeout without blaming JSON parsing', async () => {
    const { classifyProviderFailure, formatProviderFailureForUser } = await import('../src/main/providers/errorMessages')

    expect(classifyProviderFailure('network: request timeout')).toBe('network_timeout')
    expect(formatProviderFailureForUser('network: request timeout', 'bigmodel')).toContain('智谱')
    expect(formatProviderFailureForUser('network: request timeout', 'bigmodel')).toContain('Provider 请求超时')
    expect(formatProviderFailureForUser('network: request timeout', 'bigmodel')).not.toContain('JSON')
  })

  it('does not leak sensitive credentials while formatting provider errors', async () => {
    const { formatProviderFailureForUser } = await import('../src/main/providers/errorMessages')

    const message = formatProviderFailureForUser('auth: Bearer sk-test-secret API key abc123', 'openai')

    expect(message).not.toContain('sk-test-secret')
    expect(message).not.toContain('abc123')
  })
})
