import { describe, expect, it, vi } from 'vitest'
import { createDashboardNarrativeStore } from '@/app/lib/dashboard-narrative-store'

function resolvedChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'gte', 'lte']) {
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
    const meals = resolvedChain({ data: [], error: null })
    ;(meals.order as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{
        meal_timestamp: '2026-07-27T12:00:00.000Z',
        total_protein: '142.00', total_carbs: '210.00', total_fat: '61.00',
        total_calories: '1957.00',
      }],
      error: null,
    })
    const targets = resolvedChain({
      data: { target_protein: '180.00', target_calories: '2350.00' },
      error: null,
    })

    const from = vi.fn()
      .mockReturnValueOnce(template)
      .mockReturnValueOnce(defaultTemplate)
      .mockReturnValueOnce(prs)
      .mockReturnValueOnce(meals)
      .mockReturnValueOnce(targets)
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
    const facts = await store.getFacts('user-1', '2026-07-27', 0)

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

  it('groups late UTC meals on the athlete local calendar day', async () => {
    const prs = resolvedChain({ data: [], error: null })
    ;(prs.limit as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null })

    const meals = resolvedChain({ data: [], error: null })
    ;(meals.order as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          meal_timestamp: '2026-07-27T22:47:00.000Z',
          total_protein: '30.00', total_carbs: '40.00', total_fat: '10.00',
          total_calories: '300.00',
        },
        {
          meal_timestamp: '2026-07-28T01:09:00.000Z',
          total_protein: '20.00', total_carbs: '10.00', total_fat: '5.00',
          total_calories: '200.00',
        },
      ],
      error: null,
    })

    const targets = resolvedChain({
      data: { target_protein: '100.00', target_calories: '1000.00' },
      error: null,
    })

    const from = vi.fn((table: string) => {
      if (table === 'personal_records') return prs
      if (table === 'meals') return meals
      if (table === 'daily_targets') return targets
      throw new Error(`Unexpected table ${table}`)
    })
    const supabase = {
      from,
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            date: '2026-07-28', workout_count: 0, strength_blocks: 0,
            metcon_blocks: 0, cardio_blocks: 0, avg_rpe: null, meal_count: 1,
            total_protein: '20.00', total_carbs: '10.00', total_fat: '5.00',
            total_calories: '200.00', protein_pct_target: '20.0',
            calorie_pct_target: '20.0', recovery_score: 80, sleep_score: 90,
            strain: '4.00',
          },
          {
            date: '2026-07-27', workout_count: 1, strength_blocks: 1,
            metcon_blocks: 0, cardio_blocks: 0, avg_rpe: '7.00', meal_count: 1,
            total_protein: '30.00', total_carbs: '40.00', total_fat: '10.00',
            total_calories: '300.00', protein_pct_target: '30.0',
            calorie_pct_target: '30.0', recovery_score: null, sleep_score: null,
            strain: null,
          },
        ],
        error: null,
      }),
    }
    const store = createDashboardNarrativeStore(supabase as never)

    const facts = await store.getFacts('user-1', '2026-07-28', 300)

    expect(facts.days.find(day => day.date === '2026-07-28')).toEqual(
      expect.objectContaining({ mealCount: 0, totalCalories: 0, recoveryScore: 80 }),
    )
    expect(facts.days.find(day => day.date === '2026-07-27')).toEqual(
      expect.objectContaining({
        mealCount: 2,
        totalProtein: 50,
        totalCalories: 500,
        proteinPctTarget: 50,
        caloriePctTarget: 50,
      }),
    )
  })

  it('uses one deterministic best PR fact per workout and exercise type', async () => {
    const prs = resolvedChain({ data: [], error: null })
    ;(prs.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: '5', workout_id: 'workout-1', exercise: 'Back Squat',
          pr_type: 'weight', value: '285.00', achieved_at: '2026-07-28T12:00:00Z',
        },
        {
          id: '4', workout_id: 'workout-1', exercise: 'Back Squat',
          pr_type: 'weight', value: '275.00', achieved_at: '2026-07-28T12:00:00Z',
        },
        {
          id: '3', workout_id: 'workout-1', exercise: 'Back Squat',
          pr_type: 'weight', value: '285.00', achieved_at: '2026-07-28T12:00:00Z',
        },
      ],
      error: null,
    })
    const meals = resolvedChain({ data: [], error: null })
    ;(meals.order as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null })
    const targets = resolvedChain({ data: null, error: null })
    const from = vi.fn((table: string) => {
      if (table === 'personal_records') return prs
      if (table === 'meals') return meals
      if (table === 'daily_targets') return targets
      throw new Error(`Unexpected table ${table}`)
    })
    const supabase = {
      from,
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const store = createDashboardNarrativeStore(supabase as never)

    const facts = await store.getFacts('user-1', '2026-07-28', 300)

    expect(facts.personalRecords).toEqual([
      expect.objectContaining({ exercise: 'Back Squat', prType: 'weight', value: 285 }),
    ])
    expect(prs.order).toHaveBeenNthCalledWith(1, 'achieved_at', { ascending: false })
    expect(prs.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
  })
})
