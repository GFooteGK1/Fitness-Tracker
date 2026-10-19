import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/coach/context/route'
import { contextClient, contextNow, contextOwner, contextRows } from '../fixtures/coaching-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

describe('GET /api/coach/context uses existing cookie authentication', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(contextNow) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
  it('returns private no-store context without writing or synthesizing', async () => {
    const { db, writes } = contextClient()
    vi.mocked(createServerClient).mockResolvedValue(db as never)
    const response = await GET(new Request('http://localhost/api/coach/context?tzOffset=0'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(await response.json()).toMatchObject({ context: { purpose: 'today_training', authority: 'factual_context_only' } })
    expect(writes).not.toHaveBeenCalled()
  })
  it('requires auth before parsing or reading domain data', async () => {
    const { db } = contextClient(undefined, { authenticated: false })
    vi.mocked(createServerClient).mockResolvedValue(db as never)
    const response = await GET(new Request('http://localhost/api/coach/context?user_id=foreign'))
    expect(response.status).toBe(401); expect(db.from).not.toHaveBeenCalled()
  })
  it('includes owned recent work with the shared planning flag disabled', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false')
    const rows = contextRows()
    rows.workouts = [{ ...workSnapshot().workouts[0], user_id: contextOwner, workout_date: '2026-10-18',
      created_at: contextNow, updated_at: contextNow }]
    const { db, writes } = contextClient(rows)
    vi.mocked(createServerClient).mockResolvedValue(db as never)
    const response = await GET(new Request('http://localhost/api/coach/context?tzOffset=0&days=7'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ context: { performedWork: { status: 'available',
      records: [{ workoutId: 'work-1', origin: 'athlete_reported' }] } } })
    expect(writes).not.toHaveBeenCalled()
  })
  it('rejects selectors rather than accepting apparent identity overrides', async () => {
    const { db } = contextClient(); vi.mocked(createServerClient).mockResolvedValue(db as never)
    expect((await GET(new Request('http://localhost/api/coach/context?tzOffset=0&userId=foreign'))).status).toBe(400)
    expect(db.from).not.toHaveBeenCalled()
  })
  it('does not disclose unexpected provider errors', async () => {
    vi.mocked(createServerClient).mockRejectedValueOnce(new Error('private credential'))
    const response = await GET(new Request('http://localhost/api/coach/context?tzOffset=0'))
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('private credential')
  })
})
