/**
 * Offline queue for workout logging operations.
 * Queues workout entries when offline and syncs them when connectivity is restored.
 */

export interface WorkoutQueueEntry {
  id: string
  type: 'workout_log' | 'workout_parse'
  data: {
    content: string
    method: 'text' | 'voice' | 'photo'
    photoData?: string
    timestamp: string
  }
  createdAt: number
  retryCount: number
  maxRetries: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
}

const WORKOUT_QUEUE_KEY = 'workout_offline_queue'
const MAX_RETRIES = 3
const SYNC_CHECK_INTERVAL = 30000

class WorkoutOfflineQueue {
  private queue: WorkoutQueueEntry[] = []
  private isProcessing = false
  private syncInterval: ReturnType<typeof setInterval> | null = null
  private listeners: Array<() => void> = []

  constructor() {
    this.load()
    if (typeof window !== 'undefined') {
      this.setupNetworkListeners()
      this.startSyncInterval()
    }
  }

  enqueue(entry: Pick<WorkoutQueueEntry, 'type' | 'data'>): string {
    const id = `wk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const queueEntry: WorkoutQueueEntry = {
      id,
      type: entry.type,
      data: entry.data,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      status: 'pending',
    }

    this.queue.push(queueEntry)
    this.save()
    this.notify()

    if (typeof window !== 'undefined' && navigator.onLine) {
      this.processQueue()
    }

    return id
  }

  remove(id: string): boolean {
    const idx = this.queue.findIndex(e => e.id === id)
    if (idx === -1) return false
    this.queue.splice(idx, 1)
    this.save()
    this.notify()
    return true
  }

  getAll(): WorkoutQueueEntry[] {
    return [...this.queue]
  }

  getPending(): WorkoutQueueEntry[] {
    return this.queue.filter(e => e.status === 'pending' || e.status === 'processing')
  }

  getStats() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(e => e.status === 'pending').length,
      processing: this.queue.filter(e => e.status === 'processing').length,
      completed: this.queue.filter(e => e.status === 'completed').length,
      failed: this.queue.filter(e => e.status === 'failed').length,
    }
  }

  async processQueue(): Promise<number> {
    if (this.isProcessing || (typeof window !== 'undefined' && !navigator.onLine)) {
      return 0
    }

    this.isProcessing = true
    let processedCount = 0

    try {
      const pending = this.queue.filter(
        e => e.status === 'pending' || (e.status === 'failed' && e.retryCount < e.maxRetries)
      )

      for (const entry of pending) {
        try {
          entry.status = 'processing'
          this.save()
          this.notify()

          await this.processEntry(entry)

          entry.status = 'completed'
          processedCount++
        } catch (err) {
          entry.retryCount++
          entry.error = err instanceof Error ? err.message : String(err)
          entry.status = entry.retryCount >= entry.maxRetries ? 'failed' : 'pending'
        }

        this.save()
        this.notify()
      }
    } finally {
      this.isProcessing = false
    }

    return processedCount
  }

  clearCompleted(): number {
    const before = this.queue.length
    this.queue = this.queue.filter(e => e.status !== 'completed')
    this.save()
    this.notify()
    return before - this.queue.length
  }

  clearAll(): void {
    this.queue = []
    this.save()
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.listeners = []
  }

  private async processEntry(entry: WorkoutQueueEntry): Promise<void> {
    if (entry.type === 'workout_log') {
      const response = await fetch('/api/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: entry.data.content,
          method: entry.data.method,
          timestamp: entry.data.timestamp,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Workout sync failed (${response.status})`)
      }
    } else if (entry.type === 'workout_parse') {
      const response = await fetch('/api/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: entry.data.content,
          method: entry.data.method,
          photoData: entry.data.photoData,
          timestamp: entry.data.timestamp,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Workout parse failed (${response.status})`)
      }
    }
  }

  private load(): void {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(WORKOUT_QUEUE_KEY)
      if (raw) {
        this.queue = JSON.parse(raw)
      }
    } catch {
      this.queue = []
    }
  }

  private save(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(WORKOUT_QUEUE_KEY, JSON.stringify(this.queue))
    } catch {
      // storage full or unavailable
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => {
      try { fn() } catch { /* ignore */ }
    })
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.processQueue()
    })
  }

  private startSyncInterval(): void {
    this.syncInterval = setInterval(() => {
      if (typeof window !== 'undefined' && navigator.onLine && !this.isProcessing) {
        const pending = this.queue.filter(e => e.status === 'pending').length
        if (pending > 0) {
          this.processQueue()
        }
      }
    }, SYNC_CHECK_INTERVAL)
  }
}

// Singleton
export const workoutOfflineQueue = new WorkoutOfflineQueue()

export function queueWorkoutLog(content: string, method: 'text' | 'voice' | 'photo' = 'text'): string {
  return workoutOfflineQueue.enqueue({
    type: 'workout_log',
    data: {
      content,
      method,
      timestamp: new Date().toISOString(),
    },
  })
}

export function queueWorkoutParse(content: string, method: 'text' | 'voice' | 'photo', photoData?: string): string {
  return workoutOfflineQueue.enqueue({
    type: 'workout_parse',
    data: {
      content,
      method,
      photoData,
      timestamp: new Date().toISOString(),
    },
  })
}
