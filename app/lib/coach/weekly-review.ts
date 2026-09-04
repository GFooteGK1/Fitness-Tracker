import {
  ADAPTIVE_ASSESSMENT_DEFINITIONS,
  findAssessmentDefinition,
  type AssessmentDefinition,
  type EvidenceStatus
} from './adaptive-programming-contracts'
import {
  evaluateAdaptation,
  type AdaptationEvidenceSnapshot,
  type AdaptationExecutionSummary,
  type AdaptationReview,
  type AdaptationSafetySignal
} from './adaptation-evaluator'
import type { CoachEvidenceContextPacket } from './evidence-context'
import type {
  CoachExecutionSession,
  CoachSessionCheckinSummary
} from './execution-feedback'
import {
  MOVEMENT_CATALOG,
  type MovementDefinition
} from './movement-catalog'
import type {
  CompleteProgrammingDose,
  CompleteProgrammingExercisePrescription
} from './programming-schema'
import {
  ROLLING_WEEKLY_POLICY_VERSION,
  ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION,
  ROLLING_WEEKLY_SCHEMA_VERSION,
  type RollingWeeklyAction,
  type RollingWeeklyDoseChange,
  type RollingWeeklyEvidenceStatus,
  type RollingWeeklyPlanningDecision,
  type RollingWeeklyPresentationClass,
  type RollingWeeklyReviewObservationLink,
  type RollingWeeklySafetyBoundary,
  type RollingWeeklySignalRequest
} from './rolling-weekly-contracts'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'
import type { WeeklyCoverageAssignment } from './weekly-coverage'

export type RollingWeeklyReviewReason =
  | 'all_sessions_terminal'
  | 'week_ended'
  | 'athlete_requested'
  | 'safety_override'

export interface RollingWeeklyExecutionSummary extends AdaptationExecutionSummary {
  windowStart: string
  windowEnd: string
  athleteLocalDate: string
  plannedSessions: number
  completedSessions: number
  skippedSessions: number
  pastDuePlannedSessions: number
  modifiedSessions: number
  stoppedEarlySessions: number
  lowEnergyReports: number
  mildPainReports: number
  concerningPainReports: number
  concerningSessionIds: string[]
  concerningScheduledDates: string[]
  terminalSessionsWithoutCheckins: string[]
}

export interface RollingWeeklyProposalBoundary {
  eligible: boolean
  requiresAcceptance: boolean
  activePlanUnchanged: true
  generationReady: boolean
  directionConfirmationRequired: boolean
  blockingReasons: string[]
}

export interface RollingWeeklyReadyReview {
  status: 'ready'
  schemaVersion: typeof ROLLING_WEEKLY_SCHEMA_VERSION
  algorithmVersion: typeof ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION
  policyVersion: typeof ROLLING_WEEKLY_POLICY_VERSION
  programId: string
  basePlanVersionId: string
  goalId: string
  windowStart: string
  windowEnd: string
  reviewedAt: string
  reviewReason: RollingWeeklyReviewReason
  action: RollingWeeklyAction
  presentationClass: RollingWeeklyPresentationClass
  evidenceStatus: RollingWeeklyEvidenceStatus
  confidence: number
  rationale: string[]
  missing: string[]
  executionSummary: RollingWeeklyExecutionSummary
  evidenceSnapshot: AdaptationEvidenceSnapshot | null
  observationLinks: RollingWeeklyReviewObservationLink[]
  safetyOverride: AdaptationReview['safetyOverride']
  doseChange: RollingWeeklyDoseChange | null
  signalRequest: RollingWeeklySignalRequest | null
  safetyBoundary: RollingWeeklySafetyBoundary | null
  proposal: RollingWeeklyProposalBoundary
  goalMetMaintenance: boolean
  evaluatorReview: AdaptationReview
}

export interface RollingWeeklyPendingReview {
  status: 'not_ready'
  schemaVersion: typeof ROLLING_WEEKLY_SCHEMA_VERSION
  algorithmVersion: typeof ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION
  programId: string
  basePlanVersionId: string
  goalId: string
  windowStart: string
  windowEnd: string
  executionSummary: RollingWeeklyExecutionSummary
  blockingReasons: string[]
}

export type RollingWeeklyReview = RollingWeeklyReadyReview | RollingWeeklyPendingReview

export interface BuildRollingWeeklyReviewInput {
  programId: string
  basePlanVersionId: string
  goalId: string
  adaptivePlan: unknown
  currentWeek: RollingWeeklyPlanDraft
  context: CoachEvidenceContextPacket
  recoveryContext?: CoachEvidenceContextPacket | null
  sessions: readonly CoachExecutionSession[]
  checkins: readonly CoachSessionCheckinSummary[]
  athleteLocalDate: string
  athleteRequestedReview?: boolean
}

/**
 * Produces the single authoritative decision for an accepted rolling week.
 * It records missed work as evidence and never mutates or carries a session.
 */
export function buildRollingWeeklyReview(
  input: BuildRollingWeeklyReviewInput
): RollingWeeklyReview {
  validateInput(input)
  const execution = summarizeExecution(input)
  const safetySignals = buildSafetySignals(input, execution)
  const reviewReason = readinessReason(input, execution, safetySignals)

  if (!reviewReason) {
    return {
      status: 'not_ready',
      schemaVersion: ROLLING_WEEKLY_SCHEMA_VERSION,
      algorithmVersion: ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION,
      programId: input.programId,
      basePlanVersionId: input.basePlanVersionId,
      goalId: input.goalId,
      windowStart: input.currentWeek.windowStart,
      windowEnd: input.currentWeek.windowEnd,
      executionSummary: execution,
      blockingReasons: ['The current week is still open and has unfinished scheduled sessions.']
    }
  }

  const evaluatorReview = evaluateAdaptation({
    goalId: input.goalId,
    adaptivePlan: input.adaptivePlan,
    context: input.context,
    recoveryContext: input.recoveryContext,
    safetySignals,
    execution
  })
  const mapped = mapDecision(evaluatorReview, input.currentWeek, execution)
  const rationale = [
    ...evaluatorReview.rationale,
    ...executionRationale(execution),
    ...mapped.additionalRationale
  ]
  const missing = [...new Set([
    ...evaluatorReview.missing,
    ...execution.terminalSessionsWithoutCheckins.map(id => `session_checkin_missing:${id}`),
    ...mapped.missing
  ])].sort()
  const directionConfirmationRequired = mapped.action === 'shift_emphasis'
  const generationReady = mapped.action === 'pause_review'
    ? false
    : mapped.action === 'shift_emphasis'
      ? false
      : mapped.action === 'adjust_dose' || mapped.action === 'recover'
        ? mapped.doseChange !== null
        : mapped.action === 'collect_signal'
          ? mapped.signalRequest !== null
          : true
  const blockingReasons = [
    ...(directionConfirmationRequired
      ? ['Confirm the replacement training emphasis before generating the next week.']
      : []),
    ...(!generationReady && mapped.action !== 'shift_emphasis' && mapped.action !== 'pause_review'
      ? ['No safe bounded plan change could be generated from the accepted weekly dose.']
      : []),
    ...(mapped.action === 'pause_review'
      ? ['Resolve the concerning safety signal before generating another training week.']
      : [])
  ]

  return {
    status: 'ready',
    schemaVersion: ROLLING_WEEKLY_SCHEMA_VERSION,
    algorithmVersion: ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION,
    policyVersion: ROLLING_WEEKLY_POLICY_VERSION,
    programId: input.programId,
    basePlanVersionId: input.basePlanVersionId,
    goalId: input.goalId,
    windowStart: input.currentWeek.windowStart,
    windowEnd: input.currentWeek.windowEnd,
    reviewedAt: input.context.asOf,
    reviewReason,
    action: mapped.action,
    presentationClass: mapped.presentationClass,
    evidenceStatus: mapped.evidenceStatus,
    confidence: evaluatorReview.confidence,
    rationale,
    missing,
    executionSummary: execution,
    evidenceSnapshot: evaluatorReview.evidenceSnapshot,
    observationLinks: observationLinks(evaluatorReview.evidenceSnapshot),
    safetyOverride: evaluatorReview.safetyOverride,
    doseChange: mapped.doseChange,
    signalRequest: mapped.signalRequest,
    safetyBoundary: mapped.safetyBoundary,
    proposal: {
      eligible: mapped.action !== 'pause_review',
      requiresAcceptance: mapped.action !== 'pause_review',
      activePlanUnchanged: true,
      generationReady,
      directionConfirmationRequired,
      blockingReasons
    },
    goalMetMaintenance: evaluatorReview.action === 'maintain',
    evaluatorReview
  }
}

/** Builds the typed input for the one-week planner after the review is stored. */
export function buildRollingWeeklyPlanningDecision(
  reviewId: string,
  review: RollingWeeklyReadyReview
): RollingWeeklyPlanningDecision {
  if (!reviewId.trim()) throw new Error('Stored weekly review ID is required')
  const decision: RollingWeeklyPlanningDecision = {
    reviewId,
    action: review.action,
    presentationClass: review.presentationClass,
    evidenceStatus: review.evidenceStatus,
    rationale: review.rationale.join(' ')
  }
  if (review.doseChange) decision.doseChange = review.doseChange
  if (review.signalRequest) decision.signalRequest = review.signalRequest
  if (review.safetyBoundary) decision.safetyBoundary = review.safetyBoundary
  return decision
}

function validateInput(input: BuildRollingWeeklyReviewInput): void {
  if (!isIsoDate(input.athleteLocalDate)) {
    throw new Error('Athlete local date must be a valid YYYY-MM-DD date')
  }
  if (input.currentWeek.kind !== 'weekly_plan') {
    throw new Error('Weekly review needs an accepted rolling weekly plan')
  }
  if (
    input.context.activePlan?.programId !== input.programId
    || input.context.activePlan.planVersionId !== input.basePlanVersionId
  ) {
    throw new Error('Weekly review context does not match the accepted plan')
  }
  if (input.context.asOf.slice(0, 10) < input.currentWeek.windowStart) {
    throw new Error('Weekly review cannot run before the accepted week starts')
  }
}

function summarizeExecution(input: BuildRollingWeeklyReviewInput): RollingWeeklyExecutionSummary {
  const sessions = input.sessions
    .filter(session => (
      session.scheduledDate !== null
      && session.scheduledDate >= input.currentWeek.windowStart
      && session.scheduledDate <= input.currentWeek.windowEnd
    ))
    .sort((left, right) => (
      String(left.scheduledDate).localeCompare(String(right.scheduledDate))
      || left.sessionIndex - right.sessionIndex
      || left.id.localeCompare(right.id)
    ))
  const sessionIds = new Set(sessions.map(session => session.id))
  const checkins = latestCheckins(input.checkins.filter(checkin => (
    sessionIds.has(checkin.prescribedSessionId)
    && checkin.occurredAt <= input.context.asOf
  )))
  const sessionById = new Map(sessions.map(session => [session.id, session]))
  const checkedSessionIds = new Set(checkins.map(checkin => checkin.prescribedSessionId))
  const completedSessionIds = sessions.filter(session => session.status === 'completed').map(session => session.id)
  const skippedSessionIds = sessions.filter(session => session.status === 'skipped').map(session => session.id)
  const rpes = checkins.flatMap(checkin => (
    checkin.outcome === 'skipped' || checkin.sessionRpe === null ? [] : [checkin.sessionRpe]
  ))
  const concerningSessionIds = checkins
    .filter(checkin => checkin.pain === 'concerning')
    .map(checkin => checkin.prescribedSessionId)

  return {
    windowStart: input.currentWeek.windowStart,
    windowEnd: input.currentWeek.windowEnd,
    athleteLocalDate: input.athleteLocalDate,
    scheduledSessionIds: sessions.map(session => session.id),
    completedSessionIds,
    skippedSessionIds,
    checkinIds: checkins.map(checkin => checkin.id).sort(),
    completionRate: sessions.length === 0
      ? null
      : round(completedSessionIds.length / sessions.length),
    averageSessionRpe: rpes.length === 0
      ? null
      : round(rpes.reduce((total, value) => total + value, 0) / rpes.length),
    plannedSessions: sessions.length,
    completedSessions: completedSessionIds.length,
    skippedSessions: skippedSessionIds.length,
    pastDuePlannedSessions: sessions.filter(session => (
      session.status === 'planned'
      && session.scheduledDate !== null
      && session.scheduledDate < input.athleteLocalDate
    )).length,
    modifiedSessions: checkins.filter(checkin => checkin.outcome === 'modified').length,
    stoppedEarlySessions: checkins.filter(checkin => checkin.outcome === 'stopped_early').length,
    lowEnergyReports: checkins.filter(checkin => checkin.energy === 'low').length,
    mildPainReports: checkins.filter(checkin => checkin.pain === 'mild').length,
    concerningPainReports: checkins.filter(checkin => checkin.pain === 'concerning').length,
    concerningSessionIds,
    concerningScheduledDates: [...new Set(concerningSessionIds.flatMap(sessionId => {
      const scheduledDate = sessionById.get(sessionId)?.scheduledDate
      return scheduledDate ? [scheduledDate] : []
    }))].sort(),
    terminalSessionsWithoutCheckins: sessions
      .filter(session => session.status !== 'planned' && !checkedSessionIds.has(session.id))
      .map(session => session.id)
      .sort()
  }
}

function readinessReason(
  input: BuildRollingWeeklyReviewInput,
  execution: RollingWeeklyExecutionSummary,
  safetySignals: readonly AdaptationSafetySignal[]
): RollingWeeklyReviewReason | null {
  if (safetySignals.some(signal => signal.severity === 'pause')) return 'safety_override'
  if (input.athleteRequestedReview) return 'athlete_requested'
  if (
    execution.plannedSessions > 0
    && execution.completedSessions + execution.skippedSessions === execution.plannedSessions
  ) return 'all_sessions_terminal'
  if (input.athleteLocalDate > input.currentWeek.windowEnd) return 'week_ended'
  return null
}

function buildSafetySignals(
  input: BuildRollingWeeklyReviewInput,
  execution: RollingWeeklyExecutionSummary
): AdaptationSafetySignal[] {
  const sessionIds = new Set(execution.scheduledSessionIds)
  return latestCheckins(input.checkins.filter(checkin => (
    sessionIds.has(checkin.prescribedSessionId)
    && checkin.occurredAt <= input.context.asOf
  )))
    .flatMap(checkin => {
      const signals: AdaptationSafetySignal[] = []
      if (checkin.pain === 'concerning') {
        signals.push({
          id: `${checkin.id}:pain`,
          kind: 'concerning_pain',
          severity: 'pause',
          occurredAt: checkin.occurredAt
        })
      } else if (checkin.pain === 'mild') {
        signals.push({
          id: `${checkin.id}:pain`,
          kind: 'repeated_pain',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      if (checkin.outcome === 'stopped_early') {
        signals.push({
          id: `${checkin.id}:stopped`,
          kind: 'stopped_early',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      if (checkin.energy === 'low') {
        signals.push({
          id: `${checkin.id}:energy`,
          kind: 'low_energy',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      return signals
    })
}

function mapDecision(
  evaluator: AdaptationReview,
  currentWeek: RollingWeeklyPlanDraft,
  execution: RollingWeeklyExecutionSummary
): {
  action: RollingWeeklyAction
  presentationClass: RollingWeeklyPresentationClass
  evidenceStatus: RollingWeeklyEvidenceStatus
  doseChange: RollingWeeklyDoseChange | null
  signalRequest: RollingWeeklySignalRequest | null
  safetyBoundary: RollingWeeklySafetyBoundary | null
  additionalRationale: string[]
  missing: string[]
} {
  if (evaluator.action === 'pause_review') {
    return {
      action: 'pause_review',
      presentationClass: 'safety',
      evidenceStatus: 'safety_override',
      doseChange: null,
      signalRequest: null,
      safetyBoundary: buildSafetyBoundary(currentWeek, execution),
      additionalRationale: [],
      missing: []
    }
  }
  if (evaluator.action === 'hold_collect_more') {
    const signalRequest = buildSignalRequest(currentWeek, evaluator)
    return {
      action: 'collect_signal',
      presentationClass: 'needs_signal',
      evidenceStatus: 'insufficient',
      doseChange: null,
      signalRequest,
      safetyBoundary: null,
      additionalRationale: signalRequest
        ? ['The next weekly dose keeps the emphasis stable and adds one compatible measurement.']
        : [],
      missing: signalRequest ? [] : ['compatible_assessment_placement_unavailable']
    }
  }
  if (evaluator.action === 'progress') {
    const doseChange = findDoseChange(currentWeek, 'adjust_dose')
    if (!doseChange) {
      return {
        action: 'continue',
        presentationClass: 'same_track',
        evidenceStatus: 'sufficient',
        doseChange: null,
        signalRequest: null,
        safetyBoundary: null,
        additionalRationale: ['The accepted dose is already at its validated bound, so the next week holds steady.'],
        missing: []
      }
    }
    return {
      action: 'adjust_dose',
      presentationClass: 'small_adjustment',
      evidenceStatus: 'sufficient',
      doseChange,
      signalRequest: null,
      safetyBoundary: null,
      additionalRationale: ['One validated dose variable can progress by one bounded step.'],
      missing: []
    }
  }
  if (evaluator.action === 'recover') {
    const doseChange = findDoseChange(currentWeek, 'recover')
    return {
      action: 'recover',
      presentationClass: doseChange ? 'small_adjustment' : 'material_change',
      evidenceStatus: 'sufficient',
      doseChange,
      signalRequest: null,
      safetyBoundary: null,
      additionalRationale: doseChange
        ? ['One validated dose variable can decrease by one bounded step.']
        : ['The accepted dose has no safe bounded reduction; coach review is required before another week is generated.'],
      missing: doseChange ? [] : ['bounded_recovery_change_unavailable']
    }
  }
  if (evaluator.action === 'maintain' || evaluator.action === 'redirect') {
    return {
      action: 'shift_emphasis',
      presentationClass: 'material_change',
      evidenceStatus: 'sufficient',
      doseChange: null,
      signalRequest: null,
      safetyBoundary: null,
      additionalRationale: evaluator.action === 'maintain'
        ? ['The achieved quality moves to maintenance only after the athlete confirms the replacement emphasis.']
        : ['The next emphasis must be athlete-confirmed; proxy evidence does not choose it automatically.'],
      missing: ['replacement_direction_confirmation_required']
    }
  }
  return {
    action: 'continue',
    presentationClass: 'same_track',
    evidenceStatus: rollingEvidenceStatus(evaluator.evidenceStatus),
    doseChange: null,
    signalRequest: null,
    safetyBoundary: null,
    additionalRationale: [],
    missing: []
  }
}

function findDoseChange(
  plan: RollingWeeklyPlanDraft,
  action: 'adjust_dose' | 'recover'
): RollingWeeklyDoseChange | null {
  const priorityRank = { priority: 0, secondary: 1, supporting: 2 }
  const requirements = new Map(plan.schedule.requirements.map(item => [item.id, item]))
  const ledgers = new Map(plan.schedule.ledger.map(item => [item.requirement.id, item]))
  const candidates = [...plan.schedule.assignments].sort((left, right) => {
    const leftRequirement = requirements.get(left.requirementId)
    const rightRequirement = requirements.get(right.requirementId)
    return (leftRequirement ? priorityRank[leftRequirement.priority] : 99)
      - (rightRequirement ? priorityRank[rightRequirement.priority] : 99)
      || left.id.localeCompare(right.id)
  })

  for (const assignment of candidates) {
    const step = doseStep(assignment.unit)
    if (step === null) continue
    const ledger = ledgers.get(assignment.requirementId)
    const exercise = findAssignmentExercise(plan, assignment)
    if (!ledger || !exercise || doseAmount(exercise.dose, assignment.unit) !== assignment.dose) continue
    const delta = action === 'adjust_dose' ? step : -step
    const nextPlannedDose = ledger.plannedDose + delta
    const maximum = ledger.requirement.dose.maximum ?? ledger.requirement.dose.target.max
    if (nextPlannedDose < ledger.requirement.dose.minimum || nextPlannedDose > maximum) continue
    return {
      assignmentId: assignment.id,
      unit: assignment.unit,
      from: assignment.dose,
      to: assignment.dose + delta
    }
  }
  return null
}

function buildSignalRequest(
  plan: RollingWeeklyPlanDraft,
  evaluator: AdaptationReview
): RollingWeeklySignalRequest | null {
  const measurement = evaluator.nextMeasurement
  if (!measurement) return null
  const definition = measurement.assessmentDefinitionId
    ? findAssessmentDefinition(measurement.assessmentDefinitionId)
    : ADAPTIVE_ASSESSMENT_DEFINITIONS.find(item => item.primaryMetricId === measurement.metricId) ?? null
  if (!definition) return null

  const priorityRank = { priority: 0, secondary: 1, supporting: 2 }
  const requirements = new Map(plan.schedule.requirements.map(item => [item.id, item]))
  const assignments = [...plan.schedule.assignments].sort((left, right) => {
    const leftRequirement = requirements.get(left.requirementId)
    const rightRequirement = requirements.get(right.requirementId)
    return (leftRequirement ? priorityRank[leftRequirement.priority] : 99)
      - (rightRequirement ? priorityRank[rightRequirement.priority] : 99)
      || left.id.localeCompare(right.id)
  })
  for (const assignment of assignments) {
    const exercise = findAssignmentExercise(plan, assignment)
    const movement = exercise
      ? MOVEMENT_CATALOG.find(item => item.id === exercise.movementId) ?? null
      : null
    if (!exercise || !movement || !movementSupportsAssessment(movement, definition)) continue
    return {
      coverageRequirementId: assignment.requirementId,
      movementId: exercise.movementId,
      metricId: measurement.metricId,
      protocolId: definition.protocol.id
    }
  }
  return null
}

function buildSafetyBoundary(
  plan: RollingWeeklyPlanDraft,
  execution: RollingWeeklyExecutionSummary
): RollingWeeklySafetyBoundary {
  const concerningDates = new Set(execution.concerningScheduledDates)
  const provokingSessions = plan.scheduledSessions.filter(session => (
    concerningDates.has(session.scheduledDate)
  ))
  const selectedSessions = provokingSessions.length > 0
    ? provokingSessions.map(session => session.prescription)
    : plan.sessions
  const prohibitedMovementIds = [...new Set(selectedSessions
    .flatMap(session => session.blocks.flatMap(block => block.exercises.map(exercise => exercise.movementId))))]
    .sort()
  return {
    reason: 'Pause the accepted training dose while the concerning pain signal is reviewed.',
    prohibitedMovementIds
  }
}

function observationLinks(snapshot: AdaptationEvidenceSnapshot | null): RollingWeeklyReviewObservationLink[] {
  if (!snapshot) return []
  return [
    ...snapshot.includedObservationIds.map(groupId => ({
      groupId,
      disposition: 'included' as const
    })),
    ...snapshot.excludedObservations.map(item => ({
      groupId: item.observationId,
      disposition: 'excluded' as const,
      reason: item.reason.replaceAll('_', ' ')
    }))
  ].sort((left, right) => left.groupId.localeCompare(right.groupId))
}

function executionRationale(execution: RollingWeeklyExecutionSummary): string[] {
  const rationale = [
    `${execution.completedSessions} of ${execution.plannedSessions} scheduled sessions were completed.`
  ]
  if (execution.skippedSessions > 0) {
    rationale.push(`${execution.skippedSessions} sessions were explicitly skipped and remain review evidence.`)
  }
  if (execution.pastDuePlannedSessions > 0) {
    rationale.push(`${execution.pastDuePlannedSessions} past-due planned sessions were not carried into the next week.`)
  }
  return rationale
}

function findAssignmentExercise(
  plan: RollingWeeklyPlanDraft,
  assignment: WeeklyCoverageAssignment
): CompleteProgrammingExercisePrescription | null {
  return plan.sessions
    .find(session => session.day === assignment.day)
    ?.blocks.slice(1)
    .flatMap(block => block.exercises)
    .find(exercise => exercise.coverageRequirementIds.includes(assignment.requirementId)) ?? null
}

function movementSupportsAssessment(
  movement: MovementDefinition,
  definition: AssessmentDefinition
): boolean {
  if (definition.family === 'strength') return movement.domains.includes('strength')
  if (definition.family === 'jump') return movement.patterns.includes('jump')
  if (definition.family === 'sprint') return movement.patterns.includes('sprint')
  if (definition.family === 'run') {
    return movement.domains.includes('aerobic')
      && (movement.patterns.includes('locomotion') || movement.patterns.includes('cyclical'))
  }
  return true
}

function doseStep(unit: WeeklyCoverageAssignment['unit']): number | null {
  if (unit === 'working_sets') return 1
  if (unit === 'quality_repetitions') return 2
  if (unit === 'minutes') return 5
  if (unit === 'intervals') return 1
  return null
}

function doseAmount(
  dose: CompleteProgrammingDose,
  unit: WeeklyCoverageAssignment['unit']
): number | null {
  if (unit === 'working_sets' && dose.kind === 'sets_reps' && dose.sets.min === dose.sets.max) {
    return dose.sets.min
  }
  if (unit === 'quality_repetitions' && dose.kind === 'quality_repetitions') {
    return dose.totalRepetitions ?? null
  }
  if (unit === 'minutes' && dose.kind === 'continuous'
    && dose.durationMinutes.min === dose.durationMinutes.max) {
    return dose.durationMinutes.min
  }
  if (unit === 'intervals' && dose.kind === 'intervals') {
    return dose.totalIntervals ?? null
  }
  return null
}

function rollingEvidenceStatus(status: EvidenceStatus): RollingWeeklyEvidenceStatus {
  return status === 'supported' || status === 'contradicted' ? 'sufficient' : 'insufficient'
}

function latestCheckins(
  checkins: readonly CoachSessionCheckinSummary[]
): CoachSessionCheckinSummary[] {
  const latest = new Map<string, CoachSessionCheckinSummary>()
  for (const checkin of checkins) {
    const current = latest.get(checkin.prescribedSessionId)
    if (!current || Date.parse(checkin.occurredAt) > Date.parse(current.occurredAt)) {
      latest.set(checkin.prescribedSessionId, checkin)
    }
  }
  return [...latest.values()].sort((left, right) => (
    left.prescribedSessionId.localeCompare(right.prescribedSessionId)
  ))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}
