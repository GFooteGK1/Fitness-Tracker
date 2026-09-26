/** Fresh synthetic downstream characterization. No persistence, activation or policy edits. */
import { buildAdaptivePlanContract } from '../app/lib/coach/adaptive-plan'
import { buildProgrammingProfile, validateCompleteCoachPlanningInput } from '../app/lib/coach/complete-intake'
import { reconcileTrainingDirection } from '../app/lib/coach/direction-reconciliation'
import type { CoachEvidenceContextPacket } from '../app/lib/coach/evidence-context'
import { buildRollingTrainingDirection } from '../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan, type RollingWeeklyPlanDraft } from '../app/lib/coach/rolling-weekly-plan'
import { buildRollingWeeklyPlanningDecision, buildRollingWeeklyReview, type RollingWeeklyReadyReview } from '../app/lib/coach/weekly-review'
import { matchingAssignments } from '../app/lib/coach/targeted-review'
import { developmentCases, runBaselineCase } from './programming-quality-baseline'
import { runSignalReviewTraces } from './programming-quality-signal-traces'

const nextWindowStart = '2026-09-28'

/** Identity/date-free comparison retains actual dose, load, effort, rest and order.
 * No claim is made that equal prescriptions imply equal whole-week stress.
 */
function prescriptions(plan: RollingWeeklyPlanDraft) {
  return plan.sessions.map(session => ({ day: session.day, scheduledMinutes: session.scheduledMinutes,
    blocks: session.blocks.map(block => ({ role: block.role, estimatedMinutes: block.estimatedMinutes,
      exercises: block.exercises.map(exercise => ({ movementId: exercise.movementId, role: exercise.role,
        dose: structuredClone(exercise.dose), loadAnchor: structuredClone(exercise.loadAnchor ?? null),
        executionTarget: structuredClone(exercise.executionTarget), restSeconds: structuredClone(exercise.restSeconds),
        estimatedMinutes: exercise.estimatedMinutes, successCondition: exercise.successCondition, stopCondition: exercise.stopCondition })) })) }))
}

function compactReview(review: RollingWeeklyReadyReview) {
  return { action: review.action, evidenceStatus: review.evidenceStatus, doseChange: review.doseChange,
    proposal: review.proposal, rationale: review.rationale, missing: review.missing,
    selectedMeasurements: review.evidenceSnapshot?.series.map(series => ({ metricId: series.metricId,
      semanticRole: series.semanticRole, exposureCount: series.exposureCount, trend: series.trend })) ?? [] }
}

function compile(input: Parameters<typeof buildRollingWeeklyPlan>[0]) {
  try {
    const plan = buildRollingWeeklyPlan(input)
    if (plan.kind !== 'weekly_plan') return { status: 'safety_pause' as const, days: [], prescriptionsAfter: [], error: plan.noPlanReason }
    return { status: 'compiled' as const, days: plan.sessions.map(session => session.day), prescriptionsAfter: prescriptions(plan),
      gaps: plan.schedule.gaps, changedVariables: plan.changeSummary.changedVariables }
  } catch (error) {
    return { status: 'blocked' as const, days: [], prescriptionsAfter: [], error: error instanceof Error ? error.message : String(error) }
  }
}

function reviewInput(plan: RollingWeeklyPlanDraft, context: CoachEvidenceContextPacket) {
  return { programId: context.activePlan!.programId, basePlanVersionId: context.activePlan!.planVersionId,
    goalId: plan.profileSnapshot.primaryGoal.id, adaptivePlan: buildAdaptivePlanContract(plan.profileSnapshot, [plan]), currentWeek: plan,
    context: { ...context, scope: { ...context.scope, goalId: plan.profileSnapshot.primaryGoal.id },
      activePlan: { ...context.activePlan!, goalIds: [plan.profileSnapshot.primaryGoal.id], title: plan.title,
        goalSummary: plan.profileSnapshot.athleteGoalSummary, startDate: plan.windowStart, endDate: plan.windowEnd },
      reproduction: { ...context.reproduction, request: { ...context.reproduction.request, goalId: plan.profileSnapshot.primaryGoal.id } } },
    // Request a review during the open week. Do not fabricate completed work or
    // reinterpret the supplied historical session RPE as working-set effort.
    athleteLocalDate: '2026-09-21', athleteRequestedReview: true,
    sessions: plan.scheduledSessions.map((session, index) => ({ id: `synthetic-session-${index}`, weekNumber: 1,
      sessionIndex: index + 1, scheduledDate: session.scheduledDate, status: 'planned' as const })), checkins: [] }
}

export function runDownstreamSignalChecks() {
  const cases = developmentCases()
  const source = runSignalReviewTraces().cases.find(item => item.id === 'repeated-direct-improvement')!
  const trace = source.trace!
  const directPlan = runBaselineCase(cases.find(item => item.id === 'assessment-matched')!).plan!
  const directOriginal = JSON.stringify(directPlan)
  const directInput = reviewInput(directPlan, trace.context)
  const directReview = buildRollingWeeklyReview(directInput)
  if (directReview.status !== 'ready') throw new Error('Requested synthetic direct review did not become ready')
  const directCompile = directReview.proposal.generationReady ? compile({ source: 'weekly_review', windowStart: nextWindowStart,
    profile: directPlan.profileSnapshot, direction: directPlan.directionSnapshot, priorWeek: directPlan,
    decision: buildRollingWeeklyPlanningDecision('synthetic-direct-review', directReview) })
    : { status: 'not_generation_ready' as const, days: [], prescriptionsAfter: [] }

  const scheduleCase = cases.find(item => item.id === 'availability-correction')!
  const schedulePlan = runBaselineCase({ ...scheduleCase, review: undefined }).plan!
  const scheduleOriginal = JSON.stringify(schedulePlan)
  const confirmedDays = ['thursday', 'friday', 'saturday']
  const reconciliation = reconcileTrainingDirection({ userId: 'synthetic-signal-athlete', acceptedWeek: schedulePlan,
    nextWindowStart, intentRequired: false, asOf: trace.context.asOf, memories: { training_schedule: {
      id: 'synthetic-schedule-v2', user_id: 'synthetic-signal-athlete', memory_key: 'training_schedule', kind: 'schedule', version: 2,
      status: 'confirmed', effective_from: null, effective_until: null, review_after: null,
      content: { experience: schedulePlan.profileSnapshot.trainingExperience, trainingDays: confirmedDays, sessionMinutes: 60 } } } })
  const scheduleContext: CoachEvidenceContextPacket = { ...trace.context, evidenceIds: [], evidenceSeries: [], sampleCount: 0,
    missing: ['compatible_evidence_missing'], reproduction: { ...trace.context.reproduction, observationIds: [] } }
  const scheduleReview = buildRollingWeeklyReview({ ...reviewInput(schedulePlan, scheduleContext), directionReconciliation: reconciliation })
  if (scheduleReview.status !== 'ready') throw new Error('Requested synthetic schedule review did not become ready')
  const validated = validateCompleteCoachPlanningInput({ ...reconciliation.replacementPlanningInput, setupConfirmed: true })
  if (!validated.ok) throw new Error(`Synthetic confirmation invalid: ${validated.errors.join('; ')}`)
  const replacement = buildProgrammingProfile(validated.value, schedulePlan.profileSnapshot.assessments)
  const direction = buildRollingTrainingDirection(replacement, { hypothesis: 'Confirmed availability requires a replacement arrangement.',
    goalTargetDate: schedulePlan.directionSnapshot.goalTargetDate })
  const scheduleCompile = compile({ source: 'weekly_review', windowStart: nextWindowStart, profile: replacement, direction,
    priorWeek: schedulePlan, decision: buildRollingWeeklyPlanningDecision('synthetic-schedule-review', scheduleReview) })
  const before = prescriptions(schedulePlan)
  const multiset = (rows: ReturnType<typeof prescriptions>) => rows.map(({ day: _day, ...prescription }) => JSON.stringify(prescription)).sort()
  return { version: 'programming-quality-downstream-signals-1', synthetic: true as const,
    authority: 'Offline characterization only; no coaching-quality pass, persistence, activation or approved numerical change',
    directImprovement: { sourceCaseId: source.id, inputMeasurements: source.measurements, evaluatorAction: trace.result.action,
      executionInput: { athleteLocalDate: directInput.athleteLocalDate, athleteRequestedReview: directInput.athleteRequestedReview,
        sessions: directInput.sessions, checkins: directInput.checkins,
        recoveryContextSupplied: false, workingSetRecordsSupplied: false,
        mainPacketMetrics: directInput.context.evidenceSeries.map(series => ({ metricId: series.metricId, semanticRole: series.semanticRole })) },
      review: compactReview(directReview), matchingAssignmentCount: matchingAssignments(directPlan, trace.context, trace.result, directPlan.profileSnapshot.primaryGoal.id).length,
      prescriptionsBefore: prescriptions(directPlan), compile: directCompile, acceptedInputUnchanged: JSON.stringify(directPlan) === directOriginal,
      limitations: ['Already-selected synthetic packet; no database/device validation.', 'Historical session RPE remains in the main evidence packet; no recovery packet or verified working-set effort is supplied.',
        'This fixture characterizes its actual assignment count and bounds; it does not force the one-assignment progression branch.'] },
    scheduleReplacement: { sourceCaseId: 'schedule-only-correction', reconciliation: { status: reconciliation.status, changedFields: reconciliation.changedFields, reasons: reconciliation.reasons },
      previousAvailableDays: schedulePlan.profileSnapshot.sessionAvailability.map(slot => slot.day), confirmedDays,
      review: compactReview(scheduleReview), prescriptionsBefore: before, compile: scheduleCompile,
      prescriptionMultisetEqual: scheduleCompile.status === 'compiled' ? JSON.stringify(multiset(before)) === JSON.stringify(multiset(scheduleCompile.prescriptionsAfter)) : null,
      acceptedInputUnchanged: JSON.stringify(schedulePlan) === scheduleOriginal,
      limitations: ['Synthetic confirmed setup acknowledgement; no API, database proposal or acceptance.', 'Comparison excludes weekday and generated identity but retains block order, dose, load, effort, rest and time.',
        'Compilation uses current replacement behavior; no relocation-preservation claim.', 'Adjacent actual training and outside work are not supplied or validated.'] } }
}
