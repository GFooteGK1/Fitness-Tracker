import { MOVEMENT_CATALOG } from './movement-catalog'
import { findAssessmentDefinition, type AdaptationAction } from './adaptive-programming-contracts'
import { evaluateAdaptation, type AdaptationEvaluationInput, type AdaptationReview } from './adaptation-evaluator'
import type { AdaptivePlanContract } from './adaptive-plan'
import type { CoachEvidenceContextPacket, CoachEvidenceSample } from './evidence-context'
import type { PlanningOutcome } from './planning-intent'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'
import { stableStringify, type RollingWeeklyDoseChange } from './rolling-weekly-contracts'

import { TARGETED_REVIEW_VERSION } from './targeted-review-contracts'
export { TARGETED_REVIEW_VERSION } from './targeted-review-contracts'
export interface TargetedGoalReview {
  version: typeof TARGETED_REVIEW_VERSION
  goalId: string
  allocationId: string | null
  priority: number | null
  binding: PlanningOutcome | null
  attained: boolean
  actionCandidate: AdaptationAction
  includedSourceIds: string[]
  excludedSources: Array<{ observationId: string; reason: string }>
  matchingAssignmentIds: string[]
  doseChange: RollingWeeklyDoseChange | null
  missing: string[]
  evaluator: AdaptationReview
  disposition: 'selected' | 'deferred' | 'held'
}

/** Only catalog comparability dimensions are normalized, without inferring missing context. */
export function sampleMatchesOutcome(sample: CoachEvidenceSample, outcome: PlanningOutcome): boolean {
  return sample.semanticRole === 'direct_outcome' && sampleMatchesOutcomeMeasurement(sample, outcome)
}

/** Factual measurement identity is independent of its evidence role. The
 * adaptation matcher above separately requires direct-outcome authority.
 */
export function sampleMatchesOutcomeMeasurement(sample: CoachEvidenceSample, outcome: PlanningOutcome): boolean {
  const m = outcome.measurement
  if (!m || sample.metricId !== m.metricId
    || sample.assessmentDefinition.id !== m.assessmentDefinition.id || sample.assessmentDefinition.version !== m.assessmentDefinition.version
    || sample.protocol.id !== m.protocol.id || sample.protocol.version !== m.protocol.version) return false
  return sampleMatchesBinding(sample, outcome)
}
function sampleMatchesBinding(sample: CoachEvidenceSample, outcome: PlanningOutcome): boolean {
  const b = outcome.binding
  const expected = { movementId: b.movementId, variationId: b.variation, distance: b.distance, equipmentIds: b.equipmentIds,
    repetitions: b.assessmentContext?.repetitions ?? null, externalLoad: b.assessmentContext?.externalLoad ?? null,
    duration: b.assessmentContext?.duration ?? null, techniqueModifiers: b.assessmentContext?.techniqueModifiers ?? [],
    environmentModifiers: b.assessmentContext?.environmentModifiers ?? [] }
  return comparisonKey(sample.comparison) === comparisonKey(expected)
}
function comparisonKey(raw: Record<string, unknown>): string {
  const q = (value: unknown, factors: Record<string, number>) => {
    if (value === null || value === undefined) return null
    if (typeof value !== 'object' || Array.isArray(value)) return 'invalid'
    const v = value as { value?: unknown; unit?: unknown }
    return typeof v.value === 'number' && Number.isFinite(v.value) && typeof v.unit === 'string' && factors[v.unit]
      ? Math.round(v.value * factors[v.unit] * 1e8) / 1e8 : 'invalid'
  }
  const list = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value].sort() : value == null ? [] : ['invalid']
  return stableStringify({ movementId: raw.movementId ?? null, variationId: raw.variationId ?? null,
    distance: q(raw.distance, { m: 1, km: 1000, mi: 1609.344 }), externalLoad: q(raw.externalLoad, { kg: 1, lb: 0.45359237 }),
    duration: q(raw.duration, { s: 1, min: 60 }), repetitions: raw.repetitions ?? null,
    equipmentIds: list(raw.equipmentIds), techniqueModifiers: list(raw.techniqueModifiers), environmentModifiers: list(raw.environmentModifiers) })
}

/** Reuses an existing domain policy's gates; no new numerical eligibility class is introduced. */
export function evaluateConfirmedOutcome(input: AdaptationEvaluationInput & { plan: RollingWeeklyPlanDraft; outcome: PlanningOutcome }): {
  evaluator: AdaptationReview; context: CoachEvidenceContextPacket; allocationId: string | null; excludedSources: TargetedGoalReview['excludedSources']
} {
  const { outcome, plan } = input
  const allocations = [plan.profileSnapshot.primaryGoal, ...plan.profileSnapshot.secondaryGoals]
  const allocation = allocations.find(a => a.domain === outcome.domain)
  const adaptive = structuredClone(input.adaptivePlan) as AdaptivePlanContract
  const base = adaptive?.hypotheses?.find(h => h.goalId === allocation?.id)
  const policy = adaptive?.evaluationPolicies?.find(p => p.hypothesisId === base?.id)
  const measurement = outcome.measurement
  const definition = measurement ? findAssessmentDefinition(measurement.assessmentDefinition.id) : null
  const existingDirect = base?.evidenceRequirements.find(r => r.semanticRole === 'direct_outcome')
  // A catalog family match is not a numerical policy adapter (for example velocity -> sets).
  const existingMeasurementPolicy = Boolean(measurement && existingDirect && existingDirect.metricId === measurement.metricId
    && existingDirect.assessmentDefinitionId === measurement.assessmentDefinition.id
    && definition?.version === measurement.assessmentDefinition.version
    && definition?.protocol.id === measurement.protocol.id && definition?.protocol.version === measurement.protocol.version)
  const supported = existingMeasurementPolicy && outcome.capability.status === 'supported' && outcome.goal.status === 'active'
    && measurement && definition?.allowedSemanticRoles.includes('direct_outcome') && base && policy
  const series = supported ? input.context.evidenceSeries.flatMap(series => {
    const samples = series.samples.filter(sample => sampleMatchesOutcome(sample, outcome) || base.evidenceRequirements.some(requirement => {
      if (requirement.semanticRole === 'direct_outcome' || sample.semanticRole !== requirement.semanticRole || sample.metricId !== requirement.metricId
        || sample.assessmentDefinition.id !== requirement.assessmentDefinitionId || !sampleMatchesBinding(sample, outcome)) return false
      const definition = findAssessmentDefinition(requirement.assessmentDefinitionId ?? '')
      return Boolean(definition && definition.version === sample.assessmentDefinition.version && definition.protocol.id === sample.protocol.id && definition.protocol.version === sample.protocol.version)
    }))
    return samples.length ? [{ ...series, samples, sampleCount: samples.length, observationIds: [...new Set(samples.map(s => s.observationId))] }] : []
  }) : []
  const includedIds = new Set(series.flatMap(s => s.observationIds))
  const excludedSources = input.context.evidenceIds.filter(id => !includedIds.has(id)).map(observationId => ({ observationId, reason: 'outcome_binding_mismatch' }))
  excludedSources.push(...(input.context.executionExclusions ?? []).map(item => ({ observationId: item.observationId, reason: item.reason })))
  const context: CoachEvidenceContextPacket = { ...input.context,
    // This is a derived outcome-scoped view, not a wider numerical policy. Keep
    // source caps, incompleteness, active-plan binding and retrieval reproduction.
    purpose: input.context.purpose === 'new_planning' ? 'adaptation_review' : input.context.purpose,
    scope: { ...input.context.scope, goalId: outcome.goal.id },
    evidenceSeries: series, evidenceIds: [...includedIds], sampleCount: series.reduce((n, s) => n + s.samples.length, 0) }
  if (supported) {
    const hypothesisId = `${base.id}:outcome:${outcome.goal.id}`
    const originalRequirement = base.evidenceRequirements.find(r => r.semanticRole === 'direct_outcome') ?? base.evidenceRequirements[0]
    adaptive.goals = [{ goalId: outcome.goal.id, statement: outcome.goal.statement, kind: outcome.goal.kind,
      priority: outcome.goal.priority, horizon: base.reviewWindow, target: outcome.goal.target }]
    adaptive.hypotheses = [{ ...base, id: hypothesisId, goalId: outcome.goal.id, evidenceRequirements: [{ ...originalRequirement,
      semanticRole: 'direct_outcome', metricId: measurement.metricId, assessmentDefinitionId: measurement.assessmentDefinition.id }, ...base.evidenceRequirements.filter(r => r.semanticRole !== 'direct_outcome')] }]
    const signal = adaptive.expectedSignals.find(s => s.hypothesisId === base.id && s.semanticRole === 'direct_outcome') ?? adaptive.expectedSignals.find(s => s.hypothesisId === base.id)
    const supportingSignals = adaptive.expectedSignals.filter(s => s.hypothesisId === base.id && s.semanticRole !== 'direct_outcome').map(s => ({ ...s, hypothesisId }))
    adaptive.expectedSignals = signal ? [{ ...signal, hypothesisId, metricId: measurement.metricId, semanticRole: 'direct_outcome',
      assessmentDefinitionId: measurement.assessmentDefinition.id }, ...supportingSignals] : []
    adaptive.evaluationPolicies = [{ ...policy, hypothesisId }]
  }
  const evaluator = evaluateAdaptation({ ...input, goalId: outcome.goal.id, adaptivePlan: supported ? adaptive : null, context })
  if (!supported) evaluator.missing = [...new Set([...evaluator.missing, 'outcome_policy_adapter_unavailable'])]
  return { evaluator, context, allocationId: allocation?.id ?? null, excludedSources }
}

/** Exact observed movement only. A shared domain/metric never licenses transfer to another exercise. */
export function matchingAssignments(plan: RollingWeeklyPlanDraft, context: CoachEvidenceContextPacket, review: AdaptationReview,
  allocationId: string | null, outcome?: PlanningOutcome): string[] {
  const included = new Set(review.evidenceSnapshot?.includedObservationIds ?? [])
  const samples = context.evidenceSeries.flatMap(s => s.samples).filter(s => included.has(s.observationId) && s.semanticRole === 'direct_outcome')
  const ids = [...new Set(samples.map(s => s.comparison.movementId).filter((id): id is string => typeof id === 'string' && id.length > 0))]
  const movementId = outcome?.binding.movementId ?? (ids.length === 1 ? ids[0] : null)
  if (!movementId || !samples.length || ids.some(id => id !== movementId)) return []
  return plan.schedule.assignments.filter(a => (!allocationId || a.goalAllocationId === allocationId)
    && plan.sessions.some(s => s.day === a.day && s.blocks.some(b => b.role !== 'specific_preparation'
      && b.exercises.some(e => e.movementId === movementId && e.coverageRequirementIds.includes(a.requirementId))))).map(a => a.id).sort()
}

/** Shared declared movement/coverage demand is qualitative; it cannot establish a new dose. */
export function outcomesShareDemand(a: PlanningOutcome | null, b: PlanningOutcome | null): boolean {
  const left=a?.binding.movementId,right=b?.binding.movementId
  if(!left || !right)return false
  if(left===right)return true
  const tags=MOVEMENT_CATALOG.find(m=>m.id===left)?.coverage ?? []
  return Boolean(MOVEMENT_CATALOG.find(m=>m.id===right)?.coverage.some(r=>tags.some(l=>l.kind===r.kind&&l.targetId===r.targetId)))
}
