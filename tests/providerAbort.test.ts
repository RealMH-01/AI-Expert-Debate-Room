import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRequest, ProviderResponse } from '../src/main/providers/types'

vi.mock('../src/main/providers/providerSettings', () => ({
  getProviderConfig: () => ({
    apiKey: 'sk-test',
    baseUrl: 'https://example.test/v1',
    defaultHeaders: {},
    timeout: 10,
    enabled: true
  })
}))

vi.mock('../src/main/providers/requestQueue', () => ({
  requestQueue: {
    enqueue: async (_providerId: string, task: () => Promise<ProviderResponse>) => task()
  }
}))

vi.mock('../src/shared/providers/modelRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/shared/providers/modelRegistry')>()
  return {
    ...actual,
    getProviderDefinition: () => ({ defaultBaseUrl: 'https://example.test/v1' })
  }
})

class TestOpenAICompatibleAdapter extends (await import('../src/main/providers/adapters/OpenAICompatibleAdapter')).OpenAICompatibleAdapter {
  constructor() {
    super({ providerId: 'openai_compatible', model: 'model-a' })
  }

  sendPublic(request: ProviderRequest) {
    return this.send(request)
  }
}

function installAbortableFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
  )
}

describe('provider abort handling', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('throws DebateAbortError for external user aborts instead of timeout', async () => {
    const { DebateAbortError } = await import('../src/main/providers/abort')
    installAbortableFetch()
    const adapter = new TestOpenAICompatibleAdapter()
    const controller = new AbortController()

    const promise = adapter.sendPublic({
      model: 'model-a',
      messages: [{ role: 'user', content: 'hello' }],
      signal: controller.signal
    })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(DebateAbortError)
    await expect(promise).rejects.toThrow('debate_aborted')
  })

  it('keeps provider timeout errors distinct from external aborts', async () => {
    vi.useFakeTimers()
    installAbortableFetch()
    const adapter = new TestOpenAICompatibleAdapter()

    const promise = adapter.sendPublic({
      model: 'model-a',
      messages: [{ role: 'user', content: 'hello' }]
    })
    const expectation = expect(promise).rejects.toThrow('network: request timeout')
    await vi.advanceTimersByTimeAsync(10)

    await expectation
  })
})
