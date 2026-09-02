import { describe, expect, it } from 'vitest'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import {
  buildTodaySessionCompletion,
  type TodayScheduledMeasurementDraft
} from '@/app/lib/coach/today-session'
import type {
  CoachProgramDomainId,
  CoachScheduledMeasurementSummary
} from '@/app/lib/coach/types'

const sessionId = '11111111-1111-4111-8111-111111111111'
const occurredAt = '2026-09-01T18:00:00.000Z'

describe('Today atomic session completion builder', () => {
  it('copies accepted work only after the UI supplies as-prescribed confirmation data', () => {
    const prescription = prescriptionFor('strength')
    const result = buildTodaySessionCompletion({
      sessionId,
      prescription,
      workoutDate: '2026-09-01',
      outcome: 'as_planned',
      sessionRpe: 7,
      energy: 'okay',
      pain: 'none',
      note: null,
      actualWorkSummary: null,
      totalDurationMinutes: 55,
      occurredAt,
      readiness: 4,
      readinessObservedAt: '2026-09-01T17:00:00.000Z',
      measurements: []
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        contractVersion: 2,
        performedWork: {
          mode: 'as_prescribed',
          workoutDate: '2026-09-01',
          inputText: null,
          blocks: null,
          totalDurationMinutes: 55
        },
        observations: [expect.objectContaining({
          kind: 'readiness_check',
          metric: { metricId: 'readiness.score', value: 4, unit: 'score' }
        })]
      })
    }))
  })

  it.each([
    {
      domain: 'strength' as const,
      assessmentId: 'strength.repetition_max',
      metricValue: 315,
      metricUnit: 'lb' as const,
      extras: { repetitions: 3 },
      expectedMetric: 'strength.load'
    },
    {
      domain: 'hypertrophy' as const,
      assessmentId: 'strength.repetition_capacity',
      metricValue: 12,
      metricUnit: 'repetitions' as const,
      extras: { externalLoadValue: 50, externalLoadUnit: 'lb' as const, durationValue: 60 },
      expectedMetric: 'strength.repetitions'
    },
    {
      domain: 'power_explosiveness' as const,
      assessmentId: 'jump.height',
      metricValue: 24,
      metricUnit: 'in' as const,
      extras: {},
      expectedMetric: 'jump.height'
    },
    {
      domain: 'speed_agility' as const,
      assessmentId: 'sprint.time',
      metricValue: 4.72,
      metricUnit: 's' as const,
      extras: { distanceValue: 30, distanceUnit: 'm' as const },
      expectedMetric: 'sprint.time'
    },
    {
      domain: 'aerobic' as const,
      assessmentId: 'run.time_trial',
      metricValue: 21.5,
      metricUnit: 'min' as const,
      extras: { distanceValue: 5, distanceUnit: 'km' as const },
      expectedMetric: 'run.time'
    }
  ])('builds a comparable $domain scheduled observation', ({
    domain,
    assessmentId,
    metricValue,
    metricUnit,
    extras,
    expectedMetric
  }) => {
    const prescription = prescriptionFor(domain)
    const schedule = scheduledMeasurement(assessmentId)
    const measurement: TodayScheduledMeasurementDraft = {
      schedule,
      value: metricValue,
      unit: metricUnit,
      repetitions: null,
      externalLoadValue: null,
      externalLoadUnit: 'lb',
      distanceValue: null,
      distanceUnit: 'm',
      durationValue: null,
      durationUnit: 's',
      ...extras
    }
    const result = buildTodaySessionCompletion({
      sessionId,
      prescription,
      workoutDate: '2026-09-01',
      outcome: 'as_planned',
      sessionRpe: 7.5,
      energy: 'okay',
      pain: 'none',
      note: null,
      actualWorkSummary: null,
      totalDurationMinutes: null,
      occurredAt,
      readiness: null,
      readinessObservedAt: null,
      measurements: [measurement]
    })

    if (!result.ok) {
      throw new Error(result.errors.join('; '))
    }
    if (!result.ok) return
    expect(result.value.observations).toEqual([
      expect.objectContaining({
        assessmentDefinition: { id: assessmentId, version: '1.0.0' },
        metric: expect.objectContaining({ metricId: expectedMetric }),
        comparabilityKey: expect.stringContaining('comparison-v1')
      })
    ])
  })

  it('stores modified work as athlete-reported actual work and keeps skips evidence-free', () => {
    const prescription = prescriptionFor('strength')
    const modified = buildTodaySessionCompletion({
      sessionId,
      prescription,
      workoutDate: '2026-09-01',
      outcome: 'modified',
      sessionRpe: 8,
      energy: 'low',
      pain: 'mild',
      note: 'Knee felt stiff.',
      actualWorkSummary: 'Completed three sets and reduced the final set to six reps.',
      totalDurationMinutes: 43,
      occurredAt,
      readiness: null,
      readinessObservedAt: null,
      measurements: []
    })
    expect(modified).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        performedWork: expect.objectContaining({
          mode: 'modified',
          inputText: 'Completed three sets and reduced the final set to six reps.'
        })
      })
    }))

    const skipped = buildTodaySessionCompletion({
      sessionId,
      prescription,
      workoutDate: '2026-09-01',
      outcome: 'skipped',
      sessionRpe: null,
      energy: 'low',
      pain: 'concerning',
      note: 'Did not start.',
      actualWorkSummary: null,
      totalDurationMinutes: null,
      occurredAt,
      readiness: 1,
      readinessObservedAt: '2026-09-01T17:00:00.000Z',
      measurements: []
    })
    expect(skipped).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        status: 'skipped',
        performedWork: null,
        observations: []
      })
    }))
  })
})

function prescriptionFor(domain: CoachProgramDomainId) {
  const equipmentByDomain: Record<CoachProgramDomainId, string[]> = {
    strength: ['bodyweight', 'barbell', 'rack'],
    hypertrophy: ['bodyweight', 'dumbbell'],
    power_explosiveness: ['bodyweight', 'box'],
    speed_agility: ['bodyweight', 'track'],
    aerobic: ['bodyweight', 'track'],
    resilience: ['bodyweight']
  }
  const validation = validateCompleteCoachPlanningInput({
    format: 'complete_programming_intake_v0_3',
    primaryDomain: domain,
    goal: `Improve ${domain}`,
    experience: 'consistent',
    trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60,
    equipment: equipmentByDomain[domain].join(', '),
    resolvedEquipmentIds: equipmentByDomain[domain],
    constraints: '',
    constraintKinds: [],
    secondaryGoals: [],
    startDate: '2026-08-31'
  })
  if (!validation.ok) throw new Error(validation.errors.join('; '))
  const sessions = buildCompleteEightWeekPlan(buildProgrammingProfile(validation.value, []))
    .weeks[0].sessions
  const expectedPattern = domain === 'power_explosiveness'
    ? 'jump'
    : domain === 'speed_agility'
      ? 'sprint'
      : domain === 'aerobic'
        ? 'running'
        : null
  if (!expectedPattern) return sessions[0]
  return sessions.find(session => session.blocks.some(block => block.exercises.some(exercise => {
    const movement = MOVEMENT_CATALOG.find(item => item.id === exercise.movementId)
    if (!movement) return false
    return expectedPattern === 'running'
      ? movement.running
      : movement.patterns.includes(expectedPattern)
  }))) ?? sessions[0]
}

function scheduledMeasurement(assessmentId: string): CoachScheduledMeasurementSummary {
  const definition = findAssessmentDefinition(assessmentId)
  if (!definition) throw new Error(`Missing assessment ${assessmentId}`)
  return {
    id: `scheduled:${assessmentId}:week-1`,
    weekNumber: 1,
    scheduledOn: '2026-09-01',
    assessmentDefinition: { id: definition.id, version: definition.version },
    protocol: { id: definition.protocol.id, version: definition.protocol.version },
    metricId: definition.primaryMetricId,
    semanticRole: definition.allowedSemanticRoles[0]
  }
}
