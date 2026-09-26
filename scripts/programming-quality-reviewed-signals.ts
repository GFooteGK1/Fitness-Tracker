/** Offline development evaluation. Human agreement supplies criteria, not pass labels. */
import { runSignalReviewTraces } from './programming-quality-signal-traces'
import { findAssessmentDefinition } from '../app/lib/coach/adaptive-programming-contracts'

type Traces = ReturnType<typeof runSignalReviewTraces>
export type SignalCaseId = Traces['cases'][number]['id']
type CheckStatus = 'pass' | 'fail' | 'not_observed'
type Check = { id: string; status: CheckStatus; scope: 'product' | 'diagnostic' | 'fixture'; evidence: unknown; limitation: string | null }

export const reviewedSignalCriteria = [
  { id: 'stable-and-noisy-vbt', response: 'Retain work provisionally; investigate the spike and seek comparable confirmation.', forbidden: ['Declare the spike proven noise or adaptation.', 'Change dose from the isolated spike.'], pending: ['Device validity and best-repetition suitability', 'Exact confirmation rule'], humanCheck: 'Does the response identify the uncertainty and relevant setup/execution checks without asserting a cause?' },
  { id: 'repeated-direct-improvement', response: 'Recognize improvement; decide whether to continue successful work or adjust using goals, working performance, effort and recovery.', forbidden: ['Treat improvement as automatic authority to increase dose.', 'Claim the supplied session RPE was used when it was not.'], pending: ['Integrated effort and working-performance interpretation', 'Any specific permitted prescription change'], humanCheck: 'Is continuation a real option, and is any proposed change justified against the athlete goal and burden?' },
  { id: 'mixed-vbt-working-performance', response: 'Flag disagreement, investigate setup/intent/technique/recovery, and provisionally retain working prescription.', forbidden: ['Declare global capacity loss from monitoring velocity alone.', 'Claim mixed evidence was reconciled without consuming working performance.'], pending: ['Corroborating evidence criteria'], humanCheck: 'Does the explanation reconcile both signals and identify what evidence could change the decision?' },
  { id: 'changed-protocol', response: 'Keep protocols separate; retain work unless other evidence warrants change and confirm the future monitoring protocol.', forbidden: ['Pool incompatible observations into one trend.', 'Silently replace the confirmed benchmark.'], pending: ['Which future protocol to confirm', 'Sufficiency of comparable evidence'], humanCheck: 'Does the response distinguish progress against the original benchmark from results under a new protocol?' },
  { id: 'missing-sensor-repetition', response: 'Preserve performed repetitions, mark sensor incompleteness, and require a reviewed protocol-specific completeness rule before supporting a change.', forbidden: ['Infer fewer performed repetitions or reduced capacity from missing readings.', 'Zero-fill missing velocity.', 'Treat retrieval completeness as sensor completeness.'], pending: ['Protocol-specific incomplete-exposure handling'], humanCheck: 'Does the response separate work performed from measurements observed without inventing the missing reading?' },
  { id: 'schedule-only-correction', response: 'Propose a feasible reschedule; preserve intended prescriptions where possible and explain dose/emphasis changes separately before acceptance.', forbidden: ['Require physiological decline to honor availability.', 'Silently mutate the accepted plan.', 'Hide dose changes inside relocation.'], pending: ['Whole-week feasibility and persisted proposal integration'], humanCheck: 'Does the actual proposed week implement the reschedule and explain any unavoidable prescription change?' }
] as const satisfies ReadonlyArray<{ id: SignalCaseId; response: string; forbidden: readonly string[]; pending: readonly string[]; humanCheck: string }>

function check(id: string, condition: boolean, scope: Check['scope'], evidence: unknown, limitation: string | null = null): Check {
  return { id, status: condition ? 'pass' : 'fail', scope, evidence, limitation }
}
function unseen(id: string, limitation: string): Check {
  return { id, status: 'not_observed', scope: 'product', evidence: null, limitation }
}

export function evaluateReviewedSignalTraces(traces: Traces) {
  const expected = reviewedSignalCriteria.map(item => item.id)
  const actual = traces.cases.map(item => item.id)
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || expected.some(id => !actual.includes(id))) {
    throw new Error('Reviewed signal evaluation requires exactly one trace for each of the six agreed cases')
  }
  const cases = reviewedSignalCriteria.map(criterion => {
    const item = traces.cases.find(value => value.id === criterion.id)!
    const checks: Check[] = []
    switch (item.id) {
      case 'stable-and-noisy-vbt': {
        const trace = item.noisy!
        checks.push(check('isolated-spike-does-not-trigger-diagnostic-change', trace.diagnostic.action === 'continue', 'diagnostic', { action: trace.diagnostic.action }, 'Harness-only velocity hypothesis; not validated product VBT policy.'))
        checks.push(check('product-retains-active-plan', trace.productTargeted.evaluator.proposalRecommendation.activePlanUnchanged === true, 'product', trace.productTargeted.evaluator.proposalRecommendation))
        checks.push(unseen('investigate-spike-and-seek-confirmation', 'Trace has no user-facing investigation workflow. A stable label alone does not satisfy this criterion.'))
        break
      }
      case 'repeated-direct-improvement': {
        const result = item.trace!.result
        checks.push(check('evaluator-does-not-apply-dose', result.proposalRecommendation.activePlanUnchanged === true && result.proposalRecommendation.numericChangeStatus === 'athlete_input_required', 'product', result.proposalRecommendation, 'Evaluator boundary only; does not grade the downstream weekly prescription mapper.'))
        const selectedMetrics = result.evidenceSnapshot?.series.map(series => series.metricId) ?? []
        checks.push(check('supplied-effort-reaches-selected-evidence', selectedMetrics.includes('session.rpe'), 'product', { selectedMetrics }, 'Presence is necessary, not sufficient, for appropriate effort interpretation.'))
        checks.push(unseen('goal-and-burden-justify-continuation-or-adjustment', 'No semantic or downstream weekly-decision assessment is performed by this trace.'))
        break
      }
      case 'mixed-vbt-working-performance': {
        const trace = item.velocity!
        checks.push(check('product-retains-active-plan', trace.productTargeted.evaluator.proposalRecommendation.activePlanUnchanged === true, 'product', trace.productTargeted.evaluator.proposalRecommendation))
        checks.push(unseen('working-performance-reaches-evaluator', 'This trace has no structured performed-work input bridge or consumption receipt. Adding a strength.load series would not prove that the reported working sets were consumed and must not make this criterion pass.'))
        checks.push(unseen('mixed-evidence-reconciliation', 'Reported work is fixture context, not evidence consumed by this evaluator.'))
        break
      }
      case 'changed-protocol': {
        const targeted = item.trace!.productTargeted!
        const ids = targeted.context.evidenceIds
        const expectedSeries = item.trace!.context.evidenceSeries.find(series => series.id === 'standard')!
        const retained = targeted.context.evidenceSeries
        const definition = findAssessmentDefinition('strength.repetition_max')!
        const expectedValues: Record<string, number> = { 'standard-exposure-1': 100, 'standard-exposure-2': 101 }
        const fixtureBindingMatches = retained.flatMap(series => series.samples).every(sample => (
          sample.protocol.id === definition.protocol.id && sample.protocol.version === definition.protocol.version
          && sample.assessmentDefinition.id === definition.id && sample.assessmentDefinition.version === definition.version
          && sample.metricId === 'strength.load' && sample.unit === 'kg' && sample.value === expectedValues[sample.observationId]
          && sample.comparison.movementId === 'barbell_back_squat' && sample.comparison.repetitions === 1
          && sample.comparison.variationId === 'standard' && sample.comparison.externalLoad === null
          && JSON.stringify(sample.comparison.equipmentIds) === '["barbell"]'
        ))
        const samplesMatch = JSON.stringify(retained.flatMap(series => series.samples)) === JSON.stringify(expectedSeries.samples)
        checks.push(check('exact-confirmed-protocol-evidence', ids.length === 2 && ids.includes('standard-exposure-1') && ids.includes('standard-exposure-2') && retained.length === 1 && retained[0].protocol.id === definition.protocol.id && retained[0].protocol.version === definition.protocol.version && samplesMatch && fixtureBindingMatches, 'product', { ids, protocols: retained.map(series => series.protocol), expectedProtocol: definition.protocol, samplesMatch, fixtureBindingMatches }, 'Exact selected samples are checked against source input and the declared standard fixture identity, values and binding. This is a fixture-specific check, not a general protocol validator.'))
        const excluded = targeted.excludedSources.map(source => source.observationId)
        checks.push(check('changed-observations-explicitly-excluded', ['changed-exposure-1', 'changed-exposure-2'].every(id => excluded.includes(id)), 'product', { excluded }))
        checks.push(unseen('confirm-future-monitoring-protocol', 'Filtering to the existing binding does not establish a user-facing protocol confirmation operation.'))
        break
      }
      case 'missing-sensor-repetition': {
        const partial = item.partial!
        const samples = partial.context.evidenceSeries.flatMap(series => series.samples)
        checks.push(check('known-performed-work-preserved-in-fixture', JSON.stringify(item.measurements.knownPerformedRepsPerExposure) === '[2,2,2,2]', 'fixture', { performedReps: item.measurements.knownPerformedRepsPerExposure }, 'This is a fixture fact, not proof of runtime logging or persistence.'))
        checks.push(check('missing-reading-not-zero-filled', samples.length === 7 && samples.every(sample => sample.value > 0), 'fixture', { values: samples.map(sample => sample.value) }, 'Tests these positive synthetic velocity values only; not a general zero-value validity policy.'))
        checks.push(unseen('sensor-completeness-governs-comparison', 'Expected/performed sensor counts are not supplied to this evaluator; protocol-specific handling remains unreviewed.'))
        break
      }
      case 'schedule-only-correction': {
        const compiler = item.compiler!
        const expectedDays = [...item.measurements.confirmedDays!].sort()
        const actualDays = compiler.plan?.sessions.map(session => session.day).sort() ?? []
        checks.push(check('ordinary-continuation-produces-reschedule', compiler.status === 'compiled' && JSON.stringify(actualDays) === JSON.stringify(expectedDays), 'product', { status: compiler.status, error: compiler.error, actualDays, expectedDays }, 'This grades only the legacy ordinary-continuation entrypoint, not current confirmed-direction reconciliation. See separate downstream observations for that path. Matching days alone does not establish dose preservation or persisted acceptance.'))
        checks.push(check('fixture-does-not-assert-physiological-decline', compiler.reviewDecision?.action === 'continue', 'fixture', { action: compiler.reviewDecision?.action }, 'The review decision is supplied synthetically, not selected by a model.'))
        checks.push(unseen('saved-week-matches-reviewed-reschedule', 'Pure compiler trace has no persistence or acceptance entrypoint.'))
        break
      }
    }
    return { id: criterion.id, agreement: { reviewer: 'Greg Foote', status: 'agreed_qualitative_response', source: 'docs/verification/programming-quality/signal-review-decisions.md' }, criterion, checks, coachingAssessment: 'not_assessed' as const }
  })
  const checks = cases.flatMap(item => item.checks)
  return {
    version: 'reviewed-signals-evaluation-1', purpose: 'development_gap_analysis', synthetic: true, holdout: false,
    authority: 'No numerical approval, coaching pass, model call, plan mutation or runtime activation.',
    traceVersion: traces.version, algorithmVersion: traces.algorithmVersion,
    counts: { cases: cases.length, checks: checks.length, pass: checks.filter(item => item.status === 'pass').length, fail: checks.filter(item => item.status === 'fail').length, notObserved: checks.filter(item => item.status === 'not_observed').length, coachingAssessed: 0 },
    cases
  }
}

export function runReviewedSignalEvaluation() {
  return evaluateReviewedSignalTraces(runSignalReviewTraces())
}
