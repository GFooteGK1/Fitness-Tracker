import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/fitness-insights/route'

const now = '2026-09-18T12:00:00Z'
function database({ connected = true, date = '2026-09-18', syncStates = [{ status: 'idle', last_sync_at: now }], mealRows = [{ id: 'meal', total_protein: 30, total_calories: 400 }] as any[], workoutRows = [{ id: 'workout', workout_date: '2026-09-18', rpe: 9, tags: [] }] as any[] } = {}) {
  let syncRead = 0
  const rows: Record<string, any[]> = {
    daily_fitness_summary: [{ date: '2026-09-18', total_protein: 30, total_calories: 400 }],
    workouts: workoutRows,
    meals: mealRows,
    whoop_recovery: [{ date, recovery_score: 20 }],
    whoop_sleep: [{ date, sleep_performance_percentage: 90 }],
    whoop_cycles: [1, 2, 3].map(() => ({ date, strain: 18 })),
  }
  const from = vi.fn((table: string) => {
    const chain: any = {}
    for (const method of ['select', 'eq', 'gte', 'lte', 'order']) chain[method] = vi.fn(() => chain)
    chain.single = async () => ({ data: table === 'whoop_tokens' ? connected ? { id: 'token' } : null : syncStates[Math.min(syncRead++, syncStates.length - 1)], error: null })
    chain.then = (resolve: any) => resolve({ data: rows[table] ?? [], error: null })
    return chain
  })
  vi.mocked(createServerClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) } } as any)
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); vi.stubEnv('RECOMMENDATIONS_ENABLED', 'false') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
async function response() { return (await GET(new Request('http://localhost/api/fitness-insights?tzOffset=0'))).json() }

describe('legacy fitness insights source gate', () => {
  it('retires fabricated body mass and partial meal calorie claims even with the new rollout off', async () => {
    database()
    const result = await response()
    expect(result.insights.some((insight: any) => insight.type === 'nutrition_performance' || insight.type === 'nutrition_strain' || insight.type === 'recovery_nutrition')).toBe(false)
    expect(result.insights.some((insight: any) => insight.type === 'recovery_training')).toBe(true)
    expect(result.insights.find((insight: any) => insight.type === 'meal_timing').description).toContain('0 of 1 logged workouts')
    expect(result.insights.find((insight: any) => insight.type === 'meal_timing').description).toContain('Logging coverage is unknown')
    expect(JSON.stringify(result)).not.toContain('Aim for 20-30g protein')
  })
  it('counts distinct linked logged workouts, without treating unlinked meals as evidence of intake timing', async () => {
    database({ mealRows: [
      { id: 'a', meal_timing: 'PRE_WORKOUT', workout_id: 'workout' },
      { id: 'b', meal_timing: 'pre_workout', workout_id: 'workout' },
      { id: 'c', meal_timing: 'PRE_WORKOUT', workout_id: 'outside-result' },
      { id: 'd', meal_timing: 'PRE_WORKOUT', workout_id: null },
    ] })
    const result = await response()
    const timing = result.insights.find((insight: any) => insight.type === 'meal_timing')
    expect(timing.description).toContain('1 of 1 logged workouts')
    expect(timing.description).toContain('does not establish what or when you ate')
    expect(timing.recommendations).toEqual(['Review linked meal and workout records if you want to clarify the logged timing.'])
  })
  it('reports stored low energy without inferring a nutrition cause or prescription', async () => {
    database({ workoutRows: [1, 2, 3].map(id => ({ id: `workout-${id}`, workout_date: '2026-09-18', energy_level: 2, tags: [] })) })
    const result = await response()
    const energy = result.insights.find((insight: any) => insight.type === 'energy_optimization')
    expect(energy.description).toContain('2.0/5')
    expect(energy.description).toContain('cause is not established')
    expect(energy.recommendations).toEqual(['Review workout and energy records for accuracy before drawing conclusions.'])
  })
  it.each([
    { connected: false },
    { date: '2026-09-17' },
    { syncStates: [{ status: 'idle', last_sync_at: '2026-09-16T12:00:00Z' }] },
    { syncStates: [{ status: 'idle', last_sync_at: now }, { status: 'syncing', last_sync_at: now }] },
    { syncStates: [{ status: 'idle', last_sync_at: now }, { status: 'idle', last_sync_at: '2026-09-18T11:00:00Z' }] },
  ])('does not call stale, disconnected, or mixed-sync measurements current: %j', async options => {
    database(options)
    const result = await response()
    expect(result.insights.some((insight: any) => insight.type === 'recovery_training')).toBe(false)
    expect(JSON.stringify(result)).not.toContain("Today's recovery score is 20%")
  })
})
