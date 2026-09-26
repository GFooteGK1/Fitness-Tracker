/** Synthetic offline review traces. No numerical policy, model, persistence or activation. */
import { buildAdaptivePlanContract } from '../app/lib/coach/adaptive-plan'
import { ADAPTATION_EVALUATOR_ALGORITHM_VERSION, evaluateAdaptation } from '../app/lib/coach/adaptation-evaluator'
import { ADAPTIVE_ASSESSMENT_CATALOG_VERSION, ADAPTIVE_EVIDENCE_POLICY_VERSION, findAssessmentDefinition, type EvidenceSemanticRole, type PerformanceMetricId } from '../app/lib/coach/adaptive-programming-contracts'
import { COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION, type CoachEvidenceContextPacket, type CoachEvidenceSample, type CoachEvidenceSeries } from '../app/lib/coach/evidence-context'
import type { PlanningOutcome } from '../app/lib/coach/planning-intent'
import { evaluateConfirmedOutcome } from '../app/lib/coach/targeted-review'
import { developmentCases, runBaselineCase } from './programming-quality-baseline'

const asOf = '2026-09-21T12:00:00.000Z'
const dates = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-20']
const goalId = 'synthetic-strength'

function base() {
  const plan = runBaselineCase(developmentCases().find(item => item.id === 'assessment-matched')!).plan!
  return { plan, adaptivePlan: buildAdaptivePlanContract(plan.profileSnapshot, [plan]) }
}

function evidence(id: string, metricId: PerformanceMetricId, exposures: Array<Array<number | null>>, options: {
  role?: EvidenceSemanticRole; protocolVariant?: string; startExposure?: number
} = {}): CoachEvidenceSeries {
  const definition = findAssessmentDefinition(metricId === 'strength.load' ? 'strength.repetition_max' : metricId === 'session.rpe' ? 'session.rpe' : 'strength.fixed_load_velocity')!
  const unit = metricId === 'strength.load' ? 'kg' as const : metricId === 'session.rpe' ? 'score' as const : 'm_per_s' as const
  const role = options.role ?? (metricId === 'strength.load' ? 'direct_outcome' : 'training_signal')
  const comparabilityKey = `${definition.id}|${options.protocolVariant ?? 'standard'}|${metricId === 'bar.mean_velocity' ? 'load185lb-reps2' : 'reps1'}`
  const samples: CoachEvidenceSample[] = exposures.flatMap((values, index) => values.flatMap((value, ordinal) => {
    if (value === null) return [] // Unknown sensor values stay absent, never zero-filled.
    const day = dates[(options.startExposure ?? 0) + index]
    const observationId = `${id}-exposure-${index + 1}`
    return [{ observationId, observationValueId: `${observationId}-rep-${ordinal + 1}`, metricId, semanticRole: role,
      value, unit, originalMeasurement: { value, unit }, ordinal, observedAt: `${day}T12:00:00.000Z`, capturedAt: `${day}T12:00:00.000Z`,
      workoutId: `synthetic-workout-${day}`, prescribedSessionId: null,
      assessmentDefinition: { id: definition.id, version: definition.version, catalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION },
      protocol: { ...definition.protocol, ...(options.protocolVariant ? { version: options.protocolVariant } : {}) }, comparabilityKey,
      source: { kind: 'manual', system: 'synthetic_review', device: metricId === 'bar.mean_velocity' ? 'synthetic-fixed-device' : null,
        recordId: observationId, verificationStatus: 'athlete_confirmed' }, confidence: 1,
      comparison: { movementId: metricId === 'bar.mean_velocity' ? 'barbell_floor_press' : 'barbell_back_squat', variationId: 'standard', equipmentIds: ['barbell'],
        repetitions: metricId === 'bar.mean_velocity' ? 2 : 1, externalLoad: metricId === 'bar.mean_velocity' ? { value: 185, unit: 'lb' } : null },
    }]
  }))
  return { id, metricId, semanticRole: role, assessmentDefinitionId: definition.id,
    protocol: samples[0].protocol, comparabilityKey, observationIds: [...new Set(samples.map(sample => sample.observationId))],
    sampleCount: samples.length, confidence: 1, algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION, samples }
}

function packet(series: CoachEvidenceSeries[]): CoachEvidenceContextPacket {
  const ids = series.flatMap(item => item.observationIds)
  return { schemaVersion: 1, purpose: 'adaptation_review', asOf, window: { startsAt: '2026-06-29T12:00:00.000Z', endsAt: asOf, days: 84 },
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION, evidencePolicyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION,
    storageAvailable: true, selectionComplete: true,
    scope: { userId: 'synthetic-signal-athlete', activeProgramId: 'synthetic-program', activePlanVersionId: 'synthetic-version', goalId, prescribedSessionId: null, metricId: null, protocol: null, comparabilityKey: null },
    activePlan: { programId: 'synthetic-program', title: 'Synthetic review', goalSummary: 'Standardized strength performance', startDate: '2026-08-01', endDate: '2027-04-01',
      planVersionId: 'synthetic-version', planVersion: 1, referenceVersion: 'synthetic', policyVersion: base().adaptivePlan.policyVersion, goalIds: [goalId], sessionIds: [] },
    session: null, memories: [], strengthBaselines: [], evidenceSeries: series, evidenceIds: ids, sampleCount: series.reduce((n, item) => n + item.sampleCount, 0),
    limits: { maxMemories: 16, maxAssessments: 12, maxObservationSamples: 160, sourceTruncated: false, selectionTruncated: false }, missing: [],
    reproduction: { request: { purpose: 'adaptation_review', asOf, windowDays: 84, goalId }, activePlanVersionId: 'synthetic-version', memoryIds: [], assessmentIds: [], observationIds: ids } }
}

function velocityOutcome(): PlanningOutcome {
  const definition = findAssessmentDefinition('strength.fixed_load_velocity')!
  return { goal: { schemaVersion: 1, id: 'synthetic-velocity', kind: 'performance_outcome', statement: 'Observe standardized fixed-load output', priority: 'primary', status: 'active', target: null, targetDate: null,
      requiredQualityIds: ['maximal_strength'], source: { kind: 'athlete_confirmed', confirmedAt: '2026-08-01T12:00:00.000Z' } }, domain: 'strength',
    measurement: { metricId: 'bar.mean_velocity', unit: 'm_per_s', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } },
    binding: { movementId: 'barbell_floor_press', variation: 'standard', equipmentIds: ['barbell'], distance: null,
      assessmentContext: { repetitions: 2, externalLoad: { value: 185, unit: 'lb' }, duration: null, techniqueModifiers: [], environmentModifiers: [] } },
    baseline: { status: 'unknown' }, capability: { status: 'supported' } }
}

function strengthOutcome(): PlanningOutcome {
  const outcome = velocityOutcome()
  const definition = findAssessmentDefinition('strength.repetition_max')!
  outcome.goal.id = 'synthetic-confirmed-strength'
  outcome.goal.statement = 'Improve standardized squat load'
  outcome.measurement = { metricId: 'strength.load', unit: 'kg', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
  outcome.binding = { movementId: 'barbell_back_squat', variation: 'standard', equipmentIds: ['barbell'], distance: null,
    assessmentContext: { repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
  return outcome
}

function velocityTrace(series: CoachEvidenceSeries[]) {
  const { plan, adaptivePlan } = base()
  const diagnosticContract = structuredClone(adaptivePlan)
  const hypothesis = diagnosticContract.hypotheses.find(item => item.goalId === goalId)!
  const originalRequirement = hypothesis.evidenceRequirements.find(item => item.semanticRole === 'direct_outcome')!
  // Same diagnostic setup as adaptation-evaluator.test.ts: request statistics from an
  // existing generic evaluator; this is NOT a product VBT policy or a dose adapter.
  hypothesis.evidenceRequirements = [{ ...originalRequirement, metricId: 'bar.mean_velocity', assessmentDefinitionId: 'strength.fixed_load_velocity', semanticRole: 'training_signal' }]
  const signal = diagnosticContract.expectedSignals.find(item => item.hypothesisId === hypothesis.id && item.semanticRole === 'direct_outcome')!
  diagnosticContract.expectedSignals = [{ ...signal, metricId: 'bar.mean_velocity', assessmentDefinitionId: 'strength.fixed_load_velocity', semanticRole: 'training_signal', expectedDirection: 'increase' }]
  const context = packet(series)
  return {
    diagnosticContractOrigin: 'Harness-only training-signal hypothesis for generic summary calculation; not product numerical eligibility',
    diagnosticContract, context,
    diagnostic: evaluateAdaptation({ goalId, adaptivePlan: diagnosticContract, context }),
    productTargeted: evaluateConfirmedOutcome({ goalId: 'synthetic-velocity', adaptivePlan, plan, outcome: velocityOutcome(), context }),
  }
}

function strengthTrace(values: number[], additional: CoachEvidenceSeries[] = []) {
  const { adaptivePlan } = base()
  const context = packet([evidence('direct-load', 'strength.load', values.map(value => [value])), evidence('reported-rpe', 'session.rpe', [7, 7, 7, 7].map(value => [value])), ...additional])
  return { adaptivePlan, context, result: evaluateAdaptation({ goalId, adaptivePlan, context }) }
}

export function runSignalReviewTraces() {
  const stable = [[0.50, 0.48], [0.51, 0.49], [0.50, 0.48], [0.51, 0.49]]
  const declining = [[0.54, 0.52], [0.53, 0.51], [0.49, 0.47], [0.48, 0.46]]
  const complete = [[0.50, 0.48], [0.51, 0.49], [0.52, 0.50], [0.53, 0.51]]
  const partial = [[0.50, 0.48], [0.51, 0.49], [null, 0.50], [0.53, 0.51]]
  const caseBase = { review: { reviewer: 'Greg Foote', decision: null, rationale: null, status: 'pending' }, synthetic: true }
  return { version: 'programming-quality-signal-traces-1', algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
    authority: 'Offline worked examples only; no numerical policy approval or plan activation',
    settingsSource: 'app/lib/coach/adaptation-evaluator.ts: constants and summarizeSeries; actual summary thresholds are retained in every result',
    cases: [
      { ...caseBase, id: 'stable-and-noisy-vbt' as const, measurements: { stable, isolatedSpike: [...stable.slice(0, 3), [0.65, 0.49]] },
        stable: velocityTrace([evidence('stable-vbt', 'bar.mean_velocity', stable)]), noisy: velocityTrace([evidence('noisy-vbt', 'bar.mean_velocity', [...stable.slice(0, 3), [0.65, 0.49]])]),
        proposedReview: 'Consider continuation rather than a durable change from one spike; this is pending coaching judgment.', question: 'Does best-repetition selection and the current repeated-agreement method distinguish meaningful response from sensor/outlier variation for this exact protocol?' },
      { ...caseBase, id: 'repeated-direct-improvement' as const, measurements: { standardizedOneRepLoadsKg: [100, 101, 105, 106], sessionRpe: [7, 7, 7, 7] },
        trace: strengthTrace([100, 101, 105, 106]), proposedReview: 'Identify whether hold or a particular bounded variable change best serves the actual goal; generic progress supplies no dose.', question: 'Given repeated direct improvement and stable reported effort, is any increase needed, and which exercise-specific prescription operation is justified?' },
      { ...caseBase, id: 'mixed-vbt-working-performance' as const, measurements: { velocity: declining, reportedWork: dates.map(date => ({ date, movement: 'Barbell floor press', loadLb: 205, sets: 4, repsPerSet: 2, reportedRpe: 7 })) },
        velocity: velocityTrace([evidence('declining-vbt', 'bar.mean_velocity', declining)]),
        proposedReview: 'Compare the declining monitoring series with unchanged working performance before proposing any targeted change. The current evaluator does not consume these performed-work bundles.', question: 'Which contextual/protocol check would resolve the mixed signals, and what would justify holding, changing monitoring, or changing the working dose?' },
      { ...caseBase, id: 'changed-protocol' as const, measurements: { standard: [100, 101], changedVersion: [105, 106] },
        trace: (() => { const { adaptivePlan, plan } = base(); const context = packet([evidence('standard', 'strength.load', [[100], [101]]), evidence('changed', 'strength.load', [[105], [106]], { protocolVariant: '2.0.0', startExposure: 2 }), evidence('reported-rpe', 'session.rpe', [[7], [7], [7], [7]])]); const outcome = strengthOutcome(); return { adaptivePlan, context, result: evaluateAdaptation({ goalId, adaptivePlan, context }),
          productTargeted: evaluateConfirmedOutcome({ goalId: outcome.goal.id, adaptivePlan, plan, context, outcome }) } })(),
        proposedReview: 'Keep protocol series separate; validate a new comparison rather than pool the four observations.', question: 'Is selecting one two-exposure series sufficiently explicit about the comparison gap, or should this review be withheld until one stable protocol has adequate evidence?' },
      { ...caseBase, id: 'missing-sensor-repetition' as const, measurements: { complete, partial, knownPerformedRepsPerExposure: [2, 2, 2, 2], missing: { exposure: 3, repetition: 1 } },
        complete: velocityTrace([evidence('sensor-complete', 'bar.mean_velocity', complete)]), partial: velocityTrace([evidence('sensor-partial', 'bar.mean_velocity', partial)]),
        proposedReview: 'Preserve two performed repetitions but label the third exposure sensor-incomplete; do not infer one performed rep. Current generic summaries have no expected-sensor-count gate.', question: 'Can the remaining reading represent this exposure, or must its best-repetition comparison be excluded or flagged until the missingness is resolved?' },
      { ...caseBase, id: 'schedule-only-correction' as const, measurements: { previousDays: ['monday', 'tuesday', 'wednesday'], confirmedDays: ['thursday', 'friday', 'saturday'], sessionMinutes: 60 },
        compiler: runBaselineCase(developmentCases().find(item => item.id === 'availability-correction')!),
        proposedReview: 'Create a feasibility-only proposal under unchanged physiological assumptions; current ordinary continuation cannot express this schedule edit.', question: 'Can we approve a supported rescheduling operation independently of trend evidence while preserving the intended doses and checking the whole week?' },
    ] }
}
