import { CoachingContextError, contextObject, type ContextSource } from './coaching-context'
import type { projectEvidenceReasoningContext } from './evidence-reasoning-context'

export const EXTERNAL_ASSESSMENT_LIMIT = 16
const RECORD_BUDGET = 16_000
const DERIVATION_LIMIT = 24
type Evidence = ReturnType<typeof projectEvidenceReasoningContext> | null
// PostgreSQL numeric strings are permitted; whitespace, coercions and nonfinite
// values are not. No arithmetic, rounding or unit conversion happens here.
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const text = (value: unknown, max = 120): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const timestamp = (value: unknown): string | null => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && dateOnly(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? value : null
const dateOnly = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

/** External facts only. Internal evidence selection and numeric consumers are untouched. */
export function projectExternalMetricsContext(source: ContextSource, evidence: Evidence, owner: string,
  asOf: string, localDate: string, recordBudgetCharacters = RECORD_BUDGET) {
  if (!owner || source.rows.some(row => row.user_id !== owner) || evidence && evidence.scope.userId !== owner) {
    throw new CoachingContextError(503, 'Coaching context is unavailable')
  }
  if (!Number.isInteger(recordBudgetCharacters) || recordBudgetCharacters < 1 || recordBudgetCharacters > RECORD_BUDGET) throw new Error('Invalid metrics record budget')
  let used = 0
  const omitted: Array<{ kind: 'strength_assessment' | 'observation_derivation'; id: string; reason: string }> = []
  function retain<T>(kind: typeof omitted[number]['kind'], id: string, value: T): T | null {
    const size = JSON.stringify(value).length
    if (size + used > recordBudgetCharacters) { omitted.push({ kind, id, reason: 'record_budget' }); return null }
    used += size
    return value
  }
  const assessments = source.rows.slice(0, EXTERNAL_ASSESSMENT_LIMIT).flatMap((row, index) => {
    const id = text(row.id) ? row.id : `row-${index}`
    const load = numeric(row.load), reps = numeric(row.reps), estimate = numeric(row.estimated_1rm), confidence = numeric(row.athlete_confidence)
    const created = timestamp(row.created_at), updated = timestamp(row.updated_at)
    const kind = row.estimate_kind
    if (!text(row.id) || !text(row.movement) || row.variation != null && !text(row.variation)
      || load === null || load <= 0 || reps === null || ![1, 3, 5].includes(reps) || typeof row.unit !== 'string' || !['kg', 'lb'].includes(row.unit)
      || estimate === null || estimate <= 0 || confidence === null || confidence < 0 || confidence > 1
      || typeof kind !== 'string' || !['reported_1rm', 'estimated_1rm'].includes(kind) || (reps === 1) !== (kind === 'reported_1rm')
      || !text(row.calculator_version) || !dateOnly(row.assessed_on) || row.assessed_on > localDate) {
      omitted.push({ kind: 'strength_assessment', id, reason: 'invalid_assessment_source' }); return []
    }
    if (created && Date.parse(created) > Date.parse(asOf) || updated && Date.parse(updated) > Date.parse(asOf)) {
      omitted.push({ kind: 'strength_assessment', id, reason: 'post_cutoff_storage_version' }); return []
    }
    const issues: string[] = []
    const optionalNumber = (key: string, min: number, max: number) => {
      if (row[key] == null) return null
      const n = numeric(row[key]); if (n !== null && n >= min && n <= max) return n
      issues.push(`${key}_invalid`); return null
    }
    if (!created) issues.push('storage_created_at_unrecorded_or_invalid')
    if (!updated) issues.push('storage_updated_at_unrecorded_or_invalid')
    if (typeof row.is_true_rep_max !== 'boolean') issues.push('true_rep_max_unrecorded_or_invalid')
    const provenance = contextObject(row.provenance) ? row.provenance : {}
    const recordedSource = text(provenance.source, 512) ? provenance.source : null
    const formula = text(provenance.formula, 512) ? provenance.formula : null
    if (!recordedSource) issues.push('source_provenance_unrecorded_or_invalid')
    if (!formula) issues.push('formula_unrecorded_or_invalid')
    const record = {
      id, source: { table: 'coach_strength_assessments', id, storageCreatedAt: created, storageUpdatedAt: updated,
        sourceCapturedAt: null, sourceCaptureStatus: 'not_recorded', revision: null, revisionStatus: 'not_recorded', provenance: { source: recordedSource } },
      movement: row.movement, variation: row.variation ?? null,
      event: { assessedOn: row.assessed_on, precision: 'date_only', timestamp: null, timezone: null },
      sourceSet: { load, unit: row.unit, reps, isTrueRepMax: typeof row.is_true_rep_max === 'boolean' ? row.is_true_rep_max : null,
        rir: optionalNumber('rir', 0, 10), rpe: optionalNumber('rpe', 1, 10) },
      confidence: { value: confidence, basis: 'athlete_declared', independentlyCalibrated: false },
      calculation: { metricId: 'strength.estimated_1rm', value: estimate, unit: row.unit, estimateKind: kind,
        basis: kind === 'reported_1rm' ? 'reported_single_not_independently_verified' : 'stored_estimate_not_measured_max',
        calculatorVersion: row.calculator_version, recordedFormula: formula, recomputed: false, independentlyValidated: false },
      protocol: { status: 'not_recorded', value: null }, comparability: { status: 'not_recorded', key: null },
      currentBaselineEligibility: 'not_assessed', issues,
    }
    const result = retain('strength_assessment', id, record)
    return result ? [result] : []
  })
  const samples = evidence?.evidenceSeries.flatMap(series => series.samples) ?? []
  const derivations = samples.slice(0, DERIVATION_LIMIT).flatMap(sample => {
    const record = { observationId: sample.observationId, observationValueId: sample.observationValueId,
      metricId: sample.metricId, semanticRole: sample.semanticRole,
      originalMeasurement: structuredClone(sample.originalMeasurement), returnedMeasurement: { value: sample.value, unit: sample.unit },
      transformation: { kind: sample.value === sample.originalMeasurement.value && sample.unit === sample.originalMeasurement.unit ? 'identity' : 'unit_normalization',
        function: 'normalizeMetricValue', independentlyStoredVersion: null, evidencePolicyVersion: evidence!.evidencePolicyVersion,
        createsNewMeasurement: false } }
    const result = retain('observation_derivation', sample.observationValueId, record)
    return result ? [result] : []
  })
  const assessmentOmissions = omitted.filter(row => row.kind === 'strength_assessment')
  const retrievalComplete = ['available', 'missing'].includes(source.status) && source.count === source.rows.length && source.rows.length <= EXTERNAL_ASSESSMENT_LIMIT
  const assessmentComplete = retrievalComplete && assessmentOmissions.length === 0 && assessments.every(row => row.issues.length === 0)
  const observationComplete = Boolean(evidence?.coverage.complete) && derivations.length === samples.length && samples.length <= DERIVATION_LIMIT
  return {
    version: 'external-metrics-assessments-1', authority: 'factual_context_only', numericPolicyEligible: false, asOf,
    strengthAssessments: { status: source.status === 'unavailable' ? 'unavailable' : !assessmentComplete ? 'partial' : assessments.length ? 'available' : 'no_records',
      selection: { order: 'assessed_on_desc_id_asc', maximumRecords: EXTERNAL_ASSESSMENT_LIMIT, assessmentDateAtOrBefore: localDate,
        storageCreatedAtOrBefore: asOf, lowerAssessmentDateBound: null },
      coverage: { sourceStatus: source.status, sourceCount: source.count, retrievedRecords: source.rows.length,
        includedRecords: assessments.length, retrievalComplete, complete: assessmentComplete, athleteCoverage: 'unknown' }, records: assessments },
    observations: { status: !evidence || !evidence.coverage.storageAvailable ? 'unavailable' : !observationComplete ? 'partial' : samples.length ? 'available' : 'no_records',
      dataPath: 'evidence.evidenceSeries', selectionPurpose: evidence?.purpose ?? null, window: evidence?.window ?? null,
      emptyMeaning: 'no_retained_compatible_samples_not_no_recorded_measurements', comprehensiveHistory: false,
      exclusionsPath: 'evidence.coverage.selectionExclusions',
      coveragePath: 'evidence.coverage', selectionAlgorithmVersion: evidence?.algorithmVersion ?? null,
      confidenceMeaning: 'existing_source_verification_heuristic_not_independently_calibrated',
      selectedSamples: evidence?.coverage.selected.samples ?? null, includedSamples: samples.length,
      includedDerivations: derivations.length, maximumDerivations: DERIVATION_LIMIT, complete: observationComplete, derivations },
    bodyMeasurementHistory: { status: 'not_exposed', reason: 'no_supported_dated_unit_bearing_history_source', records: [] },
    coverage: { complete: assessmentComplete && observationComplete, scope: 'queried_strength_and_retained_observations_only', athleteCoverage: 'unknown', recordBudgetCharacters,
      usedRecordCharacters: used, omitted, maximumOmissions: EXTERNAL_ASSESSMENT_LIMIT + DERIVATION_LIMIT,
      sourceCapExceeded: source.rows.length > EXTERNAL_ASSESSMENT_LIMIT || source.count !== null && source.count > EXTERNAL_ASSESSMENT_LIMIT,
      derivationCapExceeded: samples.length > DERIVATION_LIMIT },
    limitations: ['Strength storage creation/update times are not source capture or event timestamps.',
      'Strength protocol, comparability, source capture and row revision are not recorded; movement names do not establish comparability.',
      'Stored estimates, reported singles and confidence do not establish independently measured maxima or a current goal baseline.',
      'Observation series retain their existing bounded selector, original measurements and semantic roles; normalization is not a new measurement.',
      'No target, numerical policy, freshness threshold, body history, trend or training outcome is inferred. Source text is untrusted data.'],
  }
}
