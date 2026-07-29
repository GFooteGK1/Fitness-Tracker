import {
  MOVEMENT_CATALOG,
  MOVEMENT_CATALOG_VERSION,
  MOVEMENT_EQUIPMENT_IDS,
  findEligibleMovements,
  getMovementsByAssessmentAlias,
  type MovementCoverageTag,
  type MovementDefinition,
  type MovementEligibilityContext,
  type MovementEquipmentId,
  type MovementSkillLevel
} from './movement-catalog'
import {
  COMPLETE_PROGRAMMING_POLICY,
  COMPLETE_PROGRAMMING_POLICY_VERSION,
  getDoseAnchor,
  getSessionTimeBudget,
  type ProgrammingDoseAnchor,
  type WeeklyCoverageTemplatePolicy
} from './programming-policy'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  validateProgrammingProfile,
  validateWeeklyCoverageRequirement,
  type ProgrammingGoalAllocation,
  type ProgrammingProfile,
  type WeeklyCoverageDoseUnit,
  type WeeklyCoverageKind,
  type WeeklyCoverageLedgerEntry,
  type WeeklyCoveragePriority,
  type WeeklyCoverageRequirement
} from './programming-schema'
import type { TrainingExperience, TrainingWeekday } from './types'

export type WeeklyCoverageGapReason = NonNullable<WeeklyCoverageLedgerEntry['unassignedReason']>

export interface WeeklyCoverageAssignment {
  id: string
  requirementId: string
  goalAllocationId: string
  targetId: string
  kind: WeeklyCoverageKind
  day: TrainingWeekday
  dose: number
  unit: WeeklyCoverageDoseUnit
  doseAnchorId: string
  estimatedMinutes: number
  mustPrecedeKinds: WeeklyCoverageKind[]
}

export interface WeeklyCoverageDay {
  day: TrainingWeekday
  sessionMinutes: number
  usableMinutes: number
  remainingMinutes: number
  assignmentIds: string[]
}

export interface WeeklyCoverageGap {
  requirementId: string
  targetId: string
  status: 'omitted' | 'reduced'
  reason: WeeklyCoverageGapReason
  detail: string
}

export interface WeeklyCoverageSchedule {
  schemaVersion: 1
  kernelVersion: string
  policyVersion: string
  movementCatalogVersion: string
  weekNumber: number
  reviewRequired: boolean
  goalAllocationIds: string[]
  requirements: WeeklyCoverageRequirement[]
  ledger: WeeklyCoverageLedgerEntry[]
  assignments: WeeklyCoverageAssignment[]
  days: WeeklyCoverageDay[]
  gaps: WeeklyCoverageGap[]
  assessmentCandidateIdsByRequirement: Record<string, string[]>
  assessmentMatchesByRequirement: Record<string, WeeklyCoverageAssessmentMatch[]>
}

export interface WeeklyCoverageAssessmentMatch {
  assessmentId: string
  movementIds: string[]
  unambiguous: boolean
}

export interface BuildWeeklyCoverageOptions {
  weekNumber?: number
}

interface PlannedRequirement {
  requirement: WeeklyCoverageRequirement
  template: WeeklyCoverageTemplatePolicy
  goal: ProgrammingGoalAllocation
  minimumExposures: number
  desiredExposures: number
  eligibleMovements: MovementDefinition[]
}

interface InternalAssignment extends WeeklyCoverageAssignment {
  incompatibleTargetIds: string[]
}

interface InternalDay extends WeeklyCoverageDay {
  internalAssignments: InternalAssignment[]
}

const WEEKDAY_INDEX: Record<TrainingWeekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
}

const PRIORITY_RANK: Record<WeeklyCoveragePriority, number> = {
  priority: 0,
  secondary: 1,
  supporting: 2
}

export function buildWeeklyCoverageSchedule(
  profile: ProgrammingProfile,
  options: BuildWeeklyCoverageOptions = {}
): WeeklyCoverageSchedule {
  const profileValidation = validateProgrammingProfile(profile)
  if (!profileValidation.ok) throw new Error(profileValidation.errors.join('; '))

  const weekNumber = options.weekNumber ?? 1
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 8) {
    throw new Error('weekNumber must be an integer from 1 through 8')
  }

  const assessedMovementIds = unique(profile.assessments.flatMap(assessment => (
    getMovementsByAssessmentAlias(assessment.movement).map(movementDefinition => movementDefinition.id)
  )))
  const eligibility = buildEligibilityContext(profile, assessedMovementIds)
  const plannedRequirements = buildRequirements(profile, eligibility)
  const days: InternalDay[] = profile.sessionAvailability.map(({ day, minutes }) => {
    const budget = getSessionTimeBudget(minutes)
    const usableMinutes = budget.priorityAdaptationMinutes + budget.flexibleMinutes
    return {
      day,
      sessionMinutes: minutes,
      usableMinutes,
      remainingMinutes: usableMinutes,
      assignmentIds: [],
      internalAssignments: []
    }
  })
  const gaps: WeeklyCoverageGap[] = []
  const ledger: WeeklyCoverageLedgerEntry[] = []
  const assignments: WeeklyCoverageAssignment[] = []
  const assessmentCandidateIdsByRequirement: Record<string, string[]> = {}
  const assessmentMatchesByRequirement: Record<string, WeeklyCoverageAssessmentMatch[]> = {}

  for (const plan of plannedRequirements) {
    const { requirement, template } = plan
    const assessmentMatches = findAssessmentMatches(
      profile,
      requirement,
      eligibility
    )
    assessmentMatchesByRequirement[requirement.id] = assessmentMatches
    assessmentCandidateIdsByRequirement[requirement.id] = assessmentMatches
      .filter(match => match.unambiguous)
      .map(match => match.assessmentId)

    if (plan.eligibleMovements.length === 0) {
      const reason = classifyEligibilityGap(requirement, eligibility)
      ledger.push({
        requirement,
        plannedDose: 0,
        assignedSessionIds: [],
        unassignedReason: reason
      })
      gaps.push({
        requirementId: requirement.id,
        targetId: requirement.targetId,
        status: 'omitted',
        reason,
        detail: eligibilityGapDetail(reason, requirement.targetLabel)
      })
      continue
    }

    const selection = chooseAssignmentDays(plan, days)
    if (selection.days.length < plan.minimumExposures) {
      ledger.push({
        requirement,
        plannedDose: 0,
        assignedSessionIds: [],
        unassignedReason: selection.reason
      })
      gaps.push({
        requirementId: requirement.id,
        targetId: requirement.targetId,
        status: 'omitted',
        reason: selection.reason,
        detail: `No valid ${requirement.targetLabel.toLowerCase()} exposure fits the accepted weekly time and recovery constraints.`
      })
      continue
    }

    const anchor = getDoseAnchor(template.doseAnchorId)
    const plannedDose = selectPlannedDose(profile, requirement, anchor, selection.days.length)
    const distributedDose = distributeInteger(plannedDose, selection.days.length)
    const requirementAssignments: InternalAssignment[] = selection.days.map((day, index) => ({
      id: `${requirement.id}:${day.day}`,
      requirementId: requirement.id,
      goalAllocationId: requirement.goalAllocationId,
      targetId: requirement.targetId,
      kind: requirement.kind,
      day: day.day,
      dose: distributedDose[index],
      unit: requirement.dose.unit,
      doseAnchorId: requirement.doseAnchorId,
      estimatedMinutes: requirement.estimatedMinutesPerExposure,
      mustPrecedeKinds: [...requirement.sequencing.mustPrecedeKinds],
      incompatibleTargetIds: [...template.incompatibleTargetIds]
    }))

    for (const assignment of requirementAssignments) {
      const day = days.find(candidate => candidate.day === assignment.day)
      if (!day) throw new Error(`Assigned day is unavailable: ${assignment.day}`)
      day.remainingMinutes -= assignment.estimatedMinutes
      day.assignmentIds.push(assignment.id)
      day.internalAssignments.push(assignment)
      assignments.push(stripInternalAssignment(assignment))
    }

    const reductionReason = selection.days.length < plan.desiredExposures
      ? selection.reason
      : null
    ledger.push({
      requirement,
      plannedDose,
      assignedSessionIds: requirementAssignments.map(assignment => assignment.id),
      unassignedReason: reductionReason
    })
    if (reductionReason) {
      gaps.push({
        requirementId: requirement.id,
        targetId: requirement.targetId,
        status: 'reduced',
        reason: reductionReason,
        detail: `${requirement.targetLabel} was reduced from ${plan.desiredExposures} to ${selection.days.length} weekly exposure(s).`
      })
    }
  }

  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
    movementCatalogVersion: MOVEMENT_CATALOG_VERSION,
    weekNumber,
    reviewRequired: COMPLETE_PROGRAMMING_POLICY.review.checkpointWeeks.includes(weekNumber as 4 | 8),
    goalAllocationIds: [profile.primaryGoal.id, ...profile.secondaryGoals.map(goal => goal.id)],
    requirements: plannedRequirements.map(plan => plan.requirement),
    ledger,
    assignments,
    days: days.map(({ internalAssignments: _internalAssignments, ...day }) => day),
    gaps,
    assessmentCandidateIdsByRequirement,
    assessmentMatchesByRequirement
  }
}

function buildRequirements(
  profile: ProgrammingProfile,
  eligibility: MovementEligibilityContext
): PlannedRequirement[] {
  const goals: ProgrammingGoalAllocation[] = [profile.primaryGoal, ...profile.secondaryGoals]
  const planned: PlannedRequirement[] = []

  for (const goal of goals) {
    const templates = COMPLETE_PROGRAMMING_POLICY.weeklyCoverageTemplates.filter(template => (
      template.domain === goal.domain && templateIncludedForGoal(template, goal)
    ))

    for (const template of templates) {
      const desiredExposures = goal.role === 'primary'
        && profile.trainingExperience !== 'new_or_returning'
        && profile.sessionAvailability.length >= 3
        ? template.targetExposures
        : template.minimumExposures
      const dose = deriveRequirementDose(getDoseAnchor(template.doseAnchorId), template.minimumExposures, desiredExposures)
      const priority = goal.role === 'primary'
        ? template.priority
        : template.priority === 'priority' ? 'secondary' : 'supporting'
      const requirement: WeeklyCoverageRequirement = {
        id: `coverage:${goal.id}:${template.targetId}`,
        goalAllocationId: goal.id,
        domain: goal.domain,
        kind: template.kind,
        targetId: template.targetId,
        targetLabel: template.targetLabel,
        priority,
        doseAnchorId: template.doseAnchorId,
        estimatedMinutesPerExposure: template.estimatedMinutesPerExposure,
        dose,
        eligibleDays: profile.sessionAvailability.map(day => day.day),
        sequencing: {
          mustPrecedeKinds: [...template.mustPrecedeKinds],
          avoidSameDayTargetIds: [...template.incompatibleTargetIds],
          preferredRecoveryHours: template.preferredRecoveryHours
        },
        fatigueCost: template.fatigueCost,
        impactCost: template.impactCost,
        evidenceRuleIds: [...template.evidenceRuleIds],
        policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION
      }
      const validation = validateWeeklyCoverageRequirement(requirement)
      if (!validation.ok) throw new Error(validation.errors.join('; '))

      planned.push({
        requirement,
        template,
        goal,
        minimumExposures: template.minimumExposures,
        desiredExposures,
        eligibleMovements: findEligibleMovements({
          domain: goal.domain,
          requiredCoverage: [{ kind: template.kind, targetId: template.targetId }],
          eligibility
        })
      })
    }
  }

  return planned.sort((left, right) => (
    goalRank(left.goal) - goalRank(right.goal)
    || PRIORITY_RANK[left.requirement.priority] - PRIORITY_RANK[right.requirement.priority]
    || left.template.secondaryRank - right.template.secondaryRank
    || left.requirement.id.localeCompare(right.requirement.id)
  ))
}

function chooseAssignmentDays(
  plan: PlannedRequirement,
  days: InternalDay[]
): { days: InternalDay[]; reason: 'time' | 'recovery' } {
  let reductionReason: 'time' | 'recovery' = 'time'
  for (let count = plan.desiredExposures; count >= plan.minimumExposures; count -= 1) {
    const combinations = combinationsOf(days, count)
    const withoutTime = combinations.filter(combination => (
      combination.every(day => hasNoInterference(day, plan.template))
      && meetsPairwiseRecovery(combination, plan.template.preferredRecoveryHours)
    ))
    const withTime = withoutTime.filter(combination => (
      combination.every(day => day.remainingMinutes >= plan.requirement.estimatedMinutesPerExposure)
    ))
    if (withoutTime.length === 0) {
      reductionReason = 'recovery'
      continue
    }
    if (withTime.length === 0) {
      if (reductionReason !== 'recovery') reductionReason = 'time'
      continue
    }

    const selected = [...withTime].sort((left, right) => (
      combinationScore(right, plan.requirement.estimatedMinutesPerExposure)
      - combinationScore(left, plan.requirement.estimatedMinutesPerExposure)
      || combinationKey(left).localeCompare(combinationKey(right))
    ))[0]
    return {
      days: selected,
      reason: count < plan.desiredExposures
        ? reductionReason
        : 'time'
    }
  }

  const hasRecoveryCompatibleCombination = combinationsOf(days, plan.minimumExposures).some(combination => (
    combination.every(day => hasNoInterference(day, plan.template))
    && meetsPairwiseRecovery(combination, plan.template.preferredRecoveryHours)
  ))
  return {
    days: [],
    reason: hasRecoveryCompatibleCombination ? 'time' : 'recovery'
  }
}

function deriveRequirementDose(
  anchor: ProgrammingDoseAnchor,
  minimumExposures: number,
  targetExposures: number
): WeeklyCoverageRequirement['dose'] {
  const range = doseRangePerExposure(anchor)
  return {
    source: 'validated_policy',
    unit: range.unit,
    minimum: range.min * minimumExposures,
    target: {
      min: range.min * targetExposures,
      max: range.max * targetExposures
    },
    maximum: range.max * targetExposures
  }
}

function doseRangePerExposure(
  anchor: ProgrammingDoseAnchor
): { unit: WeeklyCoverageDoseUnit; min: number; max: number } {
  const dose = anchor.dose
  if (dose.kind === 'sets_reps') {
    return { unit: 'working_sets', min: dose.sets.min, max: dose.sets.max }
  }
  if (dose.kind === 'quality_repetitions') {
    return {
      unit: 'quality_repetitions',
      min: dose.series.min * dose.repetitionsPerSeries.min,
      max: dose.series.max * dose.repetitionsPerSeries.max
    }
  }
  if (dose.kind === 'continuous') {
    return {
      unit: 'minutes',
      min: dose.durationMinutes.min,
      max: dose.durationMinutes.max
    }
  }
  return {
    unit: 'intervals',
    min: dose.series.min * dose.repetitions.min,
    max: dose.series.max * dose.repetitions.max
  }
}

function selectPlannedDose(
  profile: ProgrammingProfile,
  requirement: WeeklyCoverageRequirement,
  anchor: ProgrammingDoseAnchor,
  exposureCount: number
): number {
  const perExposure = doseRangePerExposure(anchor)
  const minimum = perExposure.min * exposureCount
  const maximum = perExposure.max * exposureCount
  const recent = profile.recentTraining.doseByCoverageTarget.find(dose => (
    dose.kind === requirement.kind
    && dose.targetId === requirement.targetId
    && dose.unit === requirement.dose.unit
  ))
  if (!recent || !Number.isFinite(recent.amount)) return minimum
  return clamp(Math.round(recent.amount), minimum, maximum)
}

function buildEligibilityContext(
  profile: ProgrammingProfile,
  assessedMovementIds: string[]
): MovementEligibilityContext {
  const knownEquipment = new Set<string>(MOVEMENT_EQUIPMENT_IDS)
  const availableEquipmentIds = profile.equipment.resolvedIds.filter(
    (id): id is MovementEquipmentId => knownEquipment.has(id)
  )
  return {
    availableEquipmentIds,
    trainingExperience: profile.trainingExperience,
    assessedMovementIds,
    noOverhead: profile.explicitConstraints.some(constraint => constraint.kind === 'no_overhead'),
    noRunning: profile.explicitConstraints.some(constraint => constraint.kind === 'no_running')
  }
}

function classifyEligibilityGap(
  requirement: WeeklyCoverageRequirement,
  eligibility: MovementEligibilityContext
): WeeklyCoverageGapReason {
  const coverage: MovementCoverageTag = {
    kind: requirement.kind,
    targetId: requirement.targetId
  }
  const candidates = MOVEMENT_CATALOG.filter(movementDefinition => (
    movementDefinition.domains.includes(requirement.domain)
    && movementDefinition.coverage.some(tag => coverageKey(tag) === coverageKey(coverage))
  ))
  if (candidates.length === 0) return 'unsupported'

  const constraintEligible = candidates.filter(candidate => (
    !(eligibility.noOverhead && candidate.overhead)
    && !(eligibility.noRunning && candidate.running)
  ))
  if (constraintEligible.length === 0) return 'constraint'

  const equipment = new Set<MovementEquipmentId>([
    ...eligibility.availableEquipmentIds,
    'bodyweight'
  ])
  const equipmentEligible = constraintEligible.filter(candidate => (
    candidate.equipment.every(required => equipment.has(required))
  ))
  if (equipmentEligible.length === 0) return 'equipment'

  const experienceEligible = equipmentEligible.filter(candidate => (
    skillEligible(candidate, eligibility.trainingExperience)
    || eligibility.assessedMovementIds?.includes(candidate.id) === true
  ))
  if (experienceEligible.length === 0) return 'experience'

  return 'unsupported'
}

function findAssessmentMatches(
  profile: ProgrammingProfile,
  requirement: WeeklyCoverageRequirement,
  eligibility: MovementEligibilityContext
): WeeklyCoverageAssessmentMatch[] {
  const requirementCoverage = `${requirement.kind}:${requirement.targetId}`
  return profile.assessments.flatMap(assessment => {
    const matches = getMovementsByAssessmentAlias(assessment.movement).filter(movementDefinition => (
      movementDefinition.domains.includes(requirement.domain)
      && movementDefinition.coverage.some(tag => coverageKey(tag) === requirementCoverage)
      && findEligibleMovements({
        domain: requirement.domain,
        requiredCoverage: [{ kind: requirement.kind, targetId: requirement.targetId }],
        eligibility
      }).some(candidate => candidate.id === movementDefinition.id)
    ))
    return matches.length > 0
      ? [{
        assessmentId: assessment.id,
        movementIds: matches.map(match => match.id),
        unambiguous: matches.length === 1
      }]
      : []
  })
}

function templateIncludedForGoal(
  template: WeeklyCoverageTemplatePolicy,
  goal: ProgrammingGoalAllocation
): boolean {
  if (goal.role === 'primary') return true
  if (goal.allocation === 'development') return template.secondaryRank <= 2
  return template.secondaryRank === 1
}

function goalRank(goal: ProgrammingGoalAllocation): number {
  if (goal.role === 'primary') return 0
  return goal.allocation === 'development' ? 1 : 2
}

function hasNoInterference(day: InternalDay, template: WeeklyCoverageTemplatePolicy): boolean {
  return day.internalAssignments.every(existing => (
    !template.incompatibleTargetIds.includes(existing.targetId)
    && !existing.incompatibleTargetIds.includes(template.targetId)
  ))
}

function meetsPairwiseRecovery(
  days: InternalDay[],
  preferredRecoveryHours: number | null
): boolean {
  if (!preferredRecoveryHours || days.length < 2) return true
  const minimumDays = Math.ceil(preferredRecoveryHours / 24)
  for (let index = 0; index < days.length; index += 1) {
    for (let other = index + 1; other < days.length; other += 1) {
      if (circularDayDistance(days[index].day, days[other].day) < minimumDays) return false
    }
  }
  return true
}

function combinationsOf<T>(values: T[], count: number): T[][] {
  if (count === 0) return [[]]
  const result: T[][] = []
  const visit = (start: number, selected: T[]) => {
    if (selected.length === count) {
      result.push([...selected])
      return
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) {
      selected.push(values[index])
      visit(index + 1, selected)
      selected.pop()
    }
  }
  visit(0, [])
  return result
}

function combinationScore(days: InternalDay[], estimatedMinutes: number): number {
  const remaining = days.reduce((total, day) => total + day.remainingMinutes - estimatedMinutes, 0)
  const separation = days.length < 2
    ? 0
    : days.slice(1).reduce((total, day, index) => (
      total + circularDayDistance(days[index].day, day.day)
    ), 0)
  return (remaining * 10) + separation
}

function combinationKey(days: InternalDay[]): string {
  return days.map(day => WEEKDAY_INDEX[day.day]).join(':')
}

function circularDayDistance(left: TrainingWeekday, right: TrainingWeekday): number {
  const distance = Math.abs(WEEKDAY_INDEX[left] - WEEKDAY_INDEX[right])
  return Math.min(distance, 7 - distance)
}

function distributeInteger(total: number, count: number): number[] {
  const base = Math.floor(total / count)
  const remainder = total % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

function stripInternalAssignment(assignment: InternalAssignment): WeeklyCoverageAssignment {
  const { incompatibleTargetIds: _incompatibleTargetIds, ...publicAssignment } = assignment
  return publicAssignment
}

function skillEligible(
  movementDefinition: MovementDefinition,
  experience: TrainingExperience
): boolean {
  const skillRank: Record<MovementSkillLevel, number> = { low: 0, moderate: 1, high: 2 }
  const experienceRank: Record<TrainingExperience, number> = {
    new_or_returning: 0,
    consistent: 1,
    experienced: 2
  }
  return skillRank[movementDefinition.skillLevel] <= experienceRank[experience]
}

function eligibilityGapDetail(
  reason: WeeklyCoverageGapReason,
  targetLabel: string
): string {
  const label = targetLabel.toLowerCase()
  if (reason === 'constraint') return `${targetLabel} conflicts with an explicit athlete constraint.`
  if (reason === 'equipment') return `${targetLabel} has no eligible movement with the resolved equipment.`
  if (reason === 'experience') return `${targetLabel} has no movement within the current skill boundary.`
  return `${label} has no supported movement definition.`
}

function coverageKey(value: MovementCoverageTag): string {
  return `${value.kind}:${value.targetId}`
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
