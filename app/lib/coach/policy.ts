import type {
  DerivedStrengthAssessment,
  EightWeekIntent,
  StrengthAssessmentInput
} from './types'

export const COACH_POLICY_VERSION = '0.1.0'
export const E1RM_CALCULATOR_VERSION = 'epley-general-v1'

export const APPROVED_NUMERIC_PRESCRIPTION_SOURCES = [
  'validated_policy',
  'accepted_program'
] as const

const EIGHT_WEEK_INTENT: readonly EightWeekIntent[] = [
  {
    week: 1,
    role: 'establish',
    intent: 'Learn the movements, confirm starting loads, and finish with useful capacity left.',
    reviewRequired: false
  },
  {
    week: 2,
    role: 'build',
    intent: 'Add a small amount of appropriate load, work, pace, or complexity.',
    reviewRequired: false
  },
  {
    week: 3,
    role: 'develop',
    intent: 'Deliver the strongest appropriate stimulus while preserving the target quality.',
    reviewRequired: false
  },
  {
    week: 4,
    role: 'deload_review',
    intent: 'Reduce the stressors showing fatigue, retain useful practice, and update baselines.',
    reviewRequired: true
  },
  {
    week: 5,
    role: 'reestablish',
    intent: 'Resume from the review rather than blindly repeating week three.',
    reviewRequired: false
  },
  {
    week: 6,
    role: 'build',
    intent: 'Progress the qualities that are adapting and hold those that need more time.',
    reviewRequired: false
  },
  {
    week: 7,
    role: 'develop',
    intent: 'Deliver the most specific appropriate work of the block without chasing exhaustion.',
    reviewRequired: false
  },
  {
    week: 8,
    role: 'deload_assess',
    intent: 'Reduce stress, evaluate progress, and decide the next block with the athlete.',
    reviewRequired: true
  }
]

export function deriveStrengthAssessment(
  input: StrengthAssessmentInput
): DerivedStrengthAssessment {
  validateStrengthAssessment(input)

  const rawEstimate = input.reps === 1
    ? input.load
    : input.load * (1 + (input.reps / 30))

  return {
    movement: input.movement.trim(),
    variation: input.variation?.trim() || null,
    unit: input.unit,
    estimatedOneRepMax: roundToOneDecimal(rawEstimate),
    estimateKind: input.reps === 1 ? 'reported_1rm' : 'estimated_1rm',
    sourceLoad: input.load,
    sourceReps: input.reps,
    sourceDate: input.assessedOn,
    isTrueRepMax: input.isTrueRepMax,
    rir: input.rir ?? null,
    rpe: input.rpe ?? null,
    athleteConfidence: input.athleteConfidence,
    calculatorVersion: E1RM_CALCULATOR_VERSION,
    formula: input.reps === 1 ? 'reported load' : 'load * (1 + reps / 30)'
  }
}

export function getEightWeekIntent(): readonly EightWeekIntent[]
export function getEightWeekIntent(week: number): EightWeekIntent
export function getEightWeekIntent(week?: number): readonly EightWeekIntent[] | EightWeekIntent {
  if (week === undefined) return EIGHT_WEEK_INTENT

  if (!Number.isInteger(week) || week < 1 || week > 8) {
    throw new Error('week must be an integer from 1 through 8')
  }

  return EIGHT_WEEK_INTENT[week - 1]
}

export function isApprovedNumericPrescriptionSource(source: unknown): boolean {
  return typeof source === 'string' && (
    APPROVED_NUMERIC_PRESCRIPTION_SOURCES as readonly string[]
  ).includes(source)
}

function validateStrengthAssessment(input: StrengthAssessmentInput): void {
  if (!input.movement || input.movement.trim().length === 0) {
    throw new Error('movement is required')
  }

  if (!Number.isFinite(input.load) || input.load <= 0) {
    throw new Error('load must be greater than zero')
  }

  if (input.unit !== 'lb' && input.unit !== 'kg') {
    throw new Error('unit must be lb or kg')
  }

  if (![1, 3, 5].includes(input.reps)) {
    throw new Error('reps must be 1, 3, or 5')
  }

  if (!isValidIsoDate(input.assessedOn)) {
    throw new Error('assessedOn must be a valid YYYY-MM-DD date')
  }

  if (!Number.isFinite(input.athleteConfidence) || input.athleteConfidence < 0 || input.athleteConfidence > 1) {
    throw new Error('athleteConfidence must be between zero and one')
  }

  if (input.rir !== undefined && (!Number.isFinite(input.rir) || input.rir < 0 || input.rir > 10)) {
    throw new Error('rir must be between zero and ten')
  }

  if (input.rpe !== undefined && (!Number.isFinite(input.rpe) || input.rpe < 1 || input.rpe > 10)) {
    throw new Error('rpe must be between one and ten')
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
