/**
 * Offline queue management for food tracking operations
 * Implements Requirements 10.5 - queue operations when network is unavailable
 */

import React from 'react'

export interface QueuedOperation {
  id: string
  type: 'photo_upload' | 'meal_analysis' | 'meal_update' | 'target_update'
  data: any
  timestamp: number
  retryCount: number
  maxRetries: number
  priority: 'high' | 'medium' | 'low'
  userId?: string // Optional since we now use authenticated users
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
}

export interface QueueStats {
  totalOperations: number
  pendingOperations: number
  failedOperations: number
  completedOperations: number
  lastSyncAttempt?: number
  isOnline: boolean
}

const QUEUE_STORAGE_KEY = 'food_tracking_offline_queue'
const MAX_QUEUE_SIZE = 100
const DEFAULT_MAX_RETRIES = 3
const SYNC_INTERVAL = 30000 // 30 seconds

class OfflineQueueManager {
  private queue: QueuedOperation[] = []
  private isProcessing = false
  private syncInterval: NodeJS.Timeout | null = null
  private onlineStatusCallbacks: ((isOnline: boolean) => void)[] = []

  constructor() {
    this.loadQueue()
    this.setupNetworkListeners()
    this.startSyncInterval()
  }

  /**
   * Add operation to offline queue
   */
  enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>): string {
    const queuedOperation: QueuedOperation = {
      ...operation,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    }

    // Remove oldest operations if queue is full
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const completedOperations = this.queue.filter(op => op.status === 'completed')
      if (completedOperations.length > 0) {
        // Remove oldest completed operations
        completedOperations.sort((a, b) => a.timestamp - b.timestamp)
        const toRemove = completedOperations.slice(0, Math.ceil(MAX_QUEUE_SIZE * 0.2))
        this.queue = this.queue.filter(op => !toRemove.includes(op))
      }
    }

    this.queue.push(queuedOperation)
    this.saveQueue()

    console.log(`Operation ${queuedOperation.type} queued for offline processing:`, queuedOperation.id)

    // Try to process immediately if online
    if (typeof window !== 'undefined' && navigator.onLine) {
      this.processQueue()
    }

    return queuedOperation.id
  }

  /**
   * Remove operation from queue
   */
  dequeue(operationId: string): boolean {
    const index = this.queue.findIndex(op => op.id === operationId)
    if (index !== -1) {
      this.queue.splice(index, 1)
      this.saveQueue()
      return true
    }
    return false
  }

  /**
   * Get operation by ID
   */
  getOperation(operationId: string): QueuedOperation | null {
    return this.queue.find(op => op.id === operationId) || null
  }

  /**
   * Get all operations for a user
   */
  getUserOperations(userId: string): QueuedOperation[] {
    return this.queue.filter(op => op.userId === userId)
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const pending = this.queue.filter(op => op.status === 'pending').length
    const failed = this.queue.filter(op => op.status === 'failed').length
    const completed = this.queue.filter(op => op.status === 'completed').length

    return {
      totalOperations: this.queue.length,
      pendingOperations: pending,
      failedOperations: failed,
      completedOperations: completed,
      lastSyncAttempt: this.getLastSyncAttempt(),
      isOnline: typeof window !== 'undefined' ? navigator.onLine : true
    }
  }

  /**
   * Process all pending operations in queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || (typeof window !== 'undefined' && !navigator.onLine)) {
      return
    }

    this.isProcessing = true
    console.log('Processing offline queue...')

    try {
      // Get pending operations sorted by priority and timestamp
      const pendingOps = this.queue
        .filter(op => op.status === 'pending' || (op.status === 'failed' && op.retryCount < op.maxRetries))
        .sort((a, b) => {
          // Sort by priority first, then by timestamp
          const priorityOrder = { high: 0, medium: 1, low: 2 }
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
          return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp
        })

      for (const operation of pendingOps) {
        try {
          operation.status = 'processing'
          this.saveQueue()

          await this.processOperation(operation)

          operation.status = 'completed'
          console.log(`Operation ${operation.type} completed:`, operation.id)
        } catch (error) {
          operation.retryCount++
          operation.error = error instanceof Error ? error.message : String(error)

          if (operation.retryCount >= operation.maxRetries) {
            operation.status = 'failed'
            console.error(`Operation ${operation.type} failed permanently:`, operation.id, error)
          } else {
            operation.status = 'pending'
            console.warn(`Operation ${operation.type} failed, will retry:`, operation.id, error)
          }
        }

        this.saveQueue()
      }
    } finally {
      this.isProcessing = false
      this.setLastSyncAttempt(Date.now())
    }
  }

  /**
   * Clear completed operations from queue
   */
  clearCompleted(): number {
    const completedCount = this.queue.filter(op => op.status === 'completed').length
    this.queue = this.queue.filter(op => op.status !== 'completed')
    this.saveQueue()
    return completedCount
  }

  /**
   * Clear all operations from queue
   */
  clearAll(): void {
    this.queue = []
    this.saveQueue()
  }

  /**
   * Subscribe to online status changes
   */
  onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
    this.onlineStatusCallbacks.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.onlineStatusCallbacks.indexOf(callback)
      if (index !== -1) {
        this.onlineStatusCallbacks.splice(index, 1)
      }
    }
  }

  private async processOperation(operation: QueuedOperation): Promise<void> {
    switch (operation.type) {
      case 'photo_upload':
        await this.processPhotoUpload(operation)
        break
      case 'meal_analysis':
        await this.processMealAnalysis(operation)
        break
      case 'meal_update':
        await this.processMealUpdate(operation)
        break
      case 'target_update':
        await this.processTargetUpdate(operation)
        break
      default:
        throw new Error(`Unknown operation type: ${operation.type}`)
    }
  }

  private async processPhotoUpload(operation: QueuedOperation): Promise<void> {
    const { file, timestamp } = operation.data

    const formData = new FormData()
    formData.append('photo', file)
    formData.append('timestamp', timestamp)

    const response = await fetch('/api/meals/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Upload failed')
    }

    const result = await response.json()
    
    // Store result for retrieval
    operation.data.result = result
  }

  private async processMealAnalysis(operation: QueuedOperation): Promise<void> {
    const { photoUrl, mealId } = operation.data

    const response = await fetch('/api/meals/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ photoUrl, mealId })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Analysis failed')
    }

    const result = await response.json()
    operation.data.result = result
  }

  private async processMealUpdate(operation: QueuedOperation): Promise<void> {
    const { mealId, updates } = operation.data

    const response = await fetch(`/api/meals/${mealId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Update failed')
    }

    const result = await response.json()
    operation.data.result = result
  }

  private async processTargetUpdate(operation: QueuedOperation): Promise<void> {
    const { targets } = operation.data

    const response = await fetch('/api/targets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(targets)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Target update failed')
    }

    const result = await response.json()
    operation.data.result = result
  }

  private loadQueue(): void {
    // Only run on client-side to avoid SSR issues
    if (typeof window === 'undefined') return
    
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY)
      if (stored) {
        this.queue = JSON.parse(stored)
        console.log(`Loaded ${this.queue.length} operations from offline queue`)
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error)
      this.queue = []
    }
  }

  private saveQueue(): void {
    // Only run on client-side to avoid SSR issues
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue))
    } catch (error) {
      console.error('Failed to save offline queue:', error)
    }
  }

  private setupNetworkListeners(): void {
    // Only run on client-side to avoid SSR issues
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      console.log('Network connection restored, processing offline queue...')
      this.processQueue()
      this.notifyOnlineStatusChange(true)
    }

    const handleOffline = () => {
      console.log('Network connection lost, operations will be queued')
      this.notifyOnlineStatusChange(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  private startSyncInterval(): void {
    // Only run on client-side to avoid SSR issues
    if (typeof window === 'undefined') return
    
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isProcessing) {
        const pendingCount = this.queue.filter(op => op.status === 'pending').length
        if (pendingCount > 0) {
          console.log(`Periodic sync: ${pendingCount} pending operations`)
          this.processQueue()
        }
      }
    }, SYNC_INTERVAL)
  }

  private notifyOnlineStatusChange(isOnline: boolean): void {
    this.onlineStatusCallbacks.forEach(callback => {
      try {
        callback(isOnline)
      } catch (error) {
        console.error('Error in online status callback:', error)
      }
    })
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getLastSyncAttempt(): number | undefined {
    try {
      const stored = localStorage.getItem('food_tracking_last_sync')
      return stored ? parseInt(stored, 10) : undefined
    } catch {
      return undefined
    }
  }

  private setLastSyncAttempt(timestamp: number): void {
    try {
      localStorage.setItem('food_tracking_last_sync', timestamp.toString())
    } catch (error) {
      console.error('Failed to save last sync timestamp:', error)
    }
  }

  /**
   * Cleanup method for component unmounting
   */
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.onlineStatusCallbacks = []
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueueManager()

/**
 * Helper functions for common operations
 */

export function queuePhotoUpload(file: File, timestamp: string): string {
  return offlineQueue.enqueue({
    type: 'photo_upload',
    data: { file, timestamp },
    maxRetries: DEFAULT_MAX_RETRIES,
    priority: 'high'
  })
}

export function queueMealAnalysis(photoUrl: string, mealId: string): string {
  return offlineQueue.enqueue({
    type: 'meal_analysis',
    data: { photoUrl, mealId },
    maxRetries: DEFAULT_MAX_RETRIES,
    priority: 'high'
  })
}

export function queueMealUpdate(mealId: string, updates: any): string {
  return offlineQueue.enqueue({
    type: 'meal_update',
    data: { mealId, updates },
    maxRetries: DEFAULT_MAX_RETRIES,
    priority: 'medium'
  })
}

export function queueTargetUpdate(targets: any): string {
  return offlineQueue.enqueue({
    type: 'target_update',
    data: { targets },
    maxRetries: DEFAULT_MAX_RETRIES,
    priority: 'medium'
  })
}

/**
 * React hook for offline queue status
 */
export function useOfflineQueue() {
  const [stats, setStats] = React.useState<QueueStats>(offlineQueue.getStats())
  const [isOnline, setIsOnline] = React.useState(typeof window !== 'undefined' ? navigator.onLine : true)

  React.useEffect(() => {
    const updateStats = () => setStats(offlineQueue.getStats())
    
    const unsubscribe = offlineQueue.onOnlineStatusChange((online) => {
      setIsOnline(online)
      updateStats()
    })

    // Update stats periodically
    const interval = setInterval(updateStats, 5000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  return {
    stats,
    isOnline,
    processQueue: () => offlineQueue.processQueue(),
    clearCompleted: () => offlineQueue.clearCompleted(),
    getUserOperations: (userId: string) => offlineQueue.getUserOperations(userId)
  }
}