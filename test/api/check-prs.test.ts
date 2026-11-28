import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { POST } from '@/app/api/check-prs/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

function query(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'in', 'upsert', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve?: (value: unknown) => unknown) =>
    Promise.resolve(resolve ? resolve(result) : result))
  return chain
}

function mockSupabase(from: ReturnType<typeof vi.fn>, userId: string | null = 'user-1') {
  vi.mocked(createServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    from,
  } as never)
}

function request(body: unknown) {
  return new Request('http://localhost/api/check-prs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/check-prs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads saved rep-max projections and ignores stale client blocks', async () => {
    const workout = query({ data: { id: 'workout-1', capture_revision: 3 }, error: null })
    const records = query({
      data: [
        { exercise: 'Back Squat', pr_type: '3rm', value: '285', previous_value: '275' },
        { exercise: 'Bench Press', pr_type: '5rm', value: '225', previous_value: null },
      ],
      error: null,
    })
    const from = vi.fn().mockReturnValueOnce(workout).mockReturnValueOnce(records)
    mockSupabase(from)

    const response = await POST(request({
      workoutId: 'workout-1',
      blocks: [{
        block_type: 'STRENGTH',
        segments: [{ events: [{
          movement_name: 'Back Squat',
          performed: { reps: 3, load: { value: 999, unit: 'lb' } },
        }] }],
      }],
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      captureRevision: 3,
      projectionsStatus: 'supported_reported_quantities_only',
      baselinesRecorded: 1,
    })
    expect(body.prs).toHaveLength(1)
    expect(body.prs[0]).toMatchObject({
      exercise: 'Back Squat', prType: '3rm', newRecord: 285, previousBest: 275, isPR: true,
    })
    expect(from.mock.calls).toEqual([['workouts'], ['personal_records']])
    expect(workout.eq).toHaveBeenCalledWith('id', 'workout-1')
    expect(workout.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(workout.maybeSingle).toHaveBeenCalledOnce()
    expect(records.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(records.eq).toHaveBeenCalledWith('workout_id', 'workout-1')
    expect(records.in).toHaveBeenCalledWith('pr_type', ['1rm', '3rm', '5rm'])
    expect(records.upsert).not.toHaveBeenCalled()
  })

  it('accepts a saved workout ID without client blocks', async () => {
    const workout = query({ data: { id: 'workout-1', capture_revision: 1 }, error: null })
    const records = query({ data: [], error: null })
    const from = vi.fn().mockReturnValueOnce(workout).mockReturnValueOnce(records)
    mockSupabase(from)

    const response = await POST(request({ workoutId: 'workout-1' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ prs: [], baselinesRecorded: 0 })
  })

  it('returns 401 before querying when authentication fails', async () => {
    const from = vi.fn()
    mockSupabase(from, null)

    const response = await POST(request({ workoutId: 'workout-1' }))

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '  ', 42])('rejects an invalid workout ID %j', async (workoutId) => {
    const from = vi.fn()
    mockSupabase(from)

    const response = await POST(request({ workoutId }))

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    ['the owned workout is missing', { data: null, error: null }],
    ['the capture revision column is missing', { data: null, error: { code: '42703' } }],
  ])('cannot read projections when %s', async (_reason, workoutResult) => {
    const workout = query(workoutResult)
    const from = vi.fn().mockReturnValueOnce(workout)
    mockSupabase(from)

    const response = await POST(request({ workoutId: 'workout-1', blocks: [] }))

    expect(response.status).toBe(404)
    expect(from.mock.calls).toEqual([['workouts']])
  })

  it('returns 503 when the saved projections cannot be read', async () => {
    const workout = query({ data: { id: 'workout-1', capture_revision: 1 }, error: null })
    const records = query({ data: null, error: { code: '42P01' } })
    const from = vi.fn().mockReturnValueOnce(workout).mockReturnValueOnce(records)
    mockSupabase(from)

    const response = await POST(request({ workoutId: 'workout-1' }))

    expect(response.status).toBe(503)
    expect(records.upsert).not.toHaveBeenCalled()
  })
})
