/**
 * Property-Based Tests for Trainer Agent
 *
 * Feature: agent-system, Property 4: Trainer parse output structure
 * Feature: agent-system, Property 5: PR detection correctness
 * Feature: agent-system, Property 6: Smart default application
 * Feature: agent-system, Property 7: Workout persistence round-trip
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.9**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi } from 'vitest'
import {
  parseTrainerResponse,
  detectNewPRs,
  applySmartDefaults,
  extractScoreValue,
  persistWorkout,
} from '@/app/lib/agents/trainer-agent'
import { MOVEMENT_ALIASES } from '@/app/lib/agents/constants'
import type {
  TrainerContext,
  TrainerResponse,
  BenchmarkPR,
  WorkoutBlock,
  RecentWorkout,
  SmartDefault,
} from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Test Helpers ────────────────────────────────────────────────────

const VALID_BLOCK_TYPES = ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'] as const

function makeBaseContext(overrides?: Partial<TrainerContext>): TrainerContext {
  return {
    user_id: 'test-user-prop',
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
    current_date: '2026-02-28',
    day_of_week: 'Tuesday',
    has_whoop: false,
    recent_workouts: [],
    benchmark_prs: [],
    todays_program: null,
    movement_aliases: MOVEMENT_ALIASES,
    ...overrides,
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const arbBlockType = fc.constantFrom<WorkoutBlock['block_type']>(...VALID_BLOCK_TYPES)

const arbMovement = fc.record({
  name: fc.constantFrom('Pull-up', 'Deadlift', 'Thruster', 'Back Squat', 'Box Jump', 'Wall Ball', 'Push-up', 'Air Squat'),
  reps: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  weight: fc.option(fc.constantFrom('95 lb', '135 lb', '185 lb', '225 lb', '275 lb', '315 lb'), { nil: undefined }),
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
  tags: fc.array(fc.constantFrom('metcon', 'strength', 'cardio', 'benchmark', 'emom'), { minLength: 0, maxLength: 3 }),
})

const arbTrainerResponseJson = fc.record({
  message: fc.string({ minLength: 1, maxLength: 100 }),
  workout: fc.option(arbWorkout, { nil: undefined }),
  new_prs: fc.constant([]),
  smart_defaults: fc.constant([]),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
})

// ─── Property 4: Trainer parse output structure ──────────────────────

describe('Property 4: Trainer parse output structure', () => {

  /**
   * Property 4a: Valid JSON always produces a valid TrainerResponse
   *
   * *For any* valid JSON input, parseTrainerResponse SHALL return a response with:
   * - message is a non-empty string
   * - confidence is a number in [0, 1]
   * - new_prs is an array
   * - smart_defaults is an array
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  test.prop(
    [arbTrainerResponseJson],
    propertyConfig
  )(
    'Property 4: valid JSON always produces valid TrainerResponse structure',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseTrainerResponse(raw)

      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(0)
      expect(typeof result.confidence).toBe('number')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(Array.isArray(result.new_prs)).toBe(true)
      expect(Array.isArray(result.smart_defaults)).toBe(true)
    }
  )

  /**
   * Property 4b: Invalid/non-JSON input still produces a valid structure
   *
   * *For any* arbitrary string (including non-JSON), parseTrainerResponse SHALL
   * return a valid TrainerResponse with confidence 0.3 and the raw text as message.
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 200 }).filter(s => {
      try { JSON.parse(s); return false } catch { return true }
    })],
    propertyConfig
  )(
    'Property 4: non-JSON input produces valid fallback structure',
    (raw) => {
      const result = parseTrainerResponse(raw)

      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(0)
      expect(result.confidence).toBe(0.3)
      expect(result.workout).toBeUndefined()
      expect(Array.isArray(result.new_prs)).toBe(true)
      expect(Array.isArray(result.smart_defaults)).toBe(true)
    }
  )

  /**
   * Property 4c: Workout blocks always have valid block_type values
   *
   * *For any* JSON with workout blocks, all block_type values in the parsed
   * result SHALL be one of the valid enum values.
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  test.prop(
    [arbTrainerResponseJson.filter(r => r.workout !== undefined)],
    propertyConfig
  )(
    'Property 4: workout blocks always have valid block_type',
    (input) => {
      const raw = JSON.stringify(input)
      const result = parseTrainerResponse(raw)

      if (result.workout) {
        for (const block of result.workout.blocks) {
          expect(VALID_BLOCK_TYPES).toContain(block.block_type)
        }
      }
    }
  )

  /**
   * Property 4d: Confidence is always clamped to [0, 1]
   *
   * **Validates: Requirements 2.2**
   */
  test.prop(
    [fc.float({ min: -100, max: 100, noNaN: true })],
    propertyConfig
  )(
    'Property 4: confidence is always clamped to [0, 1]',
    (confidence) => {
      const raw = JSON.stringify({ message: 'test', confidence })
      const result = parseTrainerResponse(raw)

      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }
  )
})


// ─── Property 5: PR detection correctness ────────────────────────────

describe('Property 5: PR detection correctness', () => {

  /**
   * Property 5a: FOR_TIME — new PR only when time is strictly lower
   *
   * *For any* FOR_TIME block with a time score and an existing PR,
   * a new PR SHALL be detected if and only if the new time < existing score_value.
   *
   * **Validates: Requirements 2.3**
   */
  test.prop(
    [
      fc.integer({ min: 30, max: 3600 }),  // new time_s
      fc.integer({ min: 30, max: 3600 }),  // existing score_value
    ],
    propertyConfig
  )(
    'Property 5: FOR_TIME PR detected only when time_s < existing score_value',
    (newTime, existingScore) => {
      const block: WorkoutBlock = {
        block_type: 'FOR_TIME',
        movements: [{ name: 'Fran Thruster', reps: 21, weight: '95 lb' }],
        score: { time_s: newTime },
        rx_status: 'RX',
      }

      const response: TrainerResponse = {
        message: 'Done!',
        workout: {
          blocks: [block],
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
        score_value: existingScore,
        score_display: `${Math.floor(existingScore / 60)}:${(existingScore % 60).toString().padStart(2, '0')}`,
        date: '2026-01-10',
        rx_status: 'RX',
      }]

      const result = detectNewPRs(response, existingPRs)
      const detectedPR = result.new_prs?.some(pr => pr.benchmark_name === 'Fran' && pr.score_value === newTime)

      if (newTime < existingScore) {
        expect(detectedPR).toBe(true)
      } else {
        expect(detectedPR).not.toBe(true)
      }
    }
  )

  /**
   * Property 5b: AMRAP — new PR only when encoded score is strictly higher
   *
   * *For any* AMRAP block with rounds+reps and an existing PR,
   * a new PR SHALL be detected if and only if the encoded score > existing score_value.
   * Encoded score = rounds * 1000 + extra_reps.
   *
   * **Validates: Requirements 2.3**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 30 }),   // new rounds
      fc.integer({ min: 0, max: 50 }),   // new extra_reps
      fc.integer({ min: 1, max: 30 }),   // existing rounds
      fc.integer({ min: 0, max: 50 }),   // existing extra_reps
    ],
    propertyConfig
  )(
    'Property 5: AMRAP PR detected only when encoded score > existing score_value',
    (newRounds, newExtra, existingRounds, existingExtra) => {
      const newEncoded = newRounds * 1000 + newExtra
      const existingEncoded = existingRounds * 1000 + existingExtra

      const block: WorkoutBlock = {
        block_type: 'AMRAP',
        duration_min: 12,
        movements: [{ name: 'Cindy Pull-up', reps: 5 }],
        score: { rounds: newRounds, extra_reps: newExtra },
        rx_status: 'RX',
      }

      const response: TrainerResponse = {
        message: 'Done!',
        workout: {
          blocks: [block],
          primary_score: `${newRounds}+${newExtra}`,
          rpe: 8,
          tags: ['benchmark'],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const existingPRs: BenchmarkPR[] = [{
        benchmark_name: 'Cindy',
        score_value: existingEncoded,
        score_display: `${existingRounds}+${existingExtra}`,
        date: '2026-01-10',
        rx_status: 'RX',
      }]

      const result = detectNewPRs(response, existingPRs)
      const detectedPR = result.new_prs?.some(pr => pr.benchmark_name === 'Cindy' && pr.score_value === newEncoded)

      if (newEncoded > existingEncoded) {
        expect(detectedPR).toBe(true)
      } else {
        expect(detectedPR).not.toBe(true)
      }
    }
  )

  /**
   * Property 5c: First score for a benchmark is always a PR (no existing PRs)
   *
   * When no existing PR exists for a benchmark, the LLM-detected PR should be preserved.
   *
   * **Validates: Requirements 2.3**
   */
  test.prop(
    [
      arbBlockType,
      fc.integer({ min: 30, max: 3600 }),
    ],
    propertyConfig
  )(
    'Property 5: LLM-detected PRs preserved when no existing PRs match',
    (blockType, scoreVal) => {
      const llmPR: BenchmarkPR = {
        benchmark_name: 'NewBenchmark',
        score_value: scoreVal,
        score_display: String(scoreVal),
        date: '2026-01-20',
        rx_status: 'RX',
      }

      const response: TrainerResponse = {
        message: 'First time!',
        workout: {
          blocks: [{
            block_type: blockType,
            movements: [{ name: 'SomeMovement', reps: 10 }],
            score: { time_s: scoreVal },
          }],
          primary_score: String(scoreVal),
          rpe: 8,
          tags: ['benchmark'],
        },
        new_prs: [llmPR],
        smart_defaults: [],
        confidence: 0.9,
      }

      // No existing PRs at all
      const result = detectNewPRs(response, [])
      // The LLM-detected PR should be preserved
      expect(result.new_prs).toBeDefined()
      expect(result.new_prs!.some(pr => pr.benchmark_name === 'NewBenchmark')).toBe(true)
    }
  )

  /**
   * Property 5d: STRENGTH — new PR only when weight is strictly higher
   *
   * **Validates: Requirements 2.3**
   */
  test.prop(
    [
      fc.integer({ min: 45, max: 600 }),  // new weight (as score_value)
      fc.integer({ min: 45, max: 600 }),  // existing score_value
    ],
    propertyConfig
  )(
    'Property 5: STRENGTH PR detected only when score > existing score_value',
    (newWeight, existingScore) => {
      // For STRENGTH blocks, extractScoreValue uses rounds encoding if score has rounds,
      // or time_s if present. We use rounds=newWeight, extra_reps=0 to encode the weight.
      const block: WorkoutBlock = {
        block_type: 'STRENGTH',
        movements: [{ name: 'Deadlift Max', reps: 1, weight: `${newWeight} lb` }],
        score: { rounds: newWeight, extra_reps: 0 },
        rx_status: 'RX',
      }

      const response: TrainerResponse = {
        message: 'Heavy!',
        workout: {
          blocks: [block],
          primary_score: `${newWeight} lb`,
          rpe: 9,
          tags: ['strength'],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const newEncoded = newWeight * 1000 + 0

      const existingPRs: BenchmarkPR[] = [{
        benchmark_name: 'Deadlift',
        score_value: existingScore,
        score_display: `${existingScore} lb`,
        date: '2026-01-10',
        rx_status: 'RX',
      }]

      const result = detectNewPRs(response, existingPRs)
      const detectedPR = result.new_prs?.some(pr => pr.benchmark_name === 'Deadlift' && pr.score_value === newEncoded)

      if (newEncoded > existingScore) {
        expect(detectedPR).toBe(true)
      } else {
        expect(detectedPR).not.toBe(true)
      }
    }
  )

  /**
   * Property 5e: No workout means no PR detection changes
   *
   * **Validates: Requirements 2.3**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 100 })],
    propertyConfig
  )(
    'Property 5: response without workout is returned unchanged',
    (message) => {
      const response: TrainerResponse = {
        message,
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const result = detectNewPRs(response, [{ benchmark_name: 'Fran', score_value: 272, score_display: '4:32', date: '2026-01-10', rx_status: 'RX' }])
      expect(result).toEqual(response)
    }
  )
})


// ─── Property 6: Smart default application ───────────────────────────

describe('Property 6: Smart default application', () => {

  /**
   * Property 6a: Missing RPE gets estimated when blocks exist
   *
   * *For any* TrainerResponse with workout blocks and null RPE,
   * applySmartDefaults SHALL fill RPE with a value in [1, 10]
   * and add a smart_defaults entry with field='rpe'.
   *
   * **Validates: Requirements 2.5, 2.7**
   */
  test.prop(
    [fc.array(arbBlock, { minLength: 1, maxLength: 4 })],
    propertyConfig
  )(
    'Property 6: missing RPE gets estimated and flagged as smart default',
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

      const ctx = makeBaseContext()
      const result = applySmartDefaults(response, ctx)

      // RPE should be filled
      expect(result.workout!.rpe).not.toBeNull()
      expect(result.workout!.rpe).toBeGreaterThanOrEqual(1)
      expect(result.workout!.rpe).toBeLessThanOrEqual(10)

      // smart_defaults should contain an RPE entry
      expect(result.smart_defaults).toBeDefined()
      const rpeDefault = result.smart_defaults!.find(d => d.field === 'rpe')
      expect(rpeDefault).toBeDefined()
      expect(rpeDefault!.assumed_value).toBeTruthy()
      expect(rpeDefault!.source).toBeTruthy()
    }
  )

  /**
   * Property 6b: Existing RPE is never overridden
   *
   * *For any* TrainerResponse with a non-null RPE, applySmartDefaults
   * SHALL NOT modify the RPE value.
   *
   * **Validates: Requirements 2.5**
   */
  test.prop(
    [
      fc.array(arbBlock, { minLength: 1, maxLength: 3 }),
      fc.integer({ min: 1, max: 10 }),
    ],
    propertyConfig
  )(
    'Property 6: existing RPE is never overridden',
    (blocks, existingRPE) => {
      const response: TrainerResponse = {
        message: 'Logged!',
        workout: {
          blocks,
          primary_score: null,
          rpe: existingRPE,
          tags: [],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.85,
      }

      const ctx = makeBaseContext()
      const result = applySmartDefaults(response, ctx)

      expect(result.workout!.rpe).toBe(existingRPE)
      expect(result.smart_defaults!.some(d => d.field === 'rpe')).toBe(false)
    }
  )

  /**
   * Property 6c: Missing weight gets filled from recent workouts
   *
   * *For any* movement without weight but with reps, when recent workouts
   * contain that movement with a weight, applySmartDefaults SHALL fill the
   * weight and add a smart_defaults entry with field='weight'.
   *
   * **Validates: Requirements 2.6, 2.7**
   */
  test.prop(
    [
      fc.constantFrom('Deadlift', 'Back Squat', 'Front Squat', 'Thruster'),
      fc.constantFrom('135 lb', '185 lb', '225 lb', '275 lb'),
      fc.integer({ min: 1, max: 20 }),
    ],
    propertyConfig
  )(
    'Property 6: missing weight filled from recent workouts',
    (movementName, historicalWeight, reps) => {
      const response: TrainerResponse = {
        message: 'Logged!',
        workout: {
          blocks: [{
            block_type: 'STRENGTH',
            movements: [{ name: movementName, reps }],
          }],
          primary_score: null,
          rpe: 7,
          tags: [],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.85,
      }

      const recentWorkout: RecentWorkout = {
        id: 'w-recent',
        date: '2026-01-19',
        input_text: `${movementName} 5x5`,
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: movementName, reps: 5, weight: historicalWeight }],
        }],
        primary_score: null,
        rpe: 7,
        tags: ['strength'],
      }

      const ctx = makeBaseContext({ recent_workouts: [recentWorkout] })
      const result = applySmartDefaults(response, ctx)

      // Weight should be filled
      expect(result.workout!.blocks[0].movements[0].weight).toBe(historicalWeight)

      // smart_defaults should contain a weight entry
      const weightDefault = result.smart_defaults!.find(d => d.field === 'weight')
      expect(weightDefault).toBeDefined()
      expect(weightDefault!.assumed_value).toBe(historicalWeight)
      expect(weightDefault!.source).toContain(movementName)
    }
  )

  /**
   * Property 6d: Existing weight is never overridden
   *
   * **Validates: Requirements 2.6**
   */
  test.prop(
    [
      fc.constantFrom('Deadlift', 'Back Squat'),
      fc.constantFrom('275 lb', '315 lb'),
      fc.constantFrom('135 lb', '185 lb'),
    ],
    propertyConfig
  )(
    'Property 6: existing weight is never overridden',
    (movementName, existingWeight, historicalWeight) => {
      const response: TrainerResponse = {
        message: 'Logged!',
        workout: {
          blocks: [{
            block_type: 'STRENGTH',
            movements: [{ name: movementName, reps: 5, weight: existingWeight }],
          }],
          primary_score: null,
          rpe: 7,
          tags: [],
        },
        new_prs: [],
        smart_defaults: [],
        confidence: 0.85,
      }

      const recentWorkout: RecentWorkout = {
        id: 'w-recent',
        date: '2026-01-19',
        input_text: `${movementName} 5x5`,
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: movementName, reps: 5, weight: historicalWeight }],
        }],
        primary_score: null,
        rpe: 7,
        tags: ['strength'],
      }

      const ctx = makeBaseContext({ recent_workouts: [recentWorkout] })
      const result = applySmartDefaults(response, ctx)

      expect(result.workout!.blocks[0].movements[0].weight).toBe(existingWeight)
    }
  )

  /**
   * Property 6e: Smart defaults entries always have required fields
   *
   * *For any* applied smart default, the entry SHALL contain field, assumed_value, and source.
   *
   * **Validates: Requirements 2.7**
   */
  test.prop(
    [fc.array(arbBlock, { minLength: 1, maxLength: 3 })],
    propertyConfig
  )(
    'Property 6: all smart_defaults entries have field, assumed_value, source',
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

      const ctx = makeBaseContext()
      const result = applySmartDefaults(response, ctx)

      if (result.smart_defaults && result.smart_defaults.length > 0) {
        for (const sd of result.smart_defaults) {
          expect(typeof sd.field).toBe('string')
          expect(sd.field.length).toBeGreaterThan(0)
          expect(typeof sd.assumed_value).toBe('string')
          expect(sd.assumed_value.length).toBeGreaterThan(0)
          expect(typeof sd.source).toBe('string')
          expect(sd.source.length).toBeGreaterThan(0)
        }
      }
    }
  )

  /**
   * Property 6f: Response without workout is returned unchanged
   *
   * **Validates: Requirements 2.5, 2.6**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 100 })],
    propertyConfig
  )(
    'Property 6: response without workout is returned unchanged',
    (message) => {
      const response: TrainerResponse = {
        message,
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const ctx = makeBaseContext()
      const result = applySmartDefaults(response, ctx)
      expect(result).toEqual(response)
    }
  )
})


// ─── Property 7: Workout persistence round-trip ──────────────────────

describe('Property 7: Workout persistence round-trip', () => {

  /**
   * Property 7a: Persisted workout contains correct blocks, primary_score, rpe, tags
   *
   * *For any* TrainerResponse with workout blocks, persistWorkout SHALL insert
   * a workout row with matching blocks, primary_score, rpe, and tags.
   *
   * **Validates: Requirements 2.9**
   */
  test.prop(
    [
      arbWorkout,
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
      fc.string({ minLength: 1, maxLength: 100 }),
    ],
    propertyConfig
  )(
    'Property 7: workout insert contains correct blocks, primary_score, rpe, tags',
    async (workout, confidence, inputText) => {
      let capturedInsert: Record<string, unknown> | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('workout')
          capturedInsert = args.p_record
          return { data: 'workout-prop7', error: null }
        }),
      }

      const response: TrainerResponse = {
        message: 'Logged!',
        workout,
        new_prs: [],
        smart_defaults: [],
        confidence,
      }

      const id = await persistWorkout(
        response,
        'user-prop7',
        inputText,
        mockSupabase as any
      )

      expect(id).toBe('workout-prop7')
      expect(capturedInsert).not.toBeNull()
      expect(capturedInsert!.blocks).toEqual(workout.blocks)
      expect(capturedInsert!.primary_score).toBe(workout.primary_score)
      expect(capturedInsert!.rpe).toBe(workout.rpe)
      expect(capturedInsert!.tags).toEqual(workout.tags)
      expect(capturedInsert!.input_text).toBe(inputText)
      expect(capturedInsert!.user_id).toBe('user-prop7')
      expect(capturedInsert!.parse_confidence).toBe(confidence)
    }
  )

  /**
   * Property 7b: Block scores insert has one entry per block
   *
   * *For any* workout with N blocks, persistWorkout SHALL insert exactly N
   * block_scores rows, each with the correct block_type, rounds, time_s, rx_status.
   *
   * **Validates: Requirements 2.9**
   */
  test.prop(
    [arbWorkout],
    propertyConfig
  )(
    'Property 7: block_scores insert has one entry per block with correct fields',
    async (workout) => {
      let capturedBlockScores: Record<string, unknown>[] | null = null

      const mockSupabase = {
        rpc: vi.fn(async (name: string, args: { p_record: Record<string, unknown>; p_blocks: Record<string, unknown>[]; p_kind: string }) => {
          expect(name).toBe('save_logged_activity')
          expect(args.p_kind).toBe('workout')
          capturedBlockScores = args.p_blocks
          return { data: 'workout-prop7b', error: null }
        }),
      }

      const response: TrainerResponse = {
        message: 'Logged!',
        workout,
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      await persistWorkout(response, 'user-prop7b', 'test input', mockSupabase as any)

      expect(capturedBlockScores).not.toBeNull()
      expect(capturedBlockScores!.length).toBe(workout.blocks.length)

      for (let i = 0; i < workout.blocks.length; i++) {
        const block = workout.blocks[i]
        const score = capturedBlockScores![i]

        expect(score.block_type).toBe(block.block_type)
        // The transaction supplies its generated workout ID to every score.
        expect(score).not.toHaveProperty('workout_id')
        expect(score.user_id).toBe('user-prop7b')
        expect(score.rounds_completed).toBe(block.score?.rounds ?? null)
        expect(score.extra_reps).toBe(block.score?.extra_reps ?? null)
        expect(score.time_s).toBe(block.score?.time_s ?? null)
        expect(score.rx_status).toBe(block.rx_status ?? null)
      }
    }
  )

  /**
   * Property 7c: No workout means no persistence (returns null)
   *
   * **Validates: Requirements 2.9**
   */
  test.prop(
    [fc.string({ minLength: 1, maxLength: 100 })],
    propertyConfig
  )(
    'Property 7: response without workout returns null and no DB calls',
    async (message) => {
      const fromFn = vi.fn()
      const mockSupabase = { from: fromFn }

      const response: TrainerResponse = {
        message,
        new_prs: [],
        smart_defaults: [],
        confidence: 0.9,
      }

      const id = await persistWorkout(response, 'user-prop7c', 'test', mockSupabase as any)
      expect(id).toBeNull()
      expect(fromFn).not.toHaveBeenCalled()
    }
  )
})
