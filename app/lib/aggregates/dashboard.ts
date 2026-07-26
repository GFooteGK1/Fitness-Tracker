/**
 * Deterministic dashboard aggregates.
 *
 * This module is deliberately pure: callers fetch user-scoped rows, then pass
 * them here. It never reads the database and never calls an LLM. Composed views
 * may change presentation, but every number must originate from this layer or
 * another compute-only aggregate module (ADR-0001).
 */

export type WorkoutCategory = 'strength' | 'metcon' | 'cardio'

export interface DashboardWorkoutRow {
  workout_date: string
  blocks: unknown
  input_text: string | null
}

export interface DashboardWorkoutAggregates {
  totalWorkouts: number
  monthToDate: number
  strengthSessions: number
  metcons: number
  cardio: number
  currentMonth: string
}

interface AggregateOptions {
  asOf?: Date
  timezoneOffsetMinutes?: number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const STRENGTH_TERMS = [
  'squat', 'deadlift', 'press', 'bench', 'clean', 'snatch', 'jerk', '1rm', '5x5', '3x3', 'heavy',
]
const CARDIO_TERMS = ['run', 'row', 'bike', 'swim', 'ski erg', 'assault']
const METCON_TERMS = [
  'amrap', 'for time', 'emom', 'rounds', 'reps', 'wod', 'fran', 'grace', 'helen', 'diane', 'cindy', 'murph',
]

function includesAny(value: string, terms: readonly string[]) {
  return terms.some(term => value.includes(term))
}

export function categorizeWorkout(blocks: unknown, inputText: string | null): Set<WorkoutCategory> {
  const categories = new Set<WorkoutCategory>()
  const text = (inputText ?? '').toLowerCase()

  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue

      const rawType = 'block_type' in block
        ? block.block_type
        : 'type' in block
          ? block.type
          : ''
      const blockType = typeof rawType === 'string' ? rawType.toLowerCase() : ''

      if (
        includesAny(blockType, ['strength', 'lifting', 'build', 'heavy'])
      ) {
        categories.add('strength')
      }
      if (
        includesAny(blockType, [
          'cardio', 'monostructural', 'running', 'rowing', 'cycling', 'swimming', 'bike', 'run',
        ])
      ) {
        categories.add('cardio')
      }
      if (
        includesAny(blockType, [
          'amrap', 'for_time', 'for time', 'emom', 'tabata', 'metcon', 'wod', 'chipper', 'rounds',
        ])
      ) {
        categories.add('metcon')
      }
    }
  }

  if (categories.size === 0) {
    if (includesAny(text, STRENGTH_TERMS) || /\d+\s*x\s*\d+/.test(text)) {
      categories.add('strength')
    }
    if (includesAny(text, CARDIO_TERMS)) {
      categories.add('cardio')
    }
    if (includesAny(text, METCON_TERMS)) {
      categories.add('metcon')
    }
  }

  // Preserve the existing dashboard behavior: uncategorized CrossFit entries
  // count as metcons instead of disappearing from the breakdown.
  if (categories.size === 0) categories.add('metcon')

  return categories
}

export function computeDashboardWorkoutAggregates(
  workouts: readonly DashboardWorkoutRow[],
  options: AggregateOptions = {},
): DashboardWorkoutAggregates {
  const asOf = options.asOf ?? new Date()
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? 0
  const localNow = new Date(asOf.getTime() - timezoneOffsetMinutes * 60_000)
  const currentYear = localNow.getUTCFullYear()
  const currentMonthNumber = localNow.getUTCMonth() + 1
  const monthStart = `${currentYear}-${String(currentMonthNumber).padStart(2, '0')}-01`
  const localDate = `${currentYear}-${String(currentMonthNumber).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  let strengthSessions = 0
  let metcons = 0
  let cardio = 0

  for (const workout of workouts) {
    const categories = categorizeWorkout(workout.blocks, workout.input_text)
    if (categories.has('strength')) strengthSessions++
    if (categories.has('metcon')) metcons++
    if (categories.has('cardio')) cardio++
  }

  return {
    totalWorkouts: workouts.length,
    monthToDate: workouts.filter(workout =>
      workout.workout_date >= monthStart && workout.workout_date <= localDate
    ).length,
    strengthSessions,
    metcons,
    cardio,
    currentMonth: `${MONTH_NAMES[currentMonthNumber - 1]} ${currentYear}`,
  }
}
