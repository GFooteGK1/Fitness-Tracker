import type { FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'
import { findAssessmentDefinition, ADAPTIVE_ASSESSMENT_CATALOG_VERSION, ADAPTIVE_EVIDENCE_POLICY_VERSION } from '@/app/lib/coach/adaptive-programming-contracts'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingWeeklyReview } from '@/app/lib/coach/weekly-review'
import { COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION, type CoachEvidenceSeries, type CoachEvidenceContextPacket } from '@/app/lib/coach/evidence-context'
import { reportedFeedbackProvenance } from '@/app/lib/coach/execution-feedback'
import type { PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'

/** Invariant completion of the flat engineering fixture, derived from the W6
 * review fixtures: three available full-gym days, existing accepted strength/run
 * allocations, completed prior week, four owned comparable exposures, explicit
 * neutral check-ins. This is a synthetic existing plan, not initial-dose policy.
 * Both counterfactuals use exactly the same scaffold. Review action is never input. */
export function executeWeeklyFixture(facts: Record<string, FixtureValue>, owner: string) {
  const priorityCase = Array.isArray(facts.goalIds)
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
  profile.startDate = '2026-09-07'
  profile.equipment.resolvedIds = [...MOVEMENT_EQUIPMENT_IDS]
  profile.sessionAvailability = [{ day: 'monday', minutes: 60 }, { day: 'wednesday', minutes: 60 }, { day: 'friday', minutes: 60 }]
  if (priorityCase) profile.secondaryGoals = [{ id: 'allocation:aerobic', domain: 'aerobic', role: 'secondary', allocation: 'development', athleteIntent: 'Improve the confirmed 5000 meter outcome' }]
  const adaptive = buildCompleteEightWeekPlan(profile).adaptiveProgramming
  const weekResult = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile,
    direction: buildRollingTrainingDirection(profile, { hypothesis: 'Observe supported direct outcomes before selecting a change', goalTargetDate: null }) })
  if (weekResult.kind !== 'weekly_plan') throw Error('Invariant engineering review scaffold did not compile')
  const week = weekResult
  function strength(id: string, movement: string): PlanningOutcome {
    const outcome = runningOutcome(id), definition = findAssessmentDefinition('strength.repetition_max')!
    outcome.domain = 'strength'; outcome.goal.requiredQualityIds = ['maximal_strength']; outcome.goal.statement = `Improve ${movement}`
    outcome.measurement = { metricId: definition.primaryMetricId, unit: 'kg', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
    outcome.binding = { movementId: movement, distance: null, equipmentIds: ['barbell'], variation: 'standard', assessmentContext: { repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
    return outcome
  }
  const outcomes = priorityCase
    ? [runningOutcome(String((facts.goalIds as FixtureValue[])[0])), strength(String((facts.goalIds as FixtureValue[])[1]), 'barbell_back_squat')]
    : [strength(String(facts.goalId), String(facts.signalMovement))]
  if (priorityCase) outcomes[0].goal.target = { role: 'target', comparison: 'at_most', metric: { metricId: 'run.time', value: 1500, unit: 's' }, assessmentDefinition: outcomes[0].measurement!.assessmentDefinition, protocol: outcomes[0].measurement!.protocol }
  const content = intent(...outcomes)
  content.priorityOrder = facts.priorityConfirmed === true ? outcomes.map(o => o.goal.id) : null
  week.profileSnapshot.trainingIntent = { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content }
  if (!priorityCase) {
    // Actual accepted prescription order changes, while the broad source lacks
    // a movement binding in both variants. Sorting must not create relevance.
    const movements = facts.assignmentMovements as string[]
    const main = week.sessions[0].blocks.find(b => b.role !== 'specific_preparation')!
    const template = main.exercises[0]
    main.exercises = movements.map(movementId => ({ ...structuredClone(template), movementId }))
  }
  const sourceSeries: CoachEvidenceSeries[] = outcomes.map((outcome, outcomeIndex) => {
    const m = outcome.measurement!, b = outcome.binding
    const values = priorityCase && outcomeIndex === 0 ? facts.firstGoalAttained === true ? [1600, 1590, 1490, 1480] : [1600, 1590, 1540, 1530] : [100, 101, 105, 106]
    const samples = values.map((value, i) => ({ observationId: `${outcome.goal.id}:observation:${i}`, observationValueId: `${outcome.goal.id}:value:${i}`,
      metricId: m.metricId, semanticRole: 'direct_outcome' as const, value, unit: m.unit, originalMeasurement: { value, unit: m.unit }, ordinal: 0,
      observedAt: `2026-08-${String(10 + i * 6).padStart(2, '0')}T12:00:00.000Z`, capturedAt: `2026-08-${String(10 + i * 6).padStart(2, '0')}T12:00:00.000Z`,
      workoutId: `${outcome.goal.id}:workout:${i}`, prescribedSessionId: `${outcome.goal.id}:session:${i}`,
      assessmentDefinition: { ...m.assessmentDefinition, catalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION }, protocol: m.protocol, comparabilityKey: outcome.goal.id,
      source: { kind: 'coach_completion', system: 'sociusfit', device: null, recordId: `${outcome.goal.id}:${i}`, verificationStatus: 'athlete_confirmed' as const }, confidence: 1,
      comparison: { movementId: priorityCase ? b.movementId : null, variationId: b.variation, distance: b.distance, equipmentIds: b.equipmentIds, repetitions: b.assessmentContext?.repetitions ?? null,
        externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }))
    return { id: outcome.goal.id, metricId: m.metricId, semanticRole: 'direct_outcome', assessmentDefinitionId: m.assessmentDefinition.id, protocol: m.protocol, comparabilityKey: outcome.goal.id,
      observationIds: samples.map(s => s.observationId), sampleCount: samples.length, confidence: 1, algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION, samples }
  })
  const planId = 'engineering:accepted-week', programId = 'engineering:program', asOf = '2026-09-14T12:00:00.000Z'
  const evidenceIds = sourceSeries.flatMap(s => s.observationIds)
  const context: CoachEvidenceContextPacket = { schemaVersion: 1, purpose: 'adaptation_review', asOf, algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    evidencePolicyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION, storageAvailable: true, selectionComplete: true,
    window: { startsAt: '2026-06-16T12:00:00.000Z', endsAt: asOf, days: 90 },
    scope: { userId: owner, activeProgramId: programId, activePlanVersionId: planId, goalId: adaptive.goals[0].goalId, prescribedSessionId: null, metricId: null, protocol: null, comparabilityKey: null },
    activePlan: { programId, title: week.title, goalSummary: profile.athleteGoalSummary, startDate: week.windowStart, endDate: week.windowEnd, planVersionId: planId, planVersion: 1,
      referenceVersion: week.evidenceReferenceVersion, policyVersion: week.policyVersion, goalIds: adaptive.goals.map(g => g.goalId), sessionIds: [] },
    session: null, memories: [], strengthBaselines: [], evidenceSeries: sourceSeries, evidenceIds, sampleCount: evidenceIds.length,
    limits: { maxMemories: 16, maxAssessments: 12, maxObservationSamples: 160, sourceTruncated: false, selectionTruncated: false }, missing: [],
    reproduction: { request: { purpose: 'adaptation_review', goalId: adaptive.goals[0].goalId, asOf, windowDays: 90 }, activePlanVersionId: planId, memoryIds: [], assessmentIds: [], observationIds: evidenceIds } }
  const sessions = week.scheduledSessions.map((s, i) => ({ id: `execution:${i}`, weekNumber: 1, sessionIndex: i + 1, scheduledDate: s.scheduledDate, status: 'completed' as const }))
  const checkins = sessions.map(s => ({ feedbackVersion: 2 as const, provenance: reportedFeedbackProvenance({ sessionRpe: 7, energy: 'okay', pain: 'none' }), id: `checkin:${s.id}`, prescribedSessionId: s.id,
    outcome: 'as_planned' as const, sessionRpe: 7, energy: 'okay' as const, pain: 'none' as const, note: null, occurredAt: '2026-09-12T12:00:00.000Z' }))
  const before = JSON.stringify(week)
  const review = buildRollingWeeklyReview({ programId, basePlanVersionId: planId, goalId: adaptive.goals[0].goalId, adaptivePlan: adaptive, currentWeek: week,
    context, recoveryContext: null, sessions, checkins, athleteLocalDate: '2026-09-14', targetedReview: true })
  return { review, planUnchanged: before === JSON.stringify(week), planId, programId }
}
