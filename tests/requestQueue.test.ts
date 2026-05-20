import { describe, expect, it, vi } from 'vitest'

describe('request queue concurrency', () => {
  it('serializes same-provider work when concurrency is 1', async () => {
    const { ProviderQueue } = await import('../src/main/providers/requestQueue')
    const queue = new ProviderQueue(1)
    let running = 0
    let maxRunning = 0
    const releases: Array<() => void> = []

    const tasks = [1, 2, 3].map((value) =>
      queue.enqueue(async () => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        await new Promise<void>((resolve) => releases.push(resolve))
        running -= 1
        return value
      })
    )

    await Promise.resolve()
    expect(maxRunning).toBe(1)
    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(1), { timeout: 100 })
    expect(maxRunning).toBe(1)
    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(1), { timeout: 100 })
    releases.shift()?.()

    await expect(Promise.all(tasks)).resolves.toEqual([1, 2, 3])
    expect(maxRunning).toBe(1)
  })

  it('runs at most two same-provider jobs when concurrency is 2', async () => {
    const { ProviderQueue } = await import('../src/main/providers/requestQueue')
    const queue = new ProviderQueue(2)
    let running = 0
    let maxRunning = 0
    const releases: Array<() => void> = []

    const tasks = [1, 2, 3].map((value) =>
      queue.enqueue(async () => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        await new Promise<void>((resolve) => releases.push(resolve))
        running -= 1
        return value
      })
    )

    await Promise.resolve()
    expect(maxRunning).toBe(2)
    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(2), { timeout: 100 })
    expect(maxRunning).toBe(2)
    releases.shift()?.()
    releases.shift()?.()

    await expect(Promise.all(tasks)).resolves.toEqual([1, 2, 3])
    expect(maxRunning).toBe(2)
  })

  it('uses conservative provider-specific concurrency for BigModel', async () => {
    const { getDefaultProviderConcurrency } = await import('../src/main/providers/requestQueue')

    expect(getDefaultProviderConcurrency('bigmodel')).toBe(1)
    expect(getDefaultProviderConcurrency('deepseek')).toBe(2)
    expect(getDefaultProviderConcurrency('openai')).toBe(2)
  })
})
