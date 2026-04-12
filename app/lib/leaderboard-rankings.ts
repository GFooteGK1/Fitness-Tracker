import { RankingEntry, RankingMetric } from './types/leaderboard'

interface WorkoutBlockMovement {
  name?: string
  movement?: string
  load?: number
  load_lb?: number
  weight?: number
  reps?: number
  sets?: number
  rounds?: number
  time_s?: number
  distance?: number
  calories?: number
}

interface WorkoutBlock {
  block_type?: string
  type?: string
  title?: string
  movements?: WorkoutBlockMovement[]
  rounds_completed?: number
  extra_reps?: number
  time_s?: number
  total_reps?: number
  tonnage_lb?: number
}

interface MemberWorkout {
  user_id: string
  display_name: string
  workout_date: string
  input_text: string
  blocks: WorkoutBlock[] | null
  privacy_level: string
}

interface MemberPR {
  user_id: string
  display_name: string
  benchmark_name: string
  score_value: number
  score_display: string | null
  date: string
  is_pr: boolean
  privacy_level: string
}

interface UserBestScore {
  user_id: string
  display_name: string
  value: number
  date: string
}

/**
 * Filter workouts by exercise name. Searches block titles and movement names.
 */
export function filterWorkoutsByExercise(
  workouts: MemberWorkout[],
  exercise: string
): MemberWorkout[] {
  const lowerExercise = exercise.toLowerCase()
  return workouts.filter(w => {
    // Check input text
    if (w.input_text?.toLowerCase().includes(lowerExercise)) return true
    // Check blocks
    if (Array.isArray(w.blocks)) {
      return w.blocks.some((block: WorkoutBlock) => {
        if (block.title?.toLowerCase().includes(lowerExercise)) return true
        if (Array.isArray(block.movements)) {
          return block.movements.some(m =>
            (m.name || m.movement || '').toLowerCase().includes(lowerExercise)
          )
        }
        return false
      })
    }
    return false
  })
}

/**
 * Respect privacy settings — filter out workouts that shouldn't be shared.
 * 'all' = share everything, 'benchmarks' = only named WODs, 'manual' = nothing automatic
 */
export function applyPrivacyFilter(
  workouts: MemberWorkout[],
  exercise: string
): MemberWorkout[] {
  const benchmarkWods = new Set([
    'fran', 'grace', 'helen', 'diane', 'cindy', 'murph', 'annie', 'jackie',
    'karen', 'elizabeth', 'isabel', 'nancy', 'kelly', 'linda', 'mary',
    'amanda', 'angie', 'barbara', 'chelsea', 'eva', 'nicole', 'filthy fifty',
    'fight gone bad', 'dt', 'bear complex'
  ])
  const isBenchmark = benchmarkWods.has(exercise.toLowerCase())

  return workouts.filter(w => {
    if (w.privacy_level === 'all') return true
    if (w.privacy_level === 'benchmarks' && isBenchmark) return true
    return false // 'manual' doesn't share automatically
  })
}

/**
 * Extract the best score for each user from their workouts.
 */
export function extractBestScores(
  workouts: MemberWorkout[],
  exercise: string,
  metric: RankingMetric
): UserBestScore[] {
  const userBests = new Map<string, UserBestScore>()
  const lowerExercise = exercise.toLowerCase()

  for (const workout of workouts) {
    if (!Array.isArray(workout.blocks)) continue

    for (const block of workout.blocks) {
      const movements = block.movements || []
      for (const movement of movements) {
        const moveName = (movement.name || movement.movement || '').toLowerCase()
        if (!moveName.includes(lowerExercise)) continue

        const value = extractMetricValue(movement, block, metric)
        if (value === null || value <= 0) continue

        const existing = userBests.get(workout.user_id)
        const isBetter = metric === 'time'
          ? !existing || value < existing.value  // Lower time is better
          : !existing || value > existing.value   // Higher weight/reps/volume is better

        if (isBetter) {
          userBests.set(workout.user_id, {
            user_id: workout.user_id,
            display_name: workout.display_name,
            value,
            date: workout.workout_date
          })
        }
      }
    }
  }

  return Array.from(userBests.values())
}

/**
 * Extract best scores from benchmark PR records.
 */
export function extractBestPRScores(
  prs: MemberPR[],
  metric: RankingMetric
): UserBestScore[] {
  const userBests = new Map<string, UserBestScore>()

  for (const pr of prs) {
    // Apply privacy: benchmarks sharing is always allowed for PRs
    if (pr.privacy_level === 'manual') continue

    const value = pr.score_value
    if (!value || value <= 0) continue

    const existing = userBests.get(pr.user_id)
    const isBetter = metric === 'time'
      ? !existing || value < existing.value
      : !existing || value > existing.value

    if (isBetter) {
      userBests.set(pr.user_id, {
        user_id: pr.user_id,
        display_name: pr.display_name,
        value,
        date: pr.date
      })
    }
  }

  return Array.from(userBests.values())
}

function extractMetricValue(
  movement: WorkoutBlockMovement,
  block: WorkoutBlock,
  metric: RankingMetric
): number | null {
  switch (metric) {
    case 'weight':
      return movement.load ?? movement.load_lb ?? movement.weight ?? null
    case 'reps': {
      const reps = movement.reps ?? 0
      const sets = movement.sets ?? 1
      return reps > 0 ? reps * sets : null
    }
    case 'volume': {
      const load = movement.load ?? movement.load_lb ?? movement.weight ?? 0
      const reps = movement.reps ?? 0
      const sets = movement.sets ?? 1
      return load > 0 && reps > 0 ? load * reps * sets : null
    }
    case 'time':
      return movement.time_s ?? block.time_s ?? null
    default:
      return null
  }
}

/**
 * Rank users by their best scores and assign positions.
 * Handles ties with the same rank.
 */
export function rankUsers(
  scores: UserBestScore[],
  metric: RankingMetric,
  currentUserId: string
): RankingEntry[] {
  // Sort: time ascending (lower=better), everything else descending (higher=better)
  const sorted = [...scores].sort((a, b) =>
    metric === 'time' ? a.value - b.value : b.value - a.value
  )

  const rankings: RankingEntry[] = []
  let currentRank = 1

  for (let i = 0; i < sorted.length; i++) {
    const score = sorted[i]

    // Handle ties: same rank if same value
    if (i > 0 && sorted[i].value !== sorted[i - 1].value) {
      currentRank = i + 1
    }

    rankings.push({
      rank: currentRank,
      user_id: score.user_id,
      user_display_name: score.display_name,
      value: score.value,
      value_display: formatMetricValue(score.value, metric),
      date_achieved: score.date,
      is_current_user: score.user_id === currentUserId
    })
  }

  return rankings
}

function formatMetricValue(value: number, metric: RankingMetric): string {
  switch (metric) {
    case 'weight':
      return `${value} lb`
    case 'reps':
      return `${value} reps`
    case 'volume':
      return `${value.toLocaleString()} lb`
    case 'time': {
      const min = Math.floor(value / 60)
      const sec = value % 60
      return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
    }
    default:
      return String(value)
  }
}

/**
 * Generate a unique invite code (8 chars, uppercase alphanumeric)
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // No ambiguous chars (0/O, 1/I/L)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
