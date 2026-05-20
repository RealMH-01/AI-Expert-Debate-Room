/**
 * Request Queue - 请求队列
 *
 * Limits concurrency per providerId/baseUrl so multiple experts do not
 * overload the same provider. MockProvider bypasses the queue.
 */

type QueueTask<T> = {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  enqueuedAt: number
  onStart?: (queueWaitMs: number) => void
}

export type QueueTelemetry = {
  queueWaitMs: number
}

export type QueueOptions = {
  maxConcurrency?: number
  onStart?: (telemetry: QueueTelemetry) => void
}

export function getDefaultProviderConcurrency(providerId: string): number {
  if (providerId === 'bigmodel') return 1
  return 2
}

export class ProviderQueue {
  private queue: QueueTask<unknown>[] = []
  private running = 0
  private maxConcurrency: number

  constructor(maxConcurrency: number = 1) {
    this.maxConcurrency = normalizeConcurrency(maxConcurrency)
  }

  setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = normalizeConcurrency(maxConcurrency)
    this.processNext()
  }

  async enqueue<T>(task: () => Promise<T>, options: { onStart?: (queueWaitMs: number) => void } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
        onStart: options.onStart
      })
      this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return
    }

    const task = this.queue.shift()!
    this.running++
    task.onStart?.(Date.now() - task.enqueuedAt)

    try {
      const result = await task.execute()
      task.resolve(result)
    } catch (error) {
      task.reject(error)
    } finally {
      this.running--
      this.processNext()
    }
  }

  get pendingCount(): number {
    return this.queue.length
  }

  get runningCount(): number {
    return this.running
  }
}

class RequestQueueManager {
  private queues = new Map<string, ProviderQueue>()

  private getQueue(providerId: string, maxConcurrency?: number): ProviderQueue {
    const concurrency = maxConcurrency ?? getDefaultProviderConcurrency(providerId)
    if (!this.queues.has(providerId)) {
      this.queues.set(providerId, new ProviderQueue(concurrency))
    } else if (maxConcurrency !== undefined) {
      this.queues.get(providerId)!.setMaxConcurrency(concurrency)
    }
    return this.queues.get(providerId)!
  }

  async enqueue<T>(providerId: string, task: () => Promise<T>, options: QueueOptions = {}): Promise<T> {
    if (providerId === 'mock') {
      options.onStart?.({ queueWaitMs: 0 })
      return task()
    }
    const queue = this.getQueue(providerId, options.maxConcurrency)
    return queue.enqueue(task, {
      onStart: (queueWaitMs) => options.onStart?.({ queueWaitMs })
    })
  }

  setConcurrency(providerId: string, maxConcurrency: number): void {
    const queue = this.getQueue(providerId)
    queue.setMaxConcurrency(maxConcurrency)
  }

  getStatus(): Record<string, { pending: number; running: number }> {
    const status: Record<string, { pending: number; running: number }> = {}
    for (const [id, queue] of this.queues) {
      status[id] = {
        pending: queue.pendingCount,
        running: queue.runningCount
      }
    }
    return status
  }
}

export const requestQueue = new RequestQueueManager()

function normalizeConcurrency(maxConcurrency: number): number {
  if (!Number.isFinite(maxConcurrency)) return 1
  return Math.max(1, Math.min(10, Math.floor(maxConcurrency)))
}
