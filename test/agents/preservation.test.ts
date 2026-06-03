/**
 * Property-Based Preservation Tests for Agent Parsing
 *
 * Task 6: Write property-based tests for preservation
 *
 * **IMPORTANT**: This file provides additional preservation testing.
 * Comprehensive property-based tests are in error-handling-preservation.property.test.ts
 *
 * Feature: trainer-parsing-error-handling
 * Property 2: Preservation - Successful Parsing Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { parseTrainerResponse } from '@/app/lib/agents/trainer-agent'
import { parseNutritionistResponse } from '@/app/lib/agents/nutritionist-agent'
import { parseSociusResponse } from '@/app/lib/agents/socius-agent'

const propertyConfig = { numRuns: 50 }

// ─── Arbitraries for Valid JSON Responses ────────────────────────────

const arbValidTrainerJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  workout: fc.option(
    fc.record({
      blocks: fc.array(
        fc.record({
          block_type: fc.constantFrom('AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'),
          duration_min: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
          movements: fc.array(
            fc.record({
              name: fc.constantFrom('Pull-up', 'Deadlift', 'Thruster', 'Back Squat'),
              reps: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
              weight: fc.option(fc.constantFrom('95 lb', '135 lb', '185 lb'), { nil: undefined }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          score: fc.option(
            fc.oneof(
              fc.record({ time_s: fc.integer({ min: 30, max: 3600 }) }),
              fc.record({ rounds: fc.integer({ min: 1, max: 30 }), extra_reps: fc.integer({ min: 0, max: 50 }) })
            ),
            { nil: undefined }
          ),
          rx_status: fc.option(fc.constantFrom<'RX' | 'SCALED'>('RX', 'SCALED'), { nil: undefined }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      primary_score: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
      rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
      tags: fc.array(fc.constantFrom('metcon', 'strength', 'cardio'), { minLength: 0, maxLength: 2 }),
    }),
    { nil: undefined }
  ),
  new_prs: fc.constant([]),
  smart_defaults: fc.constant([]),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

const arbValidNutritionistJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  meal: fc.option(
    fc.record({
      items: fc.array(
        fc.record({
          food: fc.constantFrom('Chicken breast', 'White rice', 'Salmon', 'Broccoli'),
          portion: fc.constantFrom('6 oz', '1 cup', '4 oz', '200g'),
          protein: fc.integer({ min: 0, max: 60 }),
          carbs: fc.integer({ min: 0, max: 80 }),
          fat: fc.integer({ min: 0, max: 30 }),
          calories: fc.integer({ min: 0, max: 500 }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      totals: fc.record({
        protein: fc.integer({ min: 0, max: 200 }),
        carbs: fc.integer({ min: 0, max: 300 }),
        fat: fc.integer({ min: 0, max: 150 }),
        calories: fc.integer({ min: 0, max: 2000 }),
      }),
      timing: fc.constantFrom('PRE_WORKOUT', 'POST_WORKOUT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'),
    }),
    { nil: undefined }
  ),
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

const arbValidSociusJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 200 }),
  insights: fc.array(
    fc.record({
      id: fc.uuid(),
      pattern_id: fc.constantFrom('CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC', 'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG'),
      priority: fc.constantFrom<'urgent' | 'notable' | 'informational'>('urgent', 'notable', 'informational'),
      confidence: fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true }),
      content: fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
      created_at: fc.constant(new Date().toISOString()),
    }),
    { minLength: 0, maxLength: 3 }
  ),
  data_points: fc.record({
    avg_protein: fc.option(fc.integer({ min: 0, max: 200 }), { nil: undefined }),
    workout_count: fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
  }),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

// ─── Preservation Tests ──────────────────────────────────────────────

describe('Preservation: Trainer Agent', () => {
  /**
   * Property: For all valid JSON responses, Trainer parsing succeeds identically
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbValidTrainerJson],
    propertyConfig
  )(
    'valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseTrainerResponse(raw, 'test input')

      // Core fields preserved
      expect(result.message).toBe(input.message)
      expect(result.confidence).toBe(input.confidence)

      // Workout structure preserved
      if (input.workout) {
        expect(result.workout).toBeDefined()
        expect(result.workout!.blocks.length).toBe(input.workout.blocks.length)
        expect(result.workout!.primary_score).toBe(input.workout.primary_score)
        expect(result.workout!.rpe).toBe(input.workout.rpe)
        expect(result.workout!.tags).toEqual(input.workout.tags)
      } else {
        expect(result.workout).toBeUndefined()
      }

      // Arrays preserved
      expect(Array.isArray(result.new_prs)).toBe(true)
      expect(Array.isArray(result.smart_defaults)).toBe(true)
    }
  )

  /**
   * Property: For all successful Trainer requests, workouts are persisted with correct structure
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [arbValidTrainerJson.filter(json => json.workout !== undefined)],
    propertyConfig
  )(
    'workouts are persisted with correct structure',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseTrainerResponse(raw, 'test input')

      // Workout persisted correctly
      expect(result.workout).toBeDefined()
      expect(result.workout!.blocks).toBeDefined()
      expect(result.workout!.blocks.length).toBeGreaterThan(0)

      // All blocks have required fields
      for (const block of result.workout!.blocks) {
        expect(block.block_type).toBeDefined()
        expect(block.movements).toBeDefined()
        expect(block.movements.length).toBeGreaterThan(0)
      }
    }
  )
})

describe('Preservation: Nutritionist Agent', () => {
  /**
   * Property: For all valid JSON responses, Nutritionist parsing succeeds identically
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbValidNutritionistJson],
    propertyConfig
  )(
    'valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseNutritionistResponse(raw, 'test input')

      // Core fields preserved
      expect(result.message).toBe(input.message)
      expect(result.confidence).toBe(input.confidence)

      // Meal structure preserved
      if (input.meal) {
        expect(result.meal).toBeDefined()
        expect(result.meal!.items.length).toBe(input.meal.items.length)
        expect(result.meal!.totals).toEqual(input.meal.totals)
        expect(result.meal!.timing).toBe(input.meal.timing)
      } else {
        expect(result.meal).toBeUndefined()
      }

      // Budget and week status preserved
      expect(result.remaining_budget).toEqual(input.remaining_budget)
      expect(result.week_status.overall_status).toBe(input.week_status.overall_status)
    }
  )

  /**
   * Property: For all successful Nutritionist requests, meals are analyzed with correct macros
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [arbValidNutritionistJson.filter(json => json.meal !== undefined)],
    propertyConfig
  )(
    'meals are analyzed with correct macros',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseNutritionistResponse(raw, 'test input')

      // Meal analyzed correctly
      expect(result.meal).toBeDefined()
      expect(result.meal!.items).toBeDefined()
      expect(result.meal!.items.length).toBeGreaterThan(0)

      // All items have required macro fields
      for (const item of result.meal!.items) {
        expect(item.food).toBeDefined()
        expect(item.portion).toBeDefined()
        expect(typeof item.protein).toBe('number')
        expect(typeof item.carbs).toBe('number')
        expect(typeof item.fat).toBe('number')
        expect(typeof item.calories).toBe('number')
      }

      // Totals preserved
      expect(result.meal!.totals.protein).toBeDefined()
      expect(result.meal!.totals.carbs).toBeDefined()
      expect(result.meal!.totals.fat).toBeDefined()
      expect(result.meal!.totals.calories).toBeDefined()
    }
  )
})

describe('Preservation: Socius Agent', () => {
  /**
   * Property: For all valid JSON responses, Socius parsing succeeds identically
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   */
  test.prop(
    [arbValidSociusJson],
    propertyConfig
  )(
    'valid JSON responses parse identically to original',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseSociusResponse(raw, 'test input')

      // Core fields preserved
      expect(result.message).toBe(input.message)
      expect(result.confidence).toBe(input.confidence)

      // Insights structure preserved (only non-empty content insights)
      const validInputInsights = input.insights.filter(i => i.content.trim().length > 0)
      expect(result.insights!.length).toBe(validInputInsights.length)

      // Data points preserved
      expect(result.data_points).toEqual(input.data_points)
    }
  )

  /**
   * Property: For all successful Socius requests, insights are generated correctly
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  test.prop(
    [arbValidSociusJson.filter(json => json.insights.length > 0)],
    propertyConfig
  )(
    'insights are generated correctly',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseSociusResponse(raw, 'test input')

      // Insights generated correctly
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)

      // All insights have required fields
      for (const insight of result.insights!) {
        expect(insight.id).toBeDefined()
        expect(insight.pattern_id).toBeDefined()
        expect(insight.priority).toBeDefined()
        expect(typeof insight.confidence).toBe('number')
        expect(insight.content).toBeDefined()
        expect(insight.content.trim().length).toBeGreaterThan(0)
        expect(insight.created_at).toBeDefined()
      }
    }
  )
})
