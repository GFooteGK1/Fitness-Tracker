import { describe, expect, it } from 'vitest'

import {
  categorizeWorkout,
  computeDashboardWorkoutAggregates,
  type DashboardWorkoutRow,
} from '@/app/lib/aggregates/dashboard'

describe('dashboard workout aggregates', () => {
  it('computes the existing dashboard contract without an LLM', () => {
    const workouts: DashboardWorkoutRow[] = [
      {
        workout_date: '2026-07-22',
        blocks: [{ block_type: 'STRENGTH' }, { block_type: 'AMRAP' }],
        input_text: 'Back squat then conditioning',
      },
      {
        workout_date: '2026-07-10',
        blocks: null,
        input_text: 'Run 5k',
      },
      {
        workout_date: '2026-06-30',
        blocks: [{ block_type: 'OTHER' }],
        input_text: '',
      },
    ]

    expect(computeDashboardWorkoutAggregates(workouts, {
      asOf: new Date('2026-07-22T12:00:00Z'),
      timezoneOffsetMinutes: 0,
    })).toEqual({
      totalWorkouts: 3,
      monthToDate: 2,
      strengthSessions: 1,
      metcons: 2,
      cardio: 1,
      currentMonth: 'July 2026',
    })
  })

  it('uses the user-local calendar boundary for true month-to-date counts', () => {
    const workouts: DashboardWorkoutRow[] = [
      { workout_date: '2025-12-31', blocks: [], input_text: 'Deadlift' },
      { workout_date: '2026-01-01', blocks: [], input_text: 'Row' },
    ]

    const result = computeDashboardWorkoutAggregates(workouts, {
      asOf: new Date('2026-01-01T01:00:00Z'),
      timezoneOffsetMinutes: 360,
    })

    expect(result.currentMonth).toBe('December 2025')
    expect(result.monthToDate).toBe(1)
  })

  it('handles malformed block data and preserves the metcon fallback', () => {
    expect(categorizeWorkout([null, 7, { block_type: 12 }], null)).toEqual(new Set(['metcon']))
  })

  it.each([
    { block: { block_type: null, type: 'CARDIO' }, expected: 'cardio' },
    { block: { block_type: null, type: 'STRENGTH' }, expected: 'strength' },
    { block: { block_type: undefined, type: 'CARDIO' }, expected: 'cardio' },
    { block: { type: 'CARDIO' }, expected: 'cardio' },
    { block: { type: 'STRENGTH' }, expected: 'strength' },
    { block: { block_type: 'STRENGTH', type: 'CARDIO' }, expected: 'strength' },
    { block: { block_type: 'CARDIO', type: 'STRENGTH' }, expected: 'cardio' },
  ])('uses writer-compatible type precedence for $block', ({ block, expected }) => {
    expect(categorizeWorkout([block], null)).toEqual(new Set([expected]))
  })

  it.each(['', 0, false, {}])('keeps non-null malformed canonical type %j ahead of the legacy alias', block_type => {
    expect(categorizeWorkout([{ block_type, type: 'CARDIO' }], 'Deadlift')).toEqual(new Set(['strength']))
  })

  it('uses supported legacy block evidence before contradictory source text', () => {
    expect(categorizeWorkout([{ block_type: null, type: 'STRENGTH' }], 'Run')).toEqual(new Set(['strength']))
  })

  it('counts a mixed workout once per resolved category without changing total or date counts', () => {
    const blocks = [{ block_type: null, type: 'STRENGTH' }, { type: 'STRENGTH' },
      { block_type: 'CARDIO' }, { block_type: 'AMRAP' }]
    expect(computeDashboardWorkoutAggregates([{ workout_date: '2026-07-22', blocks, input_text: null }], {
      asOf: new Date('2026-07-22T12:00:00Z'), timezoneOffsetMinutes: 0,
    })).toEqual({ totalWorkouts: 1, monthToDate: 1, strengthSessions: 1, metcons: 1, cardio: 1, currentMonth: 'July 2026' })
  })
})
