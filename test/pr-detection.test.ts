import { describe, it, expect } from 'vitest'
import { detectPRsFromBlocks, formatPRValue, type WorkoutBlock } from '@/app/lib/pr-detection'

function makeStrengthBlock(overrides: Partial<WorkoutBlock> = {}): WorkoutBlock {
  return {
    block_type: 'STRENGTH',
    title: overrides.title,
    segments: overrides.segments ?? [
      {
        rounds: 1,
        events: [
          {
            movement_name: 'Back Squat',
            prescribed: { reps: 5 },
            performed: { reps: 5, load: { value: 225, unit: 'lb' } },
          },
        ],
      },
    ],
    block_score: overrides.block_score ?? {
      tonnage_lb: 1125,
      rx_status: 'RX',
    },
    ...overrides,
  }
}

function makeForTimeBlock(title: string, timeS: number): WorkoutBlock {
  return {
    block_type: 'FOR_TIME',
    title,
    segments: [
      {
        rounds: 1,
        events: [
          {
            movement_name: 'Thruster',
            prescribed: { reps: 21 },
            performed: { reps: 21, load: { value: 95, unit: 'lb' } },
          },
          {
            movement_name: 'Pull-up',
            prescribed: { reps: 21 },
            performed: { reps: 21, load: { value: 0, unit: 'lb' } },
          },
        ],
      },
    ],
    block_score: {
      time_s: timeS,
      rx_status: 'RX',
    },
  }
}

describe('detectPRsFromBlocks', () => {
  describe('weight PRs', () => {
    it('detects a new max weight when no history exists (first-time exercise)', () => {
      const blocks = [makeStrengthBlock()]
      const prs = detectPRsFromBlocks(blocks, [])

      const weightPR = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      expect(weightPR).toBeDefined()
      expect(weightPR!.isPR).toBe(true)
      expect(weightPR!.newRecord).toBe(225)
      expect(weightPR!.previousBest).toBe(0)
      expect(weightPR!.improvement).toBe('First time!')
    })

    it('detects a weight PR when new value exceeds history', () => {
      const blocks = [makeStrengthBlock()]
      const history = [{ exercise: 'Back Squat', pr_type: 'weight', value: 200 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const weightPR = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      expect(weightPR).toBeDefined()
      expect(weightPR!.newRecord).toBe(225)
      expect(weightPR!.previousBest).toBe(200)
      expect(weightPR!.improvement).toContain('+25 lbs')
    })

    it('does NOT detect a weight PR on a tie', () => {
      const blocks = [makeStrengthBlock()]
      const history = [{ exercise: 'Back Squat', pr_type: 'weight', value: 225 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const weightPR = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      expect(weightPR).toBeUndefined()
    })

    it('does NOT detect a weight PR when below history', () => {
      const blocks = [makeStrengthBlock()]
      const history = [{ exercise: 'Back Squat', pr_type: 'weight', value: 300 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const weightPR = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      expect(weightPR).toBeUndefined()
    })
  })

  describe('reps PRs', () => {
    it('detects a rep PR at a given weight', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 1,
              events: [
                {
                  movement_name: 'Bench Press',
                  prescribed: { reps: 10 },
                  performed: { reps: 10, load: { value: 185, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]
      const history = [
        { exercise: 'Bench Press @ 185 lbs', pr_type: 'reps', value: 8 },
      ]

      const prs = detectPRsFromBlocks(blocks, history)
      const repPR = prs.find(p => p.prType === 'reps' && p.exercise.includes('Bench Press'))
      expect(repPR).toBeDefined()
      expect(repPR!.newRecord).toBe(10)
      expect(repPR!.previousBest).toBe(8)
    })

    it('detects first-time rep record', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 1,
              events: [
                {
                  movement_name: 'Deadlift',
                  prescribed: { reps: 3 },
                  performed: { reps: 3, load: { value: 405, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]

      const prs = detectPRsFromBlocks(blocks, [])
      const repPR = prs.find(p => p.prType === 'reps' && p.exercise.includes('Deadlift'))
      expect(repPR).toBeDefined()
      expect(repPR!.newRecord).toBe(3)
      expect(repPR!.previousBest).toBe(0)
    })
  })

  describe('time PRs (WOD times)', () => {
    it('detects a faster WOD time', () => {
      const blocks = [makeForTimeBlock('Fran', 180)]
      const history = [{ exercise: 'Fran', pr_type: 'time', value: 210 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const timePR = prs.find(p => p.prType === 'time' && p.exercise === 'Fran')
      expect(timePR).toBeDefined()
      expect(timePR!.newRecord).toBe(180)
      expect(timePR!.previousBest).toBe(210)
      expect(timePR!.improvement).toContain('faster')
    })

    it('detects first-time WOD completion as a PR', () => {
      const blocks = [makeForTimeBlock('Murph', 2400)]
      const prs = detectPRsFromBlocks(blocks, [])

      const timePR = prs.find(p => p.prType === 'time' && p.exercise === 'Murph')
      expect(timePR).toBeDefined()
      expect(timePR!.newRecord).toBe(2400)
      expect(timePR!.previousBest).toBe(0)
      expect(timePR!.improvement).toBe('First time!')
    })

    it('does NOT detect a time PR on a tie', () => {
      const blocks = [makeForTimeBlock('Fran', 210)]
      const history = [{ exercise: 'Fran', pr_type: 'time', value: 210 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const timePR = prs.find(p => p.prType === 'time' && p.exercise === 'Fran')
      expect(timePR).toBeUndefined()
    })

    it('does NOT detect a time PR when slower', () => {
      const blocks = [makeForTimeBlock('Fran', 300)]
      const history = [{ exercise: 'Fran', pr_type: 'time', value: 210 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const timePR = prs.find(p => p.prType === 'time' && p.exercise === 'Fran')
      expect(timePR).toBeUndefined()
    })

    it('skips time PR detection when block has no title', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'FOR_TIME',
          // No title
          segments: [],
          block_score: { time_s: 300 },
        },
      ]
      const prs = detectPRsFromBlocks(blocks, [])
      const timePR = prs.find(p => p.prType === 'time')
      expect(timePR).toBeUndefined()
    })
  })

  describe('volume PRs', () => {
    it('detects a volume PR (sets x reps x weight)', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 5,
              events: [
                {
                  movement_name: 'Back Squat',
                  prescribed: { reps: 5 },
                  performed: { reps: 5, load: { value: 225, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]
      // 5 rounds * 5 reps * 225 lbs = 5625 total volume
      const history = [{ exercise: 'Back Squat', pr_type: 'volume', value: 4500 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const volPR = prs.find(p => p.prType === 'volume' && p.exercise === 'Back Squat')
      expect(volPR).toBeDefined()
      expect(volPR!.newRecord).toBe(5625)
      expect(volPR!.previousBest).toBe(4500)
    })

    it('skips volume for bodyweight movements (load = 0)', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'GYMNASTICS',
          segments: [
            {
              rounds: 3,
              events: [
                {
                  movement_name: 'Pull-up',
                  performed: { reps: 10, load: { value: 0, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]

      const prs = detectPRsFromBlocks(blocks, [])
      const volPR = prs.find(p => p.prType === 'volume' && p.exercise === 'Pull-up')
      expect(volPR).toBeUndefined()
    })
  })

  describe('multiple PRs in one session', () => {
    it('detects multiple PRs from a single workout', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 1,
              events: [
                {
                  movement_name: 'Back Squat',
                  performed: { reps: 3, load: { value: 315, unit: 'lb' } },
                },
              ],
            },
          ],
        },
        makeForTimeBlock('Grace', 180),
      ]

      const history = [
        { exercise: 'Back Squat', pr_type: 'weight', value: 300 },
        { exercise: 'Grace', pr_type: 'time', value: 210 },
      ]

      const prs = detectPRsFromBlocks(blocks, history)
      expect(prs.length).toBeGreaterThanOrEqual(2)

      const sqPR = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      const gracePR = prs.find(p => p.prType === 'time' && p.exercise === 'Grace')
      expect(sqPR).toBeDefined()
      expect(gracePR).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('handles empty blocks array', () => {
      const prs = detectPRsFromBlocks([], [])
      expect(prs).toEqual([])
    })

    it('handles blocks with no segments', () => {
      const blocks: WorkoutBlock[] = [
        { block_type: 'CARDIO' },
      ]
      const prs = detectPRsFromBlocks(blocks, [])
      expect(prs).toEqual([])
    })

    it('handles events with missing performed data', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 1,
              events: [
                {
                  movement_name: 'Deadlift',
                  prescribed: { reps: 5 },
                  // No performed data
                },
              ],
            },
          ],
        },
      ]
      const prs = detectPRsFromBlocks(blocks, [])
      expect(prs).toEqual([])
    })

    it('is case-insensitive when matching exercises to history', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 1,
              events: [
                {
                  movement_name: 'back squat',
                  performed: { reps: 5, load: { value: 250, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]
      const history = [{ exercise: 'Back Squat', pr_type: 'weight', value: 225 }]

      const prs = detectPRsFromBlocks(blocks, history)
      const pr = prs.find(p => p.prType === 'weight')
      expect(pr).toBeDefined()
      expect(pr!.previousBest).toBe(225)
    })

    it('uses the highest value from multiple historical records', () => {
      const blocks = [makeStrengthBlock()]
      const history = [
        { exercise: 'Back Squat', pr_type: 'weight', value: 200 },
        { exercise: 'Back Squat', pr_type: 'weight', value: 220 },
        { exercise: 'Back Squat', pr_type: 'weight', value: 185 },
      ]

      const prs = detectPRsFromBlocks(blocks, history)
      const pr = prs.find(p => p.prType === 'weight' && p.exercise === 'Back Squat')
      expect(pr).toBeDefined()
      expect(pr!.previousBest).toBe(220)
    })

    it('accumulates volume across segments', () => {
      const blocks: WorkoutBlock[] = [
        {
          block_type: 'STRENGTH',
          segments: [
            {
              rounds: 3,
              events: [
                {
                  movement_name: 'Deadlift',
                  performed: { reps: 5, load: { value: 315, unit: 'lb' } },
                },
              ],
            },
            {
              rounds: 2,
              events: [
                {
                  movement_name: 'Deadlift',
                  performed: { reps: 3, load: { value: 365, unit: 'lb' } },
                },
              ],
            },
          ],
        },
      ]
      // Segment 1: 3 * 5 * 315 = 4725
      // Segment 2: 2 * 3 * 365 = 2190
      // Total: 6915

      const prs = detectPRsFromBlocks(blocks, [])
      const volPR = prs.find(p => p.prType === 'volume' && p.exercise === 'Deadlift')
      expect(volPR).toBeDefined()
      expect(volPR!.newRecord).toBe(6915)
    })
  })
})

describe('formatPRValue', () => {
  it('formats time values as M:SS', () => {
    expect(formatPRValue('time', 180)).toBe('3:00')
    expect(formatPRValue('time', 587)).toBe('9:47')
    expect(formatPRValue('time', 65)).toBe('1:05')
  })

  it('formats weight values', () => {
    expect(formatPRValue('weight', 225)).toBe('225 lbs')
  })

  it('formats reps values', () => {
    expect(formatPRValue('reps', 10)).toBe('10 reps')
  })

  it('formats volume values', () => {
    expect(formatPRValue('volume', 5625)).toBe('5625 lbs')
  })
})
