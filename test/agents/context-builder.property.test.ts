vi.mock('@/app/lib/coach/athlete-context', () => ({
  fetchCoachRuntimeContext: vi.fn().mockResolvedValue({ storageAvailable: true, activeProgram: null })
}))

/**
 * Property-Based Tests for Context Builders
 *
 * Feature: agent-system, Property 16: Trainer context time window
 * Feature: agent-system, Property 17: Nutritionist context daily scope
 * Feature: agent-system, Property 18: Socius context completeness
 *
 * **Validates: Requirements 5.2, 5.3, 5.4**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi, beforeEach } from 'vitest'

// ─── Module Mocks (must be before imports) ───────────────────────────

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))

vi.mock('@/app/lib/agents/chat-persistence', () => ({
  fetchRecentChat: vi.fn().mockResolvedValue([]),
  fetchPendingUrgentInsights: vi.fn().mockResolvedValue([])
}))

import {
  buildTrainerContext,
  buildNutritionistContext,
  buildSociusContext,
} from '@/app/lib/agents/context-builder'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import type { TrainerContext, NutritionistContext, SociusContext } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Date Helpers ────────────────────────────────────────────────────

/** Generate a YYYY-MM-DD date string offset from today */
function dateOffset(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD
}

/** Generate an ISO timestamp for a given daysAgo */
function isoOffset(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/** Days ago for "recent" workouts (within 7 days) */
const arbRecentDaysAgo = fc.integer({ min: 0, max: 6 })

/** Days ago for "old" workouts (older than 7 days) */
const arbOldDaysAgo = fc.integer({ min: 8, max: 60 })

/** A workout row as returned by Supabase */
const arbWorkoutRow = (daysAgo: fc.Arbitrary<number>) =>
  fc.record({
    id: fc.uuid(),
    workout_date: daysAgo.map(d => dateOffset(d)),
    input_text: fc.string({ minLength: 1, maxLength: 50 }),
    blocks: fc.constant([{ block_type: 'AMRAP', movements: [{ name: 'Pull-up', reps: 10 }] }]),
    primary_score: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
    tags: fc.constant([])
  })

/** A meal row as returned by Supabase */
const arbMealRow = (daysAgo: fc.Arbitrary<number>) =>
  fc.record({
    id: fc.uuid(),
    meal_timestamp: daysAgo.map(d => isoOffset(d)),
    meal_timing: fc.constantFrom('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', null),
    items: fc.constant([]),
    total_protein: fc.integer({ min: 0, max: 100 }).map(String),
    total_carbs: fc.integer({ min: 0, max: 150 }).map(String),
    total_fat: fc.integer({ min: 0, max: 80 }).map(String),
    total_calories: fc.integer({ min: 0, max: 1000 }).map(String),
  })

// ─── Mock Factory ────────────────────────────────────────────────────

/**
 * Creates a mock Supabase client that routes data based on table name
 * and query shape (selected columns, filters, etc.)
 */
function createContextMock(tableData: Record<string, (params: QueryParams) => any[]>) {
  const mockFrom = vi.fn((table: string) => {
    const params: QueryParams = {
      selectedCols: '',
      eqCalls: [],
      hasSingle: false,
      limitVal: null,
      hasIs: false,
      hasGte: false,
      gteArgs: [],
      ltArgs: [],
    }

    const tableChain: Record<string, any> = {}
    const tableSelf = () => tableChain
    tableChain.select = vi.fn((cols: string) => { params.selectedCols = cols; return tableChain })
    tableChain.eq = vi.fn((col: string, val: any) => { params.eqCalls.push([col, val]); return tableChain })
    tableChain.gte = vi.fn((col: string, val: any) => { params.hasGte = true; params.gteArgs.push([col, val]); return tableChain })
    tableChain.lt = vi.fn((col: string, val: any) => { params.ltArgs.push([col, val]); return tableChain })
    tableChain.is = vi.fn(() => { params.hasIs = true; return tableChain })
    tableChain.order = vi.fn(tableSelf)
    tableChain.limit = vi.fn((n: number) => { params.limitVal = n; return tableChain })
    tableChain.single = vi.fn(() => {
      params.hasSingle = true
      return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
    })

    tableChain.then = vi.fn((resolve: any) => {
      const resolver = tableData[table]
      if (resolver) {
        return resolve({ data: resolver(params), error: null })
      }
      return resolve({ data: [], error: null })
    })

    return tableChain
  })

  return { from: mockFrom }
}

interface QueryParams {
  selectedCols: string
  eqCalls: [string, any][]
  hasSingle: boolean
  limitVal: number | null
  hasIs: boolean
  hasGte: boolean
  gteArgs: [string, any][]
  ltArgs: [string, any][]
}

// ─── Property 16: Trainer context time window ────────────────────────

describe('Property 16: Trainer context time window', () => {

  beforeEach(() => {
    vi.mocked(createServerClient).mockReset()
  })

  /**
   * Property 16a: Only workouts from the last 7 days are included
   *
   * *For any* user with workouts spanning multiple weeks, the Trainer context
   * SHALL include only workouts from the last 7 days and exclude all older workouts.
   *
   * **Validates: Requirements 5.2**
   */
  test.prop(
    [
      fc.array(arbWorkoutRow(arbRecentDaysAgo), { minLength: 1, maxLength: 5 }),
      fc.array(arbWorkoutRow(arbOldDaysAgo), { minLength: 1, maxLength: 5 }),
    ],
    propertyConfig
  )(
    'Property 16: only last 7 days of workouts included in trainer context',
    async (recentWorkouts, oldWorkouts) => {
      // The Supabase query in fetchRecentWorkouts uses .gte('workout_date', cutoffDate)
      // where cutoffDate is 7 days ago. We simulate this filtering in the mock.
      const allWorkouts = [...recentWorkouts, ...oldWorkouts]
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffDate = cutoff.toLocaleDateString('en-CA')

      const mock = createContextMock({
        workouts: (params) => {
          // fetchRecentWorkouts selects specific columns with gte on workout_date
          // fetchTodaysWorkouts selects 'id' only
          if (params.selectedCols === 'id') return []
          // Simulate the gte filter the real DB would apply
          return allWorkouts.filter(w => w.workout_date >= cutoffDate)
        },
        benchmark_prs: () => [],
        meals: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: TrainerContext = await buildTrainerContext('user-prop16')

      // All returned workouts must be within the last 7 days
      const today = new Date()
      for (const workout of ctx.recent_workouts) {
        const workoutDate = new Date(workout.date + 'T00:00:00')
        const diffMs = today.getTime() - workoutDate.getTime()
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        expect(diffDays).toBeLessThanOrEqual(8) // 7 days + buffer for time-of-day
        expect(diffDays).toBeGreaterThanOrEqual(-1) // not in the future (with buffer)
      }

      // No old workouts should be present
      const oldIds = new Set(oldWorkouts.map(w => w.id))
      for (const workout of ctx.recent_workouts) {
        expect(oldIds.has(workout.id)).toBe(false)
      }
    }
  )

  /**
   * Property 16b: Recent workouts count matches filtered set
   *
   * **Validates: Requirements 5.2**
   */
  test.prop(
    [
      fc.array(arbWorkoutRow(arbRecentDaysAgo), { minLength: 0, maxLength: 8 }),
      fc.array(arbWorkoutRow(arbOldDaysAgo), { minLength: 0, maxLength: 8 }),
    ],
    propertyConfig
  )(
    'Property 16: recent_workouts count equals workouts within 7-day window',
    async (recentWorkouts, oldWorkouts) => {
      const allWorkouts = [...recentWorkouts, ...oldWorkouts]
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffDate = cutoff.toLocaleDateString('en-CA')

      const expectedRecent = allWorkouts.filter(w => w.workout_date >= cutoffDate)

      const mock = createContextMock({
        workouts: (params) => {
          if (params.selectedCols === 'id') return []
          return expectedRecent
        },
        benchmark_prs: () => [],
        meals: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: TrainerContext = await buildTrainerContext('user-prop16b')

      expect(ctx.recent_workouts.length).toBe(expectedRecent.length)
    }
  )

  /**
   * Property 16c: Trainer context always includes PassiveContext base fields
   *
   * **Validates: Requirements 5.2**
   */
  test.prop(
    [fc.uuid()],
    propertyConfig
  )(
    'Property 16: trainer context always includes base passive context fields',
    async (userId) => {
      const mock = createContextMock({
        workouts: () => [],
        benchmark_prs: () => [],
        meals: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: TrainerContext = await buildTrainerContext(userId)

      // PassiveContext fields
      expect(ctx.user_id).toBe(userId)
      expect(ctx.targets).toBeDefined()
      expect(ctx.today).toBeDefined()
      expect(ctx.week).toBeDefined()
      expect(ctx.current_time).toBeDefined()
      expect(ctx.day_of_week).toBeDefined()
      expect(typeof ctx.has_whoop).toBe('boolean')

      // Trainer-specific fields
      expect(Array.isArray(ctx.recent_workouts)).toBe(true)
      expect(Array.isArray(ctx.benchmark_prs)).toBe(true)
      expect(ctx.movement_aliases).toBeDefined()
    }
  )
})


// ─── Property 17: Nutritionist context daily scope ───────────────────

describe('Property 17: Nutritionist context daily scope', () => {

  beforeEach(() => {
    vi.mocked(createServerClient).mockReset()
  })

  /**
   * Property 17a: Only today's meals are included
   *
   * *For any* user with meals spanning multiple days, the Nutritionist context
   * SHALL include only today's meals and exclude meals from other days.
   *
   * **Validates: Requirements 5.3**
   */
  test.prop(
    [
      fc.array(arbMealRow(fc.constant(0)), { minLength: 1, maxLength: 5 }),
      fc.array(arbMealRow(fc.integer({ min: 1, max: 30 })), { minLength: 1, maxLength: 5 }),
    ],
    propertyConfig
  )(
    'Property 17: only today\'s meals included in nutritionist context',
    async (todaysMeals, olderMeals) => {
      const allMeals = [...todaysMeals, ...olderMeals]

      // Compute today's date boundaries the same way the implementation does
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

      const todayFiltered = allMeals.filter(m =>
        m.meal_timestamp >= startOfDay && m.meal_timestamp < endOfDay
      )

      const mock = createContextMock({
        meals: (params) => {
          // Both fetchTodaysMeals and fetchTodaysMealDetails select columns starting with 'id,'
          // fetchUserPortionHistory uses limit(50) and selects 'items'
          if (params.limitVal === 50) return []
          if (params.selectedCols.startsWith('id')) {
            return todayFiltered
          }
          return []
        },
        daily_targets: () => [],
        daily_summaries: () => [],
        workouts: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: NutritionistContext = await buildNutritionistContext('user-prop17')

      // All returned meals must be from today
      const todayStr = today.toLocaleDateString('en-CA')
      for (const meal of ctx.todays_meals) {
        const mealDate = new Date(meal.timestamp).toLocaleDateString('en-CA')
        expect(mealDate).toBe(todayStr)
      }

      // No older meals should be present
      const olderIds = new Set(olderMeals.map(m => m.id))
      for (const meal of ctx.todays_meals) {
        expect(olderIds.has(meal.id)).toBe(false)
      }
    }
  )

  /**
   * Property 17b: Meal count matches today's filtered set
   *
   * **Validates: Requirements 5.3**
   */
  test.prop(
    [
      fc.array(arbMealRow(fc.constant(0)), { minLength: 0, maxLength: 6 }),
      fc.array(arbMealRow(fc.integer({ min: 1, max: 14 })), { minLength: 0, maxLength: 6 }),
    ],
    propertyConfig
  )(
    'Property 17: todays_meals count equals meals from today only',
    async (todaysMeals, olderMeals) => {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

      const allMeals = [...todaysMeals, ...olderMeals]
      const todayFiltered = allMeals.filter(m =>
        m.meal_timestamp >= startOfDay && m.meal_timestamp < endOfDay
      )

      const mock = createContextMock({
        meals: (params) => {
          if (params.limitVal === 50) return []
          if (params.selectedCols.startsWith('id')) return todayFiltered
          return []
        },
        daily_targets: () => [],
        daily_summaries: () => [],
        workouts: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: NutritionistContext = await buildNutritionistContext('user-prop17b')

      expect(ctx.todays_meals.length).toBe(todayFiltered.length)
    }
  )

  /**
   * Property 17c: Nutritionist context always includes portion_defaults
   *
   * **Validates: Requirements 5.3**
   */
  test.prop(
    [fc.uuid()],
    propertyConfig
  )(
    'Property 17: nutritionist context always includes portion_defaults',
    async (userId) => {
      const mock = createContextMock({
        meals: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
        workouts: () => [],
        whoop_recovery: () => [],
        whoop_cycles: () => [],
        insights: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: NutritionistContext = await buildNutritionistContext(userId)

      // PassiveContext fields
      expect(ctx.user_id).toBe(userId)
      expect(ctx.targets).toBeDefined()
      expect(ctx.today).toBeDefined()

      // Nutritionist-specific fields
      expect(Array.isArray(ctx.todays_meals)).toBe(true)
      expect(ctx.portion_defaults).toBeDefined()
      expect(Object.keys(ctx.portion_defaults).length).toBeGreaterThan(0)
    }
  )
})


// ─── Property 18: Socius context completeness ────────────────────────

describe('Property 18: Socius context completeness', () => {

  beforeEach(() => {
    vi.mocked(createServerClient).mockReset()
  })

  /**
   * Property 18a: Socius context always contains required fields
   *
   * *For any* user with data across all domains, the Socius context SHALL contain
   * non-null `thirty_day_summary`, `recent_insights`, and `data_availability` fields.
   *
   * **Validates: Requirements 5.4**
   */
  test.prop(
    [
      fc.uuid(),
      fc.array(
        fc.record({
          blocks: fc.array(
            fc.record({
              block_type: fc.constantFrom('AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'),
              movements: fc.constant([{ name: 'Squat', reps: 10 }]),
            }),
            { minLength: 0, maxLength: 3 }
          ),
          rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      fc.array(
        fc.record({
          total_protein: fc.integer({ min: 0, max: 100 }).map(String),
          total_calories: fc.integer({ min: 0, max: 1000 }).map(String),
          meal_timestamp: fc.constant(isoOffset(Math.floor(Math.random() * 30))),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      fc.boolean(), // has WHOOP data
    ],
    propertyConfig
  )(
    'Property 18: socius context contains non-null thirty_day_summary, recent_insights, data_availability',
    async (userId, workouts, meals, hasWhoop) => {
      const recoveries = hasWhoop
        ? [{ recovery_score: '70' }, { recovery_score: '65' }]
        : []

      const mock = createContextMock({
        workouts: (params) => {
          if (params.selectedCols === 'id') return []
          if (params.selectedCols === 'workout_date') return workouts.map((_, i) => ({ workout_date: dateOffset(i) }))
          return workouts
        },
        meals: (params) => {
          if (params.selectedCols.startsWith('id')) return []
          if (params.selectedCols === 'meal_timestamp') return meals.map(m => ({ meal_timestamp: m.meal_timestamp }))
          return meals
        },
        benchmark_prs: () => [],
        whoop_recovery: (params) => {
          if (params.selectedCols === 'id') return recoveries.length > 0 ? [{ id: 'w1' }] : []
          return recoveries
        },
        whoop_sleep: () => [],
        whoop_cycles: () => [],
        insights: () => [],
        daily_targets: (params) => {
          if (params.selectedCols === 'id') return []
          return []
        },
        daily_summaries: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: SociusContext = await buildSociusContext(userId)

      // Required fields must be non-null
      expect(ctx.thirty_day_summary).not.toBeNull()
      expect(ctx.thirty_day_summary).toBeDefined()
      expect(ctx.recent_insights).not.toBeNull()
      expect(ctx.recent_insights).toBeDefined()
      expect(ctx.data_availability).not.toBeNull()
      expect(ctx.data_availability).toBeDefined()

      // thirty_day_summary structure
      expect(typeof ctx.thirty_day_summary.workout_count).toBe('number')
      expect(ctx.thirty_day_summary.workout_types).toBeDefined()
      expect(typeof ctx.thirty_day_summary.workout_types.metcon).toBe('number')
      expect(typeof ctx.thirty_day_summary.workout_types.strength).toBe('number')
      expect(typeof ctx.thirty_day_summary.workout_types.cardio).toBe('number')
      expect(typeof ctx.thirty_day_summary.workout_types.emom).toBe('number')
      expect(typeof ctx.thirty_day_summary.total_meals).toBe('number')
      expect(typeof ctx.thirty_day_summary.pr_count).toBe('number')

      // data_availability structure
      expect(typeof ctx.data_availability.has_workouts).toBe('boolean')
      expect(typeof ctx.data_availability.has_meals).toBe('boolean')
      expect(typeof ctx.data_availability.has_whoop).toBe('boolean')
      expect(typeof ctx.data_availability.has_targets).toBe('boolean')
      expect(typeof ctx.data_availability.workout_days).toBe('number')
      expect(typeof ctx.data_availability.meal_days).toBe('number')

      // recent_insights is always an array
      expect(Array.isArray(ctx.recent_insights)).toBe(true)
    }
  )

  /**
   * Property 18b: has_whoop reflects WHOOP data presence
   *
   * If WHOOP data exists, `has_whoop` SHALL be true.
   *
   * **Validates: Requirements 5.4**
   */
  test.prop(
    [
      fc.uuid(),
      fc.boolean(),
    ],
    propertyConfig
  )(
    'Property 18: has_whoop reflects WHOOP data availability',
    async (userId, hasWhoop) => {
      const recoveries = hasWhoop ? [{ recovery_score: '70' }] : []

      const mock = createContextMock({
        workouts: (params) => {
          if (params.selectedCols === 'id') return []
          if (params.selectedCols === 'workout_date') return []
          return []
        },
        meals: () => [],
        benchmark_prs: () => [],
        whoop_recovery: (params) => {
          // For data availability check (selects 'id' with limit 1)
          if (params.selectedCols === 'id') return recoveries.length > 0 ? [{ id: 'r1' }] : []
          // For thirty day summary (selects 'recovery_score')
          return recoveries
        },
        whoop_sleep: () => [],
        whoop_cycles: (params) => {
          // fetchLatestWhoopStrain uses single() — handled by mock
          return []
        },
        insights: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: SociusContext = await buildSociusContext(userId)

      // data_availability.has_whoop should match whether WHOOP data was provided
      expect(ctx.data_availability.has_whoop).toBe(hasWhoop)
    }
  )

  /**
   * Property 18c: Socius context inherits all PassiveContext base fields
   *
   * **Validates: Requirements 5.4**
   */
  test.prop(
    [fc.uuid()],
    propertyConfig
  )(
    'Property 18: socius context inherits all passive context base fields',
    async (userId) => {
      const mock = createContextMock({
        workouts: () => [],
        meals: () => [],
        benchmark_prs: () => [],
        whoop_recovery: () => [],
        whoop_sleep: () => [],
        whoop_cycles: () => [],
        insights: () => [],
        daily_targets: () => [],
        daily_summaries: () => [],
      })

      vi.mocked(createServerClient).mockResolvedValue(mock as any)
      const ctx: SociusContext = await buildSociusContext(userId)

      // PassiveContext base fields
      expect(ctx.user_id).toBe(userId)
      expect(ctx.targets).toBeDefined()
      expect(typeof ctx.targets.protein).toBe('number')
      expect(typeof ctx.targets.carbs).toBe('number')
      expect(typeof ctx.targets.fat).toBe('number')
      expect(typeof ctx.targets.calories).toBe('number')
      expect(ctx.today).toBeDefined()
      expect(ctx.week).toBeDefined()
      expect(typeof ctx.current_time).toBe('string')
      expect(typeof ctx.day_of_week).toBe('string')
      expect(typeof ctx.has_whoop).toBe('boolean')
      expect(Array.isArray(ctx.recent_chat)).toBe(true)
      expect(Array.isArray(ctx.pending_insights)).toBe(true)

      // Socius-specific fields
      expect(ctx.thirty_day_summary).toBeDefined()
      expect(Array.isArray(ctx.recent_insights)).toBe(true)
      expect(ctx.data_availability).toBeDefined()
    }
  )
})
