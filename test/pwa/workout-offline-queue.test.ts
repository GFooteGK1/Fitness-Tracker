import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
})()

// Mock navigator
const navigatorOnLineMock = { onLine: true }

// Mock fetch
const fetchMock = vi.fn()

// Mock window with events
const eventListeners: Record<string, Array<(...args: any[]) => void>> = {}

beforeEach(() => {
  localStorageMock.clear()
  vi.stubGlobal('localStorage', localStorageMock)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', navigatorOnLineMock)
  vi.stubGlobal('window', {
    addEventListener: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!eventListeners[event]) eventListeners[event] = []
      eventListeners[event].push(handler)
    }),
    removeEventListener: vi.fn(),
  })
  navigatorOnLineMock.onLine = true
  fetchMock.mockReset()

  // Clear event listeners
  Object.keys(eventListeners).forEach(key => delete eventListeners[key])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('WorkoutOfflineQueue', () => {
  async function getQueue() {
    const mod = await import('../../app/lib/workout-offline-queue')
    return mod
  }

  it('enqueues a workout entry with correct defaults', async () => {
    const { workoutOfflineQueue } = await getQueue()

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    const id = workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: '5x5 back squat 225lb', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    expect(id).toMatch(/^wk_/)
    const all = workoutOfflineQueue.getAll()
    expect(all.length).toBeGreaterThanOrEqual(1)
    const entry = all.find(e => e.id === id)
    expect(entry).toBeDefined()
    expect(entry!.type).toBe('workout_log')
    expect(entry!.data.content).toBe('5x5 back squat 225lb')
    expect(entry!.retryCount).toBe(0)

    workoutOfflineQueue.destroy()
  })

  it('persists queue to localStorage', async () => {
    const { workoutOfflineQueue } = await getQueue()

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Run 5k', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'workout_offline_queue',
      expect.any(String)
    )

    // Find the most recent setItem call for the workout queue
    const calls = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === 'workout_offline_queue'
    )
    const lastCall = calls[calls.length - 1]
    const stored = JSON.parse(lastCall[1])
    const runEntry = stored.find((e: any) => e.data.content === 'Run 5k')
    expect(runEntry).toBeDefined()

    workoutOfflineQueue.destroy()
  })

  it('processes queue entries when online', async () => {
    navigatorOnLineMock.onLine = true
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })

    const { workoutOfflineQueue } = await getQueue()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Deadlift 315x3', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100))

    const stats = workoutOfflineQueue.getStats()
    // It should have attempted processing since we're online
    expect(fetchMock).toHaveBeenCalled()

    workoutOfflineQueue.destroy()
  })

  it('marks entry as failed after max retries', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    const id = workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Bench press 185x5', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    // Simulate going online with failing API
    navigatorOnLineMock.onLine = true
    fetchMock.mockRejectedValue(new Error('Network error'))

    // Process multiple times to exhaust retries
    await workoutOfflineQueue.processQueue()
    await workoutOfflineQueue.processQueue()
    await workoutOfflineQueue.processQueue()

    const entry = workoutOfflineQueue.getAll().find(e => e.id === id)
    expect(entry!.status).toBe('failed')
    expect(entry!.retryCount).toBe(3)

    workoutOfflineQueue.destroy()
  })

  it('does not process when offline', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Squats 225x5', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    const processed = await workoutOfflineQueue.processQueue()
    expect(processed).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()

    workoutOfflineQueue.destroy()
  })

  it('getStats returns correct counts', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'OHP 135x5', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })
    workoutOfflineQueue.enqueue({
      type: 'workout_parse',
      data: { content: 'Pull ups 3x10', method: 'voice', timestamp: '2026-04-12T10:00:00Z' },
    })

    const stats = workoutOfflineQueue.getStats()
    expect(stats.total).toBe(2)
    expect(stats.pending).toBe(2)
    expect(stats.processing).toBe(0)
    expect(stats.completed).toBe(0)
    expect(stats.failed).toBe(0)

    workoutOfflineQueue.destroy()
  })

  it('clearCompleted removes only completed entries', async () => {
    navigatorOnLineMock.onLine = true
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })

    const { workoutOfflineQueue } = await getQueue()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Deadlift 405x1', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Add another entry that stays pending
    navigatorOnLineMock.onLine = false
    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Rows 185x8', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    const cleared = workoutOfflineQueue.clearCompleted()
    const remaining = workoutOfflineQueue.getAll()
    // After clearing completed, only pending ones remain
    const pendingEntries = remaining.filter(e => e.status === 'pending')
    expect(pendingEntries.length).toBeGreaterThanOrEqual(1)

    workoutOfflineQueue.destroy()
  })

  it('remove deletes entry by id', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    const id = workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Curls 30x12', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    expect(workoutOfflineQueue.remove(id)).toBe(true)
    expect(workoutOfflineQueue.getAll().find(e => e.id === id)).toBeUndefined()

    workoutOfflineQueue.destroy()
  })

  it('remove returns false for non-existent id', async () => {
    const { workoutOfflineQueue } = await getQueue()

    expect(workoutOfflineQueue.remove('nonexistent_id')).toBe(false)

    workoutOfflineQueue.destroy()
  })

  it('subscribe notifies on changes', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    const listener = vi.fn()
    const unsubscribe = workoutOfflineQueue.subscribe(listener)

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Lunges 3x12', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    expect(listener).toHaveBeenCalled()

    unsubscribe()
    listener.mockClear()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Dips 3x15', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    expect(listener).not.toHaveBeenCalled()

    workoutOfflineQueue.destroy()
  })

  it('clearAll removes everything', async () => {
    navigatorOnLineMock.onLine = false

    const { workoutOfflineQueue } = await getQueue()

    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Squats', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })
    workoutOfflineQueue.enqueue({
      type: 'workout_log',
      data: { content: 'Bench', method: 'text', timestamp: '2026-04-12T10:00:00Z' },
    })

    workoutOfflineQueue.clearAll()
    expect(workoutOfflineQueue.getAll().length).toBe(0)
    expect(workoutOfflineQueue.getStats().total).toBe(0)

    workoutOfflineQueue.destroy()
  })
})

describe('queueWorkoutLog helper', () => {
  it('creates an entry with correct structure', async () => {
    navigatorOnLineMock.onLine = false

    const { queueWorkoutLog, workoutOfflineQueue } = await import('../../app/lib/workout-offline-queue')

    const id = queueWorkoutLog('5x5 squat 225', 'text')
    expect(id).toMatch(/^wk_/)

    const entry = workoutOfflineQueue.getAll().find(e => e.id === id)
    expect(entry).toBeDefined()
    expect(entry!.type).toBe('workout_log')
    expect(entry!.data.content).toBe('5x5 squat 225')
    expect(entry!.data.method).toBe('text')
    expect(entry!.data.timestamp).toBeTruthy()

    workoutOfflineQueue.destroy()
  })
})

describe('queueWorkoutParse helper', () => {
  it('creates a parse entry with photo data', async () => {
    navigatorOnLineMock.onLine = false

    const { queueWorkoutParse, workoutOfflineQueue } = await import('../../app/lib/workout-offline-queue')

    const id = queueWorkoutParse('workout photo', 'photo', 'data:image/png;base64,abc123')
    const entry = workoutOfflineQueue.getAll().find(e => e.id === id)
    expect(entry).toBeDefined()
    expect(entry!.type).toBe('workout_parse')
    expect(entry!.data.photoData).toBe('data:image/png;base64,abc123')

    workoutOfflineQueue.destroy()
  })
})
