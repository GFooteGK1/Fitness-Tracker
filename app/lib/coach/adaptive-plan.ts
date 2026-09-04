import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  findAssessmentDefinition,
  validateProgrammingHypothesis,
  validateTrainingGoal,
  type AdaptationAction,
  type EvidenceSemanticRole,
  type EvidenceStatus,
  type PerformanceMetricId,
  type ProgrammingHypothesis,
  type TrainableQualityId,
  type TrainingEmphasisState,
  type TrainingGoal
} from './adaptive-programming-contracts'
import type {
  ProgrammingGoalAllocation,
  ProgrammingProfile,
  WeeklyCoverageRequirement
} from './programming-schema'
import type { CoachProgramDomainId } from './types'

export const ADAPTIVE_PLAN_CONTRACT_VERSION = 'adaptive-plan-0.1.0' as const
export const ADAPTIVE_PLAN_POLICY_VERSION = 'adaptive-plan-evaluation-0.1.0' as const

export const REQUIRED_ADAPTIVE_DECISION_ACTIONS = [
  'continue',
  'progress',
  'maintain',
  'redirect',
  'recover'
] as const satisfies readonly AdaptationAction[]

const ALL_ADAPTIVE_DECISION_ACTIONS = [
  ...REQUIRED_ADAPTIVE_DECISION_ACTIONS,
  'hold_collect_more',
  'pause_review'
] as const satisfies readonly AdaptationAction[]

const ASSESSMENT_WEEKS = [1, 4, 8] as const

type GoalAllocation = ProgrammingGoalAllocation
type GoalKind = TrainingGoal['kind']
type GoalTarget = TrainingGoal['target']

interface DomainEvaluationSpec {
  qualityId: TrainableQualityId
  goalKind: GoalKind
  assessmentDefinitionId: string
  assessmentSemanticRole: EvidenceSemanticRole
  expectedDirection: AdaptiveExpectedDirection
  hypothesisLabel: string
  directOutcomeFallback: {
    metricId: PerformanceMetricId
    semanticRole: EvidenceSemanticRole
    assessmentDefinitionId: string
    expectedDirection: AdaptiveExpectedDirection
  } | null
}

const DOMAIN_EVALUATION_SPECS: Record<CoachProgramDomainId, DomainEvaluationSpec> = {
  strength: {
    qualityId: 'maximal_strength',
    goalKind: 'performance_outcome',
    assessmentDefinitionId: 'strength.repetition_max',
    assessmentSemanticRole: 'direct_outcome',
    expectedDirection: 'increase',
    hypothesisLabel: 'prioritizing maximal-strength exposures',
    directOutcomeFallback: null
  },
  hypertrophy: {
    qualityId: 'strength_endurance',
    goalKind: 'capacity',
    assessmentDefinitionId: 'strength.repetition_capacity',
    assessmentSemanticRole: 'direct_outcome',
    expectedDirection: 'increase',
    hypothesisLabel: 'developing repeatable strength capacity',
    directOutcomeFallback: null
  },
  power_explosiveness: {
    qualityId: 'explosive_strength',
    goalKind: 'performance_outcome',
    assessmentDefinitionId: 'jump.height',
    assessmentSemanticRole: 'direct_outcome',
    expectedDirection: 'increase',
    hypothesisLabel: 'prioritizing high-quality explosive work',
    directOutcomeFallback: null
  },
  speed_agility: {
    qualityId: 'acceleration',
    goalKind: 'performance_outcome',
    assessmentDefinitionId: 'sprint.time',
    assessmentSemanticRole: 'direct_outcome',
    expectedDirection: 'decrease',
    hypothesisLabel: 'prioritizing high-quality acceleration exposures',
    directOutcomeFallback: null
  },
  aerobic: {
    qualityId: 'aerobic_endurance',
    goalKind: 'performance_outcome',
    assessmentDefinitionId: 'run.time_trial',
    assessmentSemanticRole: 'direct_outcome',
    expectedDirection: 'decrease',
    hypothesisLabel: 'developing repeatable aerobic work',
    directOutcomeFallback: null
  },
  resilience: {
    qualityId: 'recovery_capacity',
    goalKind: 'capacity',
    assessmentDefinitionId: 'readiness.self_report',
    assessmentSemanticRole: 'proxy',
    expectedDirection: 'maintain_or_improve',
    hypothesisLabel: 'building repeatable capacity while protecting recovery',
    directOutcomeFallback: {
      metricId: 'session.rpe',
      semanticRole: 'training_signal',
      assessmentDefinitionId: 'session.rpe',
      expectedDirection: 'maintain_or_improve'
    }
  }
}

export type AdaptiveExpectedDirection = 'increase' | 'decrease' | 'maintain_or_improve'

export interface AdaptivePlanGoalOutcome {
  goalId: string
  statement: string
  kind: GoalKind
  priority: 'primary' | 'secondary'
  horizon: {
    startsOn: string
    endsOn: string
  }
  /** Numeric targets remain null until the athlete explicitly supplies one. */
  target: GoalTarget
}

export interface AdaptivePlanQualityEmphasis {
  id: string
  goalId: string
  qualityId: TrainableQualityId
  state: TrainingEmphasisState
  hypothesisId: string
  scheduledAssessmentIds: string[]
  evaluationPolicyId: string
}

export interface AdaptiveScheduledAssessment {
  id: string
  goalId: string
  hypothesisId: string
  weekNumber: 1 | 4 | 8
  scheduledOn: string
  assessmentDefinition: {
    id: string
    version: string
    catalogVersion: typeof ADAPTIVE_ASSESSMENT_CATALOG_VERSION
  }
  protocol: {
    id: string
    version: string
  }
  metricId: PerformanceMetricId
  semanticRole: EvidenceSemanticRole
}

export interface AdaptiveExpectedSignal {
  id: string
  hypothesisId: string
  metricId: PerformanceMetricId
  semanticRole: EvidenceSemanticRole
  assessmentDefinitionId: string | null
  expectedDirection: AdaptiveExpectedDirection
  minimumComparableObservations: number
  evaluationWindowDays: number
}

export type AdaptiveEvidenceTrend =
  | 'improving'
  | 'stable'
  | 'worsening'
  | 'goal_met'
  | 'recovery_concern'
  | 'unknown'

export interface AdaptiveDecisionCriterion {
  action: AdaptationAction
  evidenceStatuses: EvidenceStatus[]
  trends: AdaptiveEvidenceTrend[]
  comparableObservationRequirement: 'met' | 'not_met' | 'not_applicable'
  explanation: string
}

export interface AdaptiveEvaluationPolicy {
  id: string
  hypothesisId: string
  policyVersion: typeof ADAPTIVE_PLAN_POLICY_VERSION
  reviewWindow: {
    startsOn: string
    endsOn: string
  }
  automaticPlanActivation: false
  criteria: AdaptiveDecisionCriterion[]
}

export interface AdaptiveCoverageTrace {
  requirementId: string
  goalId: string
  qualityEmphasisIds: string[]
  hypothesisIds: string[]
}

export interface AdaptivePlanContract {
  schemaVersion: typeof ADAPTIVE_PROGRAMMING_SCHEMA_VERSION
  contractVersion: typeof ADAPTIVE_PLAN_CONTRACT_VERSION
  assessmentCatalogVersion: typeof ADAPTIVE_ASSESSMENT_CATALOG_VERSION
  policyVersion: typeof ADAPTIVE_PLAN_POLICY_VERSION
  goals: AdaptivePlanGoalOutcome[]
  qualityEmphases: AdaptivePlanQualityEmphasis[]
  hypotheses: ProgrammingHypothesis[]
  scheduledAssessments: AdaptiveScheduledAssessment[]
  expectedSignals: AdaptiveExpectedSignal[]
  evaluationPolicies: AdaptiveEvaluationPolicy[]
  coverageTraces: AdaptiveCoverageTrace[]
}

export interface AdaptivePlanWeek {
  schedule: {
    requirements: WeeklyCoverageRequirement[]
  }
}

export interface AdaptivePlanValidation {
  ok: boolean
  errors: string[]
}

export function buildAdaptivePlanContract(
  profile: ProgrammingProfile,
  weeks: readonly AdaptivePlanWeek[]
): AdaptivePlanContract {
  const goalAllocations: GoalAllocation[] = [profile.primaryGoal, ...profile.secondaryGoals]
  const defaultDirectionEndDate = addDays(profile.startDate, 55)
  const goals = goalAllocations.map(goal => (
    buildGoalOutcome(goal, profile.startDate, defaultDirectionEndDate)
  ))
  const goalById = new Map(goals.map(goal => [goal.goalId, goal]))
  const hypotheses = goalAllocations.map(goal => {
    const horizon = goalById.get(goal.id)?.horizon
    return buildHypothesis(goal, horizon?.startsOn ?? profile.startDate, horizon?.endsOn ?? defaultDirectionEndDate)
  })
  const scheduledAssessments = goalAllocations.flatMap(goal => (
    buildScheduledAssessments(goal, profile.startDate)
  ))
  const expectedSignals = goalAllocations.flatMap(goal => buildExpectedSignals(goal))
  const evaluationPolicies = hypotheses.map(hypothesis => buildEvaluationPolicy(hypothesis))
  const qualityEmphases = goalAllocations.map(goal => {
    const spec = DOMAIN_EVALUATION_SPECS[goal.domain]
    const hypothesisId = hypothesisIdFor(goal)
    return {
      id: emphasisIdFor(goal, spec.qualityId),
      goalId: goal.id,
      qualityId: spec.qualityId,
      state: emphasisStateFor(goal),
      hypothesisId,
      scheduledAssessmentIds: scheduledAssessmentIdsFor(goal),
      evaluationPolicyId: evaluationPolicyIdFor(hypothesisId)
    }
  })
  const coverageTraces = buildCoverageTraces(weeks, qualityEmphases)

  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    contractVersion: ADAPTIVE_PLAN_CONTRACT_VERSION,
    assessmentCatalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
    policyVersion: ADAPTIVE_PLAN_POLICY_VERSION,
    goals,
    qualityEmphases,
    hypotheses,
    scheduledAssessments,
    expectedSignals,
    evaluationPolicies,
    coverageTraces
  }
}

export function validateAdaptivePlanContract(
  contract: AdaptivePlanContract,
  profile: ProgrammingProfile,
  weeks: readonly AdaptivePlanWeek[]
): AdaptivePlanValidation {
  const errors: string[] = []
  const allocations: GoalAllocation[] = [profile.primaryGoal, ...profile.secondaryGoals]
  const allocationIds = new Set(allocations.map(goal => goal.id))
  const defaultDirectionEndDate = addDays(profile.startDate, 55)

  if (contract.schemaVersion !== ADAPTIVE_PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Adaptive plan schema version is unsupported')
  }
  if (contract.contractVersion !== ADAPTIVE_PLAN_CONTRACT_VERSION) {
    errors.push('Adaptive plan contract version is unsupported')
  }
  if (contract.assessmentCatalogVersion !== ADAPTIVE_ASSESSMENT_CATALOG_VERSION) {
    errors.push('Adaptive plan assessment catalog version is unsupported')
  }
  if (contract.policyVersion !== ADAPTIVE_PLAN_POLICY_VERSION) {
    errors.push('Adaptive plan policy version is unsupported')
  }

  validateGoals(contract, allocations, profile.startDate, defaultDirectionEndDate, errors)
  validateHypotheses(contract, allocationIds, errors)
  validateScheduledAssessments(contract, allocationIds, profile.startDate, errors)
  validateExpectedSignals(contract, errors)
  validateEvaluationPolicies(contract, errors)
  validateEmphases(contract, profile.primaryGoal.id, errors)
  validateCoverageTraces(contract, weeks, errors)

  return { ok: errors.length === 0, errors: unique(errors) }
}

function buildGoalOutcome(
  goal: GoalAllocation,
  startsOn: string,
  endsOn: string
): AdaptivePlanGoalOutcome {
  const outcome = goal.outcome
  return {
    goalId: goal.id,
    statement: outcome?.statement ?? goal.athleteIntent,
    kind: outcome?.kind ?? DOMAIN_EVALUATION_SPECS[goal.domain].goalKind,
    priority: goal.role,
    horizon: {
      startsOn: outcome?.horizon.startsOn ?? startsOn,
      endsOn: outcome?.horizon.endsOn ?? endsOn
    },
    target: outcome?.target ?? null
  }
}

function buildHypothesis(
  goal: GoalAllocation,
  startsOn: string,
  endsOn: string
): ProgrammingHypothesis {
  const spec = DOMAIN_EVALUATION_SPECS[goal.domain]
  const requirements: ProgrammingHypothesis['evidenceRequirements'] = []

  if (spec.directOutcomeFallback) {
    requirements.push({
      semanticRole: spec.directOutcomeFallback.semanticRole,
      metricId: spec.directOutcomeFallback.metricId,
      assessmentDefinitionId: spec.directOutcomeFallback.assessmentDefinitionId,
      minimumComparableObservations: 2,
      evaluationWindowDays: 56
    })
  }

  const assessment = requireAssessmentDefinition(spec.assessmentDefinitionId)
  requirements.push({
    semanticRole: spec.assessmentSemanticRole,
    metricId: assessment.primaryMetricId,
    assessmentDefinitionId: assessment.id,
    minimumComparableObservations: 2,
    evaluationWindowDays: 56
  })

  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id: hypothesisIdFor(goal),
    goalId: goal.id,
    status: 'proposed',
    statement: `${spec.hypothesisLabel} will support: ${goal.athleteIntent}`,
    qualityEmphases: [{
      qualityId: spec.qualityId,
      state: emphasisStateFor(goal)
    }],
    evidenceRequirements: requirements,
    allowedActions: [...ALL_ADAPTIVE_DECISION_ACTIONS],
    reviewWindow: { startsOn, endsOn },
    policyVersion: ADAPTIVE_PLAN_POLICY_VERSION
  }
}

function buildScheduledAssessments(
  goal: GoalAllocation,
  startDate: string
): AdaptiveScheduledAssessment[] {
  const spec = DOMAIN_EVALUATION_SPECS[goal.domain]
  const definition = requireAssessmentDefinition(spec.assessmentDefinitionId)
  const hypothesisId = hypothesisIdFor(goal)

  return ASSESSMENT_WEEKS.map(weekNumber => ({
    id: scheduledAssessmentIdFor(goal, weekNumber),
    goalId: goal.id,
    hypothesisId,
    weekNumber,
    scheduledOn: addDays(startDate, (weekNumber - 1) * 7),
    assessmentDefinition: {
      id: definition.id,
      version: definition.version,
      catalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION
    },
    protocol: {
      id: definition.protocol.id,
      version: definition.protocol.version
    },
    metricId: definition.primaryMetricId,
    semanticRole: spec.assessmentSemanticRole
  }))
}

function buildExpectedSignals(goal: GoalAllocation): AdaptiveExpectedSignal[] {
  const spec = DOMAIN_EVALUATION_SPECS[goal.domain]
  const hypothesisId = hypothesisIdFor(goal)
  const definition = requireAssessmentDefinition(spec.assessmentDefinitionId)
  const signals: AdaptiveExpectedSignal[] = []

  if (spec.directOutcomeFallback) {
    signals.push({
      id: `signal:${hypothesisId}:${spec.directOutcomeFallback.metricId}:${spec.directOutcomeFallback.semanticRole}`,
      hypothesisId,
      metricId: spec.directOutcomeFallback.metricId,
      semanticRole: spec.directOutcomeFallback.semanticRole,
      assessmentDefinitionId: spec.directOutcomeFallback.assessmentDefinitionId,
      expectedDirection: spec.directOutcomeFallback.expectedDirection,
      minimumComparableObservations: 2,
      evaluationWindowDays: 56
    })
  }

  signals.push({
    id: `signal:${hypothesisId}:${definition.primaryMetricId}:${spec.assessmentSemanticRole}`,
    hypothesisId,
    metricId: definition.primaryMetricId,
    semanticRole: spec.assessmentSemanticRole,
    assessmentDefinitionId: definition.id,
    expectedDirection: spec.expectedDirection,
    minimumComparableObservations: 2,
    evaluationWindowDays: 56
  })

  return signals
}

function buildEvaluationPolicy(hypothesis: ProgrammingHypothesis): AdaptiveEvaluationPolicy {
  return {
    id: evaluationPolicyIdFor(hypothesis.id),
    hypothesisId: hypothesis.id,
    policyVersion: ADAPTIVE_PLAN_POLICY_VERSION,
    reviewWindow: { ...hypothesis.reviewWindow },
    automaticPlanActivation: false,
    criteria: [
      criterion('continue', ['emerging', 'supported'], ['stable'], 'met',
        'Continue the current emphasis when repeated comparable evidence is stable and safety signals are clear.'),
      criterion('progress', ['supported'], ['improving'], 'met',
        'Progress only when repeated comparable direct evidence supports the expected adaptation.'),
      criterion('maintain', ['supported'], ['goal_met'], 'met',
        'Move the quality to maintenance when the athlete-defined outcome is met and confirmed.'),
      criterion('redirect', ['contradicted'], ['worsening'], 'met',
        'Redirect emphasis only after repeated comparable evidence contradicts the hypothesis.'),
      criterion('recover', ['supported', 'contradicted'], ['recovery_concern'], 'met',
        'Shift toward recovery only when repeated compatible observations support a recovery concern.'),
      criterion('hold_collect_more', ['insufficient', 'emerging'], ['unknown'], 'not_met',
        'Hold the plan and collect the smallest useful measurement when evidence is insufficient.'),
      criterion('pause_review', ['invalidated', 'excluded'], ['unknown'], 'not_applicable',
        'Pause for review when the source evidence or protocol is invalidated or excluded.')
    ]
  }
}

function criterion(
  action: AdaptationAction,
  evidenceStatuses: EvidenceStatus[],
  trends: AdaptiveEvidenceTrend[],
  comparableObservationRequirement: AdaptiveDecisionCriterion['comparableObservationRequirement'],
  explanation: string
): AdaptiveDecisionCriterion {
  return {
    action,
    evidenceStatuses,
    trends,
    comparableObservationRequirement,
    explanation
  }
}

function buildCoverageTraces(
  weeks: readonly AdaptivePlanWeek[],
  emphases: readonly AdaptivePlanQualityEmphasis[]
): AdaptiveCoverageTrace[] {
  const requirementById = new Map<string, WeeklyCoverageRequirement>()
  for (const requirement of weeks.flatMap(week => week.schedule.requirements)) {
    requirementById.set(requirement.id, requirement)
  }

  return [...requirementById.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(requirement => {
      const matching = emphases.filter(emphasis => emphasis.goalId === requirement.goalAllocationId)
      return {
        requirementId: requirement.id,
        goalId: requirement.goalAllocationId,
        qualityEmphasisIds: matching.map(emphasis => emphasis.id),
        hypothesisIds: unique(matching.map(emphasis => emphasis.hypothesisId))
      }
    })
}

function validateGoals(
  contract: AdaptivePlanContract,
  allocations: readonly GoalAllocation[],
  startDate: string,
  endDate: string,
  errors: string[]
): void {
  const allocationById = new Map(allocations.map(goal => [goal.id, goal]))
  if (
    contract.goals.length !== allocationById.size
    || contract.goals.some(goal => !allocationById.has(goal.goalId))
    || new Set(contract.goals.map(goal => goal.goalId)).size !== contract.goals.length
  ) {
    errors.push('Adaptive plan goals must match the accepted programming profile')
  }
  for (const goal of contract.goals) {
    const allocation = allocationById.get(goal.goalId)
    if (allocation && (
      goal.priority !== allocation.role
      || goal.statement !== (allocation.outcome?.statement ?? allocation.athleteIntent)
      || goal.kind !== (allocation.outcome?.kind ?? DOMAIN_EVALUATION_SPECS[allocation.domain].goalKind)
      || JSON.stringify(goal.target) !== JSON.stringify(allocation.outcome?.target ?? null)
    )) {
      errors.push(`Adaptive goal ${goal.goalId} does not match its accepted outcome`)
    }
    if (goal.statement.trim().length < 3 || goal.statement.length > 500) {
      errors.push(`Adaptive goal ${goal.goalId} needs a concise outcome statement`)
    }
    const expectedHorizon = allocation?.outcome?.horizon ?? {
      startsOn: startDate,
      endsOn: endDate
    }
    if (
      goal.horizon.startsOn !== expectedHorizon.startsOn
      || goal.horizon.endsOn !== expectedHorizon.endsOn
    ) {
      errors.push(`Adaptive goal ${goal.goalId} must use its immutable direction horizon`)
    }
    if (goal.target) {
      const emphasisQualityIds = contract.qualityEmphases
        .filter(emphasis => emphasis.goalId === goal.goalId)
        .map(emphasis => emphasis.qualityId)
      const targetValidation = validateTrainingGoal({
        schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
        id: goal.goalId,
        kind: goal.kind,
        statement: goal.statement,
        priority: goal.priority,
        status: 'active',
        target: goal.target,
        targetDate: goal.horizon.endsOn,
        requiredQualityIds: emphasisQualityIds,
        source: {
          kind: 'athlete_confirmed',
          confirmedAt: `${goal.horizon.startsOn}T00:00:00.000Z`
        }
      })
      errors.push(...targetValidation.errors.map(error => (
        `Adaptive goal ${goal.goalId}: ${error}`
      )))
    }
  }
}

function validateHypotheses(
  contract: AdaptivePlanContract,
  allocationIds: Set<string>,
  errors: string[]
): void {
  if (
    contract.hypotheses.length !== allocationIds.size
    || new Set(contract.hypotheses.map(item => item.id)).size !== contract.hypotheses.length
    || new Set(contract.hypotheses.map(item => item.goalId)).size !== allocationIds.size
    || [...allocationIds].some(goalId => !contract.hypotheses.some(item => item.goalId === goalId))
  ) {
    errors.push('Adaptive plan needs one unique hypothesis per goal')
  }
  for (const hypothesis of contract.hypotheses) {
    errors.push(...validateProgrammingHypothesis(hypothesis).errors)
    if (!allocationIds.has(hypothesis.goalId)) {
      errors.push(`Hypothesis ${hypothesis.id} references an unknown goal`)
    }
    for (const action of REQUIRED_ADAPTIVE_DECISION_ACTIONS) {
      if (!hypothesis.allowedActions.includes(action)) {
        errors.push(`Hypothesis ${hypothesis.id} must allow ${action}`)
      }
    }
  }
}

function validateScheduledAssessments(
  contract: AdaptivePlanContract,
  allocationIds: Set<string>,
  startDate: string,
  errors: string[]
): void {
  if (contract.scheduledAssessments.length !== allocationIds.size * ASSESSMENT_WEEKS.length) {
    errors.push('Every adaptive goal needs assessments at weeks 1, 4, and 8')
  }
  const hypothesisById = new Map(contract.hypotheses.map(item => [item.id, item]))
  for (const goalId of allocationIds) {
    const goalAssessments = contract.scheduledAssessments.filter(item => item.goalId === goalId)
    const scheduledWeeks = new Set(goalAssessments.map(item => item.weekNumber))
    const goalHypothesis = contract.hypotheses.find(item => item.goalId === goalId)
    if (
      goalAssessments.length !== ASSESSMENT_WEEKS.length
      || ASSESSMENT_WEEKS.some(week => !scheduledWeeks.has(week))
      || goalAssessments.some(item => item.hypothesisId !== goalHypothesis?.id)
    ) {
      errors.push(`Adaptive goal ${goalId} needs its own assessments at weeks 1, 4, and 8`)
    }
  }
  if (new Set(contract.scheduledAssessments.map(item => item.id)).size !== contract.scheduledAssessments.length) {
    errors.push('Scheduled assessment IDs must be unique')
  }
  for (const assessment of contract.scheduledAssessments) {
    const definition = findAssessmentDefinition(
      assessment.assessmentDefinition.id,
      assessment.assessmentDefinition.version
    )
    if (!allocationIds.has(assessment.goalId)) {
      errors.push(`Scheduled assessment ${assessment.id} references an unknown goal`)
    }
    const hypothesis = hypothesisById.get(assessment.hypothesisId)
    if (!hypothesis || hypothesis.goalId !== assessment.goalId) {
      errors.push(`Scheduled assessment ${assessment.id} does not match its goal hypothesis`)
    }
    if (
      !definition
      || definition.protocol.id !== assessment.protocol.id
      || definition.protocol.version !== assessment.protocol.version
      || definition.primaryMetricId !== assessment.metricId
      || !definition.allowedSemanticRoles.includes(assessment.semanticRole)
    ) {
      errors.push(`Scheduled assessment ${assessment.id} does not match its versioned protocol`)
    }
    if (
      !ASSESSMENT_WEEKS.includes(assessment.weekNumber)
      || assessment.scheduledOn !== addDays(startDate, (assessment.weekNumber - 1) * 7)
    ) {
      errors.push(`Scheduled assessment ${assessment.id} must use week 1, 4, or 8`)
    }
  }
}

function validateExpectedSignals(contract: AdaptivePlanContract, errors: string[]): void {
  const hypotheses = new Map(contract.hypotheses.map(hypothesis => [hypothesis.id, hypothesis]))
  const evidenceRequirementCount = contract.hypotheses.reduce(
    (total, hypothesis) => total + hypothesis.evidenceRequirements.length,
    0
  )
  if (contract.expectedSignals.length !== evidenceRequirementCount) {
    errors.push('Every hypothesis evidence requirement needs one expected signal')
  }
  for (const hypothesis of contract.hypotheses) {
    for (const requirement of hypothesis.evidenceRequirements) {
      const matchingSignals = contract.expectedSignals.filter(signal => (
        signal.hypothesisId === hypothesis.id
        && signal.metricId === requirement.metricId
        && signal.semanticRole === requirement.semanticRole
        && signal.assessmentDefinitionId === requirement.assessmentDefinitionId
      ))
      if (matchingSignals.length !== 1) {
        errors.push(`Hypothesis ${hypothesis.id} needs one signal per evidence requirement`)
      }
    }
  }
  if (new Set(contract.expectedSignals.map(signal => signal.id)).size !== contract.expectedSignals.length) {
    errors.push('Expected signal IDs must be unique')
  }
  for (const signal of contract.expectedSignals) {
    const hypothesis = hypotheses.get(signal.hypothesisId)
    const requirement = hypothesis?.evidenceRequirements.find(candidate => (
      candidate.metricId === signal.metricId
      && candidate.semanticRole === signal.semanticRole
      && candidate.assessmentDefinitionId === signal.assessmentDefinitionId
    ))
    if (
      !requirement
      || requirement.minimumComparableObservations !== signal.minimumComparableObservations
      || requirement.evaluationWindowDays !== signal.evaluationWindowDays
    ) {
      errors.push(`Expected signal ${signal.id} does not match its hypothesis evidence requirement`)
    }
    if (signal.minimumComparableObservations < 2) {
      errors.push(`Expected signal ${signal.id} cannot adapt from one observation`)
    }
  }
}

function validateEvaluationPolicies(contract: AdaptivePlanContract, errors: string[]): void {
  const hypotheses = new Set(contract.hypotheses.map(hypothesis => hypothesis.id))
  if (
    contract.evaluationPolicies.length !== hypotheses.size
    || new Set(contract.evaluationPolicies.map(policy => policy.id)).size
      !== contract.evaluationPolicies.length
    || new Set(contract.evaluationPolicies.map(policy => policy.hypothesisId)).size !== hypotheses.size
    || [...hypotheses].some(id => !contract.evaluationPolicies.some(policy => policy.hypothesisId === id))
  ) {
    errors.push('Adaptive plan needs one unique evaluation policy per hypothesis')
  }
  for (const policy of contract.evaluationPolicies) {
    if (!hypotheses.has(policy.hypothesisId)) {
      errors.push(`Evaluation policy ${policy.id} references an unknown hypothesis`)
    }
    if (policy.policyVersion !== ADAPTIVE_PLAN_POLICY_VERSION || policy.automaticPlanActivation !== false) {
      errors.push(`Evaluation policy ${policy.id} cannot activate or reinterpret a plan`)
    }
    const actions = new Set(policy.criteria.map(item => item.action))
    if (actions.size !== policy.criteria.length) {
      errors.push(`Evaluation policy ${policy.id} has duplicate action criteria`)
    }
    for (const action of ALL_ADAPTIVE_DECISION_ACTIONS) {
      if (!actions.has(action)) errors.push(`Evaluation policy ${policy.id} needs ${action} criteria`)
    }
    for (const action of ['progress', 'redirect', 'recover'] as const) {
      const actionCriterion = policy.criteria.find(item => item.action === action)
      if (actionCriterion && actionCriterion.comparableObservationRequirement !== 'met') {
        errors.push(`Evaluation policy ${policy.id} cannot ${action} without repeated observations`)
      }
    }
  }
}

function validateEmphases(
  contract: AdaptivePlanContract,
  primaryGoalId: string,
  errors: string[]
): void {
  const goals = new Set(contract.goals.map(goal => goal.goalId))
  const hypotheses = new Map(contract.hypotheses.map(item => [item.id, item]))
  if (
    contract.qualityEmphases.length !== goals.size
    || new Set(contract.qualityEmphases.map(item => item.goalId)).size !== goals.size
  ) {
    errors.push('Adaptive plan needs one unique quality emphasis per goal')
  }
  const assessments = new Map(contract.scheduledAssessments.map(item => [item.id, item]))
  const policies = new Map(contract.evaluationPolicies.map(item => [item.id, item]))
  if (new Set(contract.qualityEmphases.map(item => item.id)).size !== contract.qualityEmphases.length) {
    errors.push('Quality emphasis IDs must be unique')
  }
  if (!contract.qualityEmphases.some(item => (
    item.goalId === primaryGoalId && item.state === 'priority_development'
  ))) {
    errors.push('Primary goal needs at least one priority development emphasis')
  }
  for (const emphasis of contract.qualityEmphases) {
    const hypothesis = hypotheses.get(emphasis.hypothesisId)
    const policy = policies.get(emphasis.evaluationPolicyId)
    const linkedAssessments = emphasis.scheduledAssessmentIds.map(id => assessments.get(id))
    if (!goals.has(emphasis.goalId) || !hypothesis) {
      errors.push(`Quality emphasis ${emphasis.id} has an unknown goal or hypothesis`)
    } else if (
      hypothesis.goalId !== emphasis.goalId
      || !hypothesis.qualityEmphases.some(item => (
        item.qualityId === emphasis.qualityId && item.state === emphasis.state
      ))
    ) {
      errors.push(`Quality emphasis ${emphasis.id} does not match its goal hypothesis`)
    }
    if (emphasis.scheduledAssessmentIds.length === 0) {
      errors.push(`Quality emphasis ${emphasis.id} needs scheduled assessments`)
    } else if (linkedAssessments.some(item => !item)) {
      errors.push(`Quality emphasis ${emphasis.id} references an unknown assessment`)
    } else if (
      linkedAssessments.some(item => (
        item?.goalId !== emphasis.goalId || item.hypothesisId !== emphasis.hypothesisId
      ))
      || new Set(linkedAssessments.map(item => item?.weekNumber)).size !== ASSESSMENT_WEEKS.length
      || ASSESSMENT_WEEKS.some(week => !linkedAssessments.some(item => item?.weekNumber === week))
    ) {
      errors.push(`Quality emphasis ${emphasis.id} assessment schedule does not match its goal`)
    }
    if (!policy) {
      errors.push(`Quality emphasis ${emphasis.id} references an unknown evaluation policy`)
    } else if (policy.hypothesisId !== emphasis.hypothesisId) {
      errors.push(`Quality emphasis ${emphasis.id} evaluation policy does not match its hypothesis`)
    }
  }
}

function validateCoverageTraces(
  contract: AdaptivePlanContract,
  weeks: readonly AdaptivePlanWeek[],
  errors: string[]
): void {
  const requirements = new Map<string, WeeklyCoverageRequirement>()
  for (const requirement of weeks.flatMap(week => week.schedule.requirements)) {
    requirements.set(requirement.id, requirement)
  }
  const emphases = new Map(contract.qualityEmphases.map(item => [item.id, item]))
  const hypotheses = new Map(contract.hypotheses.map(item => [item.id, item]))
  if (
    contract.coverageTraces.length !== requirements.size
    || new Set(contract.coverageTraces.map(trace => trace.requirementId)).size
      !== contract.coverageTraces.length
  ) {
    errors.push('Every unique coverage requirement needs one adaptive trace')
  }
  for (const trace of contract.coverageTraces) {
    const requirement = requirements.get(trace.requirementId)
    if (!requirement || requirement.goalAllocationId !== trace.goalId) {
      errors.push(`Coverage trace ${trace.requirementId} does not match its goal allocation`)
    }
    const linkedEmphases = trace.qualityEmphasisIds.map(id => emphases.get(id))
    const linkedHypotheses = trace.hypothesisIds.map(id => hypotheses.get(id))
    if (
      trace.qualityEmphasisIds.length === 0
      || linkedEmphases.some(item => !item)
      || trace.hypothesisIds.length === 0
      || linkedHypotheses.some(item => !item)
    ) {
      errors.push(`Coverage trace ${trace.requirementId} needs valid emphasis and hypothesis links`)
    } else if (
      linkedEmphases.some(item => item?.goalId !== trace.goalId)
      || linkedHypotheses.some(item => item?.goalId !== trace.goalId)
    ) {
      errors.push(`Coverage trace ${trace.requirementId} cannot borrow another goal's evidence links`)
    }
  }
}

function emphasisStateFor(goal: GoalAllocation): TrainingEmphasisState {
  if (goal.role === 'primary') return 'priority_development'
  return goal.allocation === 'development' ? 'development' : 'maintenance'
}

function hypothesisIdFor(goal: GoalAllocation): string {
  return `hypothesis:${goal.id}`
}

function emphasisIdFor(goal: GoalAllocation, qualityId: TrainableQualityId): string {
  return `emphasis:${goal.id}:${qualityId}`
}

function scheduledAssessmentIdsFor(goal: GoalAllocation): string[] {
  return ASSESSMENT_WEEKS.map(weekNumber => scheduledAssessmentIdFor(goal, weekNumber))
}

function scheduledAssessmentIdFor(goal: GoalAllocation, weekNumber: 1 | 4 | 8): string {
  return `assessment:${goal.id}:week-${weekNumber}`
}

function evaluationPolicyIdFor(hypothesisId: string): string {
  return `evaluation:${hypothesisId}`
}

function requireAssessmentDefinition(id: string) {
  const definition = findAssessmentDefinition(id)
  if (!definition) throw new Error(`Adaptive assessment definition is unavailable: ${id}`)
  return definition
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
