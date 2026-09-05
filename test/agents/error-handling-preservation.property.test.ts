/**
 * Property-Based Preservation Tests for Agent Error Handling Bugfix
 *
 * Task 2: Write preservation property tests (BEFORE implementing fix)
 *
 * **IMPORTANT**: These tests run on UNFIXED code to establish baseline behavior.
 * They MUST PASS on unfixed code to confirm what behavior to preserve.
 *
 * Feature: trainer-parsing-error-handling
 * Property 2: Preservation - Successful Parsing Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi } from 'vitest'
import {
  parseTrainerResponse,
  detectNewPRs,
  applySmartDefaults,
  persistWorkout,
  persistNewPRs
} from '@/app/lib/agents/trainer-agent'
import {
  parseNutritionistResponse,
  applyPortionDefaults,
  persistMeal
} from '@/app/lib/agents/nutritionist-agent'
import {
  parseSociusResponse,
  persistInsights
} from '@/app/lib/agents/socius-agent'
import { normalizeMealTiming } from '@/app/lib/agents/tools/executor'
import { MOVEMENT_ALIASES, PORTION_DEFAULTS } from '@/app/lib/agents/constants'
import type {
  TrainerContext,
  TrainerResponse,
  NutritionistContext,
  NutritionistResponse,
  SociusResponse,
  WorkoutBlock,
  BenchmarkPR,
  RecentWorkout,
  RecentInsight
} from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 50 }

// ─── Test Helpers ────────────────────────────────────────────────────

const VALID_BLOCK_TYPES = ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'] as const
const VALID_MEAL_TIMINGS = ['PRE_WORKOUT', 'POST_WORKOUT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const
const VALID_PATTERN_IDS = ['CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC', 'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG'] as const
const VALID_PRIORITIES = ['urgent', 'notable', 'informational'] as const

function makeTrainerContext(overrides?: Partial<TrainerContext>): TrainerContext {
  return {
    user_id: 'test-user-preservation',
    targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
    today: {
      meals_logged: 0,
      macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      macros_remaining: { protein: 150, carbs: 200, fat: 65, calories: 2000 },
      workouts_logged: 0,
      latest_whoop_recovery: null,
      latest_whoop_strain: null,
    },
    week: {
      days_elapsed: 3,
      actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
      prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
      adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
      overall_status: 'on-track',
    },
    recent_chat: [],
    pending_insights: [],
    current_time: '2026-01-20T14:30:00Z',
    current_date: '2026-01-20',
    day_of_week: 'Tuesday',
    has_whoop: false,
    recent_workouts: [],
    benchmark_prs: [],
    todays_program: null,
    movement_aliases: MOVEMENT_ALIASES,
    ...overrides,
  }
}

function makeNutritionistContext(overrides?: Partial<NutritionistContext>): NutritionistContext {
  return {
    user_id: 'test-user-preservation',
    targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
    today: {
      meals_logged: 1,
      macros_consumed: { protein: 40, carbs: 60, fat: 20, calories: 580 },
      macros_remaining: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
      workouts_logged: 0,
      latest_whoop_recovery: null,
      latest_whoop_strain: null,
    },
    week: {
      days_elapsed: 3,
      actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
      prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
      adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
      overall_status: 'on-track',
    },
    recent_chat: [],
    pending_insights: [],
    current_time: '2026-01-20T12:30:00Z',
    current_date: '2026-01-20',
    day_of_week: 'Tuesday',
    has_whoop: false,
    todays_meals: [],
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: null,
    ...overrides,
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const arbBlockType = fc.constantFrom<WorkoutBlock['block_type']>(...VALID_BLOCK_TYPES)

const arbMovement = fc.record({
  name: fc.constantFrom('Pull-up', 'Deadlift', 'Thruster', 'Back Squat', 'Box Jump', 'Wall Ball'),
  reps: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  weight: fc.option(fc.constantFrom('95 lb', '135 lb', '185 lb', '225 lb'), { nil: undefined }),
})

const arbScore = fc.oneof(
  fc.record({
    time_s: fc.integer({ min: 30, max: 3600 }),
    rounds: fc.constant(undefined),
    extra_reps: fc.constant(undefined),
  }),
  fc.record({
    rounds: fc.integer({ min: 1, max: 30 }),
    extra_reps: fc.integer({ min: 0, max: 50 }),
    time_s: fc.constant(undefined),
  }),
)

const arbBlock = fc.record({
  block_type: arbBlockType,
  duration_min: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
  movements: fc.array(arbMovement, { minLength: 1, maxLength: 5 }),
  score: fc.option(arbScore, { nil: undefined }),
  rx_status: fc.option(fc.constantFrom<'RX' | 'SCALED'>('RX', 'SCALED'), { nil: undefined }),
}) as fc.Arbitrary<WorkoutBlock>

const arbWorkout = fc.record({
  blocks: fc.array(arbBlock, { minLength: 1, maxLength: 4 }),
  primary_score: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  tags: fc.array(fc.constantFrom('metcon', 'strength', 'cardio', 'benchmark'), { minLength: 0, maxLength: 3 }),
})

const arbTrainerResponseJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  workout: fc.option(arbWorkout, { nil: undefined }),
  new_prs: fc.constant([]),
  smart_defaults: fc.constant([]),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

const arbMealItem = fc.record({
  food: fc.constantFrom('Chicken breast', 'White rice', 'Salmon', 'Broccoli', 'Sweet potato'),
  portion: fc.constantFrom('6 oz', '1 cup', '4 oz', '1 medium', '200g'),
  protein: fc.integer({ min: 0, max: 60 }),
  carbs: fc.integer({ min: 0, max: 80 }),
  fat: fc.integer({ min: 0, max: 30 }),
  calories: fc.integer({ min: 0, max: 500 }),
})

const arbMeal = fc.record({
  items: fc.array(arbMealItem, { minLength: 1, maxLength: 5 }),
  totals: fc.record({
    protein: fc.integer({ min: 0, max: 200 }),
    carbs: fc.integer({ min: 0, max: 300 }),
    fat: fc.integer({ min: 0, max: 150 }),
    calories: fc.integer({ min: 0, max: 2000 }),
  }),
  timing: fc.constantFrom(...VALID_MEAL_TIMINGS),
})

const arbNutritionistResponseJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  meal: fc.option(arbMeal, { nil: undefined }),
  remaining_budget: fc.record({
    protein: fc.integer({ min: 0, max: 200 }),
    carbs: fc.integer({ min: 0, max: 300 }),
    fat: fc.integer({ min: 0, max: 150 }),
    calories: fc.integer({ min: 0, max: 2000 }),
  }),
  week_status: fc.record({
    days_elapsed: fc.integer({ min: 0, max: 7 }),
    actual: fc.record({
      protein: fc.integer({ min: 0, max: 1400 }),
      carbs: fc.integer({ min: 0, max: 2100 }),
      fat: fc.integer({ min: 0, max: 1050 }),
      calories: fc.integer({ min: 0, max: 14000 }),
    }),
    prorated_target: fc.record({
      protein: fc.integer({ min: 0, max: 1400 }),
      carbs: fc.integer({ min: 0, max: 2100 }),
      fat: fc.integer({ min: 0, max: 1050 }),
      calories: fc.integer({ min: 0, max: 14000 }),
    }),
    adherence_pct: fc.record({
      protein: fc.integer({ min: 0, max: 150 }),
      carbs: fc.integer({ min: 0, max: 150 }),
      fat: fc.integer({ min: 0, max: 150 }),
      calories: fc.integer({ min: 0, max: 150 }),
    }),
    overall_status: fc.constantFrom<'on-track' | 'ahead' | 'behind'>('on-track', 'ahead', 'behind'),
  }),
  smart_defaults: fc.constant([]),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

const arbInsight = fc.record({
  id: fc.uuid(),
  pattern_id: fc.constantFrom(...VALID_PATTERN_IDS),
  priority: fc.constantFrom(...VALID_PRIORITIES),
  confidence: fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true }),
  content: fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
  created_at: fc.constant(new Date().toISOString()),
})

const arbSociusResponseJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 200 }),
  insights: fc.array(arbInsight, { minLength: 0, maxLength: 5 }),
  data_points: fc.record({
    avg_protein: fc.option(fc.integer({ min: 0, max: 200 }), { nil: undefined }),
    workout_count: fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
  }),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

// ─── Property 2.1: Trainer Successful Parsing Preservation ───────────

describe('Property 2.1: Trainer successful parsing behavior preserved', () => {

  /**
   * Property 2.1a: Valid JSON responses parse identically
   *
   * *For any* valid JSON response from Trainer, parseTrainerResponse SHALL
   * produce the same parsed result with all fields correctly extracted.
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbTrainerResponseJson],
    propertyConfig
  )(
    'Property 2.1a: valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseTrainerResponse(raw)

      // Message preserved
      expect(result.message).toBe(input.message)

      // Confidence preserved
      expect(result.confidence).toBe(input.confidence)

      // Workout structure preserved
      if (input.workout) {
        expect(result.workout).toBeDefined()
        expect(result.workout!.blocks.length).toBe(input.workout.blocks.length)
        expect(result.workout!.primary_score).toBe(input.workout.primary_score)
        expect(result.workout!.rpe).toBe(input.workout.rpe)
        expect(result.workout!.tags).toEqual(input.workout.tags)

        // Block details preserved
        for (let i = 0; i < input.workout.blocks.length; i++) {
          const inputBlock = input.workout.blocks[i]
          const resultBlock = result.workout!.blocks[i]

          expect(resultBlock.block_type).toBe(inputBlock.block_type)
          expect(resultBlock.duration_min).toBe(inputBlock.duration_min)
          expect(resultBlock.movements.length).toBe(inputBlock.movements.length)
          expect(resultBlock.rx_status).toBe(inputBlock.rx_status)
        }
      } else {
        expect(result.workout).toBeUndefined()
      }

      // Arrays preserved
      expect(Array.isArray(result.new_prs)).toBe(true)
      expect(Array.isArray(result.smart_defaults)).toBe(true)
    }
  )

  /**
   * Property 2.1b: Workout persistence preserves all data
   *
   * *For any* successful Trainer request with workout blocks, persistWorkout
   * SHALL insert workout with correct blocks, movements, scores, and metadata.
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [arbWorkout, fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })],
    propertyConfig
  )(
    'Property 2.1b: workout persistence preserves all data correctly',
    async (workout, confidence) => {
      let capturedWorkout: Record<string, unknown> | null = null
      let capturedBlockScores: Record<string, unknown>[] | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('workout')
          capturedWorkout = args.p_record
          capturedBlockScores = args.p_blocks
          return { data: 'workout-preservation', error: null }
        }),
      }

      const response: TrainerResponse = {
        message: 'Logged!',
        workout,
        new_prs: [],
        smart_defaults: [],
        confidence,
      }

      const id = await persistWorkout(response, 'user-preservation', 'test input', mockSupabase as any)

      // Workout persisted successfully
      expect(id).toBe('workout-preservation')
      expect(capturedWorkout).not.toBeNull()

      // All workout fields preserved
      expect(capturedWorkout!.blocks).toEqual(workout.blocks)
      expect(capturedWorkout!.primary_score).toBe(workout.primary_score)
      expect(capturedWorkout!.rpe).toBe(workout.rpe)
      expect(capturedWorkout!.tags).toEqual(workout.tags)
      expect(capturedWorkout!.parse_confidence).toBe(confidence)

      // Block scores persisted correctly
      expect(capturedBlockScores).not.toBeNull()
      expect(capturedBlockScores!.length).toBe(workout.blocks.length)
    }
  )

  /**
   * Property 2.1c: Smart defaults applied correctly
   *
   * *For any* workout with missing RPE, applySmartDefaults SHALL fill RPE
   * with a valid value [1-10] and add smart_defaults entry.
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [fc.array(arbBlock, { minLength: 1, maxLength: 4 })],
    propertyConfig
  )(
    'Property 2.1c: smart defaults applied correctly for missing RPE',
    (blocks) => {
      const response: TrainerResponse = {
        message: 'Logged!',
        workout: {
          blocks,
          primary_score: null,
          rpe: null,
          tags: [],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.85,
      }

      const ctx = makeTrainerContext()
      const result = applySmartDefaults(response, ctx)

      // RPE filled
      expect(result.workout!.rpe).not.toBeNull()
      expect(result.workout!.rpe).toBeGreaterThanOrEqual(1)
      expect(result.workout!.rpe).toBeLessThanOrEqual(10)

      // Smart default recorded
      expect(result.smart_defaults).toBeDefined()
      const rpeDefault = result.smart_defaults!.find(d => d.field === 'rpe')
      expect(rpeDefault).toBeDefined()
    }
  )

  /**
   * Property 2.1d: PR detection works correctly
   *
   * *For any* FOR_TIME workout with lower time than existing PR,
   * detectNewPRs SHALL detect the new PR.
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [
      fc.integer({ min: 30, max: 300 }),  // new time (faster)
      fc.integer({ min: 301, max: 600 }), // existing time (slower)
    ],
    propertyConfig
  )(
    'Property 2.1d: PR detection works correctly for FOR_TIME',
    (newTime, existingTime) => {
      const response: TrainerResponse = {
        message: 'Done!',
        workout: {
          blocks: [{
            block_type: 'FOR_TIME',
            movements: [{ name: 'Fran Thruster', reps: 21 }],
            score: { time_s: newTime },
            rx_status: 'RX',
          }],
          primary_score: `${Math.floor(newTime / 60)}:${(newTime % 60).toString().padStart(2, '0')}`,
          rpe: 9,
          tags: ['benchmark'],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const existingPRs: BenchmarkPR[] = [{
        benchmark_name: 'Fran',
        score_value: existingTime,
        score_display: `${Math.floor(existingTime / 60)}:${(existingTime % 60).toString().padStart(2, '0')}`,
        date: '2026-01-10',
        rx_status: 'RX',
      }]

      const result = detectNewPRs(response, existingPRs)

      // New PR detected because newTime < existingTime
      expect(result.new_prs).toBeDefined()
      expect(result.new_prs!.length).toBeGreaterThan(0)
      expect(result.new_prs![0].benchmark_name).toBe('Fran')
      expect(result.new_prs![0].score_value).toBe(newTime)
    }
  )
})

// ─── Property 2.2: Nutritionist Successful Parsing Preservation ──────

describe('Property 2.2: Nutritionist successful parsing behavior preserved', () => {

  /**
   * Property 2.2a: Valid JSON responses parse identically
   *
   * *For any* valid JSON response from Nutritionist, parseNutritionistResponse
   * SHALL produce the same parsed result with all fields correctly extracted.
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbNutritionistResponseJson],
    propertyConfig
  )(
    'Property 2.2a: valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseNutritionistResponse(raw)

      // Message preserved
      expect(result.message).toBe(input.message)

      // Confidence preserved
      expect(result.confidence).toBe(input.confidence)

      // Meal structure preserved
      if (input.meal) {
        expect(result.meal).toBeDefined()
        expect(result.meal!.items.length).toBe(input.meal.items.length)
        expect(result.meal!.totals).toEqual(input.meal.totals)
        expect(result.meal!.timing).toBe(input.meal.timing)

        // Item details preserved
        for (let i = 0; i < input.meal.items.length; i++) {
          const inputItem = input.meal.items[i]
          const resultItem = result.meal!.items[i]

          expect(resultItem.food).toBe(inputItem.food)
          expect(resultItem.portion).toBe(inputItem.portion)
          expect(resultItem.protein).toBe(inputItem.protein)
          expect(resultItem.carbs).toBe(inputItem.carbs)
          expect(resultItem.fat).toBe(inputItem.fat)
          expect(resultItem.calories).toBe(inputItem.calories)
        }
      } else {
        expect(result.meal).toBeUndefined()
      }

      // Budget and week status preserved
      expect(result.remaining_budget).toEqual(input.remaining_budget)
      expect(result.week_status.overall_status).toBe(input.week_status.overall_status)
      expect(result.week_status.days_elapsed).toBe(input.week_status.days_elapsed)
    }
  )

  /**
   * Property 2.2b: Meal persistence preserves all data
   *
   * *For any* successful Nutritionist request with meal items, persistMeal
   * SHALL insert meal with correct items, totals, timing, and metadata.
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [arbMeal, fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })],
    propertyConfig
  )(
    'Property 2.2b: meal persistence preserves all data correctly',
    async (meal, confidence) => {
      let capturedMeal: Record<string, unknown> | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('meal')
          capturedMeal = args.p_record
          return { data: 'meal-preservation', error: null }
        }),
      }

      const response: NutritionistResponse = {
        message: 'Logged!',
        meal,
        remaining_budget: { protein: 100, carbs: 150, fat: 50, calories: 1400 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence,
      }

      const id = await persistMeal(response, 'user-preservation', mockSupabase as any)

      // Meal persisted successfully
      expect(id).toBe('meal-preservation')
      expect(capturedMeal).not.toBeNull()

      // All meal fields preserved
      expect(capturedMeal!.items).toEqual(meal.items)
      expect(capturedMeal!.meal_timing).toBe(normalizeMealTiming(meal.timing))
      expect(capturedMeal!.total_protein).toBe(meal.totals.protein)
      expect(capturedMeal!.total_carbs).toBe(meal.totals.carbs)
      expect(capturedMeal!.total_fat).toBe(meal.totals.fat)
      expect(capturedMeal!.total_calories).toBe(meal.totals.calories)
      expect(capturedMeal!.ai_confidence).toBe(confidence)
    }
  )

  /**
   * Property 2.2c: Macro validation works correctly
   *
   * *For any* meal with valid macro ranges, parsing SHALL succeed without
   * validation errors in the message.
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [
      fc.integer({ min: 0, max: 200 }),  // protein
      fc.integer({ min: 0, max: 300 }),  // carbs
      fc.integer({ min: 0, max: 150 }),  // fat
    ],
    propertyConfig
  )(
    'Property 2.2c: macro validation works correctly for valid ranges',
    (protein, carbs, fat) => {
      const calories = (protein * 4) + (carbs * 4) + (fat * 9)

      const input = {
        message: 'Logged your meal.',
        meal: {
          items: [{ food: 'Test food', portion: '1 serving', protein, carbs, fat, calories }],
          totals: { protein, carbs, fat, calories },
          timing: 'LUNCH' as const,
        },
        remaining_budget: { protein: 100, carbs: 150, fat: 50, calories: 1400 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track' as const,
        },
        smart_defaults: [],
        confidence: 0.9,
      }

      const raw = JSON.stringify(input)
      const result = parseNutritionistResponse(raw)

      // Parsing succeeds
      expect(result.meal).toBeDefined()
      expect(result.meal!.totals.protein).toBe(protein)
      expect(result.meal!.totals.carbs).toBe(carbs)
      expect(result.meal!.totals.fat).toBe(fat)
      expect(result.confidence).toBe(0.9)
    }
  )

  /**
   * Property 2.2d: Portion defaults applied correctly
   *
   * *For any* meal with vague portions, applyPortionDefaults SHALL fill
   * portions from defaults and add smart_defaults entry.
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [fc.constantFrom('chicken breast', 'salmon', 'white rice', 'broccoli')],
    propertyConfig
  )(
    'Property 2.2d: portion defaults applied correctly for vague portions',
    (food) => {
      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: {
          items: [{ food, portion: 'standard serving', protein: 30, carbs: 20, fat: 10, calories: 290 }],
          totals: { protein: 30, carbs: 20, fat: 10, calories: 290 },
          timing: 'LUNCH',
        },
        remaining_budget: { protein: 120, carbs: 180, fat: 55, calories: 1710 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence: 0.85,
      }

      const ctx = makeNutritionistContext()
      const result = applyPortionDefaults(response, ctx)

      // Portion filled from defaults
      expect(result.meal!.items[0].portion).not.toBe('standard serving')

      // Smart default recorded
      expect(result.smart_defaults).toBeDefined()
      const portionDefault = result.smart_defaults!.find(d => d.field === 'portion')
      expect(portionDefault).toBeDefined()
    }
  )
})

// ─── Property 2.3: Socius Successful Parsing Preservation ────────────

describe('Property 2.3: Socius successful parsing behavior preserved', () => {

  /**
   * Property 2.3a: Valid JSON responses parse identically
   *
   * *For any* valid JSON response from Socius, parseSociusResponse SHALL
   * produce the same parsed result with all fields correctly extracted.
   *
   * Note: Parser trims content and filters out insights with empty/whitespace-only content,
   * so we verify insights have non-empty trimmed content and compare trimmed values.
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbSociusResponseJson],
    propertyConfig
  )(
    'Property 2.3a: valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseSociusResponse(raw)

      // Message preserved
      expect(result.message).toBe(input.message)

      // Confidence preserved
      expect(result.confidence).toBe(input.confidence)

      // Insights structure preserved (only non-empty content insights)
      const validInputInsights = input.insights.filter(i => i.content.trim().length > 0)
      expect(result.insights!.length).toBe(validInputInsights.length)

      // Insight details preserved (content is trimmed by parser)
      for (let i = 0; i < validInputInsights.length; i++) {
        const inputInsight = validInputInsights[i]
        const resultInsight = result.insights![i]

        expect(resultInsight.pattern_id).toBe(inputInsight.pattern_id)
        expect(resultInsight.priority).toBe(inputInsight.priority)
        expect(resultInsight.confidence).toBe(inputInsight.confidence)
        expect(resultInsight.content).toBe(inputInsight.content.trim())
      }

      // Data points preserved
      expect(result.data_points).toEqual(input.data_points)
    }
  )

  /**
   * Property 2.3b: Insights persistence preserves all data
   *
   * *For any* successful Socius request with insights above confidence threshold,
   * persistInsights SHALL insert insights with correct pattern_id, priority, content.
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [fc.array(arbInsight, { minLength: 1, maxLength: 5 })],
    propertyConfig
  )(
    'Property 2.3b: insights persistence preserves all data correctly',
    async (insights) => {
      let capturedInsights: Record<string, unknown>[] | null = null

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'insights') {
            return {
              insert: vi.fn((data: Record<string, unknown>[]) => {
                capturedInsights = data
                return Promise.resolve({ error: null })
              }),
            }
          }
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }

      await persistInsights(insights, 'user-preservation', mockSupabase as any)

      // Insights persisted successfully
      expect(capturedInsights).not.toBeNull()
      expect(capturedInsights!.length).toBe(insights.length)

      // All insight fields preserved
      for (let i = 0; i < insights.length; i++) {
        const input = insights[i]
        const captured = capturedInsights![i]

        expect(captured.pattern_id).toBe(input.pattern_id)
        expect(captured.priority).toBe(input.priority)
        expect(captured.confidence).toBe(input.confidence)
        expect(captured.content).toBe(input.content)
        expect(captured.user_id).toBe('user-preservation')
        expect(captured.data_context).toEqual({})
      }
    }
  )

  /**
   * Property 2.3c: Insight validation works correctly
   *
   * *For any* insight with valid pattern_id and priority, parsing SHALL
   * succeed and include the insight in the result (with trimmed content).
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [
      fc.constantFrom(...VALID_PATTERN_IDS),
      fc.constantFrom(...VALID_PRIORITIES),
      fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true }),
      fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
    ],
    propertyConfig
  )(
    'Property 2.3c: insight validation works correctly for valid inputs',
    (patternId, priority, confidence, content) => {
      const input = {
        message: 'Here is my analysis.',
        insights: [{
          id: crypto.randomUUID(),
          pattern_id: patternId,
          priority,
          confidence,
          content,
          created_at: new Date().toISOString(),
        }],
        data_points: {},
        confidence: 0.9,
      }

      const raw = JSON.stringify(input)
      const result = parseSociusResponse(raw)

      // Parsing succeeds
      expect(result.insights!.length).toBe(1)
      expect(result.insights![0].pattern_id).toBe(patternId)
      expect(result.insights![0].priority).toBe(priority)
      expect(result.insights![0].confidence).toBe(confidence)
      expect(result.insights![0].content).toBe(content.trim())
    }
  )

  /**
   * Property 2.3d: Confidence threshold filtering works
   *
   * *For any* insights with confidence > 0.6, persistInsights SHALL
   * insert them to the database.
   *
   * **Validates: Requirements 3.2, 3.4**
   */
  test.prop(
    [fc.float({ min: Math.fround(0.61), max: Math.fround(1), noNaN: true })],
    propertyConfig
  )(
    'Property 2.3d: confidence threshold filtering works correctly',
    async (confidence) => {
      let insertCalled = false

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'insights') {
            return {
              insert: vi.fn((data: Record<string, unknown>[]) => {
                insertCalled = true
                expect(data.length).toBeGreaterThan(0)
                expect(data[0].confidence).toBeGreaterThan(0.6)
                return Promise.resolve({ error: null })
              }),
            }
          }
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }

      const insights: RecentInsight[] = [{
        id: crypto.randomUUID(),
        pattern_id: 'CAL_DEF',
        priority: 'notable',
        confidence,
        content: 'Test insight above threshold',
        created_at: new Date().toISOString(),
      }]

      await persistInsights(insights, 'user-preservation', mockSupabase as any)

      // Insert was called because confidence > 0.6
      expect(insertCalled).toBe(true)
    }
  )
})
