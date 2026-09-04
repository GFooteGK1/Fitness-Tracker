import { describe, expect, it } from 'vitest'
import {
  buildRollingTrainingDirection,
  type RollingWeeklyPlanningDecision
} from '@/app/lib/coach/rolling-weekly-contracts'
import {
  buildRollingWeeklyPlan,
  type RollingWeeklyPlanDraft
} from '@/app/lib/coach/rolling-weekly-plan'
import type { ProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

const baseProfile = withStart(GOLDEN_PROGRAMMING_PROFILES[1].profile, '2026-09-07')
const baseDirection = buildRollingTrainingDirection(baseProfile, {
  hypothesis: 'Repeatable moderate weekly exposures will build useful muscle and strength.',
  goalTargetDate: '2026-12-31'
})

function buildInitial(): RollingWeeklyPlanDraft {
  const result = buildRollingWeeklyPlan({
    source: 'initial',
    windowStart: '2026-09-07',
    profile: baseProfile,
    direction: baseDirection
  })
  if (result.kind !== 'weekly_plan') throw new Error('Expected a weekly plan')
  return result
}

describe('rolling weekly planning kernel', () => {
  it('builds only one Monday-through-Sunday dose', () => {
    const plan = buildInitial()

    expect(plan.sequenceNumber).toBe(1)
    expect(plan.windowStart).toBe('2026-09-07')
    expect(plan.windowEnd).toBe('2026-09-13')
    expect(plan.schedule.weekNumber).toBe(1)
    expect(plan.schedule.reviewRequired).toBe(false)
    expect(plan.sessions.length).toBeGreaterThan(0)
    expect(new Set(plan.sessions.map(session => session.weekNumber))).toEqual(new Set([1]))
    expect(plan.scheduledSessions.every(session => (
      session.scheduledDate >= plan.windowStart && session.scheduledDate <= plan.windowEnd
    ))).toBe(true)
  })

  it('continues the accepted dose without a hidden change', () => {
    const prior = buildInitial()
    const next = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({ action: 'continue', presentationClass: 'same_track' })
    }))

    expect(next.sequenceNumber).toBe(2)
    expect(next.changeSummary.changedVariables).toEqual([])
    expect(doseSnapshot(next)).toEqual(doseSnapshot(prior))
    expect(movementSnapshot(next)).toEqual(movementSnapshot(prior))
    expect(next.sessions.map(session => session.sessionId)).not.toEqual(
      prior.sessions.map(session => session.sessionId)
    )
  })

  it('adjusts one validated dose variable and no other assignment', () => {
    const prior = buildInitial()
    const candidate = findProgressionCandidate(prior)
    const next = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({
        action: 'adjust_dose',
        presentationClass: 'small_adjustment',
        doseChange: {
          assignmentId: candidate.id,
          unit: candidate.unit,
          from: candidate.dose,
          to: candidate.dose + doseStep(candidate.unit)
        }
      })
    }))

    const changed = next.schedule.assignments.filter((assignment, index) => (
      assignment.dose !== prior.schedule.assignments[index].dose
    ))
    expect(changed).toHaveLength(1)
    expect(changed[0].id).toBe(candidate.id)
    expect(next.changeSummary.changedVariables).toEqual([`dose:${candidate.id}`])
  })

  it('reduces one previously progressed variable for recovery', () => {
    const prior = buildInitial()
    const candidate = findProgressionCandidate(prior)
    const progressed = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({
        action: 'adjust_dose',
        presentationClass: 'small_adjustment',
        doseChange: {
          assignmentId: candidate.id,
          unit: candidate.unit,
          from: candidate.dose,
          to: candidate.dose + doseStep(candidate.unit)
        }
      })
    }))
    const progressedAssignment = progressed.schedule.assignments.find(item => item.id === candidate.id)!

    const recovered = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-21',
      profile: withStart(baseProfile, '2026-09-21'),
      direction: baseDirection,
      priorWeek: progressed,
      decision: decision({
        action: 'recover',
        presentationClass: 'small_adjustment',
        doseChange: {
          assignmentId: candidate.id,
          unit: candidate.unit,
          from: progressedAssignment.dose,
          to: candidate.dose
        }
      })
    }))

    expect(recovered.schedule.assignments.find(item => item.id === candidate.id)?.dose).toBe(candidate.dose)
    expect(recovered.changeSummary.changedVariables).toHaveLength(1)
  })

  it('places the smallest requested assessment signal into an existing eligible exercise', () => {
    const prior = buildInitial()
    const exercise = prior.sessions[0].blocks[1].exercises[0]
    const coverageRequirementId = exercise.coverageRequirementIds[0]
    const next = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({
        action: 'collect_signal',
        presentationClass: 'needs_signal',
        evidenceStatus: 'insufficient',
        signalRequest: {
          coverageRequirementId,
          movementId: exercise.movementId,
          metricId: 'bar.mean_velocity',
          protocolId: 'strength.fixed_load_velocity.v1'
        }
      })
    }))
    const updated = next.sessions.flatMap(session => session.blocks.slice(1)).flatMap(block => block.exercises)
      .find(item => item.movementId === exercise.movementId
        && item.coverageRequirementIds.includes(coverageRequirementId))

    expect(updated?.intent).toContain('bar.mean_velocity')
    expect(updated?.selectionReasons).toContain(
      'weekly_review:collect_signal:strength.fixed_load_velocity.v1'
    )
    expect(next.changeSummary.assessmentSignal?.metricId).toBe('bar.mean_velocity')
  })

  it('rebuilds only when a material emphasis shift supplies a new direction', () => {
    const prior = buildInitial()
    const aerobicProfile = withStart(GOLDEN_PROGRAMMING_PROFILES[4].profile, '2026-09-14')
    const aerobicDirection = buildRollingTrainingDirection(aerobicProfile, {
      hypothesis: 'Aerobic capacity is now the limiting quality for the athlete goal.',
      goalTargetDate: '2026-12-31'
    })
    const shifted = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: aerobicProfile,
      direction: aerobicDirection,
      priorWeek: prior,
      decision: decision({
        action: 'shift_emphasis',
        presentationClass: 'material_change'
      })
    }))

    expect(shifted.profileSnapshot.primaryGoal.domain).toBe('aerobic')
    expect(shifted.sessions.every(session => session.domain === 'aerobic')).toBe(true)
    expect(shifted.directionSnapshot).toEqual(aerobicDirection)
  })

  it('returns a no-plan safety boundary that names the provoking movement', () => {
    const prior = buildInitial()
    const movementId = prior.sessions[0].blocks[1].exercises[0].movementId
    const result = buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({
        action: 'pause_review',
        presentationClass: 'safety',
        evidenceStatus: 'safety_override',
        safetyBoundary: {
          reason: 'Concerning pain needs review before the next normal dose.',
          prohibitedMovementIds: [movementId]
        }
      })
    })

    expect(result.kind).toBe('safety_pause')
    if (result.kind === 'safety_pause') {
      expect(result.omittedMovementIds).toEqual([movementId])
      expect(result).not.toHaveProperty('sessions')
    }
  })

  it('rejects an oversized progression and a silent direction change', () => {
    const prior = buildInitial()
    const candidate = findProgressionCandidate(prior)
    expect(() => buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: prior,
      decision: decision({
        action: 'adjust_dose',
        presentationClass: 'small_adjustment',
        doseChange: {
          assignmentId: candidate.id,
          unit: candidate.unit,
          from: candidate.dose,
          to: candidate.dose + doseStep(candidate.unit) + 1
        }
      })
    })).toThrow('one-step boundary')

    expect(() => buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: { ...baseDirection, hypothesis: 'Silently changed hypothesis.' },
      priorWeek: prior,
      decision: decision({ action: 'continue', presentationClass: 'same_track' })
    })).toThrow('Only shift_emphasis')
  })
})

function decision(
  overrides: Partial<RollingWeeklyPlanningDecision>
): RollingWeeklyPlanningDecision {
  return {
    reviewId: 'review-0001',
    action: 'continue',
    presentationClass: 'same_track',
    evidenceStatus: 'sufficient',
    rationale: 'The evidence supports this bounded weekly decision.',
    ...overrides
  }
}

function findProgressionCandidate(plan: RollingWeeklyPlanDraft) {
  const stepByUnit = {
    exposures: 1,
    working_sets: 1,
    quality_repetitions: 2,
    minutes: 5,
    intervals: 1
  } as const
  const candidate = plan.schedule.assignments.find(assignment => {
    if (assignment.unit === 'exposures') return false
    const ledger = plan.schedule.ledger.find(item => item.requirement.id === assignment.requirementId)!
    const maximum = ledger.requirement.dose.maximum ?? ledger.requirement.dose.target.max
    return ledger.plannedDose + stepByUnit[assignment.unit] <= maximum
  })
  if (!candidate) throw new Error('Golden profile has no bounded progression candidate')
  return candidate
}

function doseStep(unit: ReturnType<typeof findProgressionCandidate>['unit']): number {
  if (unit === 'quality_repetitions') return 2
  if (unit === 'minutes') return 5
  return 1
}

function requirePlan(result: ReturnType<typeof buildRollingWeeklyPlan>): RollingWeeklyPlanDraft {
  if (result.kind !== 'weekly_plan') throw new Error('Expected a weekly plan')
  return result
}

function doseSnapshot(plan: RollingWeeklyPlanDraft): number[] {
  return plan.schedule.assignments.map(assignment => assignment.dose)
}

function movementSnapshot(plan: RollingWeeklyPlanDraft): string[][] {
  return plan.sessions.map(session => (
    session.blocks.flatMap(block => block.exercises.map(exercise => exercise.movementId))
  ))
}

function withStart(profile: ProgrammingProfile, startDate: string): ProgrammingProfile {
  return structuredClone({ ...profile, startDate })
}
