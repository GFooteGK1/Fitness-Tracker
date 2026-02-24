/**
 * Property-Based Tests for Budget and Adherence Calculations
 *
 * Feature: agent-system, Property 9: Remaining macro budget calculation
 * Feature: agent-system, Property 12: Week-to-date adherence calculation
 *
 * **Validates: Requirements 3.4, 3.10**
 *
 * These tests directly exercise the pure utility functions:
 * - aggregateMacros()
 * - calculateRemaining()
 * - calculateWeekAdherence()
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import {
  aggregateMacros,
  calculateRemaining,
  calculateWeekAdherence,
} from '@/app/lib/agents/context-builder'
import type { MacroTargets, MacroTotals, MealSummary } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Arbitraries ─────────────────────────────────────────────────────

/** Non-negative macro totals (representing consumed values) */
const arbMacroTotals: fc.Arbitrary<MacroTotals> = fc.record({
  protein: fc.integer({ min: 0, max: 500 }),
  carbs: fc.integer({ min: 0, max: 800 }),
  fat: fc.integer({ min: 0, max: 300 }),
  calories: fc.integer({ min: 0, max: 5000 }),
})

/** Positive macro targets (daily targets must be > 0) */
const arbMacroTargets: fc.Arbitrary<MacroTargets> = fc.record({
  protein: fc.integer({ min: 1, max: 500 }),
  carbs: fc.integer({ min: 1, max: 800 }),
  fat: fc.integer({ min: 1, max: 300 }),
  calories: fc.integer({ min: 1, max: 5000 }),
  tolerance_pct: fc.integer({ min: 1, max: 50 }),
})

/** A MealSummary with non-negative macro totals */
const arbMealSummary: fc.Arbitrary<MealSummary> = fc.record({
  id: fc.uuid(),
  timestamp: fc.constant(new Date().toISOString()),
  timing: fc.constantFrom('BREAKFAST' as const, 'LUNCH' as const, 'DINNER' as const, 'SNACK' as const, null),
  items: fc.constant([]),
  totals: arbMacroTotals,
})

// ─── Property 9: Remaining macro budget calculation ──────────────────

describe('Property 9: Remaining macro budget calculation', () => {

  /**
   * Property 9a: Remaining = target - consumed for each macro field
   *
   * *For any* set of today's meals (with non-negative macros) and daily targets
   * (with positive values), the remaining budget SHALL equal `target - sum(meals)`
   * for each macro (protein, carbs, fat, calories).
   *
   * **Validates: Requirements 3.4**
   */
  test.prop(
    [
      fc.array(arbMealSummary, { minLength: 0, maxLength: 10 }),
      arbMacroTargets,
    ],
    propertyConfig
  )(
    'Property 9: remaining = target - aggregated consumed for each macro',
    (meals, targets) => {
      const consumed = aggregateMacros(meals)
      const remaining = calculateRemaining(consumed, targets)

      expect(remaining.protein).toBe(targets.protein - consumed.protein)
      expect(remaining.carbs).toBe(targets.carbs - consumed.carbs)
      expect(remaining.fat).toBe(targets.fat - consumed.fat)
      expect(remaining.calories).toBe(targets.calories - consumed.calories)
    }
  )

  /**
   * Property 9b: Remaining MAY be negative (over-target)
   *
   * When consumed exceeds targets, remaining values are negative.
   *
   * **Validates: Requirements 3.4**
   */
  test.prop(
    [arbMacroTargets],
    propertyConfig
  )(
    'Property 9: remaining is negative when consumed exceeds target',
    (targets) => {
      const overConsumed: MacroTotals = {
        protein: targets.protein + 50,
        carbs: targets.carbs + 50,
        fat: targets.fat + 50,
        calories: targets.calories + 500,
      }
      const remaining = calculateRemaining(overConsumed, targets)

      expect(remaining.protein).toBeLessThan(0)
      expect(remaining.carbs).toBeLessThan(0)
      expect(remaining.fat).toBeLessThan(0)
      expect(remaining.calories).toBeLessThan(0)
    }
  )

  /**
   * Property 9c: Zero meals → full budget remaining
   *
   * **Validates: Requirements 3.4**
   */
  test.prop(
    [arbMacroTargets],
    propertyConfig
  )(
    'Property 9: zero meals means remaining equals full target',
    (targets) => {
      const consumed = aggregateMacros([])
      const remaining = calculateRemaining(consumed, targets)

      expect(remaining.protein).toBe(targets.protein)
      expect(remaining.carbs).toBe(targets.carbs)
      expect(remaining.fat).toBe(targets.fat)
      expect(remaining.calories).toBe(targets.calories)
    }
  )

  /**
   * Property 9d: aggregateMacros sums all meal totals correctly
   *
   * **Validates: Requirements 3.4**
   */
  test.prop(
    [fc.array(arbMealSummary, { minLength: 1, maxLength: 10 })],
    propertyConfig
  )(
    'Property 9: aggregateMacros equals manual sum of meal totals',
    (meals) => {
      const aggregated = aggregateMacros(meals)

      const expectedProtein = meals.reduce((sum, m) => sum + m.totals.protein, 0)
      const expectedCarbs = meals.reduce((sum, m) => sum + m.totals.carbs, 0)
      const expectedFat = meals.reduce((sum, m) => sum + m.totals.fat, 0)
      const expectedCalories = meals.reduce((sum, m) => sum + m.totals.calories, 0)

      expect(aggregated.protein).toBe(expectedProtein)
      expect(aggregated.carbs).toBe(expectedCarbs)
      expect(aggregated.fat).toBe(expectedFat)
      expect(aggregated.calories).toBe(expectedCalories)
    }
  )
})

// ─── Property 12: Week-to-date adherence calculation ─────────────────

describe('Property 12: Week-to-date adherence calculation', () => {

  /**
   * Property 12a: Adherence percentages equal (actual / prorated_target) × 100
   *
   * *For any* set of daily meal summaries and daily targets with positive values,
   * the week-to-date adherence percentages SHALL equal
   * `(actual_cumulative / (daily_target × days_elapsed)) × 100` for each macro.
   *
   * **Validates: Requirements 3.10**
   */
  test.prop(
    [
      fc.array(arbMacroTotals, { minLength: 1, maxLength: 7 }),
      arbMacroTargets,
    ],
    propertyConfig
  )(
    'Property 12: adherence pct = (actual / prorated_target) * 100',
    (dailySummaries, targets) => {
      const result = calculateWeekAdherence(dailySummaries, targets)
      const days = dailySummaries.length

      // Verify days_elapsed
      expect(result.days_elapsed).toBe(days)

      // Verify actual is the sum of daily summaries
      const expectedActual = dailySummaries.reduce(
        (acc, d) => ({
          protein: acc.protein + d.protein,
          carbs: acc.carbs + d.carbs,
          fat: acc.fat + d.fat,
          calories: acc.calories + d.calories,
        }),
        { protein: 0, carbs: 0, fat: 0, calories: 0 }
      )
      expect(result.actual.protein).toBe(expectedActual.protein)
      expect(result.actual.carbs).toBe(expectedActual.carbs)
      expect(result.actual.fat).toBe(expectedActual.fat)
      expect(result.actual.calories).toBe(expectedActual.calories)

      // Verify prorated target = daily_target × days_elapsed
      expect(result.prorated_target.protein).toBe(targets.protein * days)
      expect(result.prorated_target.carbs).toBe(targets.carbs * days)
      expect(result.prorated_target.fat).toBe(targets.fat * days)
      expect(result.prorated_target.calories).toBe(targets.calories * days)

      // Verify adherence percentages (targets are positive, so prorated > 0)
      const expectedProteinPct = (expectedActual.protein / (targets.protein * days)) * 100
      const expectedCarbsPct = (expectedActual.carbs / (targets.carbs * days)) * 100
      const expectedFatPct = (expectedActual.fat / (targets.fat * days)) * 100
      const expectedCaloriesPct = (expectedActual.calories / (targets.calories * days)) * 100

      expect(result.adherence_pct.protein).toBeCloseTo(expectedProteinPct, 5)
      expect(result.adherence_pct.carbs).toBeCloseTo(expectedCarbsPct, 5)
      expect(result.adherence_pct.fat).toBeCloseTo(expectedFatPct, 5)
      expect(result.adherence_pct.calories).toBeCloseTo(expectedCaloriesPct, 5)
    }
  )

  /**
   * Property 12b: overall_status classification matches tolerance
   *
   * `on-track` when average adherence is within tolerance,
   * `ahead` when above, `behind` when below.
   *
   * **Validates: Requirements 3.10**
   */
  test.prop(
    [
      fc.array(arbMacroTotals, { minLength: 1, maxLength: 7 }),
      arbMacroTargets,
    ],
    propertyConfig
  )(
    'Property 12: overall_status matches tolerance-based classification',
    (dailySummaries, targets) => {
      const result = calculateWeekAdherence(dailySummaries, targets)
      const { adherence_pct, overall_status } = result
      const tol = targets.tolerance_pct

      const avgPct = (adherence_pct.protein + adherence_pct.carbs + adherence_pct.fat + adherence_pct.calories) / 4

      if (avgPct >= (100 - tol) && avgPct <= (100 + tol)) {
        expect(overall_status).toBe('on-track')
      } else if (avgPct > (100 + tol)) {
        expect(overall_status).toBe('ahead')
      } else {
        expect(overall_status).toBe('behind')
      }
    }
  )

  /**
   * Property 12c: Empty summaries → days_elapsed defaults to 1
   *
   * **Validates: Requirements 3.10**
   */
  test.prop(
    [arbMacroTargets],
    propertyConfig
  )(
    'Property 12: empty summaries defaults days_elapsed to 1',
    (targets) => {
      const result = calculateWeekAdherence([], targets)

      expect(result.days_elapsed).toBe(1)
      expect(result.actual.protein).toBe(0)
      expect(result.actual.carbs).toBe(0)
      expect(result.actual.fat).toBe(0)
      expect(result.actual.calories).toBe(0)

      // Prorated target should be 1 × daily target
      expect(result.prorated_target.protein).toBe(targets.protein)
      expect(result.prorated_target.carbs).toBe(targets.carbs)
      expect(result.prorated_target.fat).toBe(targets.fat)
      expect(result.prorated_target.calories).toBe(targets.calories)

      // All adherence should be 0% (no food logged)
      expect(result.adherence_pct.protein).toBe(0)
      expect(result.adherence_pct.carbs).toBe(0)
      expect(result.adherence_pct.fat).toBe(0)
      expect(result.adherence_pct.calories).toBe(0)

      // 0% average → behind
      expect(result.overall_status).toBe('behind')
    }
  )

  /**
   * Property 12d: Adherence is non-negative when macros are non-negative
   *
   * **Validates: Requirements 3.10**
   */
  test.prop(
    [
      fc.array(arbMacroTotals, { minLength: 1, maxLength: 7 }),
      arbMacroTargets,
    ],
    propertyConfig
  )(
    'Property 12: adherence percentages are non-negative for non-negative inputs',
    (dailySummaries, targets) => {
      const result = calculateWeekAdherence(dailySummaries, targets)

      expect(result.adherence_pct.protein).toBeGreaterThanOrEqual(0)
      expect(result.adherence_pct.carbs).toBeGreaterThanOrEqual(0)
      expect(result.adherence_pct.fat).toBeGreaterThanOrEqual(0)
      expect(result.adherence_pct.calories).toBeGreaterThanOrEqual(0)
    }
  )
})
