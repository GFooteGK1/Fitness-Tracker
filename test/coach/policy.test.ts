import { describe, expect, it } from 'vitest'
import {
  COACH_POLICY_VERSION,
  E1RM_CALCULATOR_VERSION,
  deriveStrengthAssessment,
  getEightWeekIntent,
  isApprovedNumericPrescriptionSource
} from '@/app/lib/coach/policy'

describe('coach deterministic policy', () => {
  it('keeps policy and calculator versions explicit', () => {
    expect(COACH_POLICY_VERSION).toBe('0.1.0')
    expect(E1RM_CALCULATOR_VERSION).toBe('epley-general-v1')
  })

  it('preserves a reported 1RM without presenting it as a calculated max', () => {
    const result = deriveStrengthAssessment({
      movement: 'Back Squat',
      variation: 'high bar',
      load: 180,
      unit: 'kg',
      reps: 1,
      assessedOn: '2026-07-20',
      isTrueRepMax: true,
      athleteConfidence: 0.9
    })

    expect(result.estimatedOneRepMax).toBe(180)
    expect(result.estimateKind).toBe('reported_1rm')
    expect(result.sourceReps).toBe(1)
    expect(result.calculatorVersion).toBe(E1RM_CALCULATOR_VERSION)
  })

  it('derives and labels a 3RM or 5RM estimate with source provenance', () => {
    const threeRep = deriveStrengthAssessment({
      movement: 'Deadlift',
      load: 200,
      unit: 'kg',
      reps: 3,
      assessedOn: '2026-07-18',
      isTrueRepMax: true,
      athleteConfidence: 0.8
    })
    const fiveRep = deriveStrengthAssessment({
      movement: 'Bench Press',
      load: 100,
      unit: 'kg',
      reps: 5,
      assessedOn: '2026-07-19',
      isTrueRepMax: true,
      rir: 0,
      athleteConfidence: 0.85
    })

    expect(threeRep).toMatchObject({
      estimatedOneRepMax: 220,
      estimateKind: 'estimated_1rm',
      sourceReps: 3,
      sourceLoad: 200,
      sourceDate: '2026-07-18'
    })
    expect(fiveRep.estimatedOneRepMax).toBe(116.7)
    expect(fiveRep.estimateKind).toBe('estimated_1rm')
  })

  it('rejects unsupported or unsafe assessment inputs', () => {
    expect(() => deriveStrengthAssessment({
      movement: 'Back Squat',
      load: 100,
      unit: 'kg',
      reps: 2 as 1,
      assessedOn: '2026-07-20',
      isTrueRepMax: true,
      athleteConfidence: 0.8
    })).toThrow('reps must be 1, 3, or 5')

    expect(() => deriveStrengthAssessment({
      movement: 'Back Squat',
      load: 0,
      unit: 'kg',
      reps: 5,
      assessedOn: '2026-07-20',
      isTrueRepMax: true,
      athleteConfidence: 0.8
    })).toThrow('load must be greater than zero')
  })

  it('defines review-led deloads at weeks four and eight', () => {
    expect(getEightWeekIntent()).toHaveLength(8)
    expect(getEightWeekIntent(4)).toMatchObject({ week: 4, role: 'deload_review' })
    expect(getEightWeekIntent(8)).toMatchObject({ week: 8, role: 'deload_assess' })
    expect(getEightWeekIntent(3)).toMatchObject({ week: 3, role: 'develop' })
  })

  it('allows numbers only from policy or accepted program state', () => {
    expect(isApprovedNumericPrescriptionSource('validated_policy')).toBe(true)
    expect(isApprovedNumericPrescriptionSource('accepted_program')).toBe(true)
    expect(isApprovedNumericPrescriptionSource('llm_generated')).toBe(false)
  })
})
