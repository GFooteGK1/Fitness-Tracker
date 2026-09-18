import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { POST } from '@/app/api/check-prs/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

// These legacy writer tests model the pre-migration schema, not an empty installed schema.
const legacySchema = () => query({ data: null, error: { code: '42703' } })

function query(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'upsert', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve?: (value: unknown) => unknown) =>
    Promise.resolve(resolve ? resolve(result) : result))
  return chain
}

describe('POST /api/check-prs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads current audited projections without recalculating from stale client blocks', async () => {
    const schema = query({ data: [], error: null })
    const workout = query({ data: { id: 'workout-1', capture_revision: 3 }, error: null })
    const records = query({ data: [{ exercise: 'Squat', pr_type: 'weight', value: 100, previous_value: 95 }], error: null })
    const from = vi.fn().mockReturnValueOnce(schema).mockReturnValueOnce(workout).mockReturnValueOnce(records)
    vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) }, from } as never)
    const response = await POST(new Request('http://localhost/api/check-prs', { method: 'POST',
      body: JSON.stringify({ workoutId: 'workout-1', blocks: [{ block_type: 'STRENGTH', segments: [{ events: [{ movement_name: 'Squat', performed: { reps: 1, load: { value: 999, unit: 'lb' } } }] }] }] }) }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ captureRevision: 3, prs: [{ newRecord: 100, previousBest: 95, isPR: true }] })
    expect(workout.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(records.eq).toHaveBeenCalledWith('workout_id', 'workout-1')
    for (const chain of [schema, workout, records]) expect(chain.upsert).not.toHaveBeenCalled()
  })

  it('uses the workout-level uniqueness key when storing detected records', async () => {
    const history = query({ data: [], error: null })
    const workouts = query({ data: [], error: null })
    const write = query({ error: null })
    const from = vi.fn()
      .mockReturnValueOnce(legacySchema())
      .mockReturnValueOnce(history)
      .mockReturnValueOnce(workouts)
      .mockReturnValueOnce(write)

    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    } as never)

    const response = await POST(new Request('http://localhost/api/check-prs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutId: 'workout-1',
        blocks: [{
          block_type: 'STRENGTH',
          segments: [{
            rounds: 1,
            events: Array.from({ length: 3 }, () => ({
              movement_name: 'Back Squat',
              performed: { reps: 3, load: { value: 285, unit: 'lb' } },
            })),
          }],
        }],
      }),
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.prs).toEqual([])
    expect(body.baselinesRecorded).toBeGreaterThan(0)
    expect(write.upsert).toHaveBeenCalledWith(
      expect.any(Array),
      {
        onConflict: 'user_id,workout_id,exercise,pr_type',
        ignoreDuplicates: true,
      },
    )
  })

  it('compares session volume with aggregated historical session volume', async () => {
    const history = query({ data: [], error: null })
    const workouts = query({
      data: [{
        blocks: [
          {
            block_type: 'STRENGTH',
            segments: [{
              rounds: 1,
              events: [{
                movement_name: 'Deadlift',
                performed: { reps: 5, load: { value: 200, unit: 'lb' } },
              }],
            }],
          },
          {
            block_type: 'STRENGTH',
            segments: [{
              rounds: 1,
              events: [{
                movement_name: 'Deadlift',
                performed: { reps: 5, load: { value: 200, unit: 'lb' } },
              }],
            }],
          },
        ],
      }],
      error: null,
    })
    const write = query({ error: null })
    const from = vi.fn()
      .mockReturnValueOnce(legacySchema())
      .mockReturnValueOnce(history)
      .mockReturnValueOnce(workouts)
      .mockReturnValueOnce(write)

    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    } as never)

    const response = await POST(new Request('http://localhost/api/check-prs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutId: 'workout-current',
        blocks: [
          {
            block_type: 'STRENGTH',
            segments: [{
              rounds: 1,
              events: [{
                movement_name: 'Deadlift',
                performed: { reps: 5, load: { value: 200, unit: 'lb' } },
              }],
            }],
          },
          {
            block_type: 'STRENGTH',
            segments: [{
              rounds: 1,
              events: [{
                movement_name: 'Deadlift',
                performed: { reps: 5, load: { value: 200, unit: 'lb' } },
              }],
            }],
          },
        ],
      }),
    }))

    expect(response.status).toBe(200)
    expect((await response.json()).prs.filter(
      (pr: { prType: string }) => pr.prType === 'volume',
    )).toHaveLength(0)
  })
})
