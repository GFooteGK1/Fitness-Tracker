/**
 * Property-Based Tests for Socius Background Pattern Detection
 *
 * Feature: agent-system, Property 13: Insight creation threshold
 * Feature: agent-system, Property 14: Caloric deficit urgency classification
 *
 * **Validates: Requirements 4.3, 4.5, 4.6**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import type {
  SociusContext,
  ThirtyDaySummary,
  DataAvailability,
  MacroTargets,
  UserDailyState,
  UserWeeklyState,
  PatternId,
  InsightPriority,
} from '@/app/lib/agents/types'
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

const propertyConfig = { numRuns: 100 }

// ─── Valid values ────────────────────────────────────────────────────

const VALID_PATTERN_IDS: PatternId[] = [
  'CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC',
  'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG',
]

const VALID_PRIORITIES: InsightPriority[] = ['urgent', 'notable', 'informational']

// ─── Arbitraries ─────────────────────────────────────────────────────

const arbMacroTotals = fc.record({
  protein: fc.integer({ min: 0, max: 300 }),
  carbs: fc.integer({ min: 0, max: 500 }),
  fat: fc.integer({ min: 0, max: 200 }),
  calories: fc.integer({ min: 0, max: 4000 }),
})

const arbTargets = fc.record({
  protein: fc.integer({ min: 50, max: 300 }),
  carbs: fc.integer({ min: 50, max: 500 }),
  fat: fc.integer({ min: 20, max: 200 }),
  calories: fc.integer({ min: 1000, max: 4000 }),
  tolerance_pct: fc.integer({ min: 5, max: 20 }),
})

const arbToday = fc.record({
  meals_logged: fc.integer({ min: 0, max: 10 }),
  macros_consumed: arbMacroTotals,
  macros_remaining: arbMacroTotals,
  workouts_logged: fc.integer({ min: 0, max: 5 }),
  latest_whoop_recovery: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  latest_whoop_strain: fc.option(fc.double({ min: 0, max: 21, noNaN: true }), { nil: null }),
})

const arbSummary = fc.record({
  workout_count: fc.integer({ min: 0, max: 40 }),
  workout_types: fc.record({
    metcon: fc.integer({ min: 0, max: 20 }),
    strength: fc.integer({ min: 0, max: 20 }),
    cardio: fc.integer({ min: 0, max: 20 }),
    emom: fc.integer({ min: 0, max: 20 }),
  }),
  avg_rpe: fc.option(fc.double({ min: 1, max: 10, noNaN: true }), { nil: null }),
  total_meals: fc.integer({ min: 0, max: 200 }),
  avg_daily_protein: fc.integer({ min: 0, max: 300 }),
  avg_daily_calories: fc.integer({ min: 0, max: 4000 }),
  pr_count: fc.integer({ min: 0, max: 20 }),
  whoop_avg_recovery: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
  whoop_avg_sleep_score: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
})

const arbAvailability = fc.record({
  has_workouts: fc.boolean(),
  has_meals: fc.boolean(),
  has_whoop: fc.boolean(),
  has_targets: fc.boolean(),
  workout_days: fc.integer({ min: 0, max: 30 }),
  meal_days: fc.integer({ min: 0, max: 30 }),
})

const arbWeek: fc.Arbitrary<UserWeeklyState> = fc.record({
  days_elapsed: fc.integer({ min: 1, max: 7 }),
  actual: arbMacroTotals,
  prorated_target: arbMacroTotals,
  adherence_pct: fc.record({
    protein: fc.double({ min: 0, max: 200, noNaN: true }),
    carbs: fc.double({ min: 0, max: 200, noNaN: true }),
    fat: fc.double({ min: 0, max: 200, noNaN: true }),
    calories: fc.double({ min: 0, max: 200, noNaN: true }),
  }),
  overall_status: fc.constantFrom('on-track' as const, 'ahead' as const, 'behind' as const),
})

const arbContext: fc.Arbitrary<SociusContext> = fc.record({
  user_id: fc.uuid(),
  targets: arbTargets,
  today: arbToday,
  week: arbWeek,
  recent_chat: fc.constant([]),
  pending_insights: fc.constant([]),
  current_time: fc.constant(new Date().toISOString()),
  day_of_week: fc.constantFrom('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
  has_whoop: fc.boolean(),
  thirty_day_summary: arbSummary,
  recent_insights: fc.constant([]),
  data_availability: arbAvailability,
})

// ─── Property 13: Insight creation threshold ─────────────────────────

describe('Property 13: Insight creation threshold', () => {
  /**
   * Property 13a: All pattern checkers return valid DetectedPattern or null
   *
   * *For any* SociusContext, every pattern checker SHALL return either null
   * or a DetectedPattern with valid pattern_id, priority, confidence in [0,1],
   * non-empty content, and a data_context object.
   *
   * **Validates: Requirements 4.3, 4.6**
   */
  test.prop(
    [arbContext],
    propertyConfig
  )(
    'Property 13: all checkers return valid DetectedPattern or null',
    (ctx) => {
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
          // Valid pattern_id
          expect(VALID_PATTERN_IDS).toContain(result.pattern_id)
          // Valid priority
          expect(VALID_PRIORITIES).toContain(result.priority)
          // Confidence in [0, 1]
          expect(result.confidence).toBeGreaterThanOrEqual(0)
          expect(result.confidence).toBeLessThanOrEqual(1)
          // Non-empty content
          expect(result.content.length).toBeGreaterThan(0)
          // data_context is an object
          expect(typeof result.data_context).toBe('object')
          expect(result.data_context).not.toBeNull()
        }
      }
    }
  )

  /**
   * Property 13b: Only patterns with confidence > 0.6 should be persisted
   *
   * *For any* SociusContext, filtering detected patterns by confidence > 0.6
   * SHALL exclude all patterns with confidence <= 0.6.
   *
   * **Validates: Requirements 4.3, 4.6**
   */
  test.prop(
    [arbContext],
    propertyConfig
  )(
    'Property 13: patterns with confidence <= 0.6 are excluded by threshold filter',
    (ctx) => {
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

      const allResults = checkers.map(c => c(ctx))
      const detected = allResults.filter(
        (p): p is DetectedPattern => p !== null && p.confidence > 0.6
      )

      // Every detected pattern must have confidence > 0.6
      for (const pattern of detected) {
        expect(pattern.confidence).toBeGreaterThan(0.6)
      }

      // Every non-null result with confidence <= 0.6 must NOT be in detected
      const excluded = allResults.filter(
        (p): p is DetectedPattern => p !== null && p.confidence <= 0.6
      )
      for (const pattern of excluded) {
        expect(detected).not.toContain(pattern)
      }
    }
  )

  /**
   * Property 13c: Detected patterns contain all required Insight fields
   *
   * **Validates: Requirements 4.6**
   */
  test.prop(
    [arbContext],
    propertyConfig
  )(
    'Property 13: detected patterns contain all required insight fields',
    (ctx) => {
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
          // All required fields present
          expect(result).toHaveProperty('pattern_id')
          expect(result).toHaveProperty('priority')
          expect(result).toHaveProperty('confidence')
          expect(result).toHaveProperty('content')
          expect(result).toHaveProperty('data_context')
        }
      }
    }
  )
})

// ─── Property 14: Caloric deficit urgency classification ─────────────

describe('Property 14: Caloric deficit urgency classification', () => {
  /**
   * Property 14a: CAL_DEF is urgent when strain >= 14 AND calories < 1500
   *
   * *For any* day where WHOOP strain score >= 14 and total logged calories < 1500,
   * the CAL_DEF pattern detection SHALL classify the resulting Insight as `urgent` priority.
   *
   * **Validates: Requirements 4.5**
   */
  test.prop(
    [
      fc.double({ min: 14, max: 21, noNaN: true }),
      fc.integer({ min: 1, max: 1499 }),
    ],
    propertyConfig
  )(
    'Property 14: CAL_DEF is urgent when strain >= 14 and calories < 1500',
    (strain, calories) => {
      const ctx: SociusContext = {
        user_id: 'test',
        targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
        today: {
          meals_logged: 1,
          macros_consumed: { protein: 50, carbs: 80, fat: 20, calories },
          macros_remaining: { protein: 100, carbs: 120, fat: 45, calories: 2000 - calories },
          workouts_logged: 1,
          latest_whoop_recovery: 60,
          latest_whoop_strain: strain,
        },
        week: {
          days_elapsed: 3,
          actual: { protein: 300, carbs: 400, fat: 150, calories: 4500 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 66, carbs: 66, fat: 76, calories: 75 },
          overall_status: 'behind',
        },
        recent_chat: [],
        pending_insights: [],
        current_time: new Date().toISOString(),
        day_of_week: 'Monday',
        has_whoop: true,
        thirty_day_summary: {
          workout_count: 10, workout_types: { metcon: 5, strength: 3, cardio: 1, emom: 1 },
          avg_rpe: 7, total_meals: 50, avg_daily_protein: 130, avg_daily_calories: 1800,
          pr_count: 1, whoop_avg_recovery: 60, whoop_avg_sleep_score: 70,
        },
        recent_insights: [],
        data_availability: {
          has_workouts: true, has_meals: true, has_whoop: true, has_targets: true,
          workout_days: 10, meal_days: 20,
        },
      }

      const result = checkCaloricDeficit(ctx)
      expect(result).not.toBeNull()
      expect(result!.pattern_id).toBe('CAL_DEF')
      expect(result!.priority).toBe('urgent')
      expect(result!.confidence).toBe(0.8)
    }
  )

  /**
   * Property 14b: CAL_DEF returns null when strain is null
   *
   * **Validates: Requirements 4.5**
   */
  test.prop(
    [fc.integer({ min: 0, max: 3000 })],
    propertyConfig
  )(
    'Property 14: CAL_DEF returns null when strain is null',
    (calories) => {
      const ctx: SociusContext = {
        user_id: 'test',
        targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
        today: {
          meals_logged: 1,
          macros_consumed: { protein: 50, carbs: 80, fat: 20, calories },
          macros_remaining: { protein: 100, carbs: 120, fat: 45, calories: 2000 - calories },
          workouts_logged: 1,
          latest_whoop_recovery: 60,
          latest_whoop_strain: null,
        },
        week: {
          days_elapsed: 3,
          actual: { protein: 300, carbs: 400, fat: 150, calories: 4500 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 66, carbs: 66, fat: 76, calories: 75 },
          overall_status: 'behind',
        },
        recent_chat: [],
        pending_insights: [],
        current_time: new Date().toISOString(),
        day_of_week: 'Monday',
        has_whoop: false,
        thirty_day_summary: {
          workout_count: 10, workout_types: { metcon: 5, strength: 3, cardio: 1, emom: 1 },
          avg_rpe: 7, total_meals: 50, avg_daily_protein: 130, avg_daily_calories: 1800,
          pr_count: 1, whoop_avg_recovery: null, whoop_avg_sleep_score: null,
        },
        recent_insights: [],
        data_availability: {
          has_workouts: true, has_meals: true, has_whoop: false, has_targets: true,
          workout_days: 10, meal_days: 20,
        },
      }

      const result = checkCaloricDeficit(ctx)
      expect(result).toBeNull()
    }
  )

  /**
   * Property 14c: CAL_DEF returns null when conditions are not met
   *
   * When strain < 14 OR calories >= 1500, CAL_DEF should not trigger.
   *
   * **Validates: Requirements 4.5**
   */
  test.prop(
    [
      fc.double({ min: 0, max: 13.99, noNaN: true }),
      fc.integer({ min: 1500, max: 4000 }),
    ],
    propertyConfig
  )(
    'Property 14: CAL_DEF returns null when strain < 14 or calories >= 1500',
    (strain, calories) => {
      const ctx: SociusContext = {
        user_id: 'test',
        targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
        today: {
          meals_logged: 2,
          macros_consumed: { protein: 100, carbs: 150, fat: 50, calories },
          macros_remaining: { protein: 50, carbs: 50, fat: 15, calories: 2000 - calories },
          workouts_logged: 1,
          latest_whoop_recovery: 60,
          latest_whoop_strain: strain,
        },
        week: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5500 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 88, carbs: 83, fat: 92, calories: 91 },
          overall_status: 'on-track',
        },
        recent_chat: [],
        pending_insights: [],
        current_time: new Date().toISOString(),
        day_of_week: 'Monday',
        has_whoop: true,
        thirty_day_summary: {
          workout_count: 10, workout_types: { metcon: 5, strength: 3, cardio: 1, emom: 1 },
          avg_rpe: 7, total_meals: 50, avg_daily_protein: 130, avg_daily_calories: 1800,
          pr_count: 1, whoop_avg_recovery: 60, whoop_avg_sleep_score: 70,
        },
        recent_insights: [],
        data_availability: {
          has_workouts: true, has_meals: true, has_whoop: true, has_targets: true,
          workout_days: 10, meal_days: 20,
        },
      }

      // With strain < 14, CAL_DEF should not trigger regardless of calories
      const result = checkCaloricDeficit(ctx)
      expect(result).toBeNull()
    }
  )
})

// ─── Property 15: Workout type aggregation ───────────────────────────

import type { WorkoutBlock } from '@/app/lib/agents/types'
import { aggregateWorkoutTypes } from '@/app/lib/agents/context-builder'

const arbBlockType = fc.constantFrom(
  'AMRAP' as const,
  'FOR_TIME' as const,
  'EMOM' as const,
  'STRENGTH' as const,
  'CARDIO' as const
)

const arbWorkoutBlock: fc.Arbitrary<WorkoutBlock> = fc.record({
  block_type: arbBlockType,
  duration_min: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
  movements: fc.array(
    fc.record({
      name: fc.constantFrom('Pull-up', 'Deadlift', 'Back Squat', 'Run', 'Row'),
      reps: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
      weight: fc.option(fc.constantFrom('135 lb', '225 lb', '315 lb'), { nil: undefined }),
    }),
    { minLength: 1, maxLength: 5 }
  ),
  score: fc.option(
    fc.record({
      rounds: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
      extra_reps: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
      time_s: fc.option(fc.integer({ min: 30, max: 3600 }), { nil: undefined }),
    }),
    { nil: undefined }
  ),
  rx_status: fc.option(fc.constantFrom('RX' as const, 'SCALED' as const), { nil: undefined }),
})

describe('Property 15: Workout type aggregation', () => {
  /**
   * Property 15a: AMRAP and FOR_TIME count as metcon, STRENGTH as strength,
   * CARDIO as cardio, EMOM as emom, and total equals the sum of all categories.
   *
   * *For any* set of workout blocks with known block_type values, the aggregation
   * SHALL correctly categorize each block and the total SHALL equal the sum of
   * all categories.
   *
   * **Validates: Requirements 4.8**
   */
  test.prop(
    [fc.array(arbWorkoutBlock, { minLength: 0, maxLength: 50 })],
    propertyConfig
  )(
    'Property 15: aggregation categorizes block types correctly and total equals sum',
    (blocks) => {
      const result = aggregateWorkoutTypes(blocks)

      // Manual count for verification
      let expectedMetcon = 0
      let expectedStrength = 0
      let expectedCardio = 0
      let expectedEmom = 0

      for (const block of blocks) {
        if (block.block_type === 'AMRAP' || block.block_type === 'FOR_TIME') {
          expectedMetcon++
        } else if (block.block_type === 'STRENGTH') {
          expectedStrength++
        } else if (block.block_type === 'CARDIO') {
          expectedCardio++
        } else if (block.block_type === 'EMOM') {
          expectedEmom++
        }
      }

      expect(result.metcon).toBe(expectedMetcon)
      expect(result.strength).toBe(expectedStrength)
      expect(result.cardio).toBe(expectedCardio)
      expect(result.emom).toBe(expectedEmom)
      expect(result.total).toBe(result.metcon + result.strength + result.cardio + result.emom)
      expect(result.total).toBe(blocks.length)
    }
  )

  /**
   * Property 15b: Empty block array produces all zeros.
   *
   * **Validates: Requirements 4.8**
   */
  test.prop(
    [fc.constant([] as WorkoutBlock[])],
    propertyConfig
  )(
    'Property 15: empty blocks produce zero counts',
    (blocks) => {
      const result = aggregateWorkoutTypes(blocks)
      expect(result.metcon).toBe(0)
      expect(result.strength).toBe(0)
      expect(result.cardio).toBe(0)
      expect(result.emom).toBe(0)
      expect(result.total).toBe(0)
    }
  )

  /**
   * Property 15c: AMRAP-only and FOR_TIME-only arrays both map entirely to metcon.
   *
   * **Validates: Requirements 4.8**
   */
  test.prop(
    [
      fc.array(
        arbWorkoutBlock.map(b => ({ ...b, block_type: fc.sample(fc.constantFrom('AMRAP' as const, 'FOR_TIME' as const), 1)[0] })),
        { minLength: 1, maxLength: 30 }
      ),
    ],
    propertyConfig
  )(
    'Property 15: AMRAP and FOR_TIME blocks all count as metcon',
    (blocks) => {
      const result = aggregateWorkoutTypes(blocks)
      expect(result.metcon).toBe(blocks.length)
      expect(result.strength).toBe(0)
      expect(result.cardio).toBe(0)
      expect(result.emom).toBe(0)
      expect(result.total).toBe(blocks.length)
    }
  )
})
