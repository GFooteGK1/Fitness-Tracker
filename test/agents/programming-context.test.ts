import { describe, expect, it } from 'vitest'
import { summarizeDays } from '@/app/lib/agents/programming-context'
import type { DailyProgrammingContext } from '@/app/lib/agents/types'

function day(overrides: Partial<DailyProgrammingContext>): DailyProgrammingContext {
  return {
    date: '2026-05-31',
    workout_count: 0,
    workout_summary: null,
    strength_blocks: 0,
    metcon_blocks: 0,
    cardio_blocks: 0,
    avg_rpe: null,
    total_protein: 0,
    total_carbs: 0,
    total_fat: 0,
    total_calories: 0,
    protein_pct_target: null,
    calorie_pct_target: null,
    recovery_score: null,
    hrv_rmssd_milli: null,
    resting_heart_rate: null,
    sleep_score: null,
    sleep_efficiency_pct: null,
    strain: null,
    ...overrides
  }
}

describe('summarizeDays', () => {
  it('counts domain availability and averages only present metrics', () => {
    const summary = summarizeDays([
      day({
        workout_count: 1,
        total_calories: 2200,
        recovery_score: 70,
        sleep_score: 80,
        strain: 12,
        protein_pct_target: 100,
        calorie_pct_target: 95
      }),
      day({
        date: '2026-05-30',
        workout_count: 0,
        total_calories: 1900,
        recovery_score: 50,
        sleep_score: 60,
        strain: 8,
        protein_pct_target: 80,
        calorie_pct_target: 85
      }),
      day({ date: '2026-05-29' })
    ])

    expect(summary.day_count).toBe(3)
    expect(summary.workout_days).toBe(1)
    expect(summary.nutrition_days).toBe(2)
    expect(summary.recovery_days).toBe(2)
    expect(summary.avg_recovery).toBe(60)
    expect(summary.avg_sleep_score).toBe(70)
    expect(summary.avg_strain).toBe(10)
    expect(summary.avg_protein_pct_target).toBe(90)
    expect(summary.avg_calorie_pct_target).toBe(90)
  })
})
