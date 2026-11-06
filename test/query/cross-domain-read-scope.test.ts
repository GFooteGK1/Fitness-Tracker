import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/llm/client', () => ({ complete: vi.fn() }))

import { POST } from '@/app/api/query/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'

const owner = 'synthetic-query-owner'
const workout = { workout_date: '2026-11-04', input_text: 'Synthetic squat session', primary_score: '5 reps',
  blocks: [{ block_type: 'STRENGTH', segments: [{ exercise: 'Synthetic squat', sets: [{ reps: 5, load: 100 }] }] }],
  rpe: 7, tags: ['strength'] }
const pr = { benchmark_name: 'Synthetic benchmark', date: '2026-11-04', score_value: 5, score_display: '5 reps', rx_status: 'rx' }
const meal = { meal_timestamp: '2026-11-04T12:00:00.000Z',
  items: [{ food: 'Synthetic meal', portion: '1 serving', protein: 30, carbs: 40, fat: 10, calories: 370 }],
  total_protein: '30', total_carbs: '40', total_fat: '10', total_calories: '370', meal_timing: 'LUNCH' }
const targets = { target_protein: '150', target_carbs: '200', target_fat: '60', target_calories: '1940' }

function database(populated: boolean) {
  const queries: Array<{ table: string; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>; lte: ReturnType<typeof vi.fn> }> = []
  const rows: Record<string, unknown[]> = populated ? {
    workouts: [workout], benchmark_prs: [pr], meals: [meal], daily_targets: [targets],
  } : {}
  const from = vi.fn((table: string) => {
    let single = false
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const gte = vi.fn().mockReturnThis()
    const lte = vi.fn().mockReturnThis()
    queries.push({ table, select, eq, gte, lte })
    const query = {
      select, eq, gte, lte,
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: () => { single = true; return query },
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: single ? rows[table]?.[0] ?? null : rows[table] ?? [], error: null,
      }),
    }
    return query
  })
  const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) }
  return { db: { auth, from }, queries }
}

describe('legacy query reads only the data consumed by its response contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'))
    vi.mocked(complete).mockResolvedValue({ text: 'Synthetic answer' } as Awaited<ReturnType<typeof complete>>)
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('rejects unauthenticated callers before any source read or model call', async () => {
    const { db } = database(true)
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    vi.mocked(createServerClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof createServerClient>>)
    const response = await POST(new Request('http://localhost/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'How do my meals affect my workout?' }),
    }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(db.from).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it.each([
    { intent: 'WORKOUT_ONLY', question: 'Show my workout history', populated: true },
    { intent: 'WORKOUT_ONLY', question: 'Show my workout history', populated: false },
    { intent: 'NUTRITION_ONLY', question: 'Show my meals', populated: true },
    { intent: 'NUTRITION_ONLY', question: 'Show my meals', populated: false },
    { intent: 'CROSS_DOMAIN', question: 'How do my meals affect my workout?', populated: true },
    { intent: 'CROSS_DOMAIN', question: 'How do my meals affect my workout?', populated: false },
  ])('preserves $intent responses without discarded reads (populated=$populated)', async ({ intent, question, populated }) => {
    const { db, queries } = database(populated)
    vi.mocked(createServerClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof createServerClient>>)
    const response = await POST(new Request('http://localhost/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, tzOffset: 0 }),
    }))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ success: true, metadata: {
      intent, dataFetched: intent === 'CROSS_DOMAIN'
        ? { workouts: populated ? 1 : 0, meals: populated ? 1 : 0, prs: populated ? 1 : 0 }
        : intent === 'NUTRITION_ONLY' ? { meals: populated ? 1 : 0 }
          : { workouts: populated ? 1 : 0, prs: populated ? 1 : 0 },
    } })
    if (populated) {
      expect(result.answer).toBe('Synthetic answer')
      expect(complete).toHaveBeenCalledTimes(1)
      const input = vi.mocked(complete).mock.calls[0][0].messages[0].content
      expect(typeof input).toBe('string')
      const context = JSON.parse((input as string).split('\nData:\n')[1].split('\n\nAnalyze the data')[0])
      const workoutContext = { workouts: [{ date: workout.workout_date, description: workout.input_text,
        score: workout.primary_score, rpe: workout.rpe, tags: workout.tags }], benchmark_prs: [pr] }
      const nutritionContext = { meals: [{ meal_timestamp: meal.meal_timestamp, meal_name: 'Synthetic meal',
          total_protein: 30, total_carbs: 40, total_fat: 10, total_calories: 370, meal_timing: 'LUNCH' }],
          daily_targets: { target_protein: 150, target_carbs: 200, target_fat: 60, target_calories: 1940 },
          daily_summaries: [{ date: '2026-11-04', total_protein: 30, total_carbs: 40, total_fat: 10, total_calories: 370, meal_count: 1 }] }
      expect(context).toEqual(intent === 'CROSS_DOMAIN'
        ? { workout_data: workoutContext, nutrition_data: nutritionContext }
        : intent === 'NUTRITION_ONLY' ? nutritionContext : workoutContext)
    } else {
      expect(result.answer).toEqual(expect.any(String))
      expect(complete).not.toHaveBeenCalled()
    }
    // The public response and model input above need only these owner-scoped sources.
    expect(queries.map(query => query.table).sort()).toEqual(intent === 'CROSS_DOMAIN'
      ? ['benchmark_prs', 'daily_targets', 'meals', 'workouts']
      : intent === 'NUTRITION_ONLY' ? ['daily_targets', 'meals'] : ['benchmark_prs', 'workouts'])
    for (const query of queries) expect(query.eq).toHaveBeenCalledWith('user_id', owner)
    if (intent !== 'NUTRITION_ONLY') {
      const workoutQuery = queries.find(query => query.table === 'workouts')!
      expect(workoutQuery.select).toHaveBeenCalledWith('workout_date, input_text, primary_score, rpe, tags')
      expect(workoutQuery.gte).toHaveBeenCalledWith('workout_date', '2026-05-09')
      expect(workoutQuery.lte).toHaveBeenCalledWith('workout_date', '2026-11-05')
    }
    if (intent !== 'WORKOUT_ONLY') {
      const mealQuery = queries.find(query => query.table === 'meals')!
      expect(mealQuery.gte).toHaveBeenCalledWith('meal_timestamp', expect.stringMatching(/^2026-05-09T/))
      expect(mealQuery.lte).toHaveBeenCalledWith('meal_timestamp', '2026-11-05T12:00:00.000Z')
    }
  })
})
