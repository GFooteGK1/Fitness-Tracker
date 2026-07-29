import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'
import {
  buildWeeklyCoverageSchedule,
  type WeeklyCoverageSchedule
} from '@/app/lib/coach/weekly-coverage'
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

function expectBalancedSchedule(schedule: WeeklyCoverageSchedule): void {
  const assignmentsByRequirement = new Map<string, number>()
  for (const assignment of schedule.assignments) {
    assignmentsByRequirement.set(
      assignment.requirementId,
      (assignmentsByRequirement.get(assignment.requirementId) ?? 0) + assignment.dose
    )
  }

  for (const entry of schedule.ledger) {
    expect(assignmentsByRequirement.get(entry.requirement.id) ?? 0).toBe(entry.plannedDose)
    expect(entry.plannedDose === 0 || entry.plannedDose >= entry.requirement.dose.minimum).toBe(true)
  }
  for (const day of schedule.days) {
    expect(day.remainingMinutes).toBeGreaterThanOrEqual(0)
    expect(day.assignmentIds.length).toBe(new Set(day.assignmentIds).size)
  }
  for (const requirement of schedule.requirements) {
    const entry = schedule.ledger.find(candidate => candidate.requirement.id === requirement.id)
    const gap = schedule.gaps.find(candidate => candidate.requirementId === requirement.id)
    expect(Boolean(entry?.plannedDose) || Boolean(gap)).toBe(true)
  }
}

describe('weekly coverage scheduler', () => {
  it('builds and accounts for a complete strength ledger before choosing exercises', () => {
    const schedule = buildWeeklyCoverageSchedule(profileFor('strength'))
    const targets = schedule.requirements.map(requirement => requirement.targetId)

    expect(targets).toEqual(expect.arrayContaining([
      'knee_dominant',
      'hip_hinge',
      'horizontal_push',
      'horizontal_pull'
    ]))
    expect(schedule.gaps).toEqual([])
    expect(schedule.requirements.every(requirement => (
      requirement.policyVersion === '0.3.0'
      && requirement.evidenceRuleIds.length > 0
    ))).toBe(true)
    expectBalancedSchedule(schedule)
  })

  it('keeps incompatible aerobic intervals away from lead power when the schedule permits', () => {
    const profile = profileFor('power_explosiveness', 4)
    profile.secondaryGoals = [{
      id: 'goal:secondary:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'development',
      athleteIntent: 'Maintain aerobic fitness'
    }]

    const schedule = buildWeeklyCoverageSchedule(profile)
    const lowerPower = schedule.assignments.filter(assignment => (
      assignment.targetId === 'lower_body_power'
    ))
    const intervals = schedule.assignments.filter(assignment => (
      assignment.targetId === 'aerobic_intervals'
    ))

    for (const powerAssignment of lowerPower) {
      expect(intervals.some(interval => interval.day === powerAssignment.day)).toBe(false)
    }
    expectBalancedSchedule(schedule)
  })

  it('surfaces true sprint omissions instead of relabeling drills when running is excluded', () => {
    const profile = profileFor('speed_agility', 3)
    profile.explicitConstraints = [{
      id: 'constraint:no_running',
      kind: 'no_running',
      description: 'Do not prescribe running',
      source: 'athlete_confirmed'
    }]

    const schedule = buildWeeklyCoverageSchedule(profile)

    expect(schedule.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'locomotor_acceleration', reason: 'constraint' }),
      expect.objectContaining({ targetId: 'maximum_velocity', reason: 'constraint' })
    ]))
    expect(schedule.assignments.map(assignment => assignment.targetId)).toEqual(expect.arrayContaining([
      'sprint_mechanics',
      'deceleration_control'
    ]))
    expectBalancedSchedule(schedule)
  })

  it('uses recent factual dose and matching assessments without inventing a load', () => {
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
    }, {
      id: 'assessment-ambiguous',
      movement: 'Deadlift',
      variation: null,
      load: 315,
      unit: 'lb',
      reps: 3,
      assessedOn: '2026-07-27',
      isTrueRepMax: true,
      rir: 0,
      rpe: null,
      athleteConfidence: 0.8,
      estimatedOneRepMax: 346.5,
      estimateKind: 'estimated_1rm',
      calculatorVersion: 'epley-general-v1'
    }]
    profile.recentTraining = {
      asOfDate: '2026-07-28',
      lookbackDays: 28,
      completedSessionCount: 9,
      performedMovementIds: ['barbell_back_squat'],
      doseByCoverageTarget: [{
        kind: 'movement_pattern',
        targetId: 'knee_dominant',
        unit: 'working_sets',
        amount: 7
      }]
    }

    const schedule = buildWeeklyCoverageSchedule(profile)
    const knee = schedule.ledger.find(entry => entry.requirement.targetId === 'knee_dominant')

    expect(knee?.plannedDose).toBe(7)
    expect(schedule.assessmentCandidateIdsByRequirement[knee?.requirement.id ?? ''])
      .toEqual(['assessment-1'])
    expect(schedule.assessmentMatchesByRequirement[knee?.requirement.id ?? ''])
      .toEqual([{
        assessmentId: 'assessment-1',
        movementIds: ['barbell_back_squat'],
        unambiguous: true
      }])
    const hinge = schedule.ledger.find(entry => entry.requirement.targetId === 'hip_hinge')
    expect(schedule.assessmentCandidateIdsByRequirement[hinge?.requirement.id ?? ''])
      .not.toContain('assessment-ambiguous')
    expect(schedule.assessmentMatchesByRequirement[hinge?.requirement.id ?? ''])
      .toEqual([expect.objectContaining({
        assessmentId: 'assessment-ambiguous',
        unambiguous: false
      })])
    expectBalancedSchedule(schedule)
  })

  it('starts new or returning athletes at minimum exposure frequency and marks review weeks without auto-deloading', () => {
    const profile = profileFor('strength', 3)
    profile.trainingExperience = 'new_or_returning'

    const weekOne = buildWeeklyCoverageSchedule(profile)
    const weekFour = buildWeeklyCoverageSchedule(profile, { weekNumber: 4 })
    const kneeAssignments = weekOne.assignments.filter(assignment => (
      assignment.targetId === 'knee_dominant'
    ))

    expect(kneeAssignments).toHaveLength(1)
    expect(weekOne.reviewRequired).toBe(false)
    expect(weekFour.reviewRequired).toBe(true)
    expect(weekFour.assignments).toEqual(weekOne.assignments)
  })

  it('makes time-pressure reductions inspectable instead of overfilling short sessions', () => {
    const profile = profileFor('strength', 2, 30)
    profile.secondaryGoals = [
      {
        id: 'goal:secondary:hypertrophy',
        domain: 'hypertrophy',
        role: 'secondary',
        allocation: 'development',
        athleteIntent: 'Add muscle'
      },
      {
        id: 'goal:secondary:aerobic',
        domain: 'aerobic',
        role: 'secondary',
        allocation: 'maintenance',
        athleteIntent: 'Maintain aerobic fitness'
      }
    ]

    const schedule = buildWeeklyCoverageSchedule(profile)

    expect(schedule.gaps.some(gap => gap.reason === 'time')).toBe(true)
    expectBalancedSchedule(schedule)
  })
})

test.prop([
  fc.constantFrom(...COACH_PROGRAM_DOMAIN_IDS),
  fc.integer({ min: 2, max: 6 }),
  fc.constantFrom(30, 45, 60, 75, 90)
], { numRuns: 100 })('all domains produce accounted schedules across 2-6 days and 30-90 minutes', (
  domain,
  dayCount,
  minutes
) => {
  const schedule = buildWeeklyCoverageSchedule(profileFor(domain, dayCount, minutes))

  expect(schedule.days).toHaveLength(dayCount)
  expect(schedule.requirements.length).toBeGreaterThan(0)
  expect(schedule.gaps.every(gap => gap.reason !== 'unsupported')).toBe(true)
  expectBalancedSchedule(schedule)
})
