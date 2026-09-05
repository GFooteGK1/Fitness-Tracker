/**
 * Property-Based Tests for Nutritionist Agent
 *
 * Feature: agent-system, Property 8: Nutritionist parse output with portion defaults
 * Feature: agent-system, Property 10: Meal persistence round-trip
 * Feature: agent-system, Property 11: Meal timing inference
 *
 * **Validates: Requirements 3.2, 3.3, 3.8, 3.9**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi } from 'vitest'
import {
  parseNutritionistResponse,
  applyPortionDefaults,
  inferMealTiming,
  persistMeal,
} from '@/app/lib/agents/nutritionist-agent'
import { PORTION_DEFAULTS } from '@/app/lib/agents/constants'
import { normalizeMealTiming } from '@/app/lib/agents/tools/executor'
import type {
  NutritionistContext,
  NutritionistResponse,
  MealItem,
  MacroTotals,
  MealTiming,
  SmartDefault,
  UserWeeklyState,
} from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Test Helpers ────────────────────────────────────────────────────

const VALID_TIMINGS: MealTiming[] = [
  'PRE_WORKOUT', 'POST_WORKOUT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK',
]

const VAGUE_PORTIONS = ['standard serving', 'some', 'a bit', 'unknown', '']

function makeBaseContext(overrides?: Partial<NutritionistContext>): NutritionistContext {
  return {
    user_id: 'test-user-prop',
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
    current_date: '2026-02-28',
    day_of_week: 'Tuesday',
    has_whoop: false,
    todays_meals: [],
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: null,
    ...overrides,
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const arbMealTiming = fc.constantFrom<MealTiming>(...VALID_TIMINGS)

const arbMacroTotals = fc.record({
  protein: fc.integer({ min: 0, max: 200 }),
  carbs: fc.integer({ min: 0, max: 300 }),
  fat: fc.integer({ min: 0, max: 150 }),
  calories: fc.integer({ min: 0, max: 2000 }),
})

const arbMealItem = fc.record({
  food: fc.constantFrom(
    'Chicken breast', 'White rice', 'Broccoli', 'Salmon fillet',
    'Sweet potato', 'Greek yogurt', 'Banana', 'Steak', 'Pasta', 'Eggs',
  ),
  portion: fc.constantFrom(
    '6 oz', '1 cup', '1 medium', '2 large', '8 oz grilled',
    '1/2 cup', '3 oz', '200g', '1 slice',
  ),
  protein: fc.integer({ min: 0, max: 80 }),
  carbs: fc.integer({ min: 0, max: 100 }),
  fat: fc.integer({ min: 0, max: 50 }),
  calories: fc.integer({ min: 0, max: 800 }),
})

const arbVagueMealItem = fc.record({
  food: fc.constantFrom(
    'chicken breast', 'rice', 'salmon', 'steak', 'eggs',
    'greek yogurt', 'banana', 'avocado', 'oatmeal',
  ),
  portion: fc.constantFrom(...VAGUE_PORTIONS),
  protein: fc.integer({ min: 0, max: 80 }),
  carbs: fc.integer({ min: 0, max: 100 }),
  fat: fc.integer({ min: 0, max: 50 }),
  calories: fc.integer({ min: 0, max: 800 }),
})

const arbWeekStatus = fc.record({
  days_elapsed: fc.integer({ min: 1, max: 7 }),
  actual: arbMacroTotals,
  prorated_target: arbMacroTotals,
  adherence_pct: fc.record({
    protein: fc.integer({ min: 0, max: 150 }),
    carbs: fc.integer({ min: 0, max: 150 }),
    fat: fc.integer({ min: 0, max: 150 }),
    calories: fc.integer({ min: 0, max: 150 }),
  }),
  overall_status: fc.constantFrom<'on-track' | 'ahead' | 'behind'>('on-track', 'ahead', 'behind'),
})

const arbNutritionistResponseJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  meal: fc.option(
    fc.record({
      items: fc.array(arbMealItem, { minLength: 1, maxLength: 5 }),
      totals: arbMacroTotals,
      timing: arbMealTiming,
    }),
    { nil: undefined },
  ),
  remaining_budget: arbMacroTotals,
  week_status: arbWeekStatus,
  smart_defaults: fc.constant([]),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})


// ─── Property 8: Nutritionist parse output with portion defaults ─────

describe('Property 8: Nutritionist parse output with portion defaults', () => {

  /**
   * Property 8a: Valid JSON always produces a valid NutritionistResponse
   *
   * *For any* valid JSON input, parseNutritionistResponse SHALL return a response with:
   * - message is a non-empty string
   * - confidence is a number in [0, 1]
   * - remaining_budget has protein, carbs, fat, calories fields
   * - week_status has valid overall_status
   * - If meal is present, items have food, portion, protein, carbs, fat, calories
   *
   * **Validates: Requirements 3.2**
   */
  test.prop(
    [arbNutritionistResponseJson],
    propertyConfig,
  )(
    'Property 8: valid JSON always produces valid NutritionistResponse structure',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseNutritionistResponse(raw)

      // message is a non-empty string
      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(0)

      // confidence in [0, 1]
      expect(typeof result.confidence).toBe('number')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)

      // remaining_budget has all macro fields
      expect(typeof result.remaining_budget.protein).toBe('number')
      expect(typeof result.remaining_budget.carbs).toBe('number')
      expect(typeof result.remaining_budget.fat).toBe('number')
      expect(typeof result.remaining_budget.calories).toBe('number')

      // week_status has valid overall_status
      expect(['on-track', 'ahead', 'behind']).toContain(result.week_status.overall_status)

      // If meal is present, items have required fields
      if (result.meal) {
        expect(Array.isArray(result.meal.items)).toBe(true)
        expect(VALID_TIMINGS).toContain(result.meal.timing)
        for (const item of result.meal.items) {
          expect(typeof item.food).toBe('string')
          expect(typeof item.portion).toBe('string')
          expect(typeof item.protein).toBe('number')
          expect(typeof item.carbs).toBe('number')
          expect(typeof item.fat).toBe('number')
          expect(typeof item.calories).toBe('number')
          expect(item.protein).toBeGreaterThanOrEqual(0)
          expect(item.carbs).toBeGreaterThanOrEqual(0)
          expect(item.fat).toBeGreaterThanOrEqual(0)
          expect(item.calories).toBeGreaterThanOrEqual(0)
        }
      }
    },
  )

  /**
   * Property 8b: Invalid/non-JSON input still produces a valid structure
   *
   * *For any* arbitrary non-JSON string, parseNutritionistResponse SHALL
   * return a valid NutritionistResponse with confidence 0.3 and the raw text as message.
   *
   * **Validates: Requirements 3.2**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 200 }).filter(s => {
      try { JSON.parse(s); return false } catch { return true }
    })],
    propertyConfig,
  )(
    'Property 8: non-JSON input produces valid fallback structure',
    (raw) => {
      const result = parseNutritionistResponse(raw)

      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(0)
      expect(result.confidence).toBe(0.3)
      expect(result.meal).toBeUndefined()
      expect(typeof result.remaining_budget.protein).toBe('number')
      expect(typeof result.remaining_budget.carbs).toBe('number')
      expect(typeof result.remaining_budget.fat).toBe('number')
      expect(typeof result.remaining_budget.calories).toBe('number')
      expect(['on-track', 'ahead', 'behind']).toContain(result.week_status.overall_status)
    },
  )

  /**
   * Property 8c: Confidence is always clamped to [0, 1]
   *
   * **Validates: Requirements 3.2**
   */
  test.prop(
    [fc.float({ min: -100, max: 100, noNaN: true })],
    propertyConfig,
  )(
    'Property 8: confidence is always clamped to [0, 1]',
    (confidence) => {
      const raw = JSON.stringify({ message: 'test', confidence, remaining_budget: {}, week_status: {} })
      const result = parseNutritionistResponse(raw)

      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    },
  )

  /**
   * Property 8d: Vague portions get replaced by PORTION_DEFAULTS
   *
   * *For any* meal item with a vague portion and a food matching PORTION_DEFAULTS,
   * applyPortionDefaults SHALL replace the portion with the standard default
   * and add a smart_defaults entry with field='portion'.
   *
   * **Validates: Requirements 3.3**
   */
  test.prop(
    [arbVagueMealItem],
    propertyConfig,
  )(
    'Property 8: vague portions get replaced with PORTION_DEFAULTS',
    (item) => {
      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: {
          items: [item],
          totals: { protein: item.protein, carbs: item.carbs, fat: item.fat, calories: item.calories },
          timing: 'LUNCH',
        },
        remaining_budget: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
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

      const ctx = makeBaseContext()
      const result = applyPortionDefaults(response, ctx)

      // The portion should no longer be vague
      const resultItem = result.meal!.items[0]
      expect(VAGUE_PORTIONS).not.toContain(resultItem.portion.toLowerCase().trim())

      // A smart_defaults entry for portion should exist
      expect(result.smart_defaults!.some(d => d.field === 'portion')).toBe(true)
    },
  )

  /**
   * Property 8e: Specific portions are never modified
   *
   * *For any* meal item with a specific (non-vague) portion,
   * applyPortionDefaults SHALL NOT modify the portion.
   *
   * **Validates: Requirements 3.3**
   */
  test.prop(
    [arbMealItem],
    propertyConfig,
  )(
    'Property 8: specific portions are never modified',
    (item) => {
      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: {
          items: [item],
          totals: { protein: item.protein, carbs: item.carbs, fat: item.fat, calories: item.calories },
          timing: 'DINNER',
        },
        remaining_budget: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence: 0.9,
      }

      const ctx = makeBaseContext()
      const result = applyPortionDefaults(response, ctx)

      // Portion should remain unchanged (arbMealItem uses specific portions)
      expect(result.meal!.items[0].portion).toBe(item.portion)
    },
  )

  /**
   * Property 8f: User portion history is preferred over standard defaults
   *
   * *For any* meal item with a vague portion and matching user history,
   * applyPortionDefaults SHALL use the user's historical portion.
   *
   * **Validates: Requirements 3.3**
   */
  test.prop(
    [
      fc.constantFrom('chicken breast', 'rice', 'salmon', 'steak', 'eggs'),
      fc.constantFrom(...VAGUE_PORTIONS),
      fc.constantFrom('8 oz (225g)', '2 cups cooked', '10 oz', '3 large', '12 oz'),
    ],
    propertyConfig,
  )(
    'Property 8: user portion history preferred over standard defaults',
    (food, vaguePortion, userPortion) => {
      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: {
          items: [{ food, portion: vaguePortion, protein: 30, carbs: 20, fat: 10, calories: 290 }],
          totals: { protein: 30, carbs: 20, fat: 10, calories: 290 },
          timing: 'LUNCH',
        },
        remaining_budget: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
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

      const ctx = makeBaseContext({
        user_portion_history: { [food]: userPortion },
      })
      const result = applyPortionDefaults(response, ctx)

      expect(result.meal!.items[0].portion).toBe(userPortion)
      const portionDefault = result.smart_defaults!.find(d => d.field === 'portion')
      expect(portionDefault).toBeDefined()
      expect(portionDefault!.source).toContain('your usual portion')
    },
  )

  /**
   * Property 8g: Response without meal is returned unchanged
   *
   * **Validates: Requirements 3.3**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 100 })],
    propertyConfig,
  )(
    'Property 8: response without meal is returned unchanged by applyPortionDefaults',
    (message) => {
      const response: NutritionistResponse = {
        message,
        remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence: 0.9,
      }

      const ctx = makeBaseContext()
      const result = applyPortionDefaults(response, ctx)
      expect(result).toEqual(response)
    },
  )
})


// ─── Property 10: Meal persistence round-trip ────────────────────────

describe('Property 10: Meal persistence round-trip', () => {

  /**
   * Property 10a: Persisted meal contains correct macros, timing, items, and user_id
   *
   * *For any* NutritionistResponse with meal items, persistMeal SHALL insert
   * a meal row with matching user_id, meal_timing, total_protein, total_carbs,
   * total_fat, total_calories, and items.
   *
   * **Validates: Requirements 3.8**
   */
  test.prop(
    [
      fc.array(arbMealItem, { minLength: 1, maxLength: 5 }),
      arbMealTiming,
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
      fc.uuid(),
    ],
    propertyConfig,
  )(
    'Property 10: meal insert contains correct macros, timing, items, user_id',
    async (items, timing, confidence, userId) => {
      let capturedInsert: Record<string, unknown> | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('meal')
          capturedInsert = args.p_record
          return { data: 'meal-prop10', error: null }
        }),
      }

      const totals: MacroTotals = {
        protein: items.reduce((s, i) => s + i.protein, 0),
        carbs: items.reduce((s, i) => s + i.carbs, 0),
        fat: items.reduce((s, i) => s + i.fat, 0),
        calories: items.reduce((s, i) => s + i.calories, 0),
      }

      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: { items, totals, timing },
        remaining_budget: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
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

      const id = await persistMeal(response, userId, mockSupabase as any)

      expect(id).toBe('meal-prop10')
      expect(capturedInsert).not.toBeNull()
      expect(capturedInsert!.user_id).toBe(userId)
      expect(capturedInsert!.meal_timing).toBe(normalizeMealTiming(timing))
      expect(capturedInsert!.total_protein).toBe(totals.protein)
      expect(capturedInsert!.total_carbs).toBe(totals.carbs)
      expect(capturedInsert!.total_fat).toBe(totals.fat)
      expect(capturedInsert!.total_calories).toBe(totals.calories)
      expect(capturedInsert!.items).toEqual(items)
    },
  )

  /**
   * Property 10b: Low confidence sets needs_review to true
   *
   * *For any* NutritionistResponse with confidence < 0.7,
   * persistMeal SHALL set needs_review=true and ai_confidence to the confidence value.
   *
   * **Validates: Requirements 3.8**
   */
  test.prop(
    [
      fc.array(arbMealItem, { minLength: 1, maxLength: 3 }),
      fc.float({ min: Math.fround(0), max: Math.fround(0.69), noNaN: true }),
    ],
    propertyConfig,
  )(
    'Property 10: low confidence sets needs_review true',
    async (items, confidence) => {
      let capturedInsert: Record<string, unknown> | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('meal')
          capturedInsert = args.p_record
          return { data: 'meal-low-conf', error: null }
        }),
      }

      const totals: MacroTotals = {
        protein: items.reduce((s, i) => s + i.protein, 0),
        carbs: items.reduce((s, i) => s + i.carbs, 0),
        fat: items.reduce((s, i) => s + i.fat, 0),
        calories: items.reduce((s, i) => s + i.calories, 0),
      }

      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: { items, totals, timing: 'LUNCH' },
        remaining_budget: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
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

      await persistMeal(response, 'user-low-conf', mockSupabase as any)

      expect(capturedInsert).not.toBeNull()
      expect(capturedInsert!.needs_review).toBe(true)
      expect(capturedInsert!.ai_confidence).toBe(confidence)
    },
  )

  /**
   * Property 10c: No meal means no persistence (returns null)
   *
   * **Validates: Requirements 3.8**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 100 })],
    propertyConfig,
  )(
    'Property 10: response without meal returns null',
    async (message) => {
      const fromFn = vi.fn()
      const mockSupabase = { from: fromFn }

      const response: NutritionistResponse = {
        message,
        remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence: 0.9,
      }

      const id = await persistMeal(response, 'user-no-meal', mockSupabase as any)
      expect(id).toBeNull()
      expect(fromFn).not.toHaveBeenCalled()
    },
  )

  /**
   * Property 10d: Empty items means no persistence (returns null)
   *
   * **Validates: Requirements 3.8**
   */
  test.prop(
    [arbMealTiming],
    propertyConfig,
  )(
    'Property 10: response with empty items returns null',
    async (timing) => {
      const fromFn = vi.fn()
      const mockSupabase = { from: fromFn }

      const response: NutritionistResponse = {
        message: 'Logged!',
        meal: {
          items: [],
          totals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
          timing,
        },
        remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
          prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
          adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
          overall_status: 'on-track',
        },
        smart_defaults: [],
        confidence: 0.5,
      }

      const id = await persistMeal(response, 'user-empty', mockSupabase as any)
      expect(id).toBeNull()
      expect(fromFn).not.toHaveBeenCalled()
    },
  )
})


// ─── Property 11: Meal timing inference ──────────────────────────────

describe('Property 11: Meal timing inference', () => {

  /**
   * Property 11a: Time-of-day rules without workouts
   *
   * *For any* hour (0-23) with 0 workouts, inferMealTiming SHALL return:
   * - Before 10am → BREAKFAST
   * - 10am-1pm → LUNCH
   * - 1pm-4pm → SNACK
   * - 4pm-8pm → DINNER
   * - After 8pm → SNACK
   *
   * **Validates: Requirements 3.9**
   */
  test.prop(
    [fc.integer({ min: 0, max: 23 })],
    propertyConfig,
  )(
    'Property 11: time-of-day rules without workouts',
    (hour) => {
      const timestamp = `2026-01-20T${hour.toString().padStart(2, '0')}:30:00Z`
      const result = inferMealTiming(timestamp, 0)

      expect(result).not.toBeNull()

      if (hour < 10) {
        expect(result).toBe('BREAKFAST')
      } else if (hour >= 10 && hour < 13) {
        expect(result).toBe('LUNCH')
      } else if (hour >= 13 && hour < 16) {
        expect(result).toBe('SNACK')
      } else if (hour >= 16 && hour < 20) {
        expect(result).toBe('DINNER')
      } else {
        expect(result).toBe('SNACK')
      }
    },
  )

  /**
   * Property 11b: Workout proximity overrides time-of-day rules
   *
   * *For any* hour with workouts > 0, inferMealTiming SHALL return
   * PRE_WORKOUT or POST_WORKOUT for workout-adjacent hours,
   * and fall through to time-of-day rules for non-adjacent hours.
   *
   * **Validates: Requirements 3.9**
   */
  test.prop(
    [
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 1, max: 3 }),
    ],
    propertyConfig,
  )(
    'Property 11: workout proximity overrides produce PRE/POST_WORKOUT or time-of-day fallback',
    (hour, workoutCount) => {
      const timestamp = `2026-01-20T${hour.toString().padStart(2, '0')}:30:00Z`
      const result = inferMealTiming(timestamp, workoutCount)

      expect(result).not.toBeNull()
      expect(VALID_TIMINGS).toContain(result)

      // Workout-adjacent hours should return PRE or POST_WORKOUT
      if (hour >= 5 && hour < 8) {
        expect(result).toBe('PRE_WORKOUT')
      } else if (hour >= 8 && hour < 11) {
        expect(result).toBe('POST_WORKOUT')
      } else if (hour >= 15 && hour < 17) {
        expect(result).toBe('PRE_WORKOUT')
      } else if (hour >= 17 && hour < 20) {
        expect(result).toBe('POST_WORKOUT')
      } else {
        // Non-adjacent hours fall through to time-of-day rules
        if (hour < 10) {
          expect(result).toBe('BREAKFAST')
        } else if (hour >= 10 && hour < 13) {
          expect(result).toBe('LUNCH')
        } else if (hour >= 13 && hour < 16) {
          expect(result).toBe('SNACK')
        } else if (hour >= 16 && hour < 20) {
          expect(result).toBe('DINNER')
        } else {
          expect(result).toBe('SNACK')
        }
      }
    },
  )

  /**
   * Property 11c: Result is always a valid MealTiming or null
   *
   * *For any* timestamp and workout count, inferMealTiming SHALL return
   * either null (for invalid timestamps) or a valid MealTiming value.
   *
   * **Validates: Requirements 3.9**
   */
  test.prop(
    [
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 10 }),
    ],
    propertyConfig,
  )(
    'Property 11: result is always a valid MealTiming',
    (hour, workoutCount) => {
      const timestamp = `2026-01-20T${hour.toString().padStart(2, '0')}:15:00Z`
      const result = inferMealTiming(timestamp, workoutCount)

      expect(result).not.toBeNull()
      expect(VALID_TIMINGS).toContain(result)
    },
  )

  /**
   * Property 11d: Invalid timestamps return null
   *
   * **Validates: Requirements 3.9**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 50 }).filter(s => isNaN(new Date(s).getTime()))],
    propertyConfig,
  )(
    'Property 11: invalid timestamps return null',
    (badTimestamp) => {
      const result = inferMealTiming(badTimestamp, 0)
      expect(result).toBeNull()
    },
  )

  /**
   * Property 11e: Zero workouts never produces PRE_WORKOUT or POST_WORKOUT
   *
   * *For any* hour with 0 workouts, inferMealTiming SHALL NOT return
   * PRE_WORKOUT or POST_WORKOUT.
   *
   * **Validates: Requirements 3.9**
   */
  test.prop(
    [fc.integer({ min: 0, max: 23 })],
    propertyConfig,
  )(
    'Property 11: zero workouts never produces PRE/POST_WORKOUT',
    (hour) => {
      const timestamp = `2026-01-20T${hour.toString().padStart(2, '0')}:00:00Z`
      const result = inferMealTiming(timestamp, 0)

      expect(result).not.toBeNull()
      expect(result).not.toBe('PRE_WORKOUT')
      expect(result).not.toBe('POST_WORKOUT')
    },
  )
})
