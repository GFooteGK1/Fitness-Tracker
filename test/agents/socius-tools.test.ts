import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeToolCall } from '@/app/lib/agents/tools/executor'

function createDailyContextSupabaseMock() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn()
  }

  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({
    data: [
      {
        date: '2026-05-30',
        workout_count: 1,
        workout_summary: 'Strength + short metcon',
        strength_blocks: 1,
        metcon_blocks: 1,
        cardio_blocks: 0,
        avg_rpe: 8,
        total_protein: 155,
        total_carbs: 240,
        total_fat: 70,
        total_calories: 2210,
        protein_pct_target: 1.03,
        calorie_pct_target: 1.01,
        recovery_score: 72,
        hrv_rmssd_milli: 58,
        resting_heart_rate: 48,
        sleep_score: 84,
        sleep_efficiency_pct: 91,
        strain: 13.4
      }
    ],
    error: null
  })

  return {
    supabase: {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient,
    query
  }
}

describe('Socius retrieval tools', () => {
  it('returns compact programming readiness context from daily_agent_context', async () => {
    const { supabase, query } = createDailyContextSupabaseMock()

    const result = await executeToolCall(
      'get_programming_readiness',
      { days: 14 },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('daily_agent_context')
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-123')
    expect(query.limit).toHaveBeenCalledWith(14)
    expect(result.data?.context).toMatchObject({
      summary: {
        day_count: 1,
        workout_days: 1,
        nutrition_days: 1,
        recovery_days: 1,
        avg_recovery: 72,
        avg_sleep_score: 84,
        avg_strain: 13.4
      },
      days: [
        expect.objectContaining({
          date: '2026-05-30',
          workout_summary: 'Strength + short metcon',
          total_protein: 155,
          recovery_score: 72
        })
      ]
    })
  })

  it('bounds requested days to the 90-day context cap', async () => {
    const { supabase, query } = createDailyContextSupabaseMock()

    const result = await executeToolCall(
      'get_programming_readiness',
      { days: 365 },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(query.limit).toHaveBeenCalledWith(90)
  })
})
