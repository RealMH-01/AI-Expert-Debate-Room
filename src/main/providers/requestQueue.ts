/**
 * Request Queue - 请求队列
 *
 * 按 providerId/baseUrl 维度限制并发，避免多个专家同时打爆同一个 provider。
 * MockProvider 不受此队列限制。
 *
 * 设计：
 * - 每个 provider 独立队列
 * - 默认最大并发 1（串行）
 * - 不会阻塞其他 provider 的请求
 */

type QueueTask<T> = {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

class ProviderQueue {
  private queue: QueueTask<unknown>[] = []
  private running = 0
  private maxConcurrency: number

  constructor(maxConcurrency: number = 1) {
    this.maxConcurrency = maxConcurrency
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject
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

/**
 * 全局请求队列管理器
 * 按 providerId 维度管理队列
 */
class RequestQueueManager {
  private queues = new Map<string, ProviderQueue>()
  private defaultConcurrency = 1

  /**
   * 获取或创建指定 provider 的队列
   */
  private getQueue(providerId: string): ProviderQueue {
    if (!this.queues.has(providerId)) {
      this.queues.set(providerId, new ProviderQueue(this.defaultConcurrency))
    }
    return this.queues.get(providerId)!
  }

  /**
   * 向指定 provider 的队列中添加请求
   * Mock provider 不走队列，直接执行
   */
  async enqueue<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    if (providerId === 'mock') {
      // MockProvider 不需要限流，直接执行
      return task()
    }
    const queue = this.getQueue(providerId)
    return queue.enqueue(task)
  }

  /**
   * 设置指定 provider 的最大并发数
   */
  setConcurrency(providerId: string, maxConcurrency: number): void {
    const queue = this.getQueue(providerId)
    // 重新创建队列（简单实现）
    this.queues.set(providerId, new ProviderQueue(maxConcurrency))
  }

  /**
   * 获取状态信息
   */
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

/** 全局单例 */
export const requestQueue = new RequestQueueManager()
