import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseTrainerResponse,
  detectNewPRs,
  applySmartDefaults,
  estimateRPE,
  lookupLastWeight,
  extractScoreValue,
  buildScoreDisplay,
  persistWorkout,
  persistNewPRs
} from '@/app/lib/agents/trainer-agent'
import { MOVEMENT_ALIASES } from '@/app/lib/agents/constants'
import type {
  TrainerContext,
  TrainerResponse,
  BenchmarkPR,
  WorkoutBlock,
  RecentWorkout
} from '@/app/lib/agents/types'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeBaseContext(overrides?: Partial<TrainerContext>): TrainerContext {
  return {
    user_id: 'test-user-123',
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

function makeWorkout(overrides?: Partial<RecentWorkout>): RecentWorkout {
  return {
    id: 'w1',
    date: '2026-01-19',
    input_text: '5 rounds: 10 DL 225#, 15 BJ',
    blocks: [{
      block_type: 'FOR_TIME',
      movements: [
        { name: 'Deadlift', reps: 10, weight: '225 lb' },
        { name: 'Box Jump', reps: 15 },
      ],
      score: { time_s: 847 },
      rx_status: 'RX',
    }],
    primary_score: '14:07',
    rpe: 8,
    tags: ['metcon'],
    ...overrides,
  }
}

function makePR(overrides?: Partial<BenchmarkPR>): BenchmarkPR {
  return {
    benchmark_name: 'Fran',
    score_value: 272,
    score_display: '4:32',
    date: '2026-01-15',
    rx_status: 'RX',
    ...overrides,
  }
}

function makeBlock(overrides?: Partial<WorkoutBlock>): WorkoutBlock {
  return {
    block_type: 'FOR_TIME',
    movements: [
      { name: 'Thruster', reps: 21, weight: '95 lb' },
      { name: 'Pull-up', reps: 21 },
    ],
    score: { time_s: 250 },
    rx_status: 'RX',
    ...overrides,
  }
}

// ─── parseTrainerResponse ────────────────────────────────────────────

describe('parseTrainerResponse', () => {
  it('parses valid JSON with workout data', () => {
    const raw = JSON.stringify({
      message: 'Nice workout!',
      workout: {
        blocks: [{
          block_type: 'AMRAP',
          duration_min: 12,
          movements: [{ name: 'Pull-up', reps: 5 }],
          score: { rounds: 7, extra_reps: 3 },
          rx_status: 'RX'
        }],
        primary_score: '7+3',
        rpe: 8,
        tags: ['metcon']
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.92
    })

    const result = parseTrainerResponse(raw)
    expect(result.message).toBe('Nice workout!')
    expect(result.workout).toBeDefined()
    expect(result.workout!.blocks).toHaveLength(1)
    expect(result.workout!.blocks[0].block_type).toBe('AMRAP')
    expect(result.workout!.blocks[0].score?.rounds).toBe(7)
    expect(result.workout!.primary_score).toBe('7+3')
    expect(result.workout!.rpe).toBe(8)
    expect(result.confidence).toBe(0.92)
  })

  it('parses conversational response without workout', () => {
    const raw = JSON.stringify({
      message: 'Your last Fran time was 4:32 RX on January 15th.',
      new_prs: [],
      smart_defaults: [],
      confidence: 0.95
    })

    const result = parseTrainerResponse(raw)
    expect(result.message).toContain('Fran')
    expect(result.workout).toBeUndefined()
    expect(result.new_prs).toEqual([])
    expect(result.confidence).toBe(0.95)
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"message":"test","confidence":0.8}\n```'
    const result = parseTrainerResponse(raw)
    expect(result.message).toBe('test')
    expect(result.confidence).toBe(0.8)
  })

  it('strips plain code fences', () => {
    const raw = '```\n{"message":"test","confidence":0.7}\n```'
    const result = parseTrainerResponse(raw)
    expect(result.message).toBe('test')
  })

  it('handles malformed JSON gracefully', () => {
    const raw = 'This is not JSON at all, just a conversational response.'
    const result = parseTrainerResponse(raw)
    expect(result.message).toContain('trouble processing that workout')
    expect(result.workout).toBeUndefined()
    expect(result.confidence).toBe(0.3)
  })

  it('handles empty string', () => {
    const result = parseTrainerResponse('')
    expect(result.message).toBeTruthy()
    expect(result.confidence).toBe(0.3)
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = JSON.stringify({ message: 'test', confidence: 1.5 })
    const result = parseTrainerResponse(raw)
    expect(result.confidence).toBe(1)

    const raw2 = JSON.stringify({ message: 'test', confidence: -0.5 })
    const result2 = parseTrainerResponse(raw2)
    expect(result2.confidence).toBe(0)
  })

  it('defaults confidence to 0.5 when missing', () => {
    const raw = JSON.stringify({ message: 'test' })
    const result = parseTrainerResponse(raw)
    expect(result.confidence).toBe(0.5)
  })

  it('normalizes invalid block_type to FOR_TIME', () => {
    const raw = JSON.stringify({
      message: 'test',
      workout: {
        blocks: [{ block_type: 'INVALID', movements: [] }],
        primary_score: null,
        rpe: null,
        tags: []
      },
      confidence: 0.8
    })
    const result = parseTrainerResponse(raw)
    expect(result.workout!.blocks[0].block_type).toBe('FOR_TIME')
  })

  it('handles missing movement fields gracefully', () => {
    const raw = JSON.stringify({
      message: 'test',
      workout: {
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: 'Back Squat' }]
        }]
      },
      confidence: 0.8
    })
    const result = parseTrainerResponse(raw)
    const movement = result.workout!.blocks[0].movements[0]
    expect(movement.name).toBe('Back Squat')
    expect(movement.reps).toBeUndefined()
    expect(movement.weight).toBeUndefined()
  })
})

// ─── detectNewPRs ────────────────────────────────────────────────────

describe('detectNewPRs', () => {
  it('detects a new FOR_TIME PR (lower time is better)', () => {
    const response: TrainerResponse = {
      message: 'Fran done!',
      workout: {
        blocks: [makeBlock({
          block_type: 'FOR_TIME',
          movements: [
            { name: 'Thruster', reps: 21, weight: '95 lb' },
            { name: 'Fran Pull-up', reps: 21 },
          ],
          score: { time_s: 250 }
        })],
        primary_score: '4:10',
        rpe: 9,
        tags: ['benchmark']
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const existingPRs = [makePR({ benchmark_name: 'Fran', score_value: 272 })]
    const result = detectNewPRs(response, existingPRs)
    expect(result.new_prs).toBeDefined()
    expect(result.new_prs!.length).toBeGreaterThan(0)
    expect(result.new_prs![0].benchmark_name).toBe('Fran')
  })

  it('does not flag a PR when time is slower', () => {
    const response: TrainerResponse = {
      message: 'Fran done!',
      workout: {
        blocks: [makeBlock({
          block_type: 'FOR_TIME',
          movements: [{ name: 'Fran Thruster', reps: 21 }],
          score: { time_s: 300 }
        })],
        primary_score: '5:00',
        rpe: 8,
        tags: []
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const existingPRs = [makePR({ benchmark_name: 'Fran', score_value: 272 })]
    const result = detectNewPRs(response, existingPRs)
    // Should not detect a new PR since 300 > 272
    expect(result.new_prs).toEqual([])
  })

  it('returns response unchanged when no workout', () => {
    const response: TrainerResponse = {
      message: 'Just a question answer.',
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }
    const result = detectNewPRs(response, [makePR()])
    expect(result).toEqual(response)
  })

  it('preserves LLM-detected PRs when our logic finds none', () => {
    const llmPR: BenchmarkPR = {
      benchmark_name: 'Grace',
      score_value: 120,
      score_display: '2:00',
      date: '2026-01-20',
      rx_status: 'RX'
    }
    const response: TrainerResponse = {
      message: 'Grace PR!',
      workout: {
        blocks: [makeBlock({ movements: [{ name: 'Clean and Jerk', reps: 30 }] })],
        primary_score: '2:00',
        rpe: 10,
        tags: ['benchmark']
      },
      new_prs: [llmPR],
      smart_defaults: [],
      confidence: 0.95
    }

    const result = detectNewPRs(response, [])
    expect(result.new_prs).toContainEqual(llmPR)
  })
})

// ─── extractScoreValue & buildScoreDisplay ───────────────────────────

describe('extractScoreValue', () => {
  it('extracts time_s for FOR_TIME blocks', () => {
    const block = makeBlock({ score: { time_s: 587 } })
    expect(extractScoreValue(block)).toBe(587)
  })

  it('encodes rounds + extra_reps for AMRAP blocks', () => {
    const block = makeBlock({
      block_type: 'AMRAP',
      score: { rounds: 7, extra_reps: 5 }
    })
    expect(extractScoreValue(block)).toBe(7005)
  })

  it('returns 0 when no score', () => {
    const block = makeBlock({ score: undefined })
    expect(extractScoreValue(block)).toBe(0)
  })
})

describe('buildScoreDisplay', () => {
  it('formats time as mm:ss', () => {
    const block = makeBlock({ score: { time_s: 587 } })
    expect(buildScoreDisplay(block)).toBe('9:47')
  })

  it('formats rounds+reps', () => {
    const block = makeBlock({ score: { rounds: 7, extra_reps: 5 } })
    expect(buildScoreDisplay(block)).toBe('7+5')
  })

  it('returns "No score" when no score', () => {
    const block = makeBlock({ score: undefined })
    expect(buildScoreDisplay(block)).toBe('No score')
  })

  it('handles zero extra_reps', () => {
    const block = makeBlock({ score: { rounds: 10 } })
    expect(buildScoreDisplay(block)).toBe('10+0')
  })
})

// ─── applySmartDefaults ──────────────────────────────────────────────

describe('applySmartDefaults', () => {
  it('estimates RPE when missing', () => {
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [makeBlock({ block_type: 'AMRAP' })],
        primary_score: '7+3',
        rpe: null,
        tags: ['metcon']
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const ctx = makeBaseContext()
    const result = applySmartDefaults(response, ctx)
    expect(result.workout!.rpe).toBeDefined()
    expect(result.workout!.rpe).toBeGreaterThanOrEqual(1)
    expect(result.workout!.rpe).toBeLessThanOrEqual(10)
    expect(result.smart_defaults).toBeDefined()
    expect(result.smart_defaults!.some(d => d.field === 'rpe')).toBe(true)
  })

  it('does not override existing RPE', () => {
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [makeBlock()],
        primary_score: '4:10',
        rpe: 9,
        tags: []
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const ctx = makeBaseContext()
    const result = applySmartDefaults(response, ctx)
    expect(result.workout!.rpe).toBe(9)
    expect(result.smart_defaults!.some(d => d.field === 'rpe')).toBe(false)
  })

  it('fills missing weight from recent workouts', () => {
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: 'Deadlift', reps: 5 }],
        }],
        primary_score: null,
        rpe: 7,
        tags: ['strength']
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.85
    }

    const ctx = makeBaseContext({
      recent_workouts: [makeWorkout({
        blocks: [{
          block_type: 'FOR_TIME',
          movements: [
            { name: 'Deadlift', reps: 10, weight: '225 lb' },
            { name: 'Box Jump', reps: 15 },
          ],
          score: { time_s: 847 },
          rx_status: 'RX',
        }]
      })]
    })

    const result = applySmartDefaults(response, ctx)
    expect(result.workout!.blocks[0].movements[0].weight).toBe('225 lb')
    expect(result.smart_defaults!.some(d => d.field === 'weight')).toBe(true)
    expect(result.smart_defaults!.find(d => d.field === 'weight')!.source).toContain('Deadlift')
  })

  it('does not fill weight when movement already has weight', () => {
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: 'Deadlift', reps: 5, weight: '275 lb' }],
        }],
        primary_score: null,
        rpe: 7,
        tags: []
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.85
    }

    const ctx = makeBaseContext({
      recent_workouts: [makeWorkout()]
    })

    const result = applySmartDefaults(response, ctx)
    expect(result.workout!.blocks[0].movements[0].weight).toBe('275 lb')
  })

  it('returns response unchanged when no workout', () => {
    const response: TrainerResponse = {
      message: 'Just a question.',
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }
    const result = applySmartDefaults(response, makeBaseContext())
    expect(result).toEqual(response)
  })
})

// ─── estimateRPE ─────────────────────────────────────────────────────

describe('estimateRPE', () => {
  it('returns null for empty blocks', () => {
    expect(estimateRPE([])).toBeNull()
  })

  it('estimates higher RPE for AMRAP/FOR_TIME', () => {
    const rpe = estimateRPE([makeBlock({ block_type: 'AMRAP' })])
    expect(rpe).toBe(8)
  })

  it('estimates moderate RPE for STRENGTH', () => {
    const rpe = estimateRPE([makeBlock({ block_type: 'STRENGTH' })])
    expect(rpe).toBe(6)
  })

  it('estimates lower RPE for CARDIO', () => {
    const rpe = estimateRPE([makeBlock({ block_type: 'CARDIO' })])
    expect(rpe).toBe(5)
  })

  it('averages across multiple blocks', () => {
    const rpe = estimateRPE([
      makeBlock({ block_type: 'STRENGTH' }),  // 6
      makeBlock({ block_type: 'AMRAP' }),      // 8
    ])
    expect(rpe).toBe(7) // avg of 6 and 8
  })

  it('clamps to [1, 10]', () => {
    const rpe = estimateRPE([makeBlock({ block_type: 'CARDIO' })])
    expect(rpe).toBeGreaterThanOrEqual(1)
    expect(rpe).toBeLessThanOrEqual(10)
  })
})

// ─── lookupLastWeight ────────────────────────────────────────────────

describe('lookupLastWeight', () => {
  it('finds weight from recent workouts', () => {
    const workouts = [makeWorkout()]
    const weight = lookupLastWeight('Deadlift', workouts)
    expect(weight).toBe('225 lb')
  })

  it('is case-insensitive', () => {
    const workouts = [makeWorkout()]
    const weight = lookupLastWeight('deadlift', workouts)
    expect(weight).toBe('225 lb')
  })

  it('returns null when movement not found', () => {
    const workouts = [makeWorkout()]
    const weight = lookupLastWeight('Snatch', workouts)
    expect(weight).toBeNull()
  })

  it('returns null for empty workout list', () => {
    const weight = lookupLastWeight('Deadlift', [])
    expect(weight).toBeNull()
  })

  it('returns first match (most recent workout first)', () => {
    const workouts = [
      makeWorkout({
        id: 'w2',
        date: '2026-01-20',
        blocks: [{
          block_type: 'STRENGTH',
          movements: [{ name: 'Deadlift', reps: 3, weight: '315 lb' }],
        }]
      }),
      makeWorkout({
        id: 'w1',
        date: '2026-01-19',
        blocks: [{
          block_type: 'FOR_TIME',
          movements: [{ name: 'Deadlift', reps: 10, weight: '225 lb' }],
        }]
      }),
    ]
    const weight = lookupLastWeight('Deadlift', workouts)
    expect(weight).toBe('315 lb')
  })
})

// ─── persistWorkout ──────────────────────────────────────────────────

describe('persistWorkout', () => {
  function createMockSupabase(workoutId = 'workout-123') {
    const rpc = vi.fn().mockResolvedValue({ data: workoutId, error: null })
    return {
      supabase: { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient,
      rpc
    }
  }

  it('persists workout and returns workout ID', async () => {
    const { supabase, rpc } = createMockSupabase()
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [makeBlock()],
        primary_score: '4:10',
        rpe: 9,
        tags: ['metcon']
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const id = await persistWorkout(response, 'user-1', 'Fran 4:10 Rx', supabase)
    expect(id).toBe('workout-123')
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('save_logged_activity', expect.objectContaining({
      p_kind: 'workout',
      p_record: expect.objectContaining({ blocks: response.workout!.blocks, input_text: 'Fran 4:10 Rx' }),
      p_blocks: [expect.objectContaining({ block_type: response.workout!.blocks[0].block_type })]
    }))
  })

  it('returns null when no workout in response', async () => {
    const { supabase } = createMockSupabase()
    const response: TrainerResponse = {
      message: 'Just a question.',
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    const id = await persistWorkout(response, 'user-1', 'What was my last Fran?', supabase)
    expect(id).toBeNull()
  })

  it('returns null when blocks are empty', async () => {
    const { supabase } = createMockSupabase()
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [],
        primary_score: null,
        rpe: null,
        tags: []
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.5
    }

    const id = await persistWorkout(response, 'user-1', 'test', supabase)
    expect(id).toBeNull()
  })

  it('throws when the atomic workout save fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const supabase = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient
    const response: TrainerResponse = {
      message: 'Logged!',
      workout: {
        blocks: [makeBlock()],
        primary_score: '4:10',
        rpe: 9,
        tags: []
      },
      new_prs: [],
      smart_defaults: [],
      confidence: 0.9
    }

    await expect(persistWorkout(response, 'user-1', 'test', supabase)).rejects.toThrow('Unable to save the complete activity')
  })
})

// ─── persistNewPRs ───────────────────────────────────────────────────

describe('persistNewPRs', () => {
  it('inserts PR rows to benchmark_prs table', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null })
    const fromFn = vi.fn().mockReturnValue({ insert: insertFn })
    const supabase = { from: fromFn } as unknown as import('@supabase/supabase-js').SupabaseClient

    const prs: BenchmarkPR[] = [
      makePR({ benchmark_name: 'Fran', score_value: 250, score_display: '4:10' })
    ]

    await persistNewPRs(prs, 'user-1', 'workout-123', supabase)
    expect(fromFn).toHaveBeenCalledWith('benchmark_prs')
    expect(insertFn).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        benchmark_name: 'Fran',
        score_value: 250,
        score_display: '4:10',
        is_pr: true,
        workout_id: 'workout-123'
      })
    ])
  })

  it('does nothing when prs array is empty', async () => {
    const fromFn = vi.fn()
    const supabase = { from: fromFn } as unknown as import('@supabase/supabase-js').SupabaseClient

    await persistNewPRs([], 'user-1', 'workout-123', supabase)
    expect(fromFn).not.toHaveBeenCalled()
  })
})
