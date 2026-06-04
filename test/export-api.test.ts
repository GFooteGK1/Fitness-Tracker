/**
 * Tests for the /api/export route handler.
 *
 * These tests import the route handler directly and exercise it with mocked
 * Supabase clients, validating auth, parameter validation, and response headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock Supabase ---

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockGte = vi.fn()
const mockLte = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()

let queryCalls: Record<string, { gte: unknown[][]; lte: unknown[][] }> = {}

function tableCalls(table: string) {
  queryCalls[table] ??= { gte: [], lte: [] }
  return queryCalls[table]
}

function chainMock(table: string, terminal: () => any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn((...args: unknown[]) => {
      tableCalls(table).gte.push(args)
      return chain
    }),
    lte: vi.fn((...args: unknown[]) => {
      tableCalls(table).lte.push(args)
      return chain
    }),
    order: vi.fn(() => terminal()),
    single: vi.fn(() => terminal()),
  }
  return chain
}

let mockUser: any = { id: 'user-123', email: 'test@example.com' }
let mockAuthError: any = null
let mockWorkoutsData: any[] = []
let mockMealsData: any[] = []
let mockProfileData: any = { display_name: 'Test User', email: 'test@example.com' }

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(async () => {
    const workoutsChain = chainMock('workouts', () => Promise.resolve({ data: mockWorkoutsData, error: null }))
    const mealsChain = chainMock('meals', () => Promise.resolve({ data: mockMealsData, error: null }))
    const profileChain = chainMock('user_profiles', () => Promise.resolve({ data: mockProfileData, error: null }))

    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: mockUser },
          error: mockAuthError,
        })),
      },
      from: vi.fn((table: string) => {
        if (table === 'workouts') return workoutsChain
        if (table === 'meals') return mealsChain
        if (table === 'user_profiles') return profileChain
        return profileChain
      }),
    }
  }),
}))

// Mock jsPDF to avoid needing canvas in test environment
vi.mock('jspdf', () => {
  class MockJsPDF {
    internal = {
      pageSize: { getWidth: () => 297, getHeight: () => 210 },
    }
    lastAutoTable = { finalY: 100 }
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFontSize() {}
    text() {}
    addPage() {}
    getNumberOfPages() { return 1 }
    setPage() {}
    output() { return new Uint8Array([37, 80, 68, 70]) } // %PDF
  }
  return { default: MockJsPDF }
})

vi.mock('jspdf-autotable', () => ({
  default: (doc: any) => {
    doc.lastAutoTable = { finalY: 100 }
  },
}))

import { GET } from '@/app/api/export/route'

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/export')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return new Request(url.toString())
}

describe('GET /api/export', () => {
  beforeEach(() => {
    mockUser = { id: 'user-123', email: 'test@example.com' }
    mockAuthError = null
    mockWorkoutsData = []
    mockMealsData = []
    mockProfileData = { display_name: 'Test User', email: 'test@example.com' }
    queryCalls = {}
  })

  // --- Auth Tests ---

  it('should return 401 when user is not authenticated', async () => {
    mockUser = null
    const res = await GET(makeRequest({ format: 'csv', type: 'workouts', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('should return 401 when auth error occurs', async () => {
    mockAuthError = new Error('Token expired')
    const res = await GET(makeRequest({ format: 'csv', type: 'workouts', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(401)
  })

  // --- Validation Tests ---

  it('should return 400 for invalid format', async () => {
    const res = await GET(makeRequest({ format: 'xlsx', type: 'workouts', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('format')
  })

  it('should return 400 for invalid type', async () => {
    const res = await GET(makeRequest({ format: 'csv', type: 'steps', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('type')
  })

  it('should return 400 when dates are missing', async () => {
    const res = await GET(makeRequest({ format: 'csv', type: 'workouts' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('date')
  })

  it('should return 400 for invalid date format', async () => {
    const res = await GET(makeRequest({ format: 'csv', type: 'workouts', start: '04/01/2026', end: '04/10/2026' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('YYYY-MM-DD')
  })

  it('should return 400 for invalid timezone offset', async () => {
    const res = await GET(makeRequest({ format: 'csv', type: 'meals', start: '2026-04-01', end: '2026-04-10', tzOffset: '900' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('timezone offset')
  })

  // --- CSV Response Tests ---

  it('should return CSV with correct content type for workouts', async () => {
    mockWorkoutsData = [
      {
        id: '1',
        workout_date: '2026-04-01',
        input_text: 'Squat 5x5',
        blocks: [],
        notes: '',
        total_duration_min: 30,
      },
    ]
    const res = await GET(makeRequest({ format: 'csv', type: 'workouts', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toContain('.csv')

    const text = await res.text()
    expect(text).toContain('Date,Exercise')
    expect(text).toContain('Squat 5x5')
  })

  it('should return CSV with correct content type for meals', async () => {
    mockMealsData = [
      {
        id: '1',
        meal_timestamp: '2026-04-01T12:00:00Z',
        items: [{ food: 'Chicken', calories: 300, protein: 45, carbs: 0, fat: 8 }],
        total_protein: 45,
        total_carbs: 0,
        total_fat: 8,
        total_calories: 300,
        photo_url: '',
      },
    ]
    const res = await GET(makeRequest({ format: 'csv', type: 'meals', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')

    const text = await res.text()
    expect(text).toContain('Meal Name')
    expect(text).toContain('Chicken')
  })

  it('should query meals using local date UTC boundaries from tzOffset', async () => {
    const res = await GET(makeRequest({ format: 'csv', type: 'meals', start: '2026-04-01', end: '2026-04-01', tzOffset: '360' }))
    expect(res.status).toBe(200)

    expect(queryCalls.meals.gte).toContainEqual(['meal_timestamp', '2026-04-01T06:00:00.000Z'])
    expect(queryCalls.meals.lte).toContainEqual(['meal_timestamp', '2026-04-02T05:59:59.999Z'])
  })

  it('should return combined CSV for type "all"', async () => {
    mockWorkoutsData = [{ id: '1', workout_date: '2026-04-01', input_text: 'Run', blocks: [], notes: '', total_duration_min: 20 }]
    mockMealsData = [{ id: '1', meal_timestamp: '2026-04-01T08:00:00Z', items: [{ food: 'Oats', calories: 300, protein: 10, carbs: 50, fat: 5 }], total_protein: 10, total_carbs: 50, total_fat: 5, total_calories: 300, photo_url: '' }]

    const res = await GET(makeRequest({ format: 'csv', type: 'all', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('--- WORKOUTS ---')
    expect(text).toContain('--- MEALS ---')
  })

  // --- PDF Response Tests ---

  it('should return PDF with correct content type', async () => {
    const res = await GET(makeRequest({ format: 'pdf', type: 'workouts', start: '2026-04-01', end: '2026-04-10' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('.pdf')
  })

  it('should include date range in PDF filename', async () => {
    const res = await GET(makeRequest({ format: 'pdf', type: 'meals', start: '2026-03-01', end: '2026-03-31' }))
    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition') || ''
    expect(disposition).toContain('2026-03-01')
    expect(disposition).toContain('2026-03-31')
    expect(disposition).toContain('meals')
  })
})
