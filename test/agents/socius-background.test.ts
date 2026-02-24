/**
 * Unit Tests for Socius Background Pattern Detection
 *
 * Tests all 10 pattern checkers as pure functions against SociusContext.
 *
 * Validates: Requirements 4.2, 4.3, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SociusContext, ThirtyDaySummary, DataAvailability, MacroTargets, UserDailyState, UserWeeklyState } from '@/app/lib/agents/types'
import {
  checkCaloricDeficit,
  checkOvertraining,
  checkNutritionPerformance,
  checkRecoveryVolume,
  checkProteinRecovery,
  checkSleepPerformance,
  checkHRVTrend,
  checkStrainNutrition,
  checkHydration,
  checkConsistentProgression,
  type DetectedPattern,
} from '@/app/lib/agents/socius-background'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeDefaultTargets(overrides?: Partial<MacroTargets>): MacroTargets {
  return {
    protein: 150,
    carbs: 200,
    fat: 65,
    calories: 2000,
    tolerance_pct: 10,
    ...overrides,
  }
}

function makeDefaultToday(overrides?: Partial<UserDailyState>): UserDailyState {
  return {
    meals_logged: 2,
    macros_consumed: { protein: 100, carbs: 150, fat: 50, calories: 1500 },
    macros_remaining: { protein: 50, carbs: 50, fat: 15, calories: 500 },
    workouts_logged: 1,
    latest_whoop_recovery: 60,
    latest_whoop_strain: 12,
    ...overrides,
  }
}

function makeDefaultWeek(): UserWeeklyState {
  return {
    days_elapsed: 3,
    actual: { protein: 400, carbs: 500, fat: 180, calories: 5500 },
    prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
    adherence_pct: { protein: 88, carbs: 83, fat: 92, calories: 91 },
    overall_status: 'on-track',
  }
}

function makeDefaultSummary(overrides?: Partial<ThirtyDaySummary>): ThirtyDaySummary {
  return {
    workout_count: 12,
    workout_types: { metcon: 5, strength: 4, cardio: 2, emom: 1 },
    avg_rpe: 7.5,
    total_meals: 60,
    avg_daily_protein: 140,
    avg_daily_calories: 1900,
    pr_count: 2,
    whoop_avg_recovery: 65,
    whoop_avg_sleep_score: 72,
    ...overrides,
  }
}

function makeDefaultAvailability(overrides?: Partial<DataAvailability>): DataAvailability {
  return {
    has_workouts: true,
    has_meals: true,
    has_whoop: true,
    has_targets: true,
    workout_days: 12,
    meal_days: 20,
    ...overrides,
  }
}

function makeContext(overrides?: Partial<SociusContext>): SociusContext {
  return {
    user_id: 'test-user',
    targets: makeDefaultTargets(),
    today: makeDefaultToday(),
    week: makeDefaultWeek(),
    recent_chat: [],
    pending_insights: [],
    current_time: new Date().toISOString(),
    day_of_week: 'Monday',
    has_whoop: true,
    thirty_day_summary: makeDefaultSummary(),
    recent_insights: [],
    data_availability: makeDefaultAvailability(),
    ...overrides,
  }
}

// ─── checkCaloricDeficit ─────────────────────────────────────────────

describe('checkCaloricDeficit', () => {
  it('returns urgent when strain >= 14 and calories < 1500', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 16,
        macros_consumed: { protein: 80, carbs: 100, fat: 30, calories: 1200 },
      }),
    })
    const result = checkCaloricDeficit(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('CAL_DEF')
    expect(result!.priority).toBe('urgent')
    expect(result!.confidence).toBe(0.8)
    expect(result!.data_context).toEqual({ strain: 16, calories: 1200 })
  })

  it('returns null when strain is null', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_strain: null }),
    })
    expect(checkCaloricDeficit(ctx)).toBeNull()
  })

  it('returns null when calories are 0 (no meals logged)', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 16,
        macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      }),
    })
    expect(checkCaloricDeficit(ctx)).toBeNull()
  })

  it('returns null when strain < 14', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 10,
        macros_consumed: { protein: 50, carbs: 80, fat: 20, calories: 800 },
      }),
    })
    expect(checkCaloricDeficit(ctx)).toBeNull()
  })

  it('returns null when calories >= 1500', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 18,
        macros_consumed: { protein: 120, carbs: 180, fat: 60, calories: 1600 },
      }),
    })
    expect(checkCaloricDeficit(ctx)).toBeNull()
  })

  it('returns urgent at exact boundary (strain=14, calories=1499)', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 14,
        macros_consumed: { protein: 80, carbs: 100, fat: 30, calories: 1499 },
      }),
    })
    const result = checkCaloricDeficit(ctx)
    expect(result).not.toBeNull()
    expect(result!.priority).toBe('urgent')
  })
})

// ─── checkOvertraining ───────────────────────────────────────────────

describe('checkOvertraining', () => {
  it('returns notable when workout_count >= 5 and avg recovery < 34', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 8, whoop_avg_recovery: 28 }),
    })
    const result = checkOvertraining(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('OVER_TRN')
    expect(result!.priority).toBe('notable')
    expect(result!.confidence).toBeGreaterThan(0.6)
  })

  it('returns null when avg recovery is null', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 10, whoop_avg_recovery: null }),
    })
    expect(checkOvertraining(ctx)).toBeNull()
  })

  it('returns null when workout_count < 5', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 3, whoop_avg_recovery: 25 }),
    })
    expect(checkOvertraining(ctx)).toBeNull()
  })

  it('returns null when recovery >= 34', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 10, whoop_avg_recovery: 50 }),
    })
    expect(checkOvertraining(ctx)).toBeNull()
  })

  it('confidence increases with more workouts', () => {
    const ctx5 = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 5, whoop_avg_recovery: 25 }),
    })
    const ctx15 = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 15, whoop_avg_recovery: 25 }),
    })
    const r5 = checkOvertraining(ctx5)!
    const r15 = checkOvertraining(ctx15)!
    expect(r15.confidence).toBeGreaterThan(r5.confidence)
  })

  it('confidence is capped at 0.9', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 30, whoop_avg_recovery: 20 }),
    })
    const result = checkOvertraining(ctx)!
    expect(result.confidence).toBeLessThanOrEqual(0.9)
  })
})

// ─── checkNutritionPerformance ───────────────────────────────────────

describe('checkNutritionPerformance', () => {
  it('returns informational when adherence >= 90% and workouts >= 8', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ protein: 150, calories: 2000 }),
      thirty_day_summary: makeDefaultSummary({
        workout_count: 10,
        avg_daily_protein: 145,
        avg_daily_calories: 1950,
      }),
    })
    const result = checkNutritionPerformance(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('NUT_PERF')
    expect(result!.priority).toBe('informational')
    expect(result!.confidence).toBe(0.7)
  })

  it('returns null when workout_count < 8', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 5 }),
    })
    expect(checkNutritionPerformance(ctx)).toBeNull()
  })

  it('returns null when adherence < 90%', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ protein: 200, calories: 2500 }),
      thirty_day_summary: makeDefaultSummary({
        workout_count: 10,
        avg_daily_protein: 100,
        avg_daily_calories: 1500,
      }),
    })
    expect(checkNutritionPerformance(ctx)).toBeNull()
  })

  it('returns null when targets are 0', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ protein: 0, calories: 0 }),
    })
    expect(checkNutritionPerformance(ctx)).toBeNull()
  })
})

// ─── checkRecoveryVolume ─────────────────────────────────────────────

describe('checkRecoveryVolume', () => {
  it('returns notable when recovery < 34 and workout_count >= 5', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_recovery: 25 }),
      thirty_day_summary: makeDefaultSummary({ workout_count: 8 }),
    })
    const result = checkRecoveryVolume(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('REC_VOL')
    expect(result!.priority).toBe('notable')
    expect(result!.confidence).toBe(0.75)
  })

  it('returns null when recovery is null', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_recovery: null }),
    })
    expect(checkRecoveryVolume(ctx)).toBeNull()
  })

  it('returns null when recovery >= 34', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_recovery: 50 }),
    })
    expect(checkRecoveryVolume(ctx)).toBeNull()
  })

  it('returns null when workout_count < 5', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_recovery: 20 }),
      thirty_day_summary: makeDefaultSummary({ workout_count: 3 }),
    })
    expect(checkRecoveryVolume(ctx)).toBeNull()
  })
})

// ─── checkProteinRecovery ────────────────────────────────────────────

describe('checkProteinRecovery', () => {
  it('returns notable when recovery < 50 and protein < 80% target', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ protein: 150 }),
      today: makeDefaultToday({
        latest_whoop_recovery: 40,
        macros_consumed: { protein: 90, carbs: 100, fat: 40, calories: 1200 },
      }),
    })
    const result = checkProteinRecovery(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('PRO_REC')
    expect(result!.priority).toBe('notable')
    expect(result!.confidence).toBe(0.7)
  })

  it('returns null when recovery is null', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_recovery: null }),
    })
    expect(checkProteinRecovery(ctx)).toBeNull()
  })

  it('returns null when recovery >= 50', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_recovery: 55,
        macros_consumed: { protein: 90, carbs: 100, fat: 40, calories: 1200 },
      }),
    })
    expect(checkProteinRecovery(ctx)).toBeNull()
  })

  it('returns null when protein >= 80% target', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ protein: 150 }),
      today: makeDefaultToday({
        latest_whoop_recovery: 30,
        macros_consumed: { protein: 130, carbs: 100, fat: 40, calories: 1400 },
      }),
    })
    expect(checkProteinRecovery(ctx)).toBeNull()
  })

  it('returns null when protein consumed is 0', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_recovery: 30,
        macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      }),
    })
    expect(checkProteinRecovery(ctx)).toBeNull()
  })
})

// ─── checkSleepPerformance ───────────────────────────────────────────

describe('checkSleepPerformance', () => {
  it('returns notable when avg sleep score < 60 and workout logged today', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ workouts_logged: 1 }),
      thirty_day_summary: makeDefaultSummary({ whoop_avg_sleep_score: 45 }),
    })
    const result = checkSleepPerformance(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('SLEEP_PERF')
    expect(result!.priority).toBe('notable')
  })

  it('returns null when sleep score is null', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ whoop_avg_sleep_score: null }),
    })
    expect(checkSleepPerformance(ctx)).toBeNull()
  })

  it('returns null when no workouts logged today', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ workouts_logged: 0 }),
      thirty_day_summary: makeDefaultSummary({ whoop_avg_sleep_score: 40 }),
    })
    expect(checkSleepPerformance(ctx)).toBeNull()
  })

  it('returns null when sleep score >= 60', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ workouts_logged: 1 }),
      thirty_day_summary: makeDefaultSummary({ whoop_avg_sleep_score: 75 }),
    })
    expect(checkSleepPerformance(ctx)).toBeNull()
  })
})

// ─── checkHRVTrend ───────────────────────────────────────────────────

describe('checkHRVTrend', () => {
  it('returns informational when avg recovery < 50', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ whoop_avg_recovery: 42 }),
    })
    const result = checkHRVTrend(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('HRV_TREND')
    expect(result!.priority).toBe('informational')
    expect(result!.confidence).toBe(0.65)
  })

  it('returns null when avg recovery is null', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ whoop_avg_recovery: null }),
    })
    expect(checkHRVTrend(ctx)).toBeNull()
  })

  it('returns null when avg recovery >= 50', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ whoop_avg_recovery: 65 }),
    })
    expect(checkHRVTrend(ctx)).toBeNull()
  })
})

// ─── checkStrainNutrition ────────────────────────────────────────────

describe('checkStrainNutrition', () => {
  it('returns notable when strain >= 14 and calorie adherence < 70%', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ calories: 2000 }),
      today: makeDefaultToday({
        latest_whoop_strain: 16,
        macros_consumed: { protein: 80, carbs: 100, fat: 30, calories: 1200 },
      }),
    })
    const result = checkStrainNutrition(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('STRAIN_NUT')
    expect(result!.priority).toBe('notable')
    expect(result!.confidence).toBe(0.75)
  })

  it('returns null when strain is null', () => {
    const ctx = makeContext({
      today: makeDefaultToday({ latest_whoop_strain: null }),
    })
    expect(checkStrainNutrition(ctx)).toBeNull()
  })

  it('returns null when strain < 14', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 10,
        macros_consumed: { protein: 50, carbs: 60, fat: 20, calories: 800 },
      }),
    })
    expect(checkStrainNutrition(ctx)).toBeNull()
  })

  it('returns null when calorie adherence >= 70%', () => {
    const ctx = makeContext({
      targets: makeDefaultTargets({ calories: 2000 }),
      today: makeDefaultToday({
        latest_whoop_strain: 16,
        macros_consumed: { protein: 120, carbs: 180, fat: 55, calories: 1500 },
      }),
    })
    expect(checkStrainNutrition(ctx)).toBeNull()
  })

  it('returns null when calories consumed is 0', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 18,
        macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      }),
    })
    expect(checkStrainNutrition(ctx)).toBeNull()
  })
})

// ─── checkHydration ──────────────────────────────────────────────────

describe('checkHydration', () => {
  it('returns null (placeholder — no hydration data model yet)', () => {
    const ctx = makeContext()
    expect(checkHydration(ctx)).toBeNull()
  })
})

// ─── checkConsistentProgression ──────────────────────────────────────

describe('checkConsistentProgression', () => {
  it('returns informational when 16+ workouts across 12+ days', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 20 }),
      data_availability: makeDefaultAvailability({ workout_days: 15 }),
    })
    const result = checkConsistentProgression(ctx)
    expect(result).not.toBeNull()
    expect(result!.pattern_id).toBe('CON_PROG')
    expect(result!.priority).toBe('informational')
    expect(result!.confidence).toBe(0.7)
  })

  it('returns null when workout_count < 16', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 10 }),
      data_availability: makeDefaultAvailability({ workout_days: 10 }),
    })
    expect(checkConsistentProgression(ctx)).toBeNull()
  })

  it('returns null when workout_days < 12', () => {
    const ctx = makeContext({
      thirty_day_summary: makeDefaultSummary({ workout_count: 20 }),
      data_availability: makeDefaultAvailability({ workout_days: 8 }),
    })
    expect(checkConsistentProgression(ctx)).toBeNull()
  })
})

// ─── DetectedPattern structure validation ────────────────────────────

describe('DetectedPattern structure', () => {
  it('all checkers return valid DetectedPattern or null', () => {
    const ctx = makeContext({
      today: makeDefaultToday({
        latest_whoop_strain: 18,
        latest_whoop_recovery: 25,
        macros_consumed: { protein: 60, carbs: 80, fat: 20, calories: 900 },
        workouts_logged: 1,
      }),
      targets: makeDefaultTargets({ protein: 150, calories: 2000 }),
      thirty_day_summary: makeDefaultSummary({
        workout_count: 20,
        whoop_avg_recovery: 30,
        whoop_avg_sleep_score: 45,
      }),
      data_availability: makeDefaultAvailability({ workout_days: 15 }),
    })

    const checkers = [
      checkCaloricDeficit,
      checkOvertraining,
      checkNutritionPerformance,
      checkRecoveryVolume,
      checkProteinRecovery,
      checkSleepPerformance,
      checkHRVTrend,
      checkStrainNutrition,
      checkHydration,
      checkConsistentProgression,
    ]

    for (const checker of checkers) {
      const result = checker(ctx)
      if (result !== null) {
        expect(result.pattern_id).toBeTruthy()
        expect(['urgent', 'notable', 'informational']).toContain(result.priority)
        expect(result.confidence).toBeGreaterThanOrEqual(0)
        expect(result.confidence).toBeLessThanOrEqual(1)
        expect(result.content).toBeTruthy()
        expect(result.data_context).toBeDefined()
      }
    }
  })
})
