import { describe, it, expect } from 'vitest'
import {
  filterWorkoutsByExercise,
  applyPrivacyFilter,
  extractBestScores,
  extractBestPRScores,
  rankUsers,
  generateInviteCode
} from '@/app/lib/leaderboard-rankings'

// Helper factories
function createMemberWorkout(overrides: Partial<{
  user_id: string
  display_name: string
  workout_date: string
  input_text: string
  blocks: any[]
  privacy_level: string
}> = {}) {
  return {
    user_id: 'user-1',
    display_name: 'Athlete One',
    workout_date: '2025-01-15',
    input_text: 'Back Squat 5x5 @ 225',
    blocks: [{
      block_type: 'strength',
      title: 'Back Squat',
      movements: [{
        name: 'Back Squat',
        load: 225,
        reps: 5,
        sets: 5
      }]
    }],
    privacy_level: 'all',
    ...overrides
  }
}

function createMemberPR(overrides: Partial<{
  user_id: string
  display_name: string
  benchmark_name: string
  score_value: number
  score_display: string | null
  date: string
  is_pr: boolean
  privacy_level: string
}> = {}) {
  return {
    user_id: 'user-1',
    display_name: 'Athlete One',
    benchmark_name: 'Fran',
    score_value: 180,
    score_display: '3:00',
    date: '2025-01-15',
    is_pr: true,
    privacy_level: 'all',
    ...overrides
  }
}

// ---- Invite Code Generation ----
describe('generateInviteCode', () => {
  it('should generate an 8-character code', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(8)
  })

  it('should only contain non-ambiguous uppercase alphanumeric chars', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode()
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    }
  })

  it('should not contain ambiguous characters (0, O, 1, I, L)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode()
      expect(code).not.toMatch(/[0OIL1]/)
    }
  })

  it('should generate unique codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      codes.add(generateInviteCode())
    }
    // With 32^8 possibilities, 100 codes should all be unique
    expect(codes.size).toBe(100)
  })
})

// ---- Exercise Filtering ----
describe('filterWorkoutsByExercise', () => {
  it('should filter workouts by movement name in blocks', () => {
    const workouts = [
      createMemberWorkout({ input_text: 'Back Squat 5x5', blocks: [{
        movements: [{ name: 'Back Squat', load: 225, reps: 5, sets: 5 }]
      }]}),
      createMemberWorkout({ input_text: 'Deadlift 3x3', blocks: [{
        movements: [{ name: 'Deadlift', load: 315, reps: 3, sets: 3 }]
      }]})
    ]

    const result = filterWorkoutsByExercise(workouts, 'Back Squat')
    expect(result).toHaveLength(1)
    expect(result[0].input_text).toContain('Back Squat')
  })

  it('should be case-insensitive', () => {
    const workouts = [
      createMemberWorkout({ input_text: 'back squat 5x5', blocks: [{
        movements: [{ name: 'back squat', load: 225, reps: 5, sets: 5 }]
      }]})
    ]

    const result = filterWorkoutsByExercise(workouts, 'Back Squat')
    expect(result).toHaveLength(1)
  })

  it('should match by input_text when blocks have no matching movements', () => {
    const workouts = [
      createMemberWorkout({ input_text: 'Did some Fran today', blocks: [] })
    ]

    const result = filterWorkoutsByExercise(workouts, 'Fran')
    expect(result).toHaveLength(1)
  })

  it('should return empty array when no matches', () => {
    const workouts = [
      createMemberWorkout({ input_text: 'Running 5k', blocks: [] })
    ]

    const result = filterWorkoutsByExercise(workouts, 'Back Squat')
    expect(result).toHaveLength(0)
  })

  it('should match by block title', () => {
    const workouts = [
      createMemberWorkout({ input_text: 'Morning workout', blocks: [{
        title: 'Back Squat',
        movements: [{ name: 'BS', load: 225, reps: 5, sets: 5 }]
      }]})
    ]

    const result = filterWorkoutsByExercise(workouts, 'Back Squat')
    expect(result).toHaveLength(1)
  })
})

// ---- Privacy Controls ----
describe('applyPrivacyFilter', () => {
  it('should allow all workouts with privacy_level "all"', () => {
    const workouts = [
      createMemberWorkout({ privacy_level: 'all' })
    ]

    const result = applyPrivacyFilter(workouts, 'Back Squat')
    expect(result).toHaveLength(1)
  })

  it('should filter out "manual" privacy workouts', () => {
    const workouts = [
      createMemberWorkout({ privacy_level: 'manual' })
    ]

    const result = applyPrivacyFilter(workouts, 'Back Squat')
    expect(result).toHaveLength(0)
  })

  it('should allow "benchmarks" privacy for benchmark WODs', () => {
    const workouts = [
      createMemberWorkout({ privacy_level: 'benchmarks' })
    ]

    const result = applyPrivacyFilter(workouts, 'Fran')
    expect(result).toHaveLength(1)
  })

  it('should filter "benchmarks" privacy for non-benchmark exercises', () => {
    const workouts = [
      createMemberWorkout({ privacy_level: 'benchmarks' })
    ]

    const result = applyPrivacyFilter(workouts, 'Back Squat')
    expect(result).toHaveLength(0)
  })

  it('should handle mixed privacy levels', () => {
    const workouts = [
      createMemberWorkout({ user_id: 'u1', privacy_level: 'all' }),
      createMemberWorkout({ user_id: 'u2', privacy_level: 'manual' }),
      createMemberWorkout({ user_id: 'u3', privacy_level: 'benchmarks' })
    ]

    const result = applyPrivacyFilter(workouts, 'Fran')
    expect(result).toHaveLength(2) // 'all' + 'benchmarks' (Fran is a benchmark)
  })

  it('should recognize common benchmark WODs case-insensitively', () => {
    const benchmarks = ['Fran', 'Grace', 'Helen', 'Diane', 'Cindy', 'Murph', 'DT']
    const workouts = benchmarks.map(name =>
      createMemberWorkout({ privacy_level: 'benchmarks', input_text: name })
    )

    for (let i = 0; i < benchmarks.length; i++) {
      const result = applyPrivacyFilter([workouts[i]], benchmarks[i])
      expect(result).toHaveLength(1)
    }
  })
})

// ---- Score Extraction ----
describe('extractBestScores', () => {
  it('should extract the best weight for each user', () => {
    const workouts = [
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Back Squat', load: 225, reps: 5, sets: 5 }]
      }]}),
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Back Squat', load: 250, reps: 3, sets: 3 }]
      }]}),
      createMemberWorkout({ user_id: 'u2', display_name: 'Bob', blocks: [{
        movements: [{ name: 'Back Squat', load: 275, reps: 1, sets: 1 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'weight')
    expect(scores).toHaveLength(2)

    const alice = scores.find(s => s.user_id === 'u1')
    expect(alice?.value).toBe(250) // Higher weight

    const bob = scores.find(s => s.user_id === 'u2')
    expect(bob?.value).toBe(275)
  })

  it('should calculate volume correctly (load * reps * sets)', () => {
    const workouts = [
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Back Squat', load: 225, reps: 5, sets: 5 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'volume')
    expect(scores).toHaveLength(1)
    expect(scores[0].value).toBe(225 * 5 * 5) // 5625
  })

  it('should calculate total reps correctly (reps * sets)', () => {
    const workouts = [
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Back Squat', load: 225, reps: 5, sets: 3 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'reps')
    expect(scores).toHaveLength(1)
    expect(scores[0].value).toBe(15) // 5 * 3
  })

  it('should handle time metric (lower is better)', () => {
    const workouts = [
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Fran', time_s: 200 }]
      }]}),
      createMemberWorkout({ user_id: 'u1', display_name: 'Alice', blocks: [{
        movements: [{ name: 'Fran', time_s: 180 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Fran', 'time')
    expect(scores).toHaveLength(1)
    expect(scores[0].value).toBe(180) // Lower time is better
  })

  it('should return empty array when no matching movements', () => {
    const workouts = [
      createMemberWorkout({ blocks: [{
        movements: [{ name: 'Deadlift', load: 315, reps: 3, sets: 3 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'weight')
    expect(scores).toHaveLength(0)
  })

  it('should skip workouts with null blocks', () => {
    const workouts = [
      createMemberWorkout({ blocks: null as any })
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'weight')
    expect(scores).toHaveLength(0)
  })

  it('should handle load_lb alias for weight', () => {
    const workouts = [
      createMemberWorkout({ blocks: [{
        movements: [{ name: 'Back Squat', load_lb: 300, reps: 1, sets: 1 }]
      }]})
    ]

    const scores = extractBestScores(workouts, 'Back Squat', 'weight')
    expect(scores).toHaveLength(1)
    expect(scores[0].value).toBe(300)
  })
})

// ---- PR Score Extraction ----
describe('extractBestPRScores', () => {
  it('should get best PR per user', () => {
    const prs = [
      createMemberPR({ user_id: 'u1', display_name: 'Alice', score_value: 180 }),
      createMemberPR({ user_id: 'u1', display_name: 'Alice', score_value: 170 }),
      createMemberPR({ user_id: 'u2', display_name: 'Bob', score_value: 200 })
    ]

    const scores = extractBestPRScores(prs, 'time')
    expect(scores).toHaveLength(2)

    const alice = scores.find(s => s.user_id === 'u1')
    expect(alice?.value).toBe(170) // Lower time is better
  })

  it('should filter out manual privacy PRs', () => {
    const prs = [
      createMemberPR({ user_id: 'u1', privacy_level: 'manual', score_value: 180 }),
      createMemberPR({ user_id: 'u2', privacy_level: 'all', score_value: 200 })
    ]

    const scores = extractBestPRScores(prs, 'weight')
    expect(scores).toHaveLength(1)
    expect(scores[0].user_id).toBe('u2')
  })

  it('should keep highest value for weight metric', () => {
    const prs = [
      createMemberPR({ user_id: 'u1', score_value: 300 }),
      createMemberPR({ user_id: 'u1', score_value: 315 })
    ]

    const scores = extractBestPRScores(prs, 'weight')
    expect(scores).toHaveLength(1)
    expect(scores[0].value).toBe(315)
  })
})

// ---- Ranking ----
describe('rankUsers', () => {
  it('should rank users by descending value for weight metric', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 225, date: '2025-01-15' },
      { user_id: 'u2', display_name: 'Bob', value: 275, date: '2025-01-14' },
      { user_id: 'u3', display_name: 'Charlie', value: 250, date: '2025-01-13' }
    ]

    const rankings = rankUsers(scores, 'weight', 'u1')

    expect(rankings[0].rank).toBe(1)
    expect(rankings[0].user_display_name).toBe('Bob')
    expect(rankings[1].rank).toBe(2)
    expect(rankings[1].user_display_name).toBe('Charlie')
    expect(rankings[2].rank).toBe(3)
    expect(rankings[2].user_display_name).toBe('Alice')
  })

  it('should rank users by ascending value for time metric', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 200, date: '2025-01-15' },
      { user_id: 'u2', display_name: 'Bob', value: 180, date: '2025-01-14' },
      { user_id: 'u3', display_name: 'Charlie', value: 195, date: '2025-01-13' }
    ]

    const rankings = rankUsers(scores, 'time', 'u1')

    expect(rankings[0].rank).toBe(1)
    expect(rankings[0].user_display_name).toBe('Bob') // fastest
    expect(rankings[1].rank).toBe(2)
    expect(rankings[1].user_display_name).toBe('Charlie')
    expect(rankings[2].rank).toBe(3)
    expect(rankings[2].user_display_name).toBe('Alice')
  })

  it('should handle ties with the same rank', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 225, date: '2025-01-15' },
      { user_id: 'u2', display_name: 'Bob', value: 225, date: '2025-01-14' },
      { user_id: 'u3', display_name: 'Charlie', value: 200, date: '2025-01-13' }
    ]

    const rankings = rankUsers(scores, 'weight', 'u1')

    expect(rankings[0].rank).toBe(1) // Alice
    expect(rankings[1].rank).toBe(1) // Bob (tied)
    expect(rankings[2].rank).toBe(3) // Charlie (skips rank 2)
  })

  it('should mark the current user correctly', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 225, date: '2025-01-15' },
      { user_id: 'u2', display_name: 'Bob', value: 275, date: '2025-01-14' }
    ]

    const rankings = rankUsers(scores, 'weight', 'u1')

    const aliceEntry = rankings.find(r => r.user_id === 'u1')
    expect(aliceEntry?.is_current_user).toBe(true)

    const bobEntry = rankings.find(r => r.user_id === 'u2')
    expect(bobEntry?.is_current_user).toBe(false)
  })

  it('should format weight values correctly', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 225, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'weight', 'u1')
    expect(rankings[0].value_display).toBe('225 lb')
  })

  it('should format reps values correctly', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 50, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'reps', 'u1')
    expect(rankings[0].value_display).toBe('50 reps')
  })

  it('should format time values correctly', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 180, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'time', 'u1')
    expect(rankings[0].value_display).toBe('3:00')
  })

  it('should format time with seconds < 60 correctly', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 45, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'time', 'u1')
    expect(rankings[0].value_display).toBe('45s')
  })

  it('should handle single user rankings', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Solo', value: 300, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'weight', 'u1')
    expect(rankings).toHaveLength(1)
    expect(rankings[0].rank).toBe(1)
  })

  it('should handle empty scores array', () => {
    const rankings = rankUsers([], 'weight', 'u1')
    expect(rankings).toHaveLength(0)
  })

  it('should format volume with locale string', () => {
    const scores = [
      { user_id: 'u1', display_name: 'Alice', value: 5625, date: '2025-01-15' }
    ]

    const rankings = rankUsers(scores, 'volume', 'u1')
    expect(rankings[0].value_display).toBe('5,625 lb')
  })
})

// ---- Integration-style: full pipeline ----
describe('rankings pipeline', () => {
  it('should filter, extract, and rank correctly end-to-end', () => {
    const workouts = [
      createMemberWorkout({
        user_id: 'u1', display_name: 'Alice', privacy_level: 'all',
        blocks: [{ movements: [{ name: 'Back Squat', load: 225, reps: 5, sets: 5 }] }]
      }),
      createMemberWorkout({
        user_id: 'u2', display_name: 'Bob', privacy_level: 'all',
        blocks: [{ movements: [{ name: 'Back Squat', load: 315, reps: 1, sets: 1 }] }]
      }),
      createMemberWorkout({
        user_id: 'u3', display_name: 'Secret', privacy_level: 'manual',
        blocks: [{ movements: [{ name: 'Back Squat', load: 400, reps: 1, sets: 1 }] }]
      }),
      createMemberWorkout({
        user_id: 'u4', display_name: 'Dave', privacy_level: 'all',
        input_text: 'Deadlift 1RM',
        blocks: [{ movements: [{ name: 'Deadlift', load: 405, reps: 1, sets: 1 }] }]
      })
    ]

    let filtered = filterWorkoutsByExercise(workouts, 'Back Squat')
    expect(filtered).toHaveLength(3) // u1, u2, u3 match

    filtered = applyPrivacyFilter(filtered, 'Back Squat')
    expect(filtered).toHaveLength(2) // u3 filtered out (manual privacy)

    const scores = extractBestScores(filtered, 'Back Squat', 'weight')
    expect(scores).toHaveLength(2) // u1 and u2

    const rankings = rankUsers(scores, 'weight', 'u1')
    expect(rankings[0].user_display_name).toBe('Bob') // 315 > 225
    expect(rankings[0].rank).toBe(1)
    expect(rankings[1].user_display_name).toBe('Alice')
    expect(rankings[1].rank).toBe(2)
    expect(rankings[1].is_current_user).toBe(true)
  })
})
