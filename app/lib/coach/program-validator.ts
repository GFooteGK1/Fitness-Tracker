import {
  validateAdaptivePlanContract,
  type AdaptivePlanContract
} from './adaptive-plan'
import {
  MOVEMENT_CATALOG,
  MOVEMENT_CATALOG_VERSION,
  MOVEMENT_EQUIPMENT_IDS,
  findMovementSubstitutions,
  getMovementsByAssessmentAlias,
  isMovementEligible,
  type MovementEligibilityContext,
  type MovementEquipmentId
} from './movement-catalog'
import { COMPLETE_PROGRAMMING_POLICY, COMPLETE_PROGRAMMING_POLICY_VERSION } from './programming-policy'
import { COMPLETE_PROGRAMMING_REFERENCE } from './programming-reference'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  validateProgrammingProfile,
  validateWeeklyCoverageRequirement,
  type CompleteProgrammingDose,
  type CompleteProgrammingExercisePrescription,
  type CompleteProgrammingSessionPrescription,
  type ProgrammingProfile,
  type WeeklyCoverageRequirement
} from './programming-schema'
import type { CompleteProgrammingPlanDraft, CompleteProgrammingWeekDraft } from './complete-program'
import type {
  WeeklyCoverageAssignment,
  WeeklyCoverageSchedule
} from './weekly-coverage'

export interface CompleteProgrammingPlanValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** Validates a draft without mutating, activating, or repairing it. */
export function validateCompleteProgrammingPlan(
  value: unknown
): CompleteProgrammingPlanValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(value)) {
    return { ok: false, errors: ['Plan must be an object'], warnings }
  }
  if (value.format !== 'complete_programming_plan_v0_3') {
    errors.push('Plan format must be complete_programming_plan_v0_3')
  }
  if (value.schemaVersion !== PROGRAMMING_SCHEMA_VERSION) errors.push('Plan schema version is unsupported')
  if (value.kernelVersion !== PROGRAMMING_KERNEL_VERSION) errors.push('Plan kernel version is unsupported')
  if (value.policyVersion !== COMPLETE_PROGRAMMING_POLICY_VERSION) errors.push('Plan policy version is unsupported')
  if (value.evidenceReferenceVersion !== COMPLETE_PROGRAMMING_REFERENCE.referenceVersion) {
    errors.push('Plan evidence reference version is unsupported')
  }
  if (value.movementCatalogVersion !== MOVEMENT_CATALOG_VERSION) {
    errors.push('Plan movement catalog version is unsupported')
  }
  if (!isRecord(value.profileSnapshot)) {
    errors.push('Plan profile snapshot is required')
  }
  if (!Array.isArray(value.weeks)) {
    errors.push('Plan weeks are required')
  }
  if (errors.length > 0 && (!isRecord(value.profileSnapshot) || !Array.isArray(value.weeks))) {
    return { ok: false, errors, warnings }
  }

  const plan = value as unknown as CompleteProgrammingPlanDraft
  try {
    const profileValidation = validateProgrammingProfile(plan.profileSnapshot)
    errors.push(...profileValidation.errors.map(error => `Profile: ${error}`))
  } catch {
    errors.push('Plan profile snapshot is malformed')
    return { ok: false, errors: unique(errors), warnings }
  }

  if (value.adaptiveProgramming === undefined) {
    warnings.push('Legacy complete v0.3 plan has no adaptive programming trace')
  } else if (!isRecord(value.adaptiveProgramming)) {
    errors.push('Adaptive programming trace must be an object')
  } else {
    try {
      const adaptiveValidation = validateAdaptivePlanContract(
        value.adaptiveProgramming as unknown as AdaptivePlanContract,
        plan.profileSnapshot,
        plan.weeks
      )
      errors.push(...adaptiveValidation.errors.map(error => `Adaptive plan: ${error}`))
    } catch {
      errors.push('Adaptive programming trace is malformed')
    }
  }

  if (plan.weeks.length !== 8) errors.push('Complete programming plans must contain exactly 8 weeks')

  const expectedWeeks = new Set(Array.from({ length: 8 }, (_, index) => index + 1))
  const seenWeeks = new Set<number>()
  for (const week of plan.weeks) {
    if (!isRecord(week) || !Number.isInteger(week.weekNumber)) {
      errors.push('Every plan week needs an integer week number')
      continue
    }
    if (seenWeeks.has(week.weekNumber)) errors.push(`Plan repeats week ${week.weekNumber}`)
    seenWeeks.add(week.weekNumber)
    expectedWeeks.delete(week.weekNumber)
    try {
      validateWeek(plan.profileSnapshot, week as unknown as CompleteProgrammingWeekDraft, errors)
    } catch {
      errors.push(`Week ${week.weekNumber} is malformed`)
    }
  }
  if (expectedWeeks.size > 0) {
    errors.push(`Plan is missing week numbers: ${[...expectedWeeks].join(', ')}`)
  }

  return { ok: errors.length === 0, errors: unique(errors), warnings }
}

/**
 * Validates one complete weekly dose without applying the legacy eight-week
 * intent and checkpoint rules.
 */
export function validateCompleteProgrammingWeekDose(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  sessions: CompleteProgrammingSessionPrescription[]
): CompleteProgrammingPlanValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const profileValidation = validateProgrammingProfile(profile)
  errors.push(...profileValidation.errors.map(error => `Profile: ${error}`))
  if (schedule.weekNumber !== 1) {
    errors.push('Rolling weekly schedule must use week number 1 within its immutable plan version')
  }
  if (schedule.reviewRequired) {
    errors.push('Rolling weekly schedules do not embed a fixed review checkpoint')
  }
  if (sessions.length < 1) {
    errors.push('Rolling weekly dose must contain at least one actionable session')
  }
  validateSchedule(profile, {
    weekNumber: 1,
    schedule,
    sessions
  } as CompleteProgrammingWeekDraft, errors)
  return { ok: errors.length === 0, errors: unique(errors), warnings }
}

function validateWeek(
  profile: ProgrammingProfile,
  week: CompleteProgrammingWeekDraft,
  errors: string[]
): void {
  const prefix = `Week ${week.weekNumber}`
  const reviewCheckpoint = week.weekNumber === 4 || week.weekNumber === 8
  const expectedIntent = COMPLETE_PROGRAMMING_POLICY.eightWeekIntent.find(item => item.week === week.weekNumber)
  if (!expectedIntent || week.role !== expectedIntent.role || week.intent !== expectedIntent.intent) {
    errors.push(`${prefix} intent does not match the versioned programming policy`)
  }
  if (!isRecord(week.review)) {
    errors.push(`${prefix} review state is required`)
  } else if (reviewCheckpoint && week.review.status !== 'pending_athlete_review') {
    errors.push(`${prefix} must remain pending athlete review before any deload adaptation`)
  } else if (!reviewCheckpoint && week.review.status !== 'not_scheduled') {
    errors.push(`${prefix} cannot claim an unscheduled deload review`)
  }
  if (
    reviewCheckpoint
    && JSON.stringify(week.review?.adjustableStressors) !== JSON.stringify(COMPLETE_PROGRAMMING_POLICY.review.adjustableStressors)
  ) {
    errors.push(`${prefix} review must name every policy-controlled adjustable stressor`)
  }
  if (!isRecord(week.schedule)) {
    errors.push(`${prefix} schedule is required`)
    return
  }
  if (!Array.isArray(week.sessions)) {
    errors.push(`${prefix} sessions are required`)
    return
  }
  if (week.sessions.length < 2) {
    errors.push(`${prefix} must contain at least two actionable sessions`)
  }
  validateSchedule(profile, week, errors)
}

function validateSchedule(
  profile: ProgrammingProfile,
  week: CompleteProgrammingWeekDraft,
  errors: string[]
): void {
  const { schedule } = week
  const prefix = `Week ${week.weekNumber}`
  if (!Array.isArray(schedule.ledger)) errors.push(`${prefix} schedule ledger is required`)
  if (!Array.isArray(schedule.requirements)) errors.push(`${prefix} schedule requirements are required`)
  if (!Array.isArray(schedule.assignments)) errors.push(`${prefix} schedule assignments are required`)
  if (!Array.isArray(schedule.days)) errors.push(`${prefix} schedule days are required`)
  if (!Array.isArray(schedule.gaps)) errors.push(`${prefix} schedule gaps are required`)
  if (
    !Array.isArray(schedule.ledger)
    || !Array.isArray(schedule.requirements)
    || !Array.isArray(schedule.assignments)
    || !Array.isArray(schedule.days)
    || !Array.isArray(schedule.gaps)
  ) return

  if (schedule.weekNumber !== week.weekNumber) errors.push(`${prefix} schedule week number does not match`)
  if (schedule.kernelVersion !== PROGRAMMING_KERNEL_VERSION) errors.push(`${prefix} schedule kernel version is unsupported`)
  if (schedule.policyVersion !== COMPLETE_PROGRAMMING_POLICY_VERSION) errors.push(`${prefix} schedule policy version is unsupported`)
  if (schedule.movementCatalogVersion !== MOVEMENT_CATALOG_VERSION) errors.push(`${prefix} schedule catalog version is unsupported`)
  if (schedule.reviewRequired !== (week.weekNumber === 4 || week.weekNumber === 8)) {
    errors.push(`${prefix} schedule review checkpoint is incorrect`)
  }

  const profileGoalIds = new Set([
    profile.primaryGoal.id,
    ...profile.secondaryGoals.map(goal => goal.id)
  ])
  if (
    schedule.goalAllocationIds.length !== profileGoalIds.size
    || schedule.goalAllocationIds.some(id => !profileGoalIds.has(id))
  ) {
    errors.push(`${prefix} schedule goals do not match the accepted profile`)
  }

  const requirementById = new Map(schedule.requirements.map(requirement => [requirement.id, requirement]))
  const assignmentById = new Map(schedule.assignments.map(assignment => [assignment.id, assignment]))
  const gapByRequirement = new Map(schedule.gaps.map(gap => [gap.requirementId, gap]))
  if (requirementById.size !== schedule.requirements.length) errors.push(`${prefix} has duplicate coverage requirement IDs`)
  if (assignmentById.size !== schedule.assignments.length) errors.push(`${prefix} has duplicate coverage assignment IDs`)
  if (schedule.ledger.length !== schedule.requirements.length) {
    errors.push(`${prefix} ledger must account for every coverage requirement exactly once`)
  }

  for (const requirement of schedule.requirements) {
    const requirementValidation = validateWeeklyCoverageRequirement(requirement)
    errors.push(...requirementValidation.errors.map(error => (
      `${prefix} coverage ${requirement.id}: ${error}`
    )))
    if (!profileGoalIds.has(requirement.goalAllocationId)) {
      errors.push(`${prefix} coverage ${requirement.id} references an unknown goal allocation`)
    }
    const ledger = schedule.ledger.find(entry => entry.requirement.id === requirement.id)
    if (!ledger) {
      errors.push(`${prefix} coverage ${requirement.id} is missing from the ledger`)
      continue
    }
    if (JSON.stringify(ledger.requirement) !== JSON.stringify(requirement)) {
      errors.push(`${prefix} coverage ${requirement.id} ledger snapshot does not match its requirement`)
    }
    const assignments = schedule.assignments.filter(assignment => assignment.requirementId === requirement.id)
    const plannedDose = assignments.reduce((total, assignment) => total + assignment.dose, 0)
    if (plannedDose !== ledger.plannedDose) {
      errors.push(`${prefix} coverage ${requirement.id} assignment dose does not match its ledger`)
    }
    const assignmentIds = assignments.map(assignment => assignment.id).sort()
    if (JSON.stringify([...ledger.assignedSessionIds].sort()) !== JSON.stringify(assignmentIds)) {
      errors.push(`${prefix} coverage ${requirement.id} assignment references do not match its ledger`)
    }
    if (ledger.plannedDose === 0 && !gapByRequirement.has(requirement.id)) {
      errors.push(`${prefix} coverage ${requirement.id} is unassigned without an explicit gap`)
    }
    if (ledger.plannedDose > 0 && assignments.length === 0) {
      errors.push(`${prefix} coverage ${requirement.id} has planned dose without an assignment`)
    }
    const gap = gapByRequirement.get(requirement.id)
    if (ledger.unassignedReason && (!gap || gap.reason !== ledger.unassignedReason)) {
      errors.push(`${prefix} coverage ${requirement.id} gap does not match its ledger reason`)
    }
    if (gap && (!ledger.unassignedReason || !gap.detail.trim())) {
      errors.push(`${prefix} coverage ${requirement.id} gap is missing ledger provenance or detail`)
    }
  }

  for (const assignment of schedule.assignments) {
    const requirement = requirementById.get(assignment.requirementId)
    if (!requirement) {
      errors.push(`${prefix} assignment ${assignment.id} references unknown coverage`)
      continue
    }
    const day = schedule.days.find(candidate => candidate.day === assignment.day)
    if (!day?.assignmentIds.includes(assignment.id)) {
      errors.push(`${prefix} assignment ${assignment.id} is missing from its scheduled day`)
    }
    const session = week.sessions.find(candidate => candidate.day === assignment.day)
    if (!session) {
      errors.push(`${prefix} assignment ${assignment.id} has no composed session`)
      continue
    }
    validateAssignmentPrescription(prefix, assignment, requirement, session, errors)
  }

  for (const day of schedule.days) {
    const dayAssignments = schedule.assignments.filter(assignment => assignment.day === day.day)
    const remainingMinutes = day.usableMinutes - dayAssignments.reduce(
      (total, assignment) => total + assignment.estimatedMinutes,
      0
    )
    if (day.remainingMinutes !== remainingMinutes || remainingMinutes < 0) {
      errors.push(`${prefix} ${day.day} coverage time is not fully accounted for`)
    }
    const expectedIds = dayAssignments.map(assignment => assignment.id).sort()
    if (JSON.stringify([...day.assignmentIds].sort()) !== JSON.stringify(expectedIds)) {
      errors.push(`${prefix} ${day.day} assignment list does not match the schedule`)
    }
  }

  const eligibility = eligibilityForProfile(profile)
  const sessionDays = week.sessions.map(session => session.day)
  const sessionIds = week.sessions.map(session => session.sessionId)
  if (new Set(sessionDays).size !== sessionDays.length) errors.push(`${prefix} has duplicate composed session days`)
  if (new Set(sessionIds).size !== sessionIds.length) errors.push(`${prefix} has duplicate composed session IDs`)
  for (const session of week.sessions) {
    validateSession(profile, schedule, session, eligibility, errors)
  }
}

function validateAssignmentPrescription(
  prefix: string,
  assignment: WeeklyCoverageAssignment,
  requirement: WeeklyCoverageRequirement,
  session: CompleteProgrammingSessionPrescription,
  errors: string[]
): void {
  const matches = session.blocks.slice(1).flatMap(block => block.exercises)
    .filter(exercise => exercise.coverageRequirementIds.includes(requirement.id))
  if (matches.length !== 1) {
    errors.push(`${prefix} assignment ${assignment.id} must map to exactly one work prescription`)
    return
  }
  const prescribedDose = doseAmount(matches[0].dose, assignment.unit)
  if (prescribedDose !== assignment.dose) {
    errors.push(`${prefix} assignment ${assignment.id} dose is not preserved in its prescription`)
  }
}

function validateSession(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  session: CompleteProgrammingSessionPrescription,
  eligibility: MovementEligibilityContext,
  errors: string[]
): void {
  const label = `Week ${session.weekNumber} ${session.day}`
  const scheduledDay = schedule.days.find(day => day.day === session.day)
  if (!scheduledDay) errors.push(`${label} is not present in the accepted schedule`)
  if (session.weekNumber !== schedule.weekNumber) errors.push(`${label} has a mismatched week number`)
  if (session.format !== 'complete_programming_v0_3') errors.push(`${label} has an unsupported session format`)
  if (session.kernelVersion !== PROGRAMMING_KERNEL_VERSION) errors.push(`${label} has an unsupported kernel version`)
  if (session.policyVersion !== COMPLETE_PROGRAMMING_POLICY_VERSION) errors.push(`${label} has an unsupported policy version`)
  if (session.evidenceReferenceVersion !== COMPLETE_PROGRAMMING_REFERENCE.referenceVersion) errors.push(`${label} has an unsupported evidence version`)
  if (session.movementCatalogVersion !== MOVEMENT_CATALOG_VERSION) errors.push(`${label} has an unsupported catalog version`)
  if (session.blocks[0]?.role !== 'specific_preparation') {
    errors.push(`${label} must begin with specific preparation`)
  }
  if (session.blocks[1]?.role !== 'priority_adaptation') {
    errors.push(`${label} must place the priority adaptation immediately after preparation`)
  }
  const composedMinutes = session.blocks.reduce((total, block) => total + block.estimatedMinutes, 0)
  if (composedMinutes > session.scheduledMinutes || session.scheduledMinutes !== scheduledDay?.sessionMinutes) {
    errors.push(`${label} exceeds its accepted time budget`)
  }

  const requirementById = new Map(schedule.requirements.map(requirement => [requirement.id, requirement]))
  for (let blockIndex = 0; blockIndex < session.blocks.length; blockIndex += 1) {
    const block = session.blocks[blockIndex]
    if (block.exercises.length === 0) errors.push(`${label} block ${block.id} has no actionable exercise`)
    const exerciseMinutes = block.exercises.reduce((total, exercise) => total + exercise.estimatedMinutes, 0)
    if (exerciseMinutes !== block.estimatedMinutes) errors.push(`${label} block ${block.id} minutes are not accounted for`)
    const exerciseCoverage = unique(block.exercises.flatMap(exercise => exercise.coverageRequirementIds)).sort()
    if (JSON.stringify([...block.coverageRequirementIds].sort()) !== JSON.stringify(exerciseCoverage)) {
      errors.push(`${label} block ${block.id} coverage does not match its exercises`)
    }
    for (const exercise of block.exercises) {
      validateExercise(profile, label, block.role, exercise, requirementById, eligibility, errors)
    }
  }


  const firstHighFatigueIndex = session.blocks.findIndex((block, index) => (
    index > 1 && block.exercises.some(exercise => exercise.fatigueCost === 'high')
  ))
  const performanceIndex = session.blocks.findIndex(block => block.coverageRequirementIds.some(id => (
    requirementById.get(id)?.kind === 'performance_quality'
  )))
  if (firstHighFatigueIndex >= 0 && performanceIndex > firstHighFatigueIndex) {
    errors.push(`${label} places speed or power after avoidable high-fatigue work`)
  }

  for (const assignment of schedule.assignments.filter(candidate => candidate.day === session.day)) {
    const requirement = requirementById.get(assignment.requirementId)
    if (!requirement) continue
    const requirementIndex = session.blocks.findIndex(block => block.coverageRequirementIds.includes(requirement.id))
    for (const precededKind of requirement.sequencing.mustPrecedeKinds) {
      const otherIndex = session.blocks.findIndex(block => block.coverageRequirementIds.some(id => (
        requirementById.get(id)?.kind === precededKind
      )))
      if (otherIndex >= 0 && requirementIndex >= otherIndex) {
        errors.push(`${label} places ${requirement.targetId} after work it must precede`)
      }
    }
  }
}

function validateExercise(
  profile: ProgrammingProfile,
  label: string,
  blockRole: CompleteProgrammingExercisePrescription['role'],
  exercise: CompleteProgrammingExercisePrescription,
  requirementById: Map<string, WeeklyCoverageRequirement>,
  eligibility: MovementEligibilityContext,
  errors: string[]
): void {
  const movement = MOVEMENT_CATALOG.find(candidate => candidate.id === exercise.movementId)
  const exerciseLabel = `${label} ${exercise.movementId}`
  if (!movement) {
    errors.push(`${exerciseLabel} references an unknown movement`)
    return
  }
  if (!isMovementEligible(movement, eligibility)) errors.push(`${exerciseLabel} violates equipment, experience, or constraint eligibility`)
  if (exercise.role !== blockRole) errors.push(`${exerciseLabel} role does not match its block`)
  if (exercise.coverageRequirementIds.length === 0) errors.push(`${exerciseLabel} has no coverage requirement`)
  const requirements = exercise.coverageRequirementIds.map(id => requirementById.get(id))
  if (requirements.some(requirement => !requirement)) errors.push(`${exerciseLabel} references unknown coverage`)
  if (!exercise.intent.trim() || !exercise.successCondition.trim() || !exercise.stopCondition.trim()) {
    errors.push(`${exerciseLabel} is missing intent, success, or stop guidance`)
  }
  if (!exercise.substitutionGuidance.trim()) errors.push(`${exerciseLabel} is missing substitution guidance`)
  if (!validRange(exercise.restSeconds) || !isRecord(exercise.executionTarget)) {
    errors.push(`${exerciseLabel} is missing rest or execution-target detail`)
  }
  if (exercise.evidenceRuleIds.length === 0 || exercise.policyVersion !== COMPLETE_PROGRAMMING_POLICY_VERSION) {
    errors.push(`${exerciseLabel} is missing policy or evidence provenance`)
  }
  validateDose(exerciseLabel, exercise, errors)
  validateLoad(profile, exerciseLabel, exercise, errors)

  const coverage = requirements.filter((item): item is WeeklyCoverageRequirement => Boolean(item))
    .map(requirement => ({ kind: requirement.kind, targetId: requirement.targetId }))
  const domain = requirements.find((item): item is WeeklyCoverageRequirement => Boolean(item))?.domain
  if (domain) {
    if (
      !movement.domains.includes(domain)
      || coverage.some(tag => !movement.coverage.some(candidate => (
        candidate.kind === tag.kind && candidate.targetId === tag.targetId
      )))
    ) {
      errors.push(`${exerciseLabel} does not own its required domain and coverage`)
    }
    const allowed = new Set(findMovementSubstitutions({
      movementId: movement.id,
      domain,
      requiredCoverage: coverage,
      eligibility
    }).map(candidate => candidate.id))
    for (const substitutionId of exercise.substitutionMovementIds) {
      if (!allowed.has(substitutionId)) {
        errors.push(`${exerciseLabel} substitution ${substitutionId} does not preserve required coverage`)
      }
    }
  }
  if (
    exercise.substitutionMovementIds.length === 0
    && !exercise.substitutionGuidance.startsWith('No equivalent eligible substitution')
  ) {
    errors.push(`${exerciseLabel} must explicitly state when no equivalent substitution exists`)
  }
}

function validateDose(
  label: string,
  exercise: CompleteProgrammingExercisePrescription,
  errors: string[]
): void {
  const dose = exercise.dose
  if (!isRecord(dose)) {
    errors.push(`${label} dose is required`)
    return
  }
  if (dose.kind === 'intervals') {
    if (
      !validRange(dose.workSeconds)
      || !validRange(dose.recoverySeconds)
      || !validRange(dose.repetitions)
      || !validRange(dose.series)
      || !validRange(dose.seriesRecoverySeconds)
      || !positiveNumber(dose.totalIntervals)
    ) {
      errors.push(`${label} interval dose must define work, recovery, repetitions, series, total intervals, and series recovery`)
    }
  } else if (dose.kind === 'sets_reps') {
    if (!validRange(dose.sets) || !validRange(dose.repetitions)) errors.push(`${label} sets and repetitions must be complete`)
  } else if (dose.kind === 'quality_repetitions') {
    if (!validRange(dose.series) || !validRange(dose.repetitionsPerSeries) || !positiveNumber(dose.totalRepetitions)) {
      errors.push(`${label} quality-repetition dose must define series, repetitions, and total repetitions`)
    }
  } else if (dose.kind === 'continuous') {
    if (!validRange(dose.durationMinutes)) errors.push(`${label} continuous dose must define duration`)
  } else {
    errors.push(`${label} dose kind is unsupported`)
  }
}

function validateLoad(
  profile: ProgrammingProfile,
  label: string,
  exercise: CompleteProgrammingExercisePrescription,
  errors: string[]
): void {
  if (!exercise.loadAnchor) return
  if (exercise.loadAnchor.source === 'saved_assessment') {
    const assessmentId = exercise.loadAnchor.assessmentId
    const assessment = profile.assessments.find(candidate => candidate.id === assessmentId)
    if (!assessment) {
      errors.push(`${label} references an unavailable assessment for prescribed load`)
    }
    if (
      !validRange(exercise.loadAnchor.percentRange)
      || exercise.loadAnchor.percentRange.min < COMPLETE_PROGRAMMING_POLICY.composition.startingStrengthPercentEstimatedOneRepMax.min
      || exercise.loadAnchor.percentRange.max > COMPLETE_PROGRAMMING_POLICY.composition.startingStrengthPercentEstimatedOneRepMax.max
      || !validRange(exercise.loadAnchor.loadRange)
    ) {
      errors.push(`${label} prescribed load is outside the deterministic policy anchor`)
    }
    if (assessment) {
      const assessmentMovements = getMovementsByAssessmentAlias(assessment.movement)
      if (
        assessmentMovements.length !== 1
        || assessmentMovements[0].id !== exercise.movementId
      ) {
        errors.push(`${label} prescribed load is not anchored to an unambiguous matching movement assessment`)
      }
      if (validRange(exercise.loadAnchor.percentRange) && validRange(exercise.loadAnchor.loadRange)) {
        const increment = COMPLETE_PROGRAMMING_POLICY.composition.loadRoundingIncrement[assessment.unit]
        const expectedMin = roundLoad(
          assessment.estimatedOneRepMax * exercise.loadAnchor.percentRange.min / 100,
          increment
        )
        const expectedMax = roundLoad(
          assessment.estimatedOneRepMax * exercise.loadAnchor.percentRange.max / 100,
          increment
        )
        if (
          exercise.loadAnchor.loadRange.unit !== assessment.unit
          || exercise.loadAnchor.loadRange.min !== expectedMin
          || exercise.loadAnchor.loadRange.max !== expectedMax
        ) {
          errors.push(`${label} prescribed load does not match its assessment and rounding policy`)
        }
      }
    }
  } else if (!exercise.loadAnchor.priorSessionId || !validRange(exercise.loadAnchor.loadRange)) {
    errors.push(`${label} accepted-program load is missing immutable prior-session provenance`)
  }
}

function eligibilityForProfile(profile: ProgrammingProfile): MovementEligibilityContext {
  const equipment = new Set<string>(MOVEMENT_EQUIPMENT_IDS)
  return {
    availableEquipmentIds: profile.equipment.resolvedIds.filter(
      (id): id is MovementEquipmentId => equipment.has(id)
    ),
    trainingExperience: profile.trainingExperience,
    assessedMovementIds: unique(profile.assessments.flatMap(assessment => (
      getMovementsByAssessmentAlias(assessment.movement).map(movement => movement.id)
    ))),
    noOverhead: profile.explicitConstraints.some(constraint => constraint.kind === 'no_overhead'),
    noRunning: profile.explicitConstraints.some(constraint => constraint.kind === 'no_running')
  }
}

function doseAmount(dose: CompleteProgrammingDose, unit: WeeklyCoverageAssignment['unit']): number | null {
  if (unit === 'working_sets' && dose.kind === 'sets_reps' && dose.sets.min === dose.sets.max) return dose.sets.min
  if (unit === 'quality_repetitions' && dose.kind === 'quality_repetitions') return dose.totalRepetitions ?? null
  if (unit === 'minutes' && dose.kind === 'continuous' && dose.durationMinutes.min === dose.durationMinutes.max) return dose.durationMinutes.min
  if (unit === 'intervals' && dose.kind === 'intervals') return dose.totalIntervals ?? null
  return null
}

function validRange(value: unknown): value is { min: number; max: number } {
  return isRecord(value)
    && typeof value.min === 'number'
    && typeof value.max === 'number'
    && Number.isFinite(value.min)
    && Number.isFinite(value.max)
    && value.min >= 0
    && value.max >= value.min
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function roundLoad(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
