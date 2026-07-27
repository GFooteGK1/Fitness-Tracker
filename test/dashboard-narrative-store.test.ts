import { describe, expect, it, vi } from 'vitest'
import { createDashboardNarrativeStore } from '@/app/lib/dashboard-narrative-store'

function resolvedChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return chain
}

describe('dashboard narrative Supabase store', () => {
  it('coerces Postgres decimal strings into deterministic numeric facts', async () => {
    const template = resolvedChain({ data: null, error: null })
    const defaultTemplate = resolvedChain({ data: null, error: null })
    const prs = resolvedChain({
      data: [{
        exercise: 'Back Squat', pr_type: 'weight', value: '315.00',
        achieved_at: '2026-07-26T12:00:00Z',
      }],
      error: null,
    })
    ;(prs.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{
        exercise: 'Back Squat', pr_type: 'weight', value: '315.00',
        achieved_at: '2026-07-26T12:00:00Z',
      }],
      error: null,
    })

    const from = vi.fn()
      .mockReturnValueOnce(template)
      .mockReturnValueOnce(defaultTemplate)
      .mockReturnValueOnce(prs)
    const supabase = {
      from,
      rpc: vi.fn().mockResolvedValue({
        data: [{
          date: '2026-07-27', workout_count: 1, strength_blocks: 2,
          metcon_blocks: 0, cardio_blocks: 0, avg_rpe: '7.50', meal_count: 3,
          total_protein: '142.00', total_carbs: '210.00', total_fat: '61.00',
          total_calories: '1957.00', protein_pct_target: '79.0',
          calorie_pct_target: '83.0', recovery_score: 72, sleep_score: 88,
          strain: '9.40',
        }],
        error: null,
      }),
    }
    const store = createDashboardNarrativeStore(supabase as never)

    expect(await store.getTemplate('user-1')).toEqual(expect.objectContaining({ version: 1 }))
    const facts = await store.getFacts('user-1', '2026-07-27')

    expect(facts.days[0]).toEqual(expect.objectContaining({
      avgRpe: 7.5,
      totalProtein: 142,
      totalCalories: 1957,
      strain: 9.4,
    }))
    expect(facts.personalRecords[0]).toEqual(expect.objectContaining({
      value: 315,
      achievedAt: '2026-07-26',
    }))
  })
})
