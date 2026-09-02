import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  ADAPTIVE_EVIDENCE_POLICY_VERSION,
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  type EvidenceSemanticRole,
  type MetricUnit,
  type PerformanceMetricId,
  type ProgrammingHypothesis
} from '@/app/lib/coach/adaptive-programming-contracts'
import {
  ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
  evaluateAdaptation,
  type AdaptationSafetySignal
} from '@/app/lib/coach/adaptation-evaluator'
import {
  ADAPTIVE_PLAN_CONTRACT_VERSION,
  ADAPTIVE_PLAN_POLICY_VERSION,
  type AdaptiveExpectedDirection,
  type AdaptivePlanContract
} from '@/app/lib/coach/adaptive-plan'
import {
  COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
  type CoachEvidenceContextPacket,
  type CoachEvidenceSample,
  type CoachEvidenceSeries
} from '@/app/lib/coach/evidence-context'

const asOf = '2026-09-01T12:00:00.000Z'
const allActions = [
  'continue', 'progress', 'maintain', 'redirect', 'recover',
  'hold_collect_more', 'pause_review'
] as const

describe('deterministic adaptation evaluator', () => {
  it('holds when authoritative selection is incomplete', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 101, 105, 106])], { selectionComplete: false })
    })

    expect(result.action).toBe('hold_collect_more')
    expect(result.evidenceSnapshot).toBeNull()
    expect(result.missing).toContain('evidence_selection_incomplete')
    expect(result.proposalRecommendation.eligible).toBe(false)
  })

  it('does not progress from one noisy exposure', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 100, 100, 130])])
    })

    expect(result.action).toBe('continue')
    expect(result.trend).toBe('stable')
    expect(result.evidenceSnapshot?.series[0]).toMatchObject({
      supportingExposureCount: 1,
      trend: 'stable'
    })
  })

  it('progresses only after repeated compatible direct outcomes improve', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 101, 105, 106])])
    })

    expect(result.action).toBe('progress')
    expect(result.evidenceStatus).toBe('supported')
    expect(result.evidenceSnapshot).toMatchObject({
      algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
      activePlanVersionId: 'plan-active',
      sampleCount: 4,
      exposureCount: 4,
      provisionalVariability: true
    })
    expect(result.evidenceSnapshot?.includedObservationIds).toEqual([
      'strength-barbell-1', 'strength-barbell-2',
      'strength-barbell-3', 'strength-barbell-4'
    ])
    expect(result.proposalRecommendation).toMatchObject({
      eligible: true,
      requiresAcceptance: true,
      activePlanUnchanged: true,
      numericChangeStatus: 'athlete_input_required'
    })
  })

  it('never combines incompatible comparability series to satisfy a threshold', () => {
    const first = strengthSeries([100, 102, 104], 'barbell')
    const second = strengthSeries([90, 92, 94], 'machine')
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan({ minimumComparableObservations: 4 }),
      context: packet([first, second])
    })

    expect(result.action).toBe('hold_collect_more')
    expect(result.evidenceSnapshot?.series).toHaveLength(1)
    expect(result.evidenceSnapshot?.series[0].exposureCount).toBe(3)
    expect(result.evidenceSnapshot?.excludedObservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'incompatible_comparability_series' })
    ]))
  })

  it('recommends recovery only when direct performance and recovery decline together', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([110, 109, 100, 99])]),
      recoveryContext: packet([
        series('readiness', 'readiness.score', 'proxy', [4, 4, 2, 2], {
          definition: 'readiness.self_report',
          protocol: 'daily-readiness-five-point',
          purpose: 'general_coaching'
        })
      ], { purpose: 'general_coaching', goalId: null })
    })

    expect(result.action).toBe('recover')
    expect(result.trend).toBe('recovery_concern')
    expect(result.rationale.join(' ')).toContain('neither signal acts alone')
  })

  it('does not let one readiness value override improving direct outcomes', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 101, 105, 106])]),
      recoveryContext: packet([
        series('readiness', 'readiness.score', 'proxy', [1], {
          definition: 'readiness.self_report',
          protocol: 'daily-readiness-five-point',
          purpose: 'general_coaching'
        })
      ], { purpose: 'general_coaching', goalId: null })
    })

    expect(result.action).toBe('progress')
    expect(result.safetyOverride.applied).toBe(false)
  })

  it('lets a concerning safety signal override otherwise supported progression', () => {
    const safety: AdaptationSafetySignal = {
      id: 'checkin-1:pain',
      kind: 'concerning_pain',
      severity: 'pause',
      occurredAt: '2026-08-30T12:00:00.000Z'
    }
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 101, 105, 106])]),
      safetySignals: [safety]
    })

    expect(result.action).toBe('pause_review')
    expect(result.evidenceStatus).toBe('excluded')
    expect(result.safetyOverride).toEqual({
      applied: true,
      signalIds: ['checkin-1:pain'],
      action: 'pause_review'
    })
    expect(result.proposalRecommendation.eligible).toBe(false)
  })

  it('moves a confirmed target to maintenance only after two direct exposures meet it', () => {
    const adaptivePlan = plan()
    adaptivePlan.goals[0].target = {
      role: 'target',
      comparison: 'at_least',
      metric: { metricId: 'strength.load', value: 105, unit: 'kg' },
      assessmentDefinition: { id: 'strength.repetition_max', version: '1.0.0' },
      protocol: { id: 'strength-repetition-max-standard', version: '1.0.0' }
    }
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan,
      context: packet([strengthSeries([100, 101, 105, 106])])
    })

    expect(result.action).toBe('maintain')
    expect(result.trend).toBe('goal_met')
  })

  it('flags specificity when a training signal improves without direct transfer', () => {
    const adaptivePlan = plan({ includeTrainingSignal: true })
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan,
      context: packet([
        strengthSeries([100, 100, 100, 100]),
        series('rpe', 'session.rpe', 'training_signal', [8, 8, 6, 6], {
          definition: 'session.rpe',
          protocol: 'session-rpe-ten-point'
        })
      ])
    })

    expect(result.action).toBe('redirect')
    expect(result.rationale.join(' ')).toContain('without transfer')
  })

  it('redirects repeated direct contradiction without inventing a new dose', () => {
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([110, 109, 100, 99])])
    })

    expect(result.action).toBe('redirect')
    expect(result.evidenceStatus).toBe('contradicted')
    expect(result.proposalRecommendation.numericChangeStatus).toBe('athlete_input_required')
  })

  it('reports set decay and velocity loss without counting sets as separate exposures', () => {
    const velocity = series('velocity', 'bar.mean_velocity', 'training_signal', [
      1, 0.9, 1.01, 0.91, 1.02, 0.92, 1.03, 0.93
    ], {
      definition: 'strength.velocity_profile',
      protocol: 'bar-velocity-standard',
      samplesPerExposure: 2
    })
    const adaptivePlan = plan({
      metricId: 'bar.mean_velocity',
      semanticRole: 'training_signal',
      assessmentDefinitionId: 'strength.velocity_profile'
    })
    const result = evaluateAdaptation({
      goalId: 'goal-strength',
      adaptivePlan,
      context: packet([velocity])
    })

    expect(result.evidenceSnapshot?.series[0]).toMatchObject({
      sampleCount: 8,
      exposureCount: 4
    })
    expect(result.evidenceSnapshot?.series[0].setToSetDecayPercent).toBeGreaterThan(9)
    expect(result.evidenceSnapshot?.series[0].velocityLossPercent).toBeGreaterThan(9)
  })

  it('produces a stable content hash for the same as-of snapshot', () => {
    const input = {
      goalId: 'goal-strength',
      adaptivePlan: plan(),
      context: packet([strengthSeries([100, 101, 105, 106])])
    }
    const first = evaluateAdaptation(input)
    const second = evaluateAdaptation(input)

    expect(first.evidenceSnapshot?.id).toBe(second.evidenceSnapshot?.id)
    expect(first.evidenceSnapshot?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

function plan(options: {
  minimumComparableObservations?: number
  includeTrainingSignal?: boolean
  metricId?: PerformanceMetricId
  semanticRole?: EvidenceSemanticRole
  assessmentDefinitionId?: string
} = {}): AdaptivePlanContract {
  const metricId = options.metricId ?? 'strength.load'
  const semanticRole = options.semanticRole ?? 'direct_outcome'
  const definition = options.assessmentDefinitionId ?? 'strength.repetition_max'
  const requirements: ProgrammingHypothesis['evidenceRequirements'] = [{
    semanticRole,
    metricId,
    assessmentDefinitionId: definition,
    minimumComparableObservations: options.minimumComparableObservations ?? 2,
    evaluationWindowDays: 56
  }]
  if (options.includeTrainingSignal) {
    requirements.push({
      semanticRole: 'training_signal',
      metricId: 'session.rpe',
      assessmentDefinitionId: 'session.rpe',
      minimumComparableObservations: 2,
      evaluationWindowDays: 56
    })
  }
  const expectedSignals = requirements.map(requirement => ({
    id: `signal:${requirement.metricId}`,
    hypothesisId: 'hypothesis-strength',
    metricId: requirement.metricId,
    semanticRole: requirement.semanticRole,
    assessmentDefinitionId: requirement.assessmentDefinitionId,
    expectedDirection: directionFor(requirement.metricId),
    minimumComparableObservations: requirement.minimumComparableObservations,
    evaluationWindowDays: requirement.evaluationWindowDays
  }))
  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    contractVersion: ADAPTIVE_PLAN_CONTRACT_VERSION,
    assessmentCatalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
    policyVersion: ADAPTIVE_PLAN_POLICY_VERSION,
    goals: [{
      goalId: 'goal-strength',
      statement: 'Increase standardized strength performance',
      kind: 'performance_outcome',
      priority: 'primary',
      horizon: { startsOn: '2026-07-01', endsOn: '2026-09-30' },
      target: null
    }],
    qualityEmphases: [{
      id: 'emphasis-strength',
      goalId: 'goal-strength',
      qualityId: 'maximal_strength',
      state: 'priority_development',
      hypothesisId: 'hypothesis-strength',
      scheduledAssessmentIds: [],
      evaluationPolicyId: 'policy-strength'
    }],
    hypotheses: [{
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'hypothesis-strength',
      goalId: 'goal-strength',
      status: 'accepted',
      statement: 'Standardized strength exposure will improve the direct outcome.',
      qualityEmphases: [{ qualityId: 'maximal_strength', state: 'priority_development' }],
      evidenceRequirements: requirements,
      allowedActions: [...allActions],
      reviewWindow: { startsOn: '2026-07-01', endsOn: '2026-09-30' },
      policyVersion: ADAPTIVE_PLAN_POLICY_VERSION
    }],
    scheduledAssessments: [],
    expectedSignals,
    evaluationPolicies: [{
      id: 'policy-strength',
      hypothesisId: 'hypothesis-strength',
      policyVersion: ADAPTIVE_PLAN_POLICY_VERSION,
      reviewWindow: { startsOn: '2026-07-01', endsOn: '2026-09-30' },
      automaticPlanActivation: false,
      criteria: []
    }],
    coverageTraces: []
  }
}

function strengthSeries(values: number[], equipment = 'barbell'): CoachEvidenceSeries {
  return series(`strength-${equipment}`, 'strength.load', 'direct_outcome', values, {
    definition: 'strength.repetition_max',
    protocol: 'strength-repetition-max-standard',
    comparability: `comparison-v1|metric=strength.load|equipment=${equipment}`
  })
}

function series(
  id: string,
  metricId: PerformanceMetricId,
  semanticRole: EvidenceSemanticRole,
  values: number[],
  options: {
    definition: string
    protocol: string
    comparability?: string
    purpose?: 'adaptation_review' | 'general_coaching'
    samplesPerExposure?: number
  }
): CoachEvidenceSeries {
  const unit = unitFor(metricId)
  const perExposure = options.samplesPerExposure ?? 1
  const samples = values.map((value, index): CoachEvidenceSample => {
    const exposureIndex = Math.floor(index / perExposure)
    const ordinal = index % perExposure
    const observationId = `${id}-${exposureIndex + 1}`
    const date = String(10 + exposureIndex * 6).padStart(2, '0')
    return {
      observationId,
      observationValueId: `${observationId}-value-${ordinal}`,
      metricId,
      semanticRole,
      value,
      unit,
      originalMeasurement: { value, unit },
      ordinal,
      observedAt: `2026-08-${date}T12:00:00.000Z`,
      capturedAt: `2026-08-${date}T12:00:00.000Z`,
      workoutId: `workout-${id}-${exposureIndex + 1}`,
      prescribedSessionId: `session-${id}-${exposureIndex + 1}`,
      assessmentDefinition: {
        id: options.definition,
        catalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION
      },
      protocol: { id: options.protocol, version: '1.0.0' },
      comparabilityKey: options.comparability ?? `comparison-v1|metric=${metricId}|series=${id}`,
      source: {
        kind: 'coach_completion',
        system: 'sociusfit',
        device: null,
        recordId: `record-${observationId}`,
        verificationStatus: 'athlete_confirmed'
      },
      confidence: 1,
      comparison: {}
    }
  })
  return {
    id,
    metricId,
    semanticRole,
    assessmentDefinitionId: options.definition,
    protocol: { id: options.protocol, version: '1.0.0' },
    comparabilityKey: options.comparability ?? `comparison-v1|metric=${metricId}|series=${id}`,
    observationIds: [...new Set(samples.map(sample => sample.observationId))],
    sampleCount: samples.length,
    confidence: 1,
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    samples
  }
}

function packet(
  evidenceSeries: CoachEvidenceSeries[],
  options: {
    selectionComplete?: boolean
    purpose?: 'adaptation_review' | 'general_coaching'
    goalId?: string | null
  } = {}
): CoachEvidenceContextPacket {
  const purpose = options.purpose ?? 'adaptation_review'
  const goalId = options.goalId === undefined ? 'goal-strength' : options.goalId
  const evidenceIds = [...new Set(evidenceSeries.flatMap(item => item.observationIds))].sort()
  return {
    schemaVersion: 1,
    purpose,
    asOf,
    window: { startsAt: '2026-06-09T12:00:00.000Z', endsAt: asOf, days: 84 },
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    evidencePolicyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION,
    storageAvailable: true,
    selectionComplete: options.selectionComplete ?? true,
    scope: {
      userId: 'user-1',
      activeProgramId: 'program-active',
      activePlanVersionId: 'plan-active',
      goalId,
      prescribedSessionId: null,
      metricId: null,
      protocol: null,
      comparabilityKey: null
    },
    activePlan: {
      programId: 'program-active',
      title: 'Strength plan',
      goalSummary: 'Build strength',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      planVersionId: 'plan-active',
      planVersion: 1,
      referenceVersion: '0.1.0',
      policyVersion: ADAPTIVE_PLAN_POLICY_VERSION,
      goalIds: ['goal-strength'],
      sessionIds: []
    },
    session: null,
    memories: [],
    strengthBaselines: [],
    evidenceSeries,
    evidenceIds,
    sampleCount: evidenceSeries.reduce((total, item) => total + item.sampleCount, 0),
    limits: {
      maxMemories: 16,
      maxAssessments: 12,
      maxObservationSamples: 160,
      sourceTruncated: false,
      selectionTruncated: false
    },
    missing: [],
    reproduction: {
      request: { purpose, asOf, windowDays: 84, ...(goalId ? { goalId } : {}) },
      activePlanVersionId: 'plan-active',
      memoryIds: [],
      assessmentIds: [],
      observationIds: evidenceIds
    }
  }
}

function directionFor(metricId: PerformanceMetricId): AdaptiveExpectedDirection {
  if (metricId === 'session.rpe') return 'maintain_or_improve'
  if (metricId === 'sprint.time' || metricId === 'run.time') return 'decrease'
  return 'increase'
}

function unitFor(metricId: PerformanceMetricId): MetricUnit {
  if (metricId === 'strength.load') return 'kg'
  if (metricId === 'bar.mean_velocity') return 'm_per_s'
  return 'score'
}
