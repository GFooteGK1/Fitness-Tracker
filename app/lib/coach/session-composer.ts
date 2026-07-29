import {
  MOVEMENT_CATALOG_VERSION,
  MOVEMENT_EQUIPMENT_IDS,
  findEligibleMovements,
  findMovementSubstitutions,
  type MovementDefinition,
  type MovementEligibilityContext,
  type MovementEquipmentId
} from './movement-catalog'
import {
  COMPLETE_PROGRAMMING_POLICY,
  COMPLETE_PROGRAMMING_POLICY_VERSION,
  getDoseAnchor,
  getSessionTimeBudget,
  type ProgrammingDoseAnchor
} from './programming-policy'
import { COMPLETE_PROGRAMMING_REFERENCE } from './programming-reference'
import {
  PROGRAMMING_KERNEL_VERSION,
  type CompleteProgrammingBlockPrescription,
  type CompleteProgrammingDose,
  type CompleteProgrammingExercisePrescription,
  type CompleteProgrammingSessionPrescription,
  type NumericRange,
  type ProgrammingGoalAllocation,
  type ProgrammingLoadAnchor,
  type ProgrammingProfile,
  type ProgrammingSessionBlockRole,
  type WeeklyCoverageKind,
  type WeeklyCoveragePriority,
  type WeeklyCoverageRequirement
} from './programming-schema'
import type {
  WeeklyCoverageAssignment,
  WeeklyCoverageAssessmentMatch,
  WeeklyCoverageSchedule
} from './weekly-coverage'
import type { CoachStrengthAssessmentSummary, TrainingWeekday } from './types'

export interface SessionCompositionResult {
  sessions: CompleteProgrammingSessionPrescription[]
  uncomposedAvailableDays: Array<{
    day: TrainingWeekday
    reason: 'no_assigned_coverage'
  }>
}

interface SelectedMovement {
  movement: MovementDefinition
  reasons: string[]
  substitutions: string[]
}

const PRIORITY_RANK: Record<WeeklyCoveragePriority, number> = {
  priority: 0,
  secondary: 1,
  supporting: 2
}

const KIND_RANK: Record<WeeklyCoverageKind, number> = {
  performance_quality: 0,
  movement_pattern: 1,
  muscle_region: 2,
  resilience_capacity: 3,
  energy_system: 4
}

export function composeWeeklySessions(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule
): SessionCompositionResult {
  validateCompositionInputs(profile, schedule)

  const requirementById = new Map(schedule.requirements.map(requirement => [
    requirement.id,
    requirement
  ]))
  const eligibility = buildEligibilityContext(profile, schedule)
  const sessions: CompleteProgrammingSessionPrescription[] = []
  const uncomposedAvailableDays: SessionCompositionResult['uncomposedAvailableDays'] = []

  for (const day of schedule.days) {
    const assignments = schedule.assignments.filter(assignment => assignment.day === day.day)
    if (assignments.length === 0) {
      uncomposedAvailableDays.push({ day: day.day, reason: 'no_assigned_coverage' })
      continue
    }

    const sortedAssignments = [...assignments].sort((left, right) => {
      const leftRequirement = requireRequirement(requirementById, left.requirementId)
      const rightRequirement = requireRequirement(requirementById, right.requirementId)
      return goalRank(profile, left.goalAllocationId) - goalRank(profile, right.goalAllocationId)
        || PRIORITY_RANK[leftRequirement.priority] - PRIORITY_RANK[rightRequirement.priority]
        || KIND_RANK[leftRequirement.kind] - KIND_RANK[rightRequirement.kind]
        || left.requirementId.localeCompare(right.requirementId)
    })
    const selected = sortedAssignments.map(assignment => {
      const requirement = requireRequirement(requirementById, assignment.requirementId)
      return {
        assignment,
        requirement,
        selected: selectMovement(profile, schedule, assignment, requirement, eligibility)
      }
    })
    const lead = selected[0]
    const preparationMinutes = getSessionTimeBudget(day.sessionMinutes).specificPreparationMinutes
    const preparation = buildPreparationBlock(
      lead.requirement,
      lead.selected,
      preparationMinutes
    )
    const workBlocks = selected.map((item, index) => buildWorkBlock(
      profile,
      schedule,
      item.assignment,
      item.requirement,
      item.selected,
      index === 0
        ? 'priority_adaptation'
        : roleForAssignment(profile, item.assignment, item.requirement)
    ))
    const titleTargets = selected.slice(0, 2).map(item => item.requirement.targetLabel)

    const blocks = [preparation, ...workBlocks]
    const composedMinutes = blocks.reduce((total, block) => total + block.estimatedMinutes, 0)
    if (composedMinutes > day.sessionMinutes) {
      throw new Error(`Composed session exceeds the accepted budget for ${day.day}`)
    }

    sessions.push({
      schemaVersion: 1,
      format: 'complete_programming_v0_3',
      kernelVersion: PROGRAMMING_KERNEL_VERSION,
      policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
      evidenceReferenceVersion: COMPLETE_PROGRAMMING_REFERENCE.referenceVersion,
      movementCatalogVersion: MOVEMENT_CATALOG_VERSION,
      weekNumber: schedule.weekNumber,
      day: day.day,
      sessionId: `week:${schedule.weekNumber}:${day.day}`,
      domain: lead.requirement.domain,
      title: titleTargets.join(' + '),
      intent: lead.requirement.targetLabel,
      scheduledMinutes: day.sessionMinutes,
      blocks
    })
  }

  return { sessions, uncomposedAvailableDays }
}

function buildPreparationBlock(
  requirement: WeeklyCoverageRequirement,
  selected: SelectedMovement,
  minutes: number
): CompleteProgrammingBlockPrescription {
  const exercise: CompleteProgrammingExercisePrescription = {
    movementId: selected.movement.id,
    movementName: `${selected.movement.name} preparation`,
    role: 'specific_preparation',
    coverageRequirementIds: [requirement.id],
    intent: `Rehearse the positions, range, rhythm, or output needed for ${requirement.targetLabel.toLowerCase()}.`,
    dose: {
      kind: 'continuous',
      durationMinutes: exactRange(minutes)
    },
    executionTarget: {
      kind: 'quality',
      cue: preparationCue(requirement.kind)
    },
    restSeconds: { min: 0, max: 60 },
    successCondition: 'Finish ready to reproduce the priority movement without preparation fatigue.',
    stopCondition: 'Reduce range, speed, or complexity if the rehearsal becomes less controlled.',
    substitutionMovementIds: [...selected.substitutions],
    substitutionGuidance: substitutionGuidance(selected.substitutions),
    selectionReasons: [`Directly rehearses ${selected.movement.name} before its priority exposure.`],
    estimatedMinutes: minutes,
    fatigueCost: 'low',
    evidenceRuleIds: ['session.specific-preparation', 'time.preserve-priority'],
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION
  }
  return {
    id: `block:preparation:${requirement.id}`,
    role: 'specific_preparation',
    coverageRequirementIds: [requirement.id],
    intent: exercise.intent,
    instructions: [exercise.executionTarget.kind === 'quality' ? exercise.executionTarget.cue : 'Rehearse the task.'],
    exercises: [exercise],
    estimatedMinutes: minutes
  }
}

function buildWorkBlock(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  assignment: WeeklyCoverageAssignment,
  requirement: WeeklyCoverageRequirement,
  selected: SelectedMovement,
  role: ProgrammingSessionBlockRole
): CompleteProgrammingBlockPrescription {
  const anchor = getDoseAnchor(assignment.doseAnchorId as Parameters<typeof getDoseAnchor>[0])
  const loadAnchor = loadAnchorForSelection(
    profile,
    schedule,
    requirement,
    selected.movement,
    anchor
  )
  const exercise: CompleteProgrammingExercisePrescription = {
    movementId: selected.movement.id,
    movementName: selected.movement.name,
    role,
    coverageRequirementIds: [requirement.id],
    intent: selected.movement.intent,
    dose: doseForAssignment(anchor, assignment.dose),
    ...(loadAnchor ? { loadAnchor } : {}),
    executionTarget: cloneExecutionTarget(anchor.executionTarget),
    restSeconds: { ...anchor.restSeconds },
    successCondition: anchor.successCondition,
    stopCondition: anchor.stopCondition,
    substitutionMovementIds: [...selected.substitutions],
    substitutionGuidance: substitutionGuidance(selected.substitutions),
    selectionReasons: [...selected.reasons],
    estimatedMinutes: assignment.estimatedMinutes,
    fatigueCost: requirement.fatigueCost,
    evidenceRuleIds: unique([...requirement.evidenceRuleIds, ...anchor.evidenceRuleIds]),
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION
  }
  return {
    id: `block:${assignment.id}`,
    role,
    coverageRequirementIds: [requirement.id],
    intent: `${requirement.targetLabel}: ${selected.movement.intent}`,
    instructions: [
      anchor.successCondition,
      anchor.stopCondition
    ],
    exercises: [exercise],
    estimatedMinutes: assignment.estimatedMinutes
  }
}

function selectMovement(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  assignment: WeeklyCoverageAssignment,
  requirement: WeeklyCoverageRequirement,
  eligibility: MovementEligibilityContext
): SelectedMovement {
  const coverage = [{ kind: requirement.kind, targetId: requirement.targetId }]
  const candidates = findEligibleMovements({
    domain: requirement.domain,
    requiredCoverage: coverage,
    eligibility
  })
  if (candidates.length === 0) {
    throw new Error(`No eligible movement for assigned coverage: ${requirement.id}`)
  }

  const scored = candidates.map(movementDefinition => ({
    movement: movementDefinition,
    score: movementScore(profile, schedule, requirement, movementDefinition)
  })).sort((left, right) => (
    right.score - left.score || left.movement.id.localeCompare(right.movement.id)
  ))
  const movementDefinition = scored[0].movement
  const preference = profile.preferences.find(candidate => candidate.movementId === movementDefinition.id)
  const exactAssessment = unambiguousAssessmentMatch(schedule, requirement.id, movementDefinition.id)
  const reasons = [
    `Fills ${requirement.kind.replaceAll('_', ' ')}: ${requirement.targetLabel}.`,
    ...(exactAssessment ? ['Matches an unambiguous saved assessment.'] : []),
    ...(preference?.preference === 'prefer' ? ['Matches an athlete-confirmed movement preference.'] : []),
    ...(profile.recentTraining.performedMovementIds.includes(movementDefinition.id)
      ? ['Keeps a recently performed movement to limit unnecessary novelty.']
      : [])
  ]
  const substitutions = findMovementSubstitutions({
    movementId: movementDefinition.id,
    domain: requirement.domain,
    requiredCoverage: coverage,
    eligibility
  }).sort((left, right) => (
    movementScore(profile, schedule, requirement, right)
    - movementScore(profile, schedule, requirement, left)
    || left.id.localeCompare(right.id)
  ))

  return {
    movement: movementDefinition,
    reasons,
    substitutions: substitutions.slice(0, 3).map(candidate => candidate.id)
  }
}

function movementScore(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  requirement: WeeklyCoverageRequirement,
  movementDefinition: MovementDefinition
): number {
  const scores = COMPLETE_PROGRAMMING_POLICY.composition.selectionScore
  const preference = profile.preferences.find(candidate => candidate.movementId === movementDefinition.id)
  return scores.lowerFatigue[movementDefinition.fatigueCost]
    + (unambiguousAssessmentMatch(schedule, requirement.id, movementDefinition.id)
      ? scores.unambiguousAssessment : 0)
    + (preference?.preference === 'prefer' ? scores.preferredMovement : 0)
    + (preference?.preference === 'avoid' ? scores.avoidedMovement : 0)
    + (profile.recentTraining.performedMovementIds.includes(movementDefinition.id)
      ? scores.recentlyPerformedMovement : 0)
}

function roleForAssignment(
  profile: ProgrammingProfile,
  assignment: WeeklyCoverageAssignment,
  requirement: WeeklyCoverageRequirement
): ProgrammingSessionBlockRole {
  if (requirement.kind === 'energy_system') return 'conditioning'
  if (assignment.goalAllocationId !== profile.primaryGoal.id) return 'secondary_adaptation'
  if (requirement.priority === 'supporting' || requirement.kind === 'resilience_capacity') {
    return 'assistance_and_capacity'
  }
  return 'secondary_adaptation'
}

function doseForAssignment(
  anchor: ProgrammingDoseAnchor,
  plannedDose: number
): CompleteProgrammingDose {
  const dose = anchor.dose
  if (dose.kind === 'sets_reps') {
    return {
      kind: 'sets_reps',
      sets: exactRange(plannedDose),
      repetitions: { ...dose.repetitions }
    }
  }
  if (dose.kind === 'quality_repetitions') {
    const structure = seriesAndRepetitions(
      plannedDose,
      dose.series,
      dose.repetitionsPerSeries
    )
    return {
      kind: 'quality_repetitions',
      totalRepetitions: plannedDose,
      series: exactRange(structure.series),
      repetitionsPerSeries: structure.repetitions,
      workSeconds: dose.workSeconds ? { ...dose.workSeconds } : null
    }
  }
  if (dose.kind === 'continuous') {
    return {
      kind: 'continuous',
      durationMinutes: exactRange(plannedDose)
    }
  }
  const structure = seriesAndRepetitions(
    plannedDose,
    dose.series,
    dose.repetitions
  )
  return {
    kind: 'intervals',
    totalIntervals: plannedDose,
    workSeconds: { ...dose.workSeconds },
    recoverySeconds: { ...dose.recoverySeconds },
    repetitions: structure.repetitions,
    series: exactRange(structure.series),
    seriesRecoverySeconds: { ...dose.seriesRecoverySeconds }
  }
}

function seriesAndRepetitions(
  total: number,
  seriesRange: NumericRange,
  repetitionRange: NumericRange
): { series: number; repetitions: NumericRange } {
  for (let series = seriesRange.min; series <= seriesRange.max; series += 1) {
    if (total % series !== 0) continue
    const repetitions = total / series
    if (repetitions >= repetitionRange.min && repetitions <= repetitionRange.max) {
      return { series, repetitions: exactRange(repetitions) }
    }
  }
  const series = clamp(
    Math.round(total / ((repetitionRange.min + repetitionRange.max) / 2)),
    seriesRange.min,
    seriesRange.max
  )
  return {
    series,
    repetitions: {
      min: Math.max(repetitionRange.min, Math.floor(total / series)),
      max: Math.min(repetitionRange.max, Math.ceil(total / series))
    }
  }
}

function loadAnchorForSelection(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule,
  requirement: WeeklyCoverageRequirement,
  movementDefinition: MovementDefinition,
  anchor: ProgrammingDoseAnchor
): ProgrammingLoadAnchor | undefined {
  if (!anchor.loadPercentEstimatedOneRepMax) return undefined
  const match = unambiguousAssessmentMatch(schedule, requirement.id, movementDefinition.id)
  if (!match) return undefined
  const assessment = profile.assessments.find(candidate => candidate.id === match.assessmentId)
  if (!assessment) return undefined

  const percentRange = COMPLETE_PROGRAMMING_POLICY.composition.startingStrengthPercentEstimatedOneRepMax
  const boundedPercentRange = {
    min: Math.max(anchor.loadPercentEstimatedOneRepMax.min, percentRange.min),
    max: Math.min(anchor.loadPercentEstimatedOneRepMax.max, percentRange.max)
  }
  const increment = COMPLETE_PROGRAMMING_POLICY.composition.loadRoundingIncrement[assessment.unit]
  return {
    source: 'saved_assessment',
    assessmentId: assessment.id,
    percentRange: boundedPercentRange,
    loadRange: {
      min: roundLoad(assessment.estimatedOneRepMax * boundedPercentRange.min / 100, increment),
      max: roundLoad(assessment.estimatedOneRepMax * boundedPercentRange.max / 100, increment),
      unit: assessment.unit
    }
  }
}

function unambiguousAssessmentMatch(
  schedule: WeeklyCoverageSchedule,
  requirementId: string,
  movementId: string
): WeeklyCoverageAssessmentMatch | undefined {
  return schedule.assessmentMatchesByRequirement[requirementId]?.find(match => (
    match.unambiguous && match.movementIds.includes(movementId)
  ))
}

function buildEligibilityContext(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule
): MovementEligibilityContext {
  const knownEquipment = new Set<string>(MOVEMENT_EQUIPMENT_IDS)
  return {
    availableEquipmentIds: profile.equipment.resolvedIds.filter(
      (id): id is MovementEquipmentId => knownEquipment.has(id)
    ),
    trainingExperience: profile.trainingExperience,
    assessedMovementIds: unique(Object.values(schedule.assessmentMatchesByRequirement)
      .flatMap(matches => matches.flatMap(match => match.movementIds))),
    noOverhead: profile.explicitConstraints.some(constraint => constraint.kind === 'no_overhead'),
    noRunning: profile.explicitConstraints.some(constraint => constraint.kind === 'no_running')
  }
}

function validateCompositionInputs(
  profile: ProgrammingProfile,
  schedule: WeeklyCoverageSchedule
): void {
  if (schedule.kernelVersion !== PROGRAMMING_KERNEL_VERSION) {
    throw new Error('Coverage schedule kernel version is incompatible')
  }
  if (schedule.policyVersion !== COMPLETE_PROGRAMMING_POLICY_VERSION) {
    throw new Error('Coverage schedule policy version is incompatible')
  }
  const goalIds = new Set([profile.primaryGoal.id, ...profile.secondaryGoals.map(goal => goal.id)])
  if (schedule.goalAllocationIds.some(id => !goalIds.has(id))) {
    throw new Error('Coverage schedule goals do not match the programming profile')
  }
}

function requireRequirement(
  requirements: Map<string, WeeklyCoverageRequirement>,
  id: string
): WeeklyCoverageRequirement {
  const requirement = requirements.get(id)
  if (!requirement) throw new Error(`Coverage assignment references an unknown requirement: ${id}`)
  return requirement
}

function goalRank(profile: ProgrammingProfile, goalAllocationId: string): number {
  if (goalAllocationId === profile.primaryGoal.id) return 0
  const goal = profile.secondaryGoals.find(candidate => candidate.id === goalAllocationId)
  return goal?.allocation === 'development' ? 1 : 2
}

function preparationCue(kind: WeeklyCoverageKind): string {
  if (kind === 'performance_quality') return 'Build from low output to crisp task-specific speed without fatigue.'
  if (kind === 'energy_system') return 'Build gradually in the selected modality until breathing and mechanics are settled.'
  return 'Rehearse the exact range and positions with light, controlled repetitions.'
}

function substitutionGuidance(substitutionMovementIds: string[]): string {
  return substitutionMovementIds.length > 0
    ? 'Use only a listed movement that preserves the same adaptation and coverage target.'
    : 'No equivalent eligible substitution is available; revise the weekly plan instead of changing the intent.'
}

function cloneExecutionTarget(
  target: ProgrammingDoseAnchor['executionTarget']
): ProgrammingDoseAnchor['executionTarget'] {
  if (target.kind === 'rir' || target.kind === 'rpe') {
    return { ...target, range: { ...target.range } }
  }
  return { ...target }
}

function exactRange(value: number): NumericRange {
  return { min: value, max: value }
}

function roundLoad(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
