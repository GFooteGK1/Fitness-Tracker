import type {
  CoachPlanningContext,
  CoachPlanningInput,
  CoachProgramDomainId,
  CoachSessionPrescription,
  CoachStrengthAssessmentSummary,
  TrainingExperience,
  TrainingWeekday
} from './types'
import type { TrainingGoal } from './adaptive-programming-contracts'

export const PROGRAMMING_SCHEMA_VERSION = 1 as const
export const PROGRAMMING_KERNEL_VERSION = '0.3.0'

export interface ProgrammingGoalOutcome {
  statement: string
  kind: TrainingGoal['kind']
  horizon: {
    startsOn: string
    endsOn: string
  }
  target: TrainingGoal['target']
}

export type ProgrammingGoalAllocation =
  | {
    id: string
    domain: CoachProgramDomainId
    role: 'primary'
    allocation: 'lead'
    athleteIntent: string
    outcome?: ProgrammingGoalOutcome
  }
  | {
    id: string
    domain: CoachProgramDomainId
    role: 'secondary'
    allocation: 'development' | 'maintenance'
    athleteIntent: string
    outcome?: ProgrammingGoalOutcome
  }

export interface ProgrammingSessionAvailability {
  day: TrainingWeekday
  minutes: number
}

export interface ProgrammingEquipmentProfile {
  /** Only resolved IDs may participate in deterministic movement eligibility. */
  resolvedIds: string[]
  /** Preserved for review; the kernel must not infer equipment from this field. */
  unresolvedAthleteDescription: string | null
}

export interface ProgrammingConstraint {
  id: string
  kind: 'no_overhead' | 'no_running'
  description: string
  source: 'athlete_confirmed'
}

export interface ProgrammingMovementPreference {
  movementId: string
  preference: 'prefer' | 'avoid'
  source: 'athlete_confirmed'
}

export interface ProgrammingRecentTrainingSummary {
  asOfDate: string | null
  lookbackDays: number
  completedSessionCount: number
  performedMovementIds: string[]
  doseByCoverageTarget: Array<{
    kind: WeeklyCoverageKind
    targetId: string
    unit: WeeklyCoverageDoseUnit
    amount: number
  }>
}

export type ProgrammingInputSource =
  | { kind: 'structured_v0_3_intake' }
  | { kind: 'legacy_v0_2_intake'; snapshot: CoachPlanningInput }

/**
 * Additive v0.3 planning contract. Accepted v0.2 plans keep their original
 * snapshot and prescription JSON; this profile is used only by the new kernel.
 */
export interface ProgrammingProfile {
  schemaVersion: typeof PROGRAMMING_SCHEMA_VERSION
  kernelVersion: typeof PROGRAMMING_KERNEL_VERSION
  athleteGoalSummary: string
  primaryGoal: Extract<ProgrammingGoalAllocation, { role: 'primary' }>
  secondaryGoals: Array<Extract<ProgrammingGoalAllocation, { role: 'secondary' }>>
  trainingExperience: TrainingExperience
  startDate: string
  sessionAvailability: ProgrammingSessionAvailability[]
  equipment: ProgrammingEquipmentProfile
  explicitConstraints: ProgrammingConstraint[]
  /** Preserved for athlete review; not a medical or movement-eligibility input. */
  unresolvedConstraintNote: string | null
  preferences: ProgrammingMovementPreference[]
  assessments: CoachStrengthAssessmentSummary[]
  recentTraining: ProgrammingRecentTrainingSummary
  inputSource: ProgrammingInputSource
}

export type WeeklyCoverageKind =
  | 'movement_pattern'
  | 'muscle_region'
  | 'performance_quality'
  | 'energy_system'
  | 'resilience_capacity'

export type WeeklyCoverageDoseUnit =
  | 'exposures'
  | 'working_sets'
  | 'quality_repetitions'
  | 'minutes'
  | 'intervals'

export type ProgrammingCost = 'low' | 'moderate' | 'high'
export type WeeklyCoveragePriority = 'priority' | 'secondary' | 'supporting'

export interface WeeklyCoverageRequirement {
  id: string
  goalAllocationId: string
  domain: CoachProgramDomainId
  kind: WeeklyCoverageKind
  targetId: string
  targetLabel: string
  priority: WeeklyCoveragePriority
  doseAnchorId: string
  estimatedMinutesPerExposure: number
  dose: {
    source: 'validated_policy'
    unit: WeeklyCoverageDoseUnit
    minimum: number
    target: { min: number; max: number }
    maximum?: number
  }
  eligibleDays: TrainingWeekday[]
  sequencing: {
    mustPrecedeKinds: WeeklyCoverageKind[]
    avoidSameDayTargetIds: string[]
    preferredRecoveryHours: number | null
  }
  fatigueCost: ProgrammingCost
  impactCost: ProgrammingCost
  evidenceRuleIds: string[]
  policyVersion: string
}

export interface WeeklyCoverageLedgerEntry {
  requirement: WeeklyCoverageRequirement
  plannedDose: number
  assignedSessionIds: string[]
  unassignedReason:
    | 'time'
    | 'equipment'
    | 'constraint'
    | 'recovery'
    | 'experience'
    | 'unsupported'
    | null
}

export type ProgrammingSessionBlockRole =
  | 'specific_preparation'
  | 'priority_adaptation'
  | 'secondary_adaptation'
  | 'assistance_and_capacity'
  | 'conditioning'
  | 'downshift'

export interface NumericRange {
  min: number
  max: number
}

export type CompleteProgrammingDose =
  | {
    kind: 'sets_reps'
    sets: NumericRange
    repetitions: NumericRange
  }
  | {
    kind: 'quality_repetitions'
    totalRepetitions?: number
    series: NumericRange
    repetitionsPerSeries: NumericRange
    workSeconds: NumericRange | null
  }
  | {
    kind: 'continuous'
    durationMinutes: NumericRange
  }
  | {
    kind: 'intervals'
    totalIntervals?: number
    workSeconds: NumericRange
    recoverySeconds: NumericRange
    repetitions: NumericRange
    series: NumericRange
    seriesRecoverySeconds: NumericRange
  }

export type ProgrammingExecutionTarget =
  | { kind: 'rir'; range: NumericRange }
  | { kind: 'rpe'; range: NumericRange }
  | { kind: 'quality'; cue: string }
  | { kind: 'talk_test'; cue: string }
  | { kind: 'pace'; cue: string; baselineId: string | null }
  | { kind: 'velocity'; cue: string; baselineId: string | null }

export type ProgrammingLoadAnchor =
  | {
    source: 'saved_assessment'
    assessmentId: string
    percentRange: NumericRange
    loadRange: NumericRange & { unit: 'lb' | 'kg' }
  }
  | {
    source: 'accepted_program'
    priorSessionId: string
    loadRange: NumericRange & { unit: 'lb' | 'kg' }
  }

export interface CompleteProgrammingExercisePrescription {
  movementId: string
  movementName: string
  role: ProgrammingSessionBlockRole
  coverageRequirementIds: string[]
  intent: string
  dose: CompleteProgrammingDose
  loadAnchor?: ProgrammingLoadAnchor
  executionTarget: ProgrammingExecutionTarget
  restSeconds: NumericRange
  successCondition: string
  stopCondition: string
  substitutionMovementIds: string[]
  substitutionGuidance: string
  selectionReasons: string[]
  estimatedMinutes: number
  fatigueCost: ProgrammingCost
  evidenceRuleIds: string[]
  policyVersion: string
}

export interface CompleteProgrammingBlockPrescription {
  id: string
  role: ProgrammingSessionBlockRole
  coverageRequirementIds: string[]
  intent: string
  instructions: string[]
  exercises: CompleteProgrammingExercisePrescription[]
  estimatedMinutes: number
}

export interface CompleteProgrammingSessionPrescription {
  schemaVersion: typeof PROGRAMMING_SCHEMA_VERSION
  format: 'complete_programming_v0_3'
  kernelVersion: typeof PROGRAMMING_KERNEL_VERSION
  policyVersion: string
  evidenceReferenceVersion: string
  movementCatalogVersion: string
  weekNumber: number
  day: TrainingWeekday
  sessionId: string
  domain: CoachProgramDomainId
  title: string
  intent: string
  scheduledMinutes: number
  blocks: CompleteProgrammingBlockPrescription[]
}

export type StoredCoachSessionPrescription =
  | CoachSessionPrescription
  | CompleteProgrammingSessionPrescription

export type ProgrammingSchemaValidation = {
  ok: boolean
  errors: string[]
}

export function normalizeLegacyPlanningInput(
  input: CoachPlanningInput,
  context: CoachPlanningContext = {}
): ProgrammingProfile {
  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    athleteGoalSummary: input.goal,
    primaryGoal: {
      id: `goal:primary:${input.primaryDomain}`,
      domain: input.primaryDomain,
      role: 'primary',
      allocation: 'lead',
      athleteIntent: input.goal,
      outcome: buildProgrammingGoalOutcome(input.primaryDomain, input.goal, input.startDate)
    },
    secondaryGoals: [],
    trainingExperience: input.experience,
    startDate: input.startDate,
    sessionAvailability: input.trainingDays.map(day => ({
      day,
      minutes: input.sessionMinutes
    })),
    equipment: {
      resolvedIds: [],
      unresolvedAthleteDescription: input.equipment.trim() || null
    },
    explicitConstraints: [],
    unresolvedConstraintNote: input.constraints.trim() || null,
    preferences: [],
    assessments: [...(context.assessments ?? [])],
    recentTraining: {
      asOfDate: null,
      lookbackDays: 0,
      completedSessionCount: 0,
      performedMovementIds: [],
      doseByCoverageTarget: []
    },
    inputSource: {
      kind: 'legacy_v0_2_intake',
      snapshot: {
        ...input,
        trainingDays: [...input.trainingDays]
      }
    }
  }
}

export function validateProgrammingProfile(
  profile: ProgrammingProfile
): ProgrammingSchemaValidation {
  const errors: string[] = []
  const goals: ProgrammingGoalAllocation[] = [profile.primaryGoal, ...profile.secondaryGoals]

  if (profile.schemaVersion !== PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Programming schema version is unsupported')
  }
  if (profile.kernelVersion !== PROGRAMMING_KERNEL_VERSION) {
    errors.push('Programming kernel version is unsupported')
  }
  if (profile.athleteGoalSummary.trim().length < 5 || profile.athleteGoalSummary.length > 500) {
    errors.push('Athlete goal summary must be between 5 and 500 characters')
  }
  if (profile.primaryGoal.role !== 'primary' || profile.primaryGoal.allocation !== 'lead') {
    errors.push('Programming profile needs exactly one lead goal')
  }
  if (profile.secondaryGoals.length > 2) {
    errors.push('Choose no more than two secondary goals')
  }
  if (profile.secondaryGoals.some(goal => (
    goal.role !== 'secondary'
    || !['development', 'maintenance'].includes(goal.allocation)
  ))) {
    errors.push('Secondary goals must use development or maintenance allocation')
  }
  if (new Set(goals.map(goal => goal.domain)).size !== goals.length) {
    errors.push('Goal domains must be unique')
  }
  if (new Set(goals.map(goal => goal.id)).size !== goals.length) {
    errors.push('Goal allocation IDs must be unique')
  }
  if (goals.some(goal => goal.athleteIntent.trim().length === 0)) {
    errors.push('Every goal allocation needs athlete intent')
  }
  for (const goal of goals) {
    if (!goal.outcome) continue
    if (
      goal.outcome.statement.trim().length < 3
      || goal.outcome.statement.length > 500
    ) {
      errors.push(`Goal ${goal.id} outcome statement must be between 3 and 500 characters`)
    }
    if (
      !isIsoDate(goal.outcome.horizon.startsOn)
      || !isIsoDate(goal.outcome.horizon.endsOn)
      || goal.outcome.horizon.endsOn < goal.outcome.horizon.startsOn
    ) {
      errors.push(`Goal ${goal.id} outcome must use a valid independent goal horizon`)
    }
  }

  const days = profile.sessionAvailability.map(availability => availability.day)
  if (
    days.length < 2
    || days.length > 6
    || new Set(days).size !== days.length
  ) {
    errors.push('Choose 2 to 6 different training days')
  }
  if (profile.sessionAvailability.some(({ minutes }) => (
    !Number.isInteger(minutes) || minutes < 30 || minutes > 90
  ))) {
    errors.push('Session minutes must be an integer from 30 through 90')
  }
  if (!isIsoDate(profile.startDate) || isoWeekday(profile.startDate) !== 1) {
    errors.push('Program start date must be a valid Monday YYYY-MM-DD date')
  }

  const equipmentIds = profile.equipment.resolvedIds
  if (
    new Set(equipmentIds).size !== equipmentIds.length
    || equipmentIds.some(id => id.trim().length === 0)
  ) {
    errors.push('Resolved equipment IDs must be unique and non-empty')
  }
  if (
    equipmentIds.length === 0
    && !profile.equipment.unresolvedAthleteDescription?.trim()
  ) {
    errors.push('Equipment needs resolved IDs or an athlete description')
  }

  if (!Number.isInteger(profile.recentTraining.lookbackDays) || profile.recentTraining.lookbackDays < 0) {
    errors.push('Recent training lookback must be a non-negative integer')
  }
  if (
    !Number.isInteger(profile.recentTraining.completedSessionCount)
    || profile.recentTraining.completedSessionCount < 0
  ) {
    errors.push('Completed session count must be a non-negative integer')
  }

  return { ok: errors.length === 0, errors }
}

export function validateWeeklyCoverageRequirement(
  requirement: WeeklyCoverageRequirement
): ProgrammingSchemaValidation {
  const errors: string[] = []

  if (requirement.dose.source !== 'validated_policy') {
    errors.push('Coverage dose must come from validated policy')
  }
  if (
    !isNonNegativeNumber(requirement.dose.minimum)
    || !isNonNegativeNumber(requirement.dose.target.min)
    || !isNonNegativeNumber(requirement.dose.target.max)
    || requirement.dose.target.min < requirement.dose.minimum
    || requirement.dose.target.max < requirement.dose.target.min
    || (
      requirement.dose.maximum !== undefined
      && requirement.dose.maximum < requirement.dose.target.max
    )
  ) {
    errors.push('Coverage target must be ordered and at least the minimum dose')
  }
  if (requirement.evidenceRuleIds.length === 0) {
    errors.push('Coverage requirements need at least one evidence rule')
  }
  if (!requirement.policyVersion.trim()) {
    errors.push('Coverage requirements need a policy version')
  }
  if (!requirement.doseAnchorId.trim()) {
    errors.push('Coverage requirements need a dose anchor')
  }
  if (
    !Number.isInteger(requirement.estimatedMinutesPerExposure)
    || requirement.estimatedMinutesPerExposure <= 0
  ) {
    errors.push('Coverage requirements need positive whole estimated minutes')
  }
  if (
    requirement.eligibleDays.length === 0
    || new Set(requirement.eligibleDays).size !== requirement.eligibleDays.length
  ) {
    errors.push('Coverage requirements need unique eligible days')
  }
  if (!requirement.id.trim() || !requirement.goalAllocationId.trim() || !requirement.targetId.trim()) {
    errors.push('Coverage requirements need stable IDs')
  }

  return { ok: errors.length === 0, errors }
}

export function detectCoachPrescriptionFormat(
  value: unknown
): 'legacy_v0_2' | 'complete_v0_3' | 'unknown' {
  if (!isRecord(value)) return 'unknown'

  if (
    value.schemaVersion === PROGRAMMING_SCHEMA_VERSION
    && value.format === 'complete_programming_v0_3'
    && value.kernelVersion === PROGRAMMING_KERNEL_VERSION
    && typeof value.policyVersion === 'string'
    && Array.isArray(value.blocks)
  ) {
    return 'complete_v0_3'
  }

  if (
    typeof value.domain === 'string'
    && typeof value.session_role === 'string'
    && isRecord(value.dose)
    && isRecord(value.evidence)
    && typeof value.evidence.policyVersion === 'string'
  ) {
    return 'legacy_v0_2'
  }

  return 'unknown'
}

export function buildProgrammingGoalOutcome(
  domain: CoachProgramDomainId,
  statement: string,
  startDate: string
): ProgrammingGoalOutcome {
  const kindByDomain: Record<CoachProgramDomainId, TrainingGoal['kind']> = {
    strength: 'performance_outcome',
    hypertrophy: 'capacity',
    power_explosiveness: 'performance_outcome',
    speed_agility: 'performance_outcome',
    aerobic: 'performance_outcome',
    resilience: 'capacity'
  }
  return {
    statement,
    kind: kindByDomain[domain],
    horizon: {
      startsOn: startDate,
      endsOn: addIsoDays(startDate, 55)
    },
    target: null
  }
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

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
