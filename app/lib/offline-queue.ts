/** Account-owned transient photo queue. Queued work never contributes to canonical totals. */
import React from 'react'
import { createClient } from './auth/supabase'
import { useAuth } from './auth/AuthContext'
import { fetchWithTimeout } from './client/fetch-with-timeout'
import { hasConfirmedCapture, recommendationOrigin, refreshAfterCanonicalSave } from './client/recommendations'
import { markCaptureCertainty } from './client/capture-uncertainty'

export interface QueuedOperation {
  id: string
  type: 'photo_upload' | 'meal_analysis' | 'meal_update' | 'target_update'
  data: any
  timestamp: number
  retryCount: number
  maxRetries: number
  priority: 'high' | 'medium' | 'low'
  userId?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  attempted?: boolean
}
export interface QueueStats {
  totalOperations: number; pendingOperations: number; failedOperations: number; completedOperations: number
  lastSyncAttempt?: number; isOnline: boolean; hasLegacyUnowned?: boolean
}
const DB_NAME = 'socius-transient-capture'
const STORE = 'photo-queue'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Offline photo storage is unavailable. Keep the photo and retry online.')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function persist(operation: QueuedOperation): Promise<void> {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(operation)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  }) } finally { db.close() }
}
export class OfflineQueueManager {
  private queue: QueuedOperation[] = []
  private isProcessing = false
  private owner: string | null = null
  private ready: Promise<void>
  private loadUnavailable = false
  private callbacks = new Set<(online: boolean) => void>()
  private lastSyncAttempt?: number
  constructor() { this.ready = typeof window === 'undefined' ? Promise.resolve() : this.load() }
  setOwner(userId: string | null) { this.owner = userId }
  private async load() {
    try {
      const db = await database()
      this.queue = await new Promise<QueuedOperation[]>((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      db.close()
      // Old localStorage File objects have no recoverable bytes. Preserve the original records;
      // migrate only a visible warning, never silently resubmit an unowned or empty photo.
      const legacy = JSON.parse(localStorage.getItem('food_tracking_offline_queue') ?? '[]')
      if (Array.isArray(legacy)) for (const operation of legacy) {
        if (!operation?.id || this.queue.some(item => item.id === operation.id)) continue
        const migrated = { ...operation, data: { timestamp: operation.data?.timestamp }, status: 'failed' as const,
          retryCount: 3, maxRetries: 3, error: 'Older queued photo cannot be recovered. Reselect the original photo and review history before saving.' }
        await persist(migrated)
        this.queue.push(migrated)
      }
      for (const operation of this.queue) {
        if (operation.status === 'processing') { operation.status = 'pending'; operation.attempted = true }
        if (operation.userId && (operation.attempted || operation.retryCount > 0)) markCaptureCertainty(operation.userId, `photo:${operation.id}`, operation.status === 'completed')
      }
    } catch { this.loadUnavailable = true }
  }
  async captureNeedsReconciliation(userId: string): Promise<boolean> {
    await this.ready
    return this.loadUnavailable || this.queue.some(item => item.userId === userId && item.status !== 'completed' && (item.attempted || item.retryCount > 0))
  }
  async enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<string> {
    await this.ready
    if (!operation.userId) throw new Error('Sign in before queueing a photo.')
    if (operation.type !== 'photo_upload' || !(operation.data.file instanceof Blob)) throw new Error('Reselect the photo. This operation cannot be queued safely.')
    if (this.queue.filter(item => item.userId === operation.userId && item.status !== 'completed').length >= 100) throw new Error('Resolve pending photos before queueing more.')
    const queued: QueuedOperation = { ...operation, id: crypto.randomUUID(), timestamp: Date.now(), retryCount: 0, status: 'pending' }
    await persist(queued)
    this.queue.push(queued)
    this.notify()
    return queued.id
  }
  getOperation(id: string) { return this.queue.find(item => item.id === id && item.userId === this.owner) ?? null }
  getUserOperations(userId: string) { return userId === this.owner ? this.queue.filter(item => item.userId === userId) : [] }
  getStats(): QueueStats {
    const own = this.queue.filter(item => item.userId === this.owner && !!this.owner)
    return { hasLegacyUnowned: this.queue.some(item => !item.userId && item.status === 'failed'), totalOperations: own.length, pendingOperations: own.filter(item => ['pending','processing'].includes(item.status)).length,
      failedOperations: own.filter(item => item.status === 'failed').length, completedOperations: own.filter(item => item.status === 'completed').length,
      lastSyncAttempt: this.lastSyncAttempt, isOnline: typeof navigator === 'undefined' || navigator.onLine }
  }
  async processQueue(): Promise<void> {
    await this.ready
    if (this.isProcessing || !this.owner || !navigator.onLine) return
    this.isProcessing = true
    const owner = this.owner
    try {
      for (const operation of this.queue.filter(item => item.userId === owner && item.status === 'pending')) {
        const { data: { user } } = await createClient().auth.getUser()
        if (this.owner !== owner || user?.id !== owner) break
        if (operation.type !== 'photo_upload' || !(operation.data.file instanceof Blob)) {
          operation.status = 'failed'; operation.error = 'Reselect the original photo; stored bytes are unavailable.'
          await persist(operation); continue
        }
        try {
          operation.status = 'processing'
          operation.attempted = true
          await persist(operation)
          markCaptureCertainty(owner, `photo:${operation.id}`, false)
          const form = new FormData()
          form.set('photo', operation.data.file)
          form.set('timestamp', operation.data.timestamp)
          form.set('requestId', operation.id)
          form.set('expectedUserId', owner)
          if (operation.data.recommendationId) form.set('recommendationId', operation.data.recommendationId)
          const response = await fetchWithTimeout('/api/meals/upload', { method: 'POST', body: form }, 120_000)
          const result = await response.json()
          if (hasConfirmedCapture(result, false)) refreshAfterCanonicalSave(owner)
          if (!response.ok || (!result.mealId && !result.receipt?.entityId && !result.receipts?.length) || result.state === 'save_unconfirmed' || result.receiptBundle?.state === 'save_unconfirmed') throw new Error(result.error ?? 'Save unconfirmed. Retry this queued entry.')
          operation.data = { timestamp: operation.data.timestamp, result } // discard bytes only after canonical save is confirmed
          operation.status = 'completed'
          operation.error = undefined
          markCaptureCertainty(owner, `photo:${operation.id}`, true)
          if (!hasConfirmedCapture(result, false)) refreshAfterCanonicalSave(owner)
        } catch (error) {
          operation.retryCount++
          operation.status = operation.retryCount >= operation.maxRetries ? 'failed' : 'pending'
          operation.error = error instanceof Error ? error.message : 'Save unconfirmed'
        }
        await persist(operation)
        this.notify()
      }
    } finally { this.isProcessing = false; this.lastSyncAttempt = Date.now(); this.notify() }
  }
  async retry(id: string) {
    await this.ready
    const operation = this.getOperation(id)
    if (!operation || !(operation.data.file instanceof Blob)) throw new Error('Reselect the original photo and review history before saving.')
    operation.status = 'pending'; operation.retryCount = 0
    await persist(operation)
    await this.processQueue()
  }
  async dequeue(id: string): Promise<boolean> {
    await this.ready
    const operation = this.getOperation(id)
    if (!operation || operation.status === 'processing') return false
    if (operation.status !== 'completed' && (operation.attempted || operation.retryCount > 0)) {
      const owner = this.owner
      const { data: { user } } = await createClient().auth.getUser()
      if (!owner || user?.id !== owner) throw new Error('Restore the original account before resolving this photo.')
      const response = await fetchWithTimeout(`/api/logging/requests/${encodeURIComponent(`photo:${operation.id}`)}?expectedUserId=${encodeURIComponent(owner)}`, { method: 'GET' }, 15_000)
      const result = await response.json()
      if (this.owner !== owner || !response.ok) throw new Error('This photo save remains unconfirmed. Retry its original request before discarding it.')
      if (result.state === 'saved' && result.receipts?.length) {
        operation.status = 'completed'; operation.data = { timestamp: operation.data.timestamp, result }; operation.error = undefined
        await persist(operation); this.notify()
        markCaptureCertainty(owner, `photo:${operation.id}`, true)
        refreshAfterCanonicalSave(owner)
        return false // Keep its recovered receipt visible; a later clear-completed action may remove device metadata.
      }
      if (result.retryAllowed !== true || result.receipts?.length) throw new Error('Resolve or explicitly cancel each pending item before discarding this photo.')
      markCaptureCertainty(owner, `photo:${operation.id}`, true)
    }
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close(); this.queue = this.queue.filter(item => item.id !== id); this.notify(); return true
  }
  async clearCompleted() { for (const item of this.getUserOperations(this.owner ?? '').filter(item => item.status === 'completed')) await this.dequeue(item.id) }
  onOnlineStatusChange(callback: (online: boolean) => void) { this.callbacks.add(callback); return () => { this.callbacks.delete(callback) } }
  private notify() { this.callbacks.forEach(callback => callback(navigator.onLine)) }
}
export const offlineQueue = new OfflineQueueManager()
export function queuePhotoUpload(file: File, timestamp: string, userId?: string): Promise<string> {
  return offlineQueue.enqueue({ type: 'photo_upload', userId, data: { file, timestamp, recommendationId: recommendationOrigin() }, maxRetries: 3, priority: 'high' })
}
export function useOfflineQueue() {
  const { user } = useAuth()
  const [stats, setStats] = React.useState<QueueStats>(offlineQueue.getStats())
  React.useEffect(() => {
    offlineQueue.setOwner(user?.id ?? null)
    const update = () => setStats(offlineQueue.getStats())
    const online = () => { update(); void offlineQueue.processQueue() }
    const unsubscribe = offlineQueue.onOnlineStatusChange(update)
    window.addEventListener('online', online); window.addEventListener('offline', update)
    const interval = setInterval(online, 30_000)
    online()
    return () => { unsubscribe(); clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('offline', update); offlineQueue.setOwner(null) }
  }, [user?.id])
  return { stats, isOnline: stats.isOnline, processQueue: () => offlineQueue.processQueue(), clearCompleted: () => offlineQueue.clearCompleted(),
    getUserOperations: (userId: string) => offlineQueue.getUserOperations(userId) }
}
