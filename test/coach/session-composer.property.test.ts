import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'
import { composeWeeklySessions } from '@/app/lib/coach/session-composer'
import { buildWeeklyCoverageSchedule } from '@/app/lib/coach/weekly-coverage'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  type ProgrammingProfile
} from '@/app/lib/coach/programming-schema'
import {
  COACH_PROGRAM_DOMAIN_IDS,
  type CoachProgramDomainId,
  type TrainingWeekday
} from '@/app/lib/coach/types'

const WEEKDAYS: TrainingWeekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
]

function profileFor(
  primaryDomain: CoachProgramDomainId,
  dayCount = 3,
  minutes = 60
): ProgrammingProfile {
  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    athleteGoalSummary: `Develop ${primaryDomain} for the next eight weeks`,
    primaryGoal: {
      id: `goal:primary:${primaryDomain}`,
      domain: primaryDomain,
      role: 'primary',
      allocation: 'lead',
      athleteIntent: `Develop ${primaryDomain}`
    },
    secondaryGoals: [],
    trainingExperience: 'consistent',
    startDate: '2026-08-03',
    sessionAvailability: WEEKDAYS.slice(0, dayCount).map(day => ({ day, minutes })),
    equipment: {
      resolvedIds: [...MOVEMENT_EQUIPMENT_IDS],
      unresolvedAthleteDescription: null
    },
    explicitConstraints: [],
    unresolvedConstraintNote: null,
    preferences: [],
    assessments: [],
    recentTraining: {
      asOfDate: null,
      lookbackDays: 0,
      completedSessionCount: 0,
      performedMovementIds: [],
      doseByCoverageTarget: []
    },
    inputSource: { kind: 'structured_v0_3_intake' }
  }
}

describe('role-based session composer', () => {
  it('builds complete strength sessions with specific preparation and multiple named adaptations', () => {
    const profile = profileFor('strength')
    const schedule = buildWeeklyCoverageSchedule(profile)
    const result = composeWeeklySessions(profile, schedule)

    expect(result.sessions).not.toHaveLength(0)
    for (const session of result.sessions) {
      expect(session.format).toBe('complete_programming_v0_3')
      expect(session.blocks[0].role).toBe('specific_preparation')
      expect(session.blocks[1].role).toBe('priority_adaptation')
      expect(session.blocks.length).toBeGreaterThanOrEqual(3)
      expect(session.blocks.reduce((total, block) => total + block.estimatedMinutes, 0))
        .toBeLessThanOrEqual(session.scheduledMinutes)

      const work = session.blocks.slice(1).flatMap(block => block.exercises)
      expect(work.length).toBeGreaterThanOrEqual(2)
      expect(work.every(exercise => (
        exercise.coverageRequirementIds.length > 0
        && exercise.selectionReasons.length > 0
        && exercise.stopCondition.length > 0
        && exercise.substitutionGuidance.length > 0
        && exercise.substitutionMovementIds.length > 0
      ))).toBe(true)
    }
  })

  it('keeps priority work before conditioning in mixed-goal sessions', () => {
    const profile = profileFor('power_explosiveness', 4)
    profile.secondaryGoals = [{
      id: 'goal:secondary:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'development',
      athleteIntent: 'Maintain aerobic fitness'
    }]
    const result = composeWeeklySessions(profile, buildWeeklyCoverageSchedule(profile))

    for (const session of result.sessions) {
      const conditioningIndex = session.blocks.findIndex(block => block.role === 'conditioning')
      if (conditioningIndex >= 0) {
        expect(conditioningIndex).toBeGreaterThan(
          session.blocks.findIndex(block => block.role === 'priority_adaptation')
        )
      }
    }
  })

  it('uses an exact unambiguous assessment for bounded load guidance and selection', () => {
    const profile = profileFor('strength')
    profile.assessments = [{
      id: 'assessment-1',
      movement: 'Back Squat',
      variation: null,
      load: 225,
      unit: 'lb',
      reps: 5,
      assessedOn: '2026-07-27',
      isTrueRepMax: true,
      rir: 0,
      rpe: null,
      athleteConfidence: 0.9,
      estimatedOneRepMax: 262.5,
      estimateKind: 'estimated_1rm',
      calculatorVersion: 'epley-general-v1'
    }]
    const result = composeWeeklySessions(profile, buildWeeklyCoverageSchedule(profile))
    const squat = result.sessions.flatMap(session => session.blocks)
      .flatMap(block => block.exercises)
      .find(exercise => exercise.movementId === 'barbell_back_squat'
        && exercise.role !== 'specific_preparation')

    expect(squat?.loadAnchor).toMatchObject({
      source: 'saved_assessment',
      assessmentId: 'assessment-1',
      percentRange: { min: 65, max: 75 },
      loadRange: { min: 170, max: 195, unit: 'lb' }
    })
    expect(squat?.selectionReasons).toContain('Matches an unambiguous saved assessment.')
  })

  it('keeps 30-minute sessions inside budget without reducing priority recovery', () => {
    const profile = profileFor('strength', 2, 30)
    const result = composeWeeklySessions(profile, buildWeeklyCoverageSchedule(profile))

    for (const session of result.sessions) {
      expect(session.blocks.reduce((total, block) => total + block.estimatedMinutes, 0))
        .toBeLessThanOrEqual(30)
      expect(session.blocks[0].estimatedMinutes).toBeGreaterThanOrEqual(5)
      expect(session.blocks[1].exercises[0].restSeconds.min).toBeGreaterThanOrEqual(120)
    }
  })
})

test.prop([
  fc.constantFrom(...COACH_PROGRAM_DOMAIN_IDS),
  fc.integer({ min: 2, max: 6 }),
  fc.constantFrom(30, 45, 60, 75, 90)
], { numRuns: 100 })('composed sessions preserve roles, traceability, eligibility, and time across supported profiles', (
  domain,
  dayCount,
  minutes
) => {
  const profile = profileFor(domain, dayCount, minutes)
  const schedule = buildWeeklyCoverageSchedule(profile)
  const result = composeWeeklySessions(profile, schedule)

  for (const session of result.sessions) {
    expect(session.blocks[0].role).toBe('specific_preparation')
    expect(session.blocks.some(block => block.role === 'priority_adaptation')).toBe(true)
    expect(session.blocks.reduce((total, block) => total + block.estimatedMinutes, 0))
      .toBeLessThanOrEqual(session.scheduledMinutes)
    for (const exercise of session.blocks.flatMap(block => block.exercises)) {
      expect(exercise.coverageRequirementIds.length).toBeGreaterThan(0)
      expect(exercise.evidenceRuleIds.length).toBeGreaterThan(0)
      expect(exercise.substitutionGuidance.length).toBeGreaterThan(0)
      expect(exercise.policyVersion).toBe('0.3.0')
    }
  }
})
