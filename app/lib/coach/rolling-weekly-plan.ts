import { MOVEMENT_CATALOG_VERSION } from './movement-catalog'
import { COMPLETE_PROGRAMMING_POLICY_VERSION } from './programming-policy'
import { COMPLETE_PROGRAMMING_REFERENCE } from './programming-reference'
import { validateCompleteProgrammingWeekDose } from './program-validator'
import {
  PROGRAMMING_KERNEL_VERSION,
  validateProgrammingProfile,
  type CompleteProgrammingDose,
  type CompleteProgrammingExercisePrescription,
  type CompleteProgrammingSessionPrescription,
  type ProgrammingProfile
} from './programming-schema'
import {
  ROLLING_WEEKLY_KERNEL_VERSION,
  ROLLING_WEEKLY_POLICY_VERSION,
  ROLLING_WEEKLY_SCHEMA_VERSION,
  expectedPresentationClass,
  stableStringify,
  validateRollingTrainingDirection,
  type RollingTrainingDirection,
  type RollingWeeklyDoseChange,
  type RollingWeeklyPlanningDecision,
  type RollingWeeklySignalRequest
} from './rolling-weekly-contracts'
import { composeWeeklySessions } from './session-composer'
import type { TrainingWeekday } from './types'
import {
  buildWeeklyCoverageSchedule,
  type WeeklyCoverageAssignment,
  type WeeklyCoverageSchedule
} from './weekly-coverage'

export type RollingWeeklyPlanSource = 'initial' | 'weekly_review' | 'legacy_conversion'

export interface BuildRollingWeeklyPlanInput {
  source: RollingWeeklyPlanSource
  windowStart: string
  profile: ProgrammingProfile
  direction: RollingTrainingDirection
  priorWeek?: RollingWeeklyPlanDraft
  decision?: RollingWeeklyPlanningDecision
}

export interface RollingScheduledSession {
  scheduledDate: string
  prescription: CompleteProgrammingSessionPrescription
}

export interface RollingWeeklyPlanDraft {
  kind: 'weekly_plan'
  schemaVersion: typeof ROLLING_WEEKLY_SCHEMA_VERSION
  format: 'rolling_weekly_plan_v0_1'
  kernelVersion: typeof ROLLING_WEEKLY_KERNEL_VERSION
  sessionKernelVersion: typeof PROGRAMMING_KERNEL_VERSION
  policyVersion: string
  sessionPolicyVersion: string
  evidenceReferenceVersion: string
  movementCatalogVersion: string
  source: RollingWeeklyPlanSource
  sequenceNumber: number
  windowStart: string
  windowEnd: string
  title: string
  profileSnapshot: ProgrammingProfile
  directionSnapshot: RollingTrainingDirection
  reviewDecision: RollingWeeklyPlanningDecision | null
  schedule: WeeklyCoverageSchedule
  sessions: CompleteProgrammingSessionPrescription[]
  scheduledSessions: RollingScheduledSession[]
  uncomposedAvailableDays: Array<{
    day: TrainingWeekday
    reason: 'no_assigned_coverage'
  }>
  changeSummary: {
    changedVariables: string[]
    assessmentSignal: RollingWeeklySignalRequest | null
  }
}

export interface RollingWeeklySafetyPauseDraft {
  kind: 'safety_pause'
  schemaVersion: typeof ROLLING_WEEKLY_SCHEMA_VERSION
  format: 'rolling_weekly_safety_pause_v0_1'
  kernelVersion: typeof ROLLING_WEEKLY_KERNEL_VERSION
  source: 'weekly_review'
  sequenceNumber: number
  windowStart: string
  windowEnd: string
  directionSnapshot: RollingTrainingDirection
  reviewDecision: RollingWeeklyPlanningDecision
  omittedMovementIds: string[]
  noPlanReason: string
}

export type RollingWeeklyPlanResult = RollingWeeklyPlanDraft | RollingWeeklySafetyPauseDraft

const WEEKDAY_OFFSET: Record<TrainingWeekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
}

const DOMAIN_TITLE: Record<ProgrammingProfile['primaryGoal']['domain'], string> = {
  strength: 'Strength',
  hypertrophy: 'Build muscle',
  power_explosiveness: 'Power and explosiveness',
  speed_agility: 'Speed and agility',
  aerobic: 'Aerobic conditioning',
  resilience: 'Resilience and movement capacity'
}

const MAX_DOSE_STEP: Record<WeeklyCoverageAssignment['unit'], number> = {
  exposures: 1,
  working_sets: 1,
  quality_repetitions: 2,
  minutes: 5,
  intervals: 1
}

/**
 * Builds one inspectable Monday-through-Sunday dose. The function never
 * activates a plan or creates a later week.
 */
export function buildRollingWeeklyPlan(
  input: BuildRollingWeeklyPlanInput
): RollingWeeklyPlanResult {
  validateInputShape(input)

  const profile = clone(input.profile)
  profile.startDate = input.windowStart
  const profileValidation = validateProgrammingProfile(profile)
  if (!profileValidation.ok) throw new Error(profileValidation.errors.join('; '))

  const directionErrors = validateRollingTrainingDirection(input.direction, profile)
  if (directionErrors.length > 0) throw new Error(directionErrors.join('; '))

  const sequenceNumber = input.priorWeek ? input.priorWeek.sequenceNumber + 1 : 1
  const windowEnd = addIsoDays(input.windowStart, 6)

  if (input.decision?.action === 'pause_review') {
    assertContinuity(requirePriorWeek(input), profile, input.direction)
    return buildSafetyPause(input, sequenceNumber, windowEnd)
  }

  let schedule: WeeklyCoverageSchedule
  let sessions: CompleteProgrammingSessionPrescription[]
  let uncomposedAvailableDays: RollingWeeklyPlanDraft['uncomposedAvailableDays']

  if (input.source === 'weekly_review' && input.decision?.action !== 'shift_emphasis') {
    const priorWeek = requirePriorWeek(input)
    assertContinuity(priorWeek, profile, input.direction)
    schedule = clone(priorWeek.schedule)
    schedule.weekNumber = 1
    schedule.reviewRequired = false
    sessions = clone(priorWeek.sessions).map((session, index) => ({
      ...session,
      weekNumber: 1,
      sessionId: `rolling:${sequenceNumber}:${session.day}:${index + 1}`
    }))
    uncomposedAvailableDays = clone(priorWeek.uncomposedAvailableDays)
  } else {
    schedule = buildWeeklyCoverageSchedule(profile, { weekNumber: 1 })
    schedule.reviewRequired = false
    const composition = composeWeeklySessions(profile, schedule)
    sessions = composition.sessions.map((session, index) => ({
      ...session,
      sessionId: `rolling:${sequenceNumber}:${session.day}:${index + 1}`
    }))
    uncomposedAvailableDays = composition.uncomposedAvailableDays
  }

  const changedVariables: string[] = []
  let assessmentSignal: RollingWeeklySignalRequest | null = null
  const decision = input.decision
  if (decision?.action === 'adjust_dose' || decision?.action === 'recover') {
    applyDoseChange(schedule, sessions, requireDoseChange(decision), decision.action)
    changedVariables.push(`dose:${decision.doseChange?.assignmentId}`)
  } else if (decision?.action === 'collect_signal') {
    assessmentSignal = requireSignalRequest(decision)
    applySignalRequest(sessions, assessmentSignal)
    changedVariables.push(`assessment:${assessmentSignal.protocolId}`)
  }

  const weeklyValidation = validateCompleteProgrammingWeekDose(profile, schedule, sessions)
  if (!weeklyValidation.ok) throw new Error(weeklyValidation.errors.join('; '))

  return {
    kind: 'weekly_plan',
    schemaVersion: ROLLING_WEEKLY_SCHEMA_VERSION,
    format: 'rolling_weekly_plan_v0_1',
    kernelVersion: ROLLING_WEEKLY_KERNEL_VERSION,
    sessionKernelVersion: PROGRAMMING_KERNEL_VERSION,
    policyVersion: ROLLING_WEEKLY_POLICY_VERSION,
    sessionPolicyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
    evidenceReferenceVersion: COMPLETE_PROGRAMMING_REFERENCE.referenceVersion,
    movementCatalogVersion: MOVEMENT_CATALOG_VERSION,
    source: input.source,
    sequenceNumber,
    windowStart: input.windowStart,
    windowEnd,
    title: `${DOMAIN_TITLE[profile.primaryGoal.domain]} · ${formatWindow(input.windowStart, windowEnd)}`,
    profileSnapshot: profile,
    directionSnapshot: clone(input.direction),
    reviewDecision: decision ? clone(decision) : null,
    schedule,
    sessions,
    scheduledSessions: sessions.map(session => ({
      scheduledDate: addIsoDays(input.windowStart, WEEKDAY_OFFSET[session.day]),
      prescription: session
    })),
    uncomposedAvailableDays,
    changeSummary: {
      changedVariables,
      assessmentSignal
    }
  }
}

function validateInputShape(input: BuildRollingWeeklyPlanInput): void {
  if (!isIsoDate(input.windowStart) || isoWeekday(input.windowStart) !== 1) {
    throw new Error('Rolling week must start on a valid Monday YYYY-MM-DD date')
  }

  if (input.source === 'weekly_review') {
    if (!input.priorWeek || !input.decision) {
      throw new Error('A reviewed next week needs the prior accepted week and its decision')
    }
    if (input.windowStart !== addIsoDays(input.priorWeek.windowEnd, 1)) {
      throw new Error('The next rolling week must begin on the Monday after the prior window')
    }
    if (!expectedPresentationClass(input.decision.action).includes(input.decision.presentationClass)) {
      throw new Error('Weekly review presentation does not match its action')
    }
    if (!input.decision.reviewId.trim() || input.decision.rationale.trim().length < 3) {
      throw new Error('A reviewed next week needs the immutable review ID and rationale')
    }
    const hasDoseChange = input.decision.doseChange !== undefined
    const hasSignalRequest = input.decision.signalRequest !== undefined
    const hasSafetyBoundary = input.decision.safetyBoundary !== undefined
    if (input.decision.action === 'continue' && (hasDoseChange || hasSignalRequest || hasSafetyBoundary)) {
      throw new Error('Continue cannot hide a dose, assessment, or safety change')
    }
    if (
      ['adjust_dose', 'recover'].includes(input.decision.action)
      && (!hasDoseChange || hasSignalRequest || hasSafetyBoundary)
    ) {
      throw new Error(`${input.decision.action} needs exactly one dose change`)
    }
    if (
      input.decision.action === 'collect_signal'
      && (!hasSignalRequest || hasDoseChange || hasSafetyBoundary)
    ) {
      throw new Error('Collect signal needs exactly one assessment request')
    }
    if (
      input.decision.action === 'shift_emphasis'
      && (hasDoseChange || hasSignalRequest || hasSafetyBoundary)
    ) {
      throw new Error('Shift emphasis must rebuild from the changed direction without hidden dose edits')
    }
    if (
      input.decision.action === 'shift_emphasis'
      && stableStringify(input.priorWeek.directionSnapshot) === stableStringify(input.direction)
    ) {
      throw new Error('Shift emphasis needs a changed durable direction')
    }
    if (
      input.decision.action === 'shift_emphasis'
      && stableStringify(input.priorWeek.directionSnapshot.currentEmphasis)
        === stableStringify(input.direction.currentEmphasis)
    ) {
      throw new Error('Shift emphasis needs a changed goal allocation')
    }
    if (
      input.decision.action === 'pause_review'
      && (!hasSafetyBoundary || hasDoseChange || hasSignalRequest)
    ) {
      throw new Error('A safety pause needs one explicit movement boundary and no hidden dose change')
    }
    if (input.decision.action === 'pause_review' && input.decision.evidenceStatus !== 'safety_override') {
      throw new Error('A safety pause needs a safety-override evidence status')
    }
  } else if (input.priorWeek || input.decision) {
    throw new Error('Initial and legacy-conversion weeks cannot contain a prior weekly decision')
  }
}

function buildSafetyPause(
  input: BuildRollingWeeklyPlanInput,
  sequenceNumber: number,
  windowEnd: string
): RollingWeeklySafetyPauseDraft {
  const decision = input.decision
  if (!decision || input.source !== 'weekly_review') {
    throw new Error('Only a weekly review can produce a safety pause')
  }
  const boundary = decision.safetyBoundary
  if (!boundary || boundary.reason.trim().length < 3 || boundary.prohibitedMovementIds.length === 0) {
    throw new Error('A safety pause needs a reason and at least one prohibited movement')
  }
  const knownMovements = new Set(
    requirePriorWeek(input).sessions.flatMap(session => (
      session.blocks.flatMap(block => block.exercises.map(exercise => exercise.movementId))
    ))
  )
  const omittedMovementIds = [...new Set(boundary.prohibitedMovementIds)].sort()
  if (omittedMovementIds.some(id => !knownMovements.has(id))) {
    throw new Error('A safety pause can only omit movements from the accepted week')
  }

  return {
    kind: 'safety_pause',
    schemaVersion: ROLLING_WEEKLY_SCHEMA_VERSION,
    format: 'rolling_weekly_safety_pause_v0_1',
    kernelVersion: ROLLING_WEEKLY_KERNEL_VERSION,
    source: 'weekly_review',
    sequenceNumber,
    windowStart: input.windowStart,
    windowEnd,
    directionSnapshot: clone(input.direction),
    reviewDecision: clone(decision),
    omittedMovementIds,
    noPlanReason: boundary.reason.trim()
  }
}

function applyDoseChange(
  schedule: WeeklyCoverageSchedule,
  sessions: CompleteProgrammingSessionPrescription[],
  change: RollingWeeklyDoseChange,
  action: 'adjust_dose' | 'recover'
): void {
  const assignment = schedule.assignments.find(item => item.id === change.assignmentId)
  if (!assignment) throw new Error('Dose change references an unknown weekly assignment')
  if (assignment.unit !== change.unit || assignment.dose !== change.from) {
    throw new Error('Dose change does not match the accepted weekly assignment')
  }
  const delta = change.to - change.from
  if (!Number.isInteger(change.from) || !Number.isInteger(change.to) || change.to < 0 || delta === 0) {
    throw new Error('Dose change needs a different non-negative whole target')
  }
  if (Math.abs(delta) > MAX_DOSE_STEP[change.unit]) {
    throw new Error('Dose change exceeds the validated one-step boundary')
  }
  if (action === 'adjust_dose' && delta < 0) {
    throw new Error('Dose adjustment must progress one variable')
  }
  if (action === 'recover' && delta > 0) {
    throw new Error('Recovery adjustment must reduce one variable')
  }

  const ledger = schedule.ledger.find(item => item.requirement.id === assignment.requirementId)
  if (!ledger) throw new Error('Dose change is missing its coverage ledger')
  const nextPlannedDose = ledger.plannedDose + delta
  const maximum = ledger.requirement.dose.maximum ?? ledger.requirement.dose.target.max
  if (nextPlannedDose < ledger.requirement.dose.minimum || nextPlannedDose > maximum) {
    throw new Error('Dose change falls outside the versioned coverage bounds')
  }

  const session = sessions.find(item => item.day === assignment.day)
  const exercise = session?.blocks.slice(1).flatMap(block => block.exercises).find(item => (
    item.coverageRequirementIds.includes(assignment.requirementId)
  ))
  if (!exercise) throw new Error('Dose change is missing its composed exercise')

  setExerciseDose(exercise, change)
  assignment.dose = change.to
  ledger.plannedDose = nextPlannedDose
}

function setExerciseDose(
  exercise: CompleteProgrammingExercisePrescription,
  change: RollingWeeklyDoseChange
): void {
  const current = doseAmount(exercise.dose, change.unit)
  if (current !== change.from) {
    throw new Error('Dose change does not match the accepted exercise prescription')
  }
  if (change.unit === 'working_sets' && exercise.dose.kind === 'sets_reps') {
    exercise.dose.sets = { min: change.to, max: change.to }
    return
  }
  if (change.unit === 'quality_repetitions' && exercise.dose.kind === 'quality_repetitions') {
    exercise.dose.totalRepetitions = change.to
    return
  }
  if (change.unit === 'minutes' && exercise.dose.kind === 'continuous') {
    exercise.dose.durationMinutes = { min: change.to, max: change.to }
    return
  }
  if (change.unit === 'intervals' && exercise.dose.kind === 'intervals') {
    exercise.dose.totalIntervals = change.to
    return
  }
  throw new Error('Dose change unit does not match the composed exercise dose')
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

function applySignalRequest(
  sessions: CompleteProgrammingSessionPrescription[],
  signal: RollingWeeklySignalRequest
): void {
  if (!signal.metricId.trim() || !signal.protocolId.trim()) {
    throw new Error('Assessment request needs a metric and protocol')
  }
  const exercise = sessions.flatMap(session => session.blocks.slice(1)).flatMap(
    block => block.exercises
  ).find(item => (
    item.movementId === signal.movementId
    && item.coverageRequirementIds.includes(signal.coverageRequirementId)
  ))
  if (!exercise) {
    throw new Error('Assessment request must use an eligible movement already present in the weekly dose')
  }

  exercise.intent = `${exercise.intent} Capture ${signal.metricId} with ${signal.protocolId}.`
  exercise.selectionReasons = [
    ...exercise.selectionReasons,
    `weekly_review:collect_signal:${signal.protocolId}`
  ]
  exercise.evidenceRuleIds = [...new Set([
    ...exercise.evidenceRuleIds,
    `assessment:${signal.metricId}:${signal.protocolId}`
  ])]
}

function assertContinuity(
  priorWeek: RollingWeeklyPlanDraft,
  profile: ProgrammingProfile,
  direction: RollingTrainingDirection
): void {
  if (stableStringify(priorWeek.directionSnapshot) !== stableStringify(direction)) {
    throw new Error('Only shift_emphasis can change the durable training direction')
  }
  if (stableStringify(profileContinuity(priorWeek.profileSnapshot)) !== stableStringify(profileContinuity(profile))) {
    throw new Error('A same-track decision cannot silently change schedule, equipment, goals, or constraints')
  }
}

function profileContinuity(profile: ProgrammingProfile): unknown {
  return {
    primaryGoal: profile.primaryGoal,
    secondaryGoals: profile.secondaryGoals,
    trainingExperience: profile.trainingExperience,
    sessionAvailability: profile.sessionAvailability,
    equipment: profile.equipment,
    explicitConstraints: profile.explicitConstraints,
    unresolvedConstraintNote: profile.unresolvedConstraintNote,
    preferences: profile.preferences
  }
}

function requirePriorWeek(input: BuildRollingWeeklyPlanInput): RollingWeeklyPlanDraft {
  if (!input.priorWeek) throw new Error('Prior rolling week is required')
  return input.priorWeek
}

function requireDoseChange(decision: RollingWeeklyPlanningDecision): RollingWeeklyDoseChange {
  if (!decision.doseChange || decision.signalRequest) {
    throw new Error(`${decision.action} needs exactly one dose change`)
  }
  return decision.doseChange
}

function requireSignalRequest(decision: RollingWeeklyPlanningDecision): RollingWeeklySignalRequest {
  if (!decision.signalRequest || decision.doseChange) {
    throw new Error('collect_signal needs exactly one assessment request')
  }
  return decision.signalRequest
}

function formatWindow(start: string, end: string): string {
  return `${start} to ${end}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function isoWeekday(value: string): number | null {
  if (!isIsoDate(value)) return null
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
