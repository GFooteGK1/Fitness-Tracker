import { describe, expect, it } from 'vitest'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { reportedFeedbackProvenance, type CoachSessionCheckinSummary } from '@/app/lib/coach/execution-feedback'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingWeeklyReview, buildRollingWeeklyPlanningDecision } from '@/app/lib/coach/weekly-review'
import { matchingAssignments } from '@/app/lib/coach/targeted-review'
import { developmentCases, runBaselineCase } from '../../scripts/programming-quality-baseline'
import { runSignalReviewTraces } from '../../scripts/programming-quality-signal-traces'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'

function fixture(expectedAssignments: 1 | 2, targetedReview: boolean) {
  const testCase = developmentCases().find(item => item.id === 'assessment-matched')!
  if (expectedAssignments === 1) {
    testCase.profile.trainingExperience = 'new_or_returning'
    testCase.profile.sessionAvailability = [{ day: 'monday', minutes: 30 }, { day: 'thursday', minutes: 30 }]
  }
  const trace = runSignalReviewTraces().cases.find(item => item.id === 'repeated-direct-improvement')!.trace!
  const sample = trace.context.evidenceSeries[0].samples[0]
  const outcome = runningOutcome('outcome:squat')
  outcome.domain = 'strength'; outcome.goal.requiredQualityIds = ['maximal_strength']; outcome.goal.statement = 'Improve standardized squat load'
  outcome.measurement = { metricId: sample.metricId, unit: sample.unit,
    assessmentDefinition: { id: sample.assessmentDefinition.id, version: sample.assessmentDefinition.version! },
    protocol: { id: sample.protocol.id, version: sample.protocol.version } }
  outcome.binding = { movementId: 'barbell_back_squat', variation: 'standard', distance: null, equipmentIds: ['barbell'],
    assessmentContext: { repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
  if (targetedReview) testCase.profile.trainingIntent = { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content: intent(outcome) }
  const result = runBaselineCase(testCase)
  if (!result.plan) throw new Error(result.error ?? 'Synthetic plan failed')
  const week = result.plan
  const sessions = week.scheduledSessions.map((session, index) => ({ id: `session-${index}`, weekNumber: 1, sessionIndex: index + 1,
    scheduledDate: session.scheduledDate, status: 'planned' as const }))
  const input = { programId: trace.context.activePlan!.programId, basePlanVersionId: trace.context.activePlan!.planVersionId,
    goalId: week.profileSnapshot.primaryGoal.id, adaptivePlan: buildAdaptivePlanContract(week.profileSnapshot, [week]), currentWeek: week,
    context: trace.context, sessions, checkins: [] as CoachSessionCheckinSummary[], athleteLocalDate: '2026-09-21', athleteRequestedReview: true, targetedReview }
  return { week, input, outcome }
}

describe('improved outcomes preserve the accepted prescription', () => {
  for (const count of [1, 2] as const) for (const targeted of [false, true]) {
    it(`continues unchanged with ${count} matching assignments and targeted review ${targeted}`, () => {
      const { week, input, outcome } = fixture(count, targeted), original = structuredClone(week)
      const review = buildRollingWeeklyReview(input)
      if (review.status !== 'ready') throw new Error('Expected ready review')
      const evaluator = review.goalReviews?.[0].evaluator ?? review.evaluatorReview
      expect(evaluator.action).toBe('progress')
      const matched = matchingAssignments(week, input.context, evaluator, week.profileSnapshot.primaryGoal.id, targeted ? outcome : undefined)
      expect(matched).toHaveLength(count)
      if (count === 1) {
        const assignment = week.schedule.assignments.find(item => item.id === matched[0])!
        const ledger = week.schedule.ledger.find(item => item.requirement.id === assignment.requirementId)!
        // Exercise the former progression path with room for its existing step;
        // a dose already at its bound would not catch the unwanted increase.
        expect(assignment.unit).toBe('working_sets')
        expect(ledger.plannedDose + 1).toBeLessThanOrEqual(ledger.requirement.dose.maximum ?? ledger.requirement.dose.target.max)
      }
      expect(review).toMatchObject({ action: 'continue', presentationClass: 'same_track', evidenceStatus: 'sufficient',
        doseChange: null, signalRequest: null, proposal: { generationReady: true, requiresAcceptance: true, activePlanUnchanged: true } })
      expect(review.rationale.join(' ')).toContain('Improvement alone does not justify increasing the prescription')
      expect(review.missing).not.toContain('exact_assignment_target_unavailable')
      const next = buildRollingWeeklyPlan({ source: 'weekly_review', windowStart: '2026-09-28', profile: week.profileSnapshot,
        direction: week.directionSnapshot, priorWeek: week, decision: buildRollingWeeklyPlanningDecision('improvement-review', review) })
      if (next.kind !== 'weekly_plan') throw new Error('Expected continuation plan')
      expect(next.sessions.map(({ sessionId: _id, ...session }) => session)).toEqual(week.sessions.map(({ sessionId: _id, ...session }) => session))
      expect(next.schedule.assignments).toEqual(week.schedule.assignments)
      expect(next.changeSummary.changedVariables).toEqual([])
      expect(week).toEqual(original)
    })
  }

  it.each(['pause', 'recover'] as const)('keeps %s safety precedence over improving measurements', mode => {
    const { input } = fixture(2, true)
    input.checkins = input.sessions.map(session => ({ id: `checkin-${session.id}`, prescribedSessionId: session.id,
      outcome: 'as_planned', feedbackVersion: 2, sessionRpe: 7, energy: mode === 'recover' ? 'low' : 'okay',
      pain: mode === 'pause' ? 'concerning' : 'none', note: null, occurredAt: input.context.asOf,
      provenance: reportedFeedbackProvenance({ sessionRpe: 7, energy: mode === 'recover' ? 'low' : 'okay', pain: mode === 'pause' ? 'concerning' : 'none' }) }))
    const review = buildRollingWeeklyReview(input)
    expect(review).toMatchObject({ status: 'ready', action: mode === 'pause' ? 'pause_review' : 'recover', doseChange: null })
    if (review.status !== 'ready') throw new Error('Expected ready safety review')
    expect(review.proposal.generationReady).toBe(false)
  })
})
