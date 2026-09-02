import { createHash } from 'crypto'
import {
  METRIC_DEFINITIONS,
  normalizeMetricValue,
  type AdaptationAction,
  type EvidenceSemanticRole,
  type EvidenceStatus,
  type MetricUnit,
  type PerformanceMetricId,
  type ProgrammingHypothesis
} from './adaptive-programming-contracts'
import {
  ADAPTIVE_PLAN_CONTRACT_VERSION,
  ADAPTIVE_PLAN_POLICY_VERSION,
  type AdaptiveEvidenceTrend,
  type AdaptiveExpectedDirection,
  type AdaptiveExpectedSignal,
  type AdaptivePlanContract,
  type AdaptivePlanGoalOutcome
} from './adaptive-plan'
import type {
  CoachEvidenceContextPacket,
  CoachEvidenceSample,
  CoachEvidenceSeries
} from './evidence-context'

export const ADAPTATION_REVIEW_SCHEMA_VERSION = 1 as const
export const ADAPTATION_EVALUATOR_ALGORITHM_VERSION = 'adaptive-review-0.1.0' as const

const MINIMUM_DIRECTIONAL_EXPOSURES = 4
const PROVISIONAL_VARIABILITY_EXPOSURES = 6
const MINIMUM_MEANINGFUL_CHANGE_PERCENT = 2
const MAXIMUM_VARIABILITY_THRESHOLD_PERCENT = 10

export type AdaptationSafetySignalKind =
  | 'concerning_pain'
  | 'repeated_pain'
  | 'stopped_early'
  | 'low_energy'
  | 'explicit_constraint'

export interface AdaptationSafetySignal {
  id: string
  kind: AdaptationSafetySignalKind
  severity: 'pause' | 'recover' | 'context'
  occurredAt: string
}

export interface AdaptationExecutionSummary {
  scheduledSessionIds: string[]
  completedSessionIds: string[]
  skippedSessionIds: string[]
  checkinIds: string[]
  completionRate: number | null
  averageSessionRpe: number | null
}

export interface AdaptationEvaluationInput {
  goalId: string
  adaptivePlan: unknown
  context: CoachEvidenceContextPacket
  recoveryContext?: CoachEvidenceContextPacket | null
  safetySignals?: readonly AdaptationSafetySignal[]
  execution?: AdaptationExecutionSummary | null
}

export interface AdaptationSeriesSummary {
  seriesId: string
  metricId: PerformanceMetricId
  semanticRole: EvidenceSemanticRole
  assessmentDefinitionId: string
  protocol: { id: string; version: string }
  protocolSignature: string
  comparabilityKey: string
  expectedDirection: AdaptiveExpectedDirection
  observationIds: string[]
  sampleCount: number
  exposureCount: number
  minimumRequiredExposures: number
  unit: MetricUnit
  bestValue: number
  averageValue: number
  baselineAverage: number | null
  recentAverage: number | null
  directedChangePercent: number | null
  meaningfulChangeThresholdPercent: number
  supportingExposureCount: number
  contradictingExposureCount: number
  variability: {
    coefficientOfVariationPercent: number | null
    provisional: boolean
  }
  setToSetDecayPercent: number | null
  velocityLossPercent: number | null
  intervalConsistencyCvPercent: number | null
  trend: AdaptiveEvidenceTrend
  status: EvidenceStatus
  freshness: 'current' | 'stale' | 'expired'
  confidence: number
}

export interface AdaptationEvidenceExclusion {
  observationId: string
  reason:
    | 'incompatible_comparability_series'
    | 'not_required_for_hypothesis'
    | 'outside_requirement_window'
    | 'lower_quality_series'
}

export interface AdaptationEvidenceSnapshot {
  schemaVersion: typeof ADAPTATION_REVIEW_SCHEMA_VERSION
  id: string
  contentHash: string
  createdAt: string
  evaluationWindow: { startsAt: string; endsAt: string }
  activePlanVersionId: string
  goalId: string
  hypothesisId: string
  evaluationPolicyId: string
  includedObservationIds: string[]
  excludedObservations: AdaptationEvidenceExclusion[]
  safetySignalIds: string[]
  executionEvidence: AdaptationExecutionSummary | null
  protocolSignatures: string[]
  sampleCount: number
  exposureCount: number
  contextAlgorithmVersion: string
  algorithmVersion: typeof ADAPTATION_EVALUATOR_ALGORITHM_VERSION
  policyVersion: string
  series: AdaptationSeriesSummary[]
  confidence: number
  provisionalVariability: boolean
}

export interface AdaptationProposalRecommendation {
  eligible: boolean
  requiresAcceptance: boolean
  activePlanUnchanged: true
  numericChangeStatus: 'not_needed' | 'not_generated' | 'athlete_input_required'
  suggestedChanges: string[]
}

export interface AdaptationReview {
  schemaVersion: typeof ADAPTATION_REVIEW_SCHEMA_VERSION
  algorithmVersion: typeof ADAPTATION_EVALUATOR_ALGORITHM_VERSION
  asOf: string
  goalId: string
  hypothesisId: string | null
  action: AdaptationAction
  evidenceStatus: EvidenceStatus
  trend: AdaptiveEvidenceTrend
  confidence: number
  rationale: string[]
  missing: string[]
  nextMeasurement: {
    metricId: PerformanceMetricId
    semanticRole: EvidenceSemanticRole
    assessmentDefinitionId: string | null
  } | null
  safetyOverride: {
    applied: boolean
    signalIds: string[]
    action: 'pause_review' | 'recover' | null
  }
  evidenceSnapshot: AdaptationEvidenceSnapshot | null
  proposalRecommendation: AdaptationProposalRecommendation
}

interface InternalSeriesSummary {
  public: AdaptationSeriesSummary
  exposureValues: number[]
  latestObservedAt: string
}

interface RequirementSelection {
  requirement: ProgrammingHypothesis['evidenceRequirements'][number]
  signal: AdaptiveExpectedSignal
  selected: InternalSeriesSummary | null
  excluded: AdaptationEvidenceExclusion[]
}

export function evaluateAdaptation(input: AdaptationEvaluationInput): AdaptationReview {
  const { context } = input
  const asOf = context.asOf
  const safetySignals = normalizeSafetySignals(input.safetySignals ?? [], asOf)
  const pauseSignals = safetySignals.filter(signal => signal.severity === 'pause')
  const baseMissing = validateEvaluationBoundary(input)

  const plan = isAdaptivePlanContract(input.adaptivePlan) ? input.adaptivePlan : null
  const hypothesis = plan?.hypotheses.find(candidate => candidate.goalId === input.goalId) ?? null
  const policy = hypothesis
    ? plan?.evaluationPolicies.find(candidate => candidate.hypothesisId === hypothesis.id) ?? null
    : null
  const goal = plan?.goals.find(candidate => candidate.goalId === input.goalId) ?? null

  if (!plan) baseMissing.push('adaptive_plan_contract_invalid')
  if (!hypothesis) baseMissing.push('goal_hypothesis_missing')
  if (!policy) baseMissing.push('evaluation_policy_missing')

  if (pauseSignals.length > 0 && (!plan || !hypothesis || !policy || baseMissing.length > 0)) {
    return reviewWithoutSnapshot({
      input,
      hypothesis,
      action: 'pause_review',
      evidenceStatus: 'excluded',
      trend: 'unknown',
      confidence: 1,
      rationale: [
        'A concerning safety signal overrides progression and plan-change logic.',
        'Pause the provoking work and review the signal without inferring a diagnosis.'
      ],
      missing: unique(baseMissing),
      safetySignals: pauseSignals,
      safetyAction: 'pause_review'
    })
  }

  if (!plan || !hypothesis || !policy || baseMissing.length > 0) {
    return reviewWithoutSnapshot({
      input,
      hypothesis,
      action: 'hold_collect_more',
      evidenceStatus: 'insufficient',
      trend: 'unknown',
      confidence: 0,
      rationale: ['The review cannot reproduce a complete authoritative evidence selection.'],
      missing: unique(baseMissing),
      safetySignals: [],
      safetyAction: null
    })
  }

  const selections = hypothesis.evidenceRequirements.map(requirement => (
    selectRequirementSeries(context, hypothesis, plan, requirement)
  ))
  const recoverySelections = selectRecoverySeries(input.recoveryContext ?? null)
  const requirementSummaries = selections.flatMap(selection => (
    selection.selected ? [selection.selected] : []
  ))
  const recoverySummaries = recoverySelections.selected
  const allSummaries = [...requirementSummaries, ...recoverySummaries]

  const missingRequirements = selections.filter(selection => (
    !selection.selected
    || selection.selected.public.exposureCount < selection.requirement.minimumComparableObservations
    || selection.selected.public.freshness !== 'current'
  ))
  const nextRequirement = missingRequirements[0]?.requirement ?? null

  const includedIds = unique(allSummaries.flatMap(summary => summary.public.observationIds)).sort()
  const excluded = normalizeExclusions([
    ...selections.flatMap(selection => selection.excluded),
    ...recoverySelections.excluded,
    ...context.evidenceIds
      .filter(id => !includedIds.includes(id))
      .map(observationId => ({
        observationId,
        reason: 'not_required_for_hypothesis' as const
      })),
    ...(input.recoveryContext?.evidenceIds ?? [])
      .filter(id => !includedIds.includes(id))
      .map(observationId => ({
        observationId,
        reason: 'not_required_for_hypothesis' as const
      }))
  ], new Set(includedIds))

  const direct = requirementSummaries.filter(summary => summary.public.semanticRole === 'direct_outcome')
  const indirect = requirementSummaries.filter(summary => summary.public.semanticRole !== 'direct_outcome')
  const directWorsening = direct.some(summary => summary.public.trend === 'worsening')
  const directImproving = direct.some(summary => summary.public.trend === 'improving')
  const directStable = direct.length > 0 && direct.every(summary => summary.public.trend === 'stable')
  const indirectImproving = indirect.some(summary => summary.public.trend === 'improving')
  const recoveryConcern = hasRecoveryConcern(recoverySummaries, input.execution ?? null)
  const recoverSignals = safetySignals.filter(signal => signal.severity === 'recover')
  const repeatedRecoverSignals = new Set(recoverSignals.map(signal => signal.id.split(':')[0])).size >= 2
  const goalMet = goal ? isGoalMet(goal, requirementSummaries) : false

  let action: AdaptationAction
  let trend: AdaptiveEvidenceTrend
  let evidenceStatus: EvidenceStatus
  const rationale: string[] = []

  if (pauseSignals.length > 0) {
    action = 'pause_review'
    trend = 'unknown'
    evidenceStatus = 'excluded'
    rationale.push(
      'A concerning safety signal overrides progression and plan-change logic.',
      'Pause the provoking work and review the signal without inferring a diagnosis.'
    )
  } else if (missingRequirements.length > 0) {
    action = 'hold_collect_more'
    trend = 'unknown'
    evidenceStatus = 'insufficient'
    rationale.push('The plan stays unchanged because at least one required comparable series is missing, stale, or below its repeated-exposure threshold.')
  } else if (repeatedRecoverSignals || (directWorsening && recoveryConcern)) {
    action = 'recover'
    trend = 'recovery_concern'
    evidenceStatus = directWorsening ? 'contradicted' : 'supported'
    rationale.push('Repeated recovery or execution-cost signals override progression.')
    if (directWorsening && recoveryConcern) {
      rationale.push('Compatible direct performance and recovery evidence declined together; neither signal acts alone.')
    }
  } else if (goalMet) {
    action = 'maintain'
    trend = 'goal_met'
    evidenceStatus = 'supported'
    rationale.push('The last two compatible direct exposures meet the athlete-confirmed goal target.')
  } else if (
    directStable
    && indirectImproving
    && direct.every(summary => summary.public.exposureCount >= MINIMUM_DIRECTIONAL_EXPOSURES)
    && indirect.some(summary => summary.public.exposureCount >= MINIMUM_DIRECTIONAL_EXPOSURES)
  ) {
    action = 'redirect'
    trend = 'worsening'
    evidenceStatus = 'contradicted'
    rationale.push('A proxy or training signal improved without transfer to the direct goal outcome; review specificity before adding more of the same emphasis.')
  } else if (directWorsening) {
    const repeated = direct
      .filter(summary => summary.public.trend === 'worsening')
      .every(summary => summary.public.exposureCount >= MINIMUM_DIRECTIONAL_EXPOSURES)
    action = repeated ? 'redirect' : 'hold_collect_more'
    trend = repeated ? 'worsening' : 'unknown'
    evidenceStatus = repeated ? 'contradicted' : 'emerging'
    rationale.push(repeated
      ? 'Repeated compatible direct outcomes contradict the current hypothesis.'
      : 'A possible decline is still provisional; collect another compatible exposure before redirecting emphasis.')
  } else if (directImproving) {
    const supported = direct
      .filter(summary => summary.public.trend === 'improving')
      .every(summary => summary.public.exposureCount >= MINIMUM_DIRECTIONAL_EXPOSURES)
    action = supported ? 'progress' : 'continue'
    trend = supported ? 'improving' : 'stable'
    evidenceStatus = supported ? 'supported' : 'emerging'
    rationale.push(supported
      ? 'Repeated compatible direct outcomes improved beyond provisional variability.'
      : 'The directional signal is still emerging, so the accepted plan continues unchanged.')
  } else {
    action = 'continue'
    trend = 'stable'
    evidenceStatus = requirementSummaries.some(summary => summary.public.status === 'emerging')
      ? 'emerging'
      : 'supported'
    rationale.push('Repeated compatible evidence is stable and does not justify reallocating training emphasis.')
  }

  if (!hypothesis.allowedActions.includes(action)) {
    rationale.push(`The hypothesis does not permit ${action}; hold for review.`)
    action = 'hold_collect_more'
    trend = 'unknown'
    evidenceStatus = 'insufficient'
  }

  const snapshot = buildSnapshot({
    input,
    hypothesis,
    policyId: policy.id,
    summaries: allSummaries.map(summary => summary.public),
    includedIds,
    excluded,
    safetySignals,
    execution: input.execution ?? null
  })
  const confidence = snapshot.confidence

  return {
    schemaVersion: ADAPTATION_REVIEW_SCHEMA_VERSION,
    algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
    asOf,
    goalId: input.goalId,
    hypothesisId: hypothesis.id,
    action,
    evidenceStatus,
    trend,
    confidence,
    rationale,
    missing: unique([
      ...context.missing.filter(item => item !== 'authoritative_memories_missing'),
      ...missingRequirements.map(selection => `evidence_requirement_unmet:${requirementKey(selection.requirement)}`)
    ]).sort(),
    nextMeasurement: nextRequirement ? {
      metricId: nextRequirement.metricId,
      semanticRole: nextRequirement.semanticRole,
      assessmentDefinitionId: nextRequirement.assessmentDefinitionId
    } : null,
    safetyOverride: {
      applied: action === 'pause_review' || (action === 'recover' && repeatedRecoverSignals),
      signalIds: (action === 'pause_review' ? pauseSignals : recoverSignals)
        .map(signal => signal.id)
        .sort(),
      action: action === 'pause_review'
        ? 'pause_review'
        : action === 'recover' && repeatedRecoverSignals ? 'recover' : null
    },
    evidenceSnapshot: snapshot,
    proposalRecommendation: proposalRecommendation(action)
  }
}

export function isAdaptivePlanContract(value: unknown): value is AdaptivePlanContract {
  if (!isRecord(value)) return false
  if (
    value.contractVersion !== ADAPTIVE_PLAN_CONTRACT_VERSION
    || value.policyVersion !== ADAPTIVE_PLAN_POLICY_VERSION
    || !Array.isArray(value.goals)
    || !Array.isArray(value.hypotheses)
    || !Array.isArray(value.expectedSignals)
    || !Array.isArray(value.evaluationPolicies)
  ) return false

  return value.goals.every(goal => isRecord(goal) && typeof goal.goalId === 'string')
    && value.hypotheses.every(hypothesis => (
      isRecord(hypothesis)
      && typeof hypothesis.id === 'string'
      && typeof hypothesis.goalId === 'string'
      && Array.isArray(hypothesis.evidenceRequirements)
      && Array.isArray(hypothesis.allowedActions)
    ))
    && value.expectedSignals.every(signal => (
      isRecord(signal)
      && typeof signal.hypothesisId === 'string'
      && typeof signal.metricId === 'string'
      && typeof signal.expectedDirection === 'string'
    ))
    && value.evaluationPolicies.every(policy => (
      isRecord(policy)
      && typeof policy.id === 'string'
      && typeof policy.hypothesisId === 'string'
      && policy.automaticPlanActivation === false
    ))
}

function validateEvaluationBoundary(input: AdaptationEvaluationInput): string[] {
  const missing: string[] = []
  const { context } = input
  if (context.purpose !== 'adaptation_review') missing.push('adaptation_context_required')
  if (context.scope.goalId !== input.goalId) missing.push('goal_scope_mismatch')
  if (!context.storageAvailable) missing.push('authoritative_storage_unavailable')
  if (!context.selectionComplete) missing.push('evidence_selection_incomplete')
  if (!context.activePlan) missing.push('active_plan_missing')
  if (
    context.activePlan
    && context.scope.activePlanVersionId !== context.activePlan.planVersionId
  ) missing.push('active_plan_scope_mismatch')
  if (!isIsoTimestamp(context.asOf)) missing.push('invalid_as_of_time')
  const structuralMissing = new Set([
    'active_plan_missing',
    'conflicting_active_programs',
    'goal_not_in_active_plan',
    'active_plan_version_unavailable',
    'active_plan_sessions_unavailable'
  ])
  missing.push(...context.missing.filter(item => structuralMissing.has(item)))
  return missing
}

function selectRequirementSeries(
  context: CoachEvidenceContextPacket,
  hypothesis: ProgrammingHypothesis,
  plan: AdaptivePlanContract,
  requirement: ProgrammingHypothesis['evidenceRequirements'][number]
): RequirementSelection {
  const signal = plan.expectedSignals.find(candidate => (
    candidate.hypothesisId === hypothesis.id
    && candidate.metricId === requirement.metricId
    && candidate.semanticRole === requirement.semanticRole
    && candidate.assessmentDefinitionId === requirement.assessmentDefinitionId
  )) ?? {
    id: `fallback:${requirementKey(requirement)}`,
    hypothesisId: hypothesis.id,
    metricId: requirement.metricId,
    semanticRole: requirement.semanticRole,
    assessmentDefinitionId: requirement.assessmentDefinitionId,
    expectedDirection: metricDirection(requirement.metricId),
    minimumComparableObservations: requirement.minimumComparableObservations,
    evaluationWindowDays: requirement.evaluationWindowDays
  }
  const candidates = context.evidenceSeries.filter(series => (
    series.metricId === requirement.metricId
    && series.semanticRole === requirement.semanticRole
    && (
      requirement.assessmentDefinitionId === null
      || series.assessmentDefinitionId === requirement.assessmentDefinitionId
    )
  ))
  const summaries = candidates.flatMap(series => {
    const summary = summarizeSeries(
      series,
      signal,
      requirement.minimumComparableObservations,
      context.asOf,
      Math.min(requirement.evaluationWindowDays, context.window.days)
    )
    return summary ? [summary] : []
  }).sort((left, right) => (
    right.public.exposureCount - left.public.exposureCount
    || freshnessRank(right.public.freshness) - freshnessRank(left.public.freshness)
    || right.public.sampleCount - left.public.sampleCount
    || right.latestObservedAt.localeCompare(left.latestObservedAt)
    || left.public.seriesId.localeCompare(right.public.seriesId)
  ))
  const selected = summaries[0] ?? null
  const selectedSeriesId = selected?.public.seriesId ?? null
  const candidateIds = new Set(candidates.flatMap(series => series.observationIds))
  const summarizedIds = new Set(summaries.flatMap(summary => summary.public.observationIds))
  const excluded: AdaptationEvidenceExclusion[] = [
    ...candidates.flatMap(series => (
      series.id === selectedSeriesId
        ? []
        : series.observationIds.map(observationId => ({
          observationId,
          reason: 'incompatible_comparability_series' as const
        }))
    )),
    ...[...candidateIds]
      .filter(id => !summarizedIds.has(id))
      .map(observationId => ({
        observationId,
        reason: 'outside_requirement_window' as const
      }))
  ]
  return { requirement, signal, selected, excluded }
}

function selectRecoverySeries(context: CoachEvidenceContextPacket | null): {
  selected: InternalSeriesSummary[]
  excluded: AdaptationEvidenceExclusion[]
} {
  if (!context || !context.storageAvailable || !context.selectionComplete) {
    return { selected: [], excluded: [] }
  }
  const selectors: Array<{
    metricId: PerformanceMetricId
    role: EvidenceSemanticRole
    direction: AdaptiveExpectedDirection
  }> = [
    { metricId: 'readiness.score', role: 'proxy', direction: 'maintain_or_improve' },
    { metricId: 'session.rpe', role: 'training_signal', direction: 'maintain_or_improve' }
  ]
  const selected: InternalSeriesSummary[] = []
  const excluded: AdaptationEvidenceExclusion[] = []
  for (const selector of selectors) {
    const candidates = context.evidenceSeries.filter(series => (
      series.metricId === selector.metricId && series.semanticRole === selector.role
    ))
    const summaries = candidates.flatMap(series => {
      const summary = summarizeSeries(series, {
        id: `recovery:${selector.metricId}`,
        hypothesisId: 'recovery-context',
        metricId: selector.metricId,
        semanticRole: selector.role,
        assessmentDefinitionId: series.assessmentDefinitionId,
        expectedDirection: selector.direction,
        minimumComparableObservations: 2,
        evaluationWindowDays: context.window.days
      }, 2, context.asOf, context.window.days)
      return summary ? [summary] : []
    }).sort((left, right) => (
      right.public.exposureCount - left.public.exposureCount
      || right.latestObservedAt.localeCompare(left.latestObservedAt)
      || left.public.seriesId.localeCompare(right.public.seriesId)
    ))
    if (summaries[0]) selected.push(summaries[0])
    for (const summary of summaries.slice(1)) {
      excluded.push(...summary.public.observationIds.map(observationId => ({
        observationId,
        reason: 'lower_quality_series' as const
      })))
    }
  }
  return { selected, excluded }
}

function summarizeSeries(
  series: CoachEvidenceSeries,
  signal: AdaptiveExpectedSignal,
  minimumRequiredExposures: number,
  asOf: string,
  windowDays: number
): InternalSeriesSummary | null {
  const startsAtMs = Date.parse(asOf) - windowDays * 86_400_000
  const samples = [...series.samples]
    .filter(sample => Date.parse(sample.observedAt) >= startsAtMs && Date.parse(sample.observedAt) <= Date.parse(asOf))
    .sort((left, right) => (
      left.observedAt.localeCompare(right.observedAt)
      || left.ordinal - right.ordinal
      || left.observationValueId.localeCompare(right.observationValueId)
    ))
  if (samples.length === 0) return null

  const direction = numericDirection(signal.expectedDirection, series.metricId)
  const grouped = groupSamplesByExposure(samples)
  const exposureRows = [...grouped.values()]
    .map(exposureSamples => {
      const ordered = [...exposureSamples].sort((left, right) => (
        left.observedAt.localeCompare(right.observedAt)
        || left.ordinal - right.ordinal
        || left.observationValueId.localeCompare(right.observationValueId)
      ))
      return {
        observedAt: ordered[ordered.length - 1].observedAt,
        representative: best(ordered.map(sample => sample.value), direction),
        samples: ordered
      }
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
  const exposureValues = exposureRows.map(row => row.representative)
  const split = Math.max(1, Math.floor(exposureValues.length / 2))
  const baselineValues = exposureValues.slice(0, split)
  const recentValues = exposureValues.slice(split)
  const baselineAverage = recentValues.length > 0 ? average(baselineValues) : null
  const recentAverage = recentValues.length > 0 ? average(recentValues) : null
  const variabilityCv = coefficientOfVariationPercent(exposureValues)
  const threshold = round(Math.max(
    MINIMUM_MEANINGFUL_CHANGE_PERCENT,
    Math.min(MAXIMUM_VARIABILITY_THRESHOLD_PERCENT, (variabilityCv ?? 0) * 0.5)
  ))
  const directedChange = baselineAverage !== null && recentAverage !== null
    ? directedPercentChange(baselineAverage, recentAverage, direction)
    : null
  const recentDirectedChanges = baselineAverage === null
    ? []
    : recentValues.map(value => directedPercentChange(baselineAverage, value, direction))
  const supportingExposureCount = recentDirectedChanges.filter(value => value > threshold).length
  const contradictingExposureCount = recentDirectedChanges.filter(value => value < -threshold).length
  const requiredAgreement = Math.min(2, recentValues.length)
  const hasRepeatedSupport = requiredAgreement >= 2 && supportingExposureCount >= requiredAgreement
  const hasRepeatedContradiction = requiredAgreement >= 2 && contradictingExposureCount >= requiredAgreement
  const exposureCount = exposureRows.length
  const freshness = freshnessFor(exposureRows[exposureRows.length - 1].observedAt, asOf, windowDays)
  const status: EvidenceStatus = exposureCount < minimumRequiredExposures || freshness !== 'current'
    ? 'insufficient'
    : hasRepeatedContradiction
      ? 'contradicted'
      : exposureCount < MINIMUM_DIRECTIONAL_EXPOSURES
        ? 'emerging'
        : 'supported'
  const trend: AdaptiveEvidenceTrend = status === 'insufficient'
    ? 'unknown'
    : hasRepeatedSupport
      ? 'improving'
      : hasRepeatedContradiction
        ? 'worsening'
        : 'stable'
  const setDecay = averageNullable(exposureRows.map(row => setDecayPercent(row.samples, direction)))
  const confidence = round(Math.min(
    exposureCount < PROVISIONAL_VARIABILITY_EXPOSURES ? 0.75 : 1,
    series.confidence * Math.min(1, exposureCount / MINIMUM_DIRECTIONAL_EXPOSURES)
  ))

  return {
    public: {
      seriesId: series.id,
      metricId: series.metricId,
      semanticRole: series.semanticRole,
      assessmentDefinitionId: series.assessmentDefinitionId,
      protocol: series.protocol,
      protocolSignature: `${series.assessmentDefinitionId}|${series.protocol.id}@${series.protocol.version}|${series.comparabilityKey}`,
      comparabilityKey: series.comparabilityKey,
      expectedDirection: signal.expectedDirection,
      observationIds: unique(samples.map(sample => sample.observationId)).sort(),
      sampleCount: samples.length,
      exposureCount,
      minimumRequiredExposures,
      unit: samples[0].unit,
      bestValue: round(best(samples.map(sample => sample.value), direction)),
      averageValue: round(average(samples.map(sample => sample.value))),
      baselineAverage: baselineAverage === null ? null : round(baselineAverage),
      recentAverage: recentAverage === null ? null : round(recentAverage),
      directedChangePercent: directedChange === null ? null : round(directedChange),
      meaningfulChangeThresholdPercent: threshold,
      supportingExposureCount,
      contradictingExposureCount,
      variability: {
        coefficientOfVariationPercent: variabilityCv === null ? null : round(variabilityCv),
        provisional: exposureCount < PROVISIONAL_VARIABILITY_EXPOSURES
      },
      setToSetDecayPercent: setDecay === null ? null : round(setDecay),
      velocityLossPercent: series.metricId === 'bar.mean_velocity' && setDecay !== null
        ? round(Math.max(0, setDecay))
        : null,
      intervalConsistencyCvPercent: variabilityCv === null ? null : round(variabilityCv),
      trend,
      status,
      freshness,
      confidence
    },
    exposureValues,
    latestObservedAt: exposureRows[exposureRows.length - 1].observedAt
  }
}

function isGoalMet(
  goal: AdaptivePlanGoalOutcome,
  summaries: InternalSeriesSummary[]
): boolean {
  if (!goal.target) return false
  const normalizedTarget = normalizeMetricValue(goal.target.metric)
  const normalizedUpper = goal.target.upperMetric
    ? normalizeMetricValue(goal.target.upperMetric)
    : null
  if (!normalizedTarget || (goal.target.upperMetric && !normalizedUpper)) return false
  const summary = summaries.find(candidate => (
    candidate.public.metricId === normalizedTarget.metricId
    && candidate.public.semanticRole === 'direct_outcome'
    && candidate.public.assessmentDefinitionId === goal.target?.assessmentDefinition.id
    && candidate.public.protocol.id === goal.target?.protocol.id
    && candidate.public.protocol.version === goal.target?.protocol.version
  ))
  if (!summary || summary.exposureValues.length < 2) return false
  return summary.exposureValues.slice(-2).every(value => {
    if (goal.target?.comparison === 'at_least') return value >= normalizedTarget.value
    if (goal.target?.comparison === 'at_most') return value <= normalizedTarget.value
    return normalizedUpper !== null
      && value >= normalizedTarget.value
      && value <= normalizedUpper.value
  })
}

function hasRecoveryConcern(
  summaries: InternalSeriesSummary[],
  execution: AdaptationExecutionSummary | null
): boolean {
  const readiness = summaries.find(summary => summary.public.metricId === 'readiness.score')
  const sessionRpe = summaries.find(summary => summary.public.metricId === 'session.rpe')
  const readinessConcern = Boolean(
    readiness
    && readiness.public.exposureCount >= 2
    && (
      readiness.public.trend === 'worsening'
      || (readiness.public.recentAverage ?? readiness.public.averageValue) <= 2.5
    )
  )
  const rpeConcern = Boolean(
    sessionRpe
    && sessionRpe.public.exposureCount >= 2
    && (
      sessionRpe.public.trend === 'worsening'
      || (sessionRpe.public.recentAverage ?? sessionRpe.public.averageValue) >= 8.5
    )
  )
  const executionConcern = execution?.averageSessionRpe !== null
    && execution?.averageSessionRpe !== undefined
    && execution.averageSessionRpe >= 8.5
  return readinessConcern || rpeConcern || executionConcern
}

function buildSnapshot(input: {
  input: AdaptationEvaluationInput
  hypothesis: ProgrammingHypothesis
  policyId: string
  summaries: AdaptationSeriesSummary[]
  includedIds: string[]
  excluded: AdaptationEvidenceExclusion[]
  safetySignals: AdaptationSafetySignal[]
  execution: AdaptationExecutionSummary | null
}): AdaptationEvidenceSnapshot {
  const activePlanVersionId = input.input.context.activePlan?.planVersionId as string
  const content = {
    schemaVersion: ADAPTATION_REVIEW_SCHEMA_VERSION,
    createdAt: input.input.context.asOf,
    evaluationWindow: {
      startsAt: input.input.context.window.startsAt,
      endsAt: input.input.context.asOf
    },
    activePlanVersionId,
    goalId: input.input.goalId,
    hypothesisId: input.hypothesis.id,
    evaluationPolicyId: input.policyId,
    includedObservationIds: input.includedIds,
    excludedObservations: input.excluded,
    safetySignalIds: input.safetySignals.map(signal => signal.id).sort(),
    executionEvidence: input.execution,
    protocolSignatures: unique(input.summaries.map(summary => summary.protocolSignature)).sort(),
    sampleCount: input.summaries.reduce((total, summary) => total + summary.sampleCount, 0),
    exposureCount: input.summaries.reduce((total, summary) => total + summary.exposureCount, 0),
    contextAlgorithmVersion: input.input.context.algorithmVersion,
    algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
    policyVersion: input.hypothesis.policyVersion,
    series: input.summaries,
    confidence: input.summaries.filter(summary => summary.status !== 'insufficient').length === 0
      ? 0
      : round(Math.min(...input.summaries
        .filter(summary => summary.status !== 'insufficient')
        .map(summary => summary.confidence))),
    provisionalVariability: input.summaries.some(summary => summary.variability.provisional)
  }
  const contentHash = createHash('sha256').update(stableStringify(content)).digest('hex')
  return {
    ...content,
    id: `adaptation-evidence:${contentHash.slice(0, 32)}`,
    contentHash
  }
}

function reviewWithoutSnapshot(input: {
  input: AdaptationEvaluationInput
  hypothesis: ProgrammingHypothesis | null
  action: AdaptationAction
  evidenceStatus: EvidenceStatus
  trend: AdaptiveEvidenceTrend
  confidence: number
  rationale: string[]
  missing: string[]
  safetySignals: AdaptationSafetySignal[]
  safetyAction: 'pause_review' | 'recover' | null
}): AdaptationReview {
  return {
    schemaVersion: ADAPTATION_REVIEW_SCHEMA_VERSION,
    algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
    asOf: input.input.context.asOf,
    goalId: input.input.goalId,
    hypothesisId: input.hypothesis?.id ?? null,
    action: input.action,
    evidenceStatus: input.evidenceStatus,
    trend: input.trend,
    confidence: input.confidence,
    rationale: input.rationale,
    missing: input.missing.sort(),
    nextMeasurement: null,
    safetyOverride: {
      applied: input.safetyAction !== null,
      signalIds: input.safetySignals.map(signal => signal.id).sort(),
      action: input.safetyAction
    },
    evidenceSnapshot: null,
    proposalRecommendation: proposalRecommendation(input.action)
  }
}

function proposalRecommendation(action: AdaptationAction): AdaptationProposalRecommendation {
  const suggested: Record<AdaptationAction, string[]> = {
    continue: ['Keep the accepted plan unchanged.'],
    progress: [
      'Build a reviewed next plan version from the same goal and compatible assessment protocol.',
      'Change only one declared dose variable and require athlete acceptance.'
    ],
    maintain: [
      'Move the achieved quality to maintenance in a replacement plan.',
      'Preserve enough exposure to retain the outcome while reallocating emphasis.'
    ],
    redirect: [
      'Review specificity and choose a replacement emphasis tied to the direct goal outcome.',
      'Do not infer the new dose from proxy improvement alone.'
    ],
    recover: [
      'Create a lower-stress replacement that preserves the goal and movement intent.',
      'Reduce one stressor: volume, intensity, impact, complexity, or density.'
    ],
    hold_collect_more: ['Keep the accepted plan unchanged and collect the named compatible measurement.'],
    pause_review: ['Do not create or activate a progression proposal while the safety signal is unresolved.']
  }
  const eligible = ['progress', 'maintain', 'redirect', 'recover'].includes(action)
  return {
    eligible,
    requiresAcceptance: eligible,
    activePlanUnchanged: true,
    numericChangeStatus: action === 'continue'
      ? 'not_needed'
      : eligible
        ? 'athlete_input_required'
        : 'not_generated',
    suggestedChanges: suggested[action]
  }
}

function groupSamplesByExposure(samples: CoachEvidenceSample[]): Map<string, CoachEvidenceSample[]> {
  const grouped = new Map<string, CoachEvidenceSample[]>()
  for (const sample of samples) {
    const key = sample.workoutId
      ?? sample.prescribedSessionId
      ?? sample.observedAt.slice(0, 10)
    const values = grouped.get(key) ?? []
    values.push(sample)
    grouped.set(key, values)
  }
  return grouped
}

function setDecayPercent(samples: CoachEvidenceSample[], direction: 1 | -1): number | null {
  if (samples.length < 2) return null
  const ordered = [...samples].sort((left, right) => (
    left.ordinal - right.ordinal || left.observationValueId.localeCompare(right.observationValueId)
  ))
  const first = ordered[0].value
  const last = ordered[ordered.length - 1].value
  if (first === 0) return null
  return direction === 1
    ? (first - last) / Math.abs(first) * 100
    : (last - first) / Math.abs(first) * 100
}

function numericDirection(
  expected: AdaptiveExpectedDirection,
  metricId: PerformanceMetricId
): 1 | -1 {
  if (expected === 'increase') return 1
  if (expected === 'decrease') return -1
  if (metricId === 'session.rpe') return -1
  if (metricId === 'readiness.score' || metricId === 'recovery.hrv') return 1
  return METRIC_DEFINITIONS[metricId].direction === 'lower_is_better' ? -1 : 1
}

function metricDirection(metricId: PerformanceMetricId): AdaptiveExpectedDirection {
  const direction = METRIC_DEFINITIONS[metricId].direction
  return direction === 'lower_is_better'
    ? 'decrease'
    : direction === 'higher_is_better'
      ? 'increase'
      : 'maintain_or_improve'
}

function directedPercentChange(baseline: number, recent: number, direction: 1 | -1): number {
  const denominator = Math.max(Math.abs(baseline), Number.EPSILON)
  return ((recent - baseline) / denominator * 100) * direction
}

function coefficientOfVariationPercent(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = average(values)
  if (mean === 0) return null
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance) / Math.abs(mean) * 100
}

function freshnessFor(
  latestObservedAt: string,
  asOf: string,
  evaluationWindowDays: number
): 'current' | 'stale' | 'expired' {
  const ageDays = (Date.parse(asOf) - Date.parse(latestObservedAt)) / 86_400_000
  if (ageDays < 0 || !Number.isFinite(ageDays)) return 'expired'
  if (ageDays <= Math.max(14, evaluationWindowDays / 2)) return 'current'
  if (ageDays <= evaluationWindowDays) return 'stale'
  return 'expired'
}

function normalizeSafetySignals(
  values: readonly AdaptationSafetySignal[],
  asOf: string
): AdaptationSafetySignal[] {
  const asOfMs = Date.parse(asOf)
  return values.filter(signal => (
    signal.id.length > 0
    && ['pause', 'recover', 'context'].includes(signal.severity)
    && isIsoTimestamp(signal.occurredAt)
    && Date.parse(signal.occurredAt) <= asOfMs
  )).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
}

function normalizeExclusions(
  exclusions: AdaptationEvidenceExclusion[],
  included: Set<string>
): AdaptationEvidenceExclusion[] {
  const priority: Record<AdaptationEvidenceExclusion['reason'], number> = {
    outside_requirement_window: 1,
    incompatible_comparability_series: 2,
    lower_quality_series: 3,
    not_required_for_hypothesis: 4
  }
  const byId = new Map<string, AdaptationEvidenceExclusion>()
  for (const exclusion of exclusions) {
    if (included.has(exclusion.observationId)) continue
    const current = byId.get(exclusion.observationId)
    if (!current || priority[exclusion.reason] < priority[current.reason]) {
      byId.set(exclusion.observationId, exclusion)
    }
  }
  return [...byId.values()].sort((left, right) => (
    left.observationId.localeCompare(right.observationId) || left.reason.localeCompare(right.reason)
  ))
}

function requirementKey(requirement: ProgrammingHypothesis['evidenceRequirements'][number]): string {
  return `${requirement.metricId}:${requirement.semanticRole}:${requirement.assessmentDefinitionId ?? 'any'}`
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function averageNullable(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return finite.length > 0 ? average(finite) : null
}

function best(values: number[], direction: 1 | -1): number {
  return direction === 1 ? Math.max(...values) : Math.min(...values)
}

function freshnessRank(value: AdaptationSeriesSummary['freshness']): number {
  return value === 'current' ? 2 : value === 'stale' ? 1 : 0
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
