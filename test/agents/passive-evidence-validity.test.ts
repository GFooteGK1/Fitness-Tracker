import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/agents/chat-persistence', () => ({ fetchRecentChat: vi.fn().mockResolvedValue([]), fetchPendingUrgentInsights: vi.fn().mockResolvedValue([]) }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { buildPassiveContext, invalidatePassiveCache } from '@/app/lib/agents/context-builder'
import { buildNutritionistPrompt } from '@/app/lib/agents/prompts/nutritionist'
import { buildSociusPrompt } from '@/app/lib/agents/prompts/socius'

const now = '2026-09-18T12:00:00Z'
function database(overrides: Record<string, unknown> = {}) {
  const records: Record<string, unknown> = {
    whoop_tokens: { id: 'connection' },
    whoop_sync_status: { status: 'idle', last_sync_at: now, error_message: null },
    whoop_recovery: { date: '2026-09-18', recovery_score: 31 },
    whoop_cycles: { date: '2026-09-18', strain: 8 },
    daily_targets: null, ...overrides,
  }
  const from = vi.fn((table: string) => {
    const chain: any = {}
    for (const method of ['select', 'eq', 'gte', 'lt', 'is', 'order', 'limit']) chain[method] = vi.fn(() => chain)
    chain.single = vi.fn(async () => ({ data: typeof records[table] === 'function' ? (records[table] as () => unknown)() : records[table] ?? null, error: null }))
    chain.then = (resolve: any) => resolve({ data: [], error: null })
    return chain
  })
  vi.mocked(createServerClient).mockResolvedValue({ from } as any)
  return records
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); invalidatePassiveCache('owner') })
afterEach(() => vi.useRealTimers())

describe('passive source eligibility', () => {
  it('preserves current WHOOP observation dates without deriving an HRV trend', async () => {
    database()
    const context = await buildPassiveContext('owner')
    expect(context.today.latest_whoop_recovery).toBe(31)
    expect(context.today.latest_whoop_strain).toBe(8)
    expect(context.whoop_context).toEqual({ syncEligible: true, status: 'current', recoveryDate: '2026-09-18', strainDate: '2026-09-18', lastSyncAt: now })
    expect(context).not.toHaveProperty('hrv_trend')
  })
  it.each([
    { whoop_tokens: null },
    { whoop_sync_status: { status: 'syncing', last_sync_at: now } },
    { whoop_sync_status: { status: 'error', last_sync_at: now } },
    { whoop_sync_status: { status: 'idle', last_sync_at: '2026-09-17T11:59:59Z' } },
    { whoop_sync_status: { status: 'idle', last_sync_at: '2026-09-18T12:00:01Z' } },
    { whoop_sync_status: { status: 'idle', last_sync_at: now, error_message: 'Partial sync failed' } },
  ])('withholds disconnected, partial, stale or future sync: %j', async override => {
    database(override)
    const context = await buildPassiveContext('owner')
    expect(context.today.latest_whoop_recovery).toBeNull()
    expect(context.today.latest_whoop_strain).toBeNull()
    expect(context.whoop_context?.status).toBe('unavailable')
  })
  it.each(['syncing', 'changed-generation'])('withholds a sync changed during source reads: %s', async change => {
    let reads = 0
    database({ whoop_sync_status: () => ++reads === 1 ? { status: 'idle', last_sync_at: now }
      : { status: change === 'syncing' ? 'syncing' : 'idle', last_sync_at: change === 'syncing' ? now : '2026-09-18T11:59:59Z' } })
    const context = await buildPassiveContext('owner')
    expect(context.whoop_context?.syncEligible).toBe(false)
    expect(context.today.latest_whoop_recovery).toBeNull()
  })
  it('withholds an old metric even after a fresh sync and refreshes connection on cache hits', async () => {
    const records = database({ whoop_recovery: { date: '2026-09-17', recovery_score: 99 } })
    expect((await buildPassiveContext('owner')).today.latest_whoop_recovery).toBeNull()
    records.whoop_tokens = null
    expect((await buildPassiveContext('owner')).today.latest_whoop_strain).toBeNull()
  })
  it('does not reuse yesterday or another timezone as current context', async () => {
    database()
    vi.setSystemTime(new Date('2026-09-18T23:59:59Z'))
    expect((await buildPassiveContext('owner')).current_date).toBe('2026-09-18')
    vi.setSystemTime(new Date('2026-09-19T00:00:01Z'))
    expect((await buildPassiveContext('owner')).current_date).toBe('2026-09-19')
    expect((await buildPassiveContext('owner', -360)).current_date).toBe('2026-09-18')
  })
  it('retains explicit zero targets and never replaces missing or invalid values with defaults', async () => {
    const records = database({ daily_targets: { target_protein: 0, target_carbs: 200, target_fat: 65, target_calories: 2000, tolerance_pct: 0 } })
    const confirmed = await buildPassiveContext('owner')
    expect(confirmed.targets_confirmed).toBe(true)
    expect(confirmed.targets.protein).toBe(0)
    records.daily_targets = { target_protein: null, target_carbs: 200, target_fat: 65, target_calories: 2000 }
    invalidatePassiveCache('owner')
    const unknown = await buildPassiveContext('owner')
    expect(unknown.targets_confirmed).toBe(false)
    expect(unknown.targets).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0, tolerance_pct: 0 })
  })
  it('presents unknown targets in both model prompts and no invented adherence', async () => {
    database()
    const passive = await buildPassiveContext('owner')
    const nutrition = buildNutritionistPrompt({ ...passive, todays_meals: [], portion_defaults: {}, user_portion_history: null })
    const socius = buildSociusPrompt({ ...passive, recent_insights: [], thirty_day_summary: { workout_count: 0, workout_types: {}, avg_rpe: null, total_meals: 0, avg_daily_protein: 0, avg_daily_calories: 0, pr_count: 0, whoop_avg_recovery: null, whoop_avg_sleep_score: null }, data_availability: { has_workouts: false, has_meals: false, has_whoop: false, has_targets: false, workout_days: 0, meal_days: 0, whoop_days: 0 } } as any)
    for (const prompt of [nutrition, socius]) {
      expect(prompt).toContain('no confirmed targets')
      expect(prompt).not.toContain('Prorated Target:')
      expect(prompt).not.toContain('Status: behind')
      expect(prompt).not.toContain('Adherence: P:')
    }
    expect(nutrition).not.toContain('Protein: 150g')
  })
})
