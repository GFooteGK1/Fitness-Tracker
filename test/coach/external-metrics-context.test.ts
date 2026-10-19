import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectExternalMetricsContext as project } from '@/app/lib/coach/external-metrics-context'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'
import { projectEvidenceReasoningContext } from '@/app/lib/coach/evidence-reasoning-context'
import type { ContextSource } from '@/app/lib/coach/coaching-context'
import { reasoningEvidencePacket } from '../fixtures/coach-reasoning-evidence'
import { contextClient, contextNow, contextOwner, contextRows } from '../fixtures/coaching-context'

// Synthetic records, intentionally independent stored estimate versus source set.
const assessment = (change: Record<string, unknown> = {}) => ({ id: 'synthetic-assessment', user_id: contextOwner,
  movement: 'Synthetic lift', variation: 'paused', load: '75.00', unit: 'kg', reps: 3, assessed_on: '2026-10-17',
  is_true_rep_max: false, rir: '2.5', rpe: '7.5', athlete_confidence: '0.750', estimated_1rm: '88.00',
  estimate_kind: 'estimated_1rm', calculator_version: 'synthetic-stored-v9', provenance: { source: 'athlete_confirmed', formula: 'stored formula text' },
  created_at: '2026-10-17T13:00:00+00:00', updated_at: '2026-10-17T14:00:00+00:00', ...change })
const source = (rows = [assessment()], status: ContextSource['status'] = rows.length ? 'available' : 'missing', count: number | null = rows.length): ContextSource => ({ status, rows, count })
const run = (s = source(), evidence: ReturnType<typeof projectEvidenceReasoningContext> | null = null, budget?: number) => project(s, evidence, contextOwner, contextNow, '2026-10-18', budget)
const evidence = () => projectEvidenceReasoningContext(reasoningEvidencePacket(contextOwner), contextOwner)

function observationRows() {
  const rows = contextRows(); rows.coach_strength_assessments = [assessment()]
  rows.performance_observation_groups = [{ id: 'group-one', user_id: contextOwner, source_import_id: null, workout_id: null,
    prescribed_session_id: null, observation_kind: 'jump_attempt', status: 'complete', observed_at: '2026-10-17T12:00:00Z',
    captured_at: '2026-10-17T12:01:00Z', source_kind: 'manual', source_system: 'synthetic', source_device: 'none', source_record_id: 'record-one',
    assessment_definition_id: 'jump.height', assessment_catalog_version: '0.2.0', protocol_version: '1.0.0', verification_status: 'athlete_confirmed',
    comparability_key: 'synthetic-jump-standard-v1', comparison_modifiers: { equipmentIds: [] }, metadata: { protocolId: 'synthetic-jump-standard' } }]
  rows.performance_observation_values = [{ id: 'value-one', group_id: 'group-one', user_id: contextOwner, metric_id: 'jump.height',
    semantic_role: 'direct_outcome', value_numeric: '20.00', unit: 'in', ordinal: 0, status: 'complete', provenance: { source: 'synthetic' } }]
  return rows
}

describe('external metrics source fidelity and unknowns', () => {
  it('preserves source set, declared effort/confidence and stored estimate without recomputing or inventing capture/protocol', () => {
    const input = source(), saved = structuredClone(input), result = run(input), row = result.strengthAssessments.records[0]
    expect(result).toMatchObject({ version: 'external-metrics-assessments-1', authority: 'factual_context_only', numericPolicyEligible: false,
      strengthAssessments: { status: 'available', coverage: { complete: true, sourceCount: 1, includedRecords: 1, athleteCoverage: 'unknown' } } })
    expect(row.sourceSet).toEqual({ load: 75, unit: 'kg', reps: 3, isTrueRepMax: false, rir: 2.5, rpe: 7.5 })
    expect(row.calculation).toEqual({ metricId: 'strength.estimated_1rm', value: 88, unit: 'kg', estimateKind: 'estimated_1rm',
      basis: 'stored_estimate_not_measured_max', calculatorVersion: 'synthetic-stored-v9', recordedFormula: 'stored formula text', recomputed: false, independentlyValidated: false })
    expect(row.confidence).toEqual({ value: 0.75, basis: 'athlete_declared', independentlyCalibrated: false })
    expect(row.event).toEqual({ assessedOn: '2026-10-17', precision: 'date_only', timestamp: null, timezone: null })
    expect(row.source).toEqual({ table: 'coach_strength_assessments', id: 'synthetic-assessment', storageCreatedAt: '2026-10-17T13:00:00+00:00',
      storageUpdatedAt: '2026-10-17T14:00:00+00:00', sourceCapturedAt: null, sourceCaptureStatus: 'not_recorded', revision: null,
      revisionStatus: 'not_recorded', provenance: { source: 'athlete_confirmed' } })
    expect(row.protocol).toEqual({ status: 'not_recorded', value: null }); expect(row.comparability).toEqual({ status: 'not_recorded', key: null })
    expect(row.currentBaselineEligibility).toBe('not_assessed'); expect(input).toEqual(saved)
  })

  it.each([1, 3, 5])('retains %i-rep lb source intent with reported single distinct from independently measured maximum', reps => {
    const result = run(source([assessment({ load: 100, unit: 'lb', reps, estimated_1rm: 112, estimate_kind: reps === 1 ? 'reported_1rm' : 'estimated_1rm',
      is_true_rep_max: true, rir: null, rpe: null })]))
    expect(result.strengthAssessments.records[0]).toMatchObject({ sourceSet: { load: 100, unit: 'lb', reps, isTrueRepMax: true, rir: null, rpe: null },
      calculation: { value: 112, unit: 'lb', basis: reps === 1 ? 'reported_single_not_independently_verified' : 'stored_estimate_not_measured_max', independentlyValidated: false } })
  })

  it('keeps absent capture/effort/provenance unknown and labels partial metadata without fabricating dates', () => {
    const result = run(source([assessment({ created_at: null, updated_at: null, is_true_rep_max: undefined, rir: undefined, rpe: null, provenance: {} })]))
    expect(result.strengthAssessments).toMatchObject({ status: 'partial', coverage: { retrievalComplete: true, complete: false } })
    expect(result.strengthAssessments.records[0]).toMatchObject({ source: { sourceCapturedAt: null, storageCreatedAt: null, revision: null },
      sourceSet: { isTrueRepMax: null, rir: null, rpe: null }, calculation: { recordedFormula: null } })
  })

  it.each([{ load: '' }, { load: ' ' }, { load: true }, { load: '75kg' }, { load: Infinity }, { load: -1 }, { reps: 2 }, { reps: null },
    { estimated_1rm: NaN }, { estimated_1rm: 'bad' }, { athlete_confidence: 1.01 }, { athlete_confidence: null }, { unit: 'unknown' },
    { unit: ['kg'] }, { estimate_kind: ['estimated_1rm'] },
    { estimate_kind: 'direct_outcome' }, { estimate_kind: 'reported_1rm' }, { assessed_on: '2026-02-30' }, { assessed_on: '2026-10-19' }])(
    'omits malformed source %j without coercion or plausible invented facts', change => {
      const result = run(source([assessment(change)]))
      expect(result.strengthAssessments).toMatchObject({ status: 'partial', records: [], coverage: { complete: false } })
      expect(result.coverage.omitted).toContainEqual({ kind: 'strength_assessment', id: 'synthetic-assessment', reason: 'invalid_assessment_source' })
    })

  it('omits a post-cutoff amendment instead of reconstructing a nonexistent historical version', () => {
    const result = run(source([assessment({ updated_at: '2026-10-18T12:00:01Z' })]))
    expect(result.strengthAssessments.records).toEqual([])
    expect(result.coverage.omitted[0].reason).toBe('post_cutoff_storage_version')
  })

  it('preserves six-digit storage timestamp precision and refuses an invented timezone or invalid calendar date', () => {
    const result = run(source([assessment({ created_at: '2026-10-17T13:00:00.123456+00:00' })]))
    expect(result.strengthAssessments.records[0].source.storageCreatedAt).toBe('2026-10-17T13:00:00.123456+00:00')
    const invalid = run(source([assessment({ created_at: '2026-10-17T13:00:00', updated_at: '2026-02-30T13:00:00Z' })]))
    expect(invalid.strengthAssessments.records[0].source).toMatchObject({ storageCreatedAt: null, storageUpdatedAt: null, sourceCapturedAt: null })
    expect(invalid.strengthAssessments.coverage.complete).toBe(false)
  })

  it('never exports private, nested or oversized provenance and marks malformed effort explicitly', () => {
    const result = run(source([assessment({ rir: -1, rpe: 'abc', idempotency_key: 'DO-NOT-EXPORT', input_fingerprint: 'DO-NOT-EXPORT',
      provenance: { source: { private: 'DO-NOT-EXPORT' }, formula: 'x'.repeat(513), private: 'DO-NOT-EXPORT' } })]))
    expect(JSON.stringify(result)).not.toContain('DO-NOT-EXPORT')
    expect(JSON.stringify(result)).not.toContain('x'.repeat(513))
    expect(result.strengthAssessments.records[0]).toMatchObject({ sourceSet: { rir: null, rpe: null }, source: { provenance: { source: null } },
      issues: expect.arrayContaining(['rir_invalid', 'rpe_invalid', 'source_provenance_unrecorded_or_invalid']) })
    expect(result.coverage.complete).toBe(false)
  })

  it('distinguishes no eligible rows, unavailable, unknown count, source cap and whole-record budget omission', () => {
    expect(run(source([])).strengthAssessments).toMatchObject({ status: 'no_records', coverage: { complete: true, sourceCount: 0 } })
    expect(run(source([], 'unavailable', null)).strengthAssessments).toMatchObject({ status: 'unavailable', coverage: { complete: false, sourceCount: null } })
    expect(run(source([], 'truncated', null)).strengthAssessments).toMatchObject({ status: 'partial', coverage: { complete: false } })
    expect(run(source([assessment()], 'truncated', 19)).strengthAssessments).toMatchObject({ status: 'partial', coverage: { sourceCount: 19, retrievedRecords: 1, complete: false } })
    expect(run(source([assessment()], 'truncated', 19)).coverage.sourceCapExceeded).toBe(true)
    expect(run(source([], 'truncated', null)).coverage.sourceCapExceeded).toBe(false)
    const budget = run(source(), null, 1)
    expect(budget.strengthAssessments.records).toEqual([]); expect(budget.coverage.usedRecordCharacters).toBe(0)
    expect(budget.coverage.omitted).toEqual([{ kind: 'strength_assessment', id: 'synthetic-assessment', reason: 'record_budget' }])
  })

  it('retains observation original/normalized literals, semantic roles and distinct series without changing input', () => {
    const packet = evidence(), before = structuredClone(packet), sample = packet.evidenceSeries[0].samples[0]
    sample.metricId = 'jump.height'; sample.originalMeasurement = { value: 20, unit: 'in' }; sample.value = 0.508; sample.unit = 'm'
    const saved = structuredClone(packet), result = run(source([]), packet)
    expect(result.observations).toMatchObject({ dataPath: 'evidence.evidenceSeries', selectionPurpose: 'general_coaching', window: packet.window,
      selectionAlgorithmVersion: packet.algorithmVersion, includedSamples: 2, includedDerivations: 2, complete: true })
    expect(result.observations.derivations[0]).toEqual({ observationId: 'measurement-1', observationValueId: 'value-1', metricId: 'jump.height',
      semanticRole: 'training_signal', originalMeasurement: { value: 20, unit: 'in' }, returnedMeasurement: { value: 0.508, unit: 'm' },
      transformation: { kind: 'unit_normalization', function: 'normalizeMetricValue', independentlyStoredVersion: null,
        evidencePolicyVersion: packet.evidencePolicyVersion, createsNewMeasurement: false } })
    expect(result.observations.derivations[1].transformation.kind).toBe('identity')
    expect(packet).toEqual(saved); expect(before.evidenceSeries[0].samples[0].value).toBe(0.57)
    expect(run(source([]), packet, 1).observations).toMatchObject({ status: 'partial', includedSamples: 2, includedDerivations: 0 })
  })

  it('preserves evidence outage/selection gaps and refuses to manufacture body-measurement history', () => {
    const packet = evidence(); packet.coverage.complete = false; packet.coverage.storageAvailable = false
    expect(run(source([]), packet).observations).toMatchObject({ status: 'unavailable', complete: false })
    expect(run().bodyMeasurementHistory).toEqual({ status: 'not_exposed', reason: 'no_supported_dated_unit_bearing_history_source', records: [] })
  })

  it('rejects foreign source/packet ownership and invalid budget before returning facts', () => {
    expect(() => run(source([assessment({ user_id: 'other-owner' })]))).toThrow('Coaching context is unavailable')
    const packet = evidence(); packet.scope.userId = 'other-owner'
    expect(() => run(source([]), packet)).toThrow('Coaching context is unavailable')
    expect(() => run(source(), null, 0)).toThrow('Invalid metrics record budget')
  })
})

describe('metrics inside the existing authenticated stable context', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(contextNow); vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false') })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('reads named owned fields, uses actual normalization, preserves saved plans/requirements and performs no write/RPC/fetch', async () => {
    const rows = observationRows(), saved = structuredClone(rows), { db, traces, writes } = contextClient(rows)
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Forbidden network'))
    const result = await readCoachingContext(db, new URLSearchParams({ tzOffset: '0', days: '7' }))
    expect(result.metricsAndAssessments.strengthAssessments.records[0].sourceSet).toEqual({ load: 75, unit: 'kg', reps: 3, isTrueRepMax: false, rir: 2.5, rpe: 7.5 })
    expect(result.metricsAndAssessments.observations).toMatchObject({ status: 'available', includedSamples: 1, complete: true })
    expect(result.evidence!.evidenceSeries[0].samples[0]).toMatchObject({ originalMeasurement: { value: 20, unit: 'in' }, value: 0.508, unit: 'm',
      observedAt: '2026-10-17T12:00:00.000Z', capturedAt: '2026-10-17T12:01:00.000Z', protocol: { id: 'synthetic-jump-standard', version: '1.0.0' }, comparabilityKey: 'synthetic-jump-standard-v1' })
    expect(result.metricsAndAssessments.observations.derivations[0].transformation.kind).toBe('unit_normalization')
    expect(result.acceptedProgramming!.todaySessions[0].prescription).toEqual(saved.prescribed_sessions[0].prescription)
    expect(result.requirements.primary_goal.value).toEqual(saved.coach_memories[1].content)
    expect(traces.every(t => t.filters.some(([k, v]) => k === 'user_id' && v === contextOwner))).toBe(true)
    const raw = traces.filter(t => t.table === 'coach_strength_assessments' && t.columns.includes('created_at'))
    expect(raw).toHaveLength(2); expect(raw.every(t => t.limit === 16 && !t.columns.includes('fingerprint') && !t.columns.includes('idempotency'))).toBe(true)
    expect(rows).toEqual(saved); expect(writes).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
  })

  it.each(['coach_strength_assessments', 'performance_observation_groups', 'performance_observation_values', 'measurement_imports'])(
    'fails closed for foreign %s rows even if adapter ownership filters malfunction', async table => {
      const rows = observationRows()
      rows.performance_observation_groups[0].source_import_id = 'import-one'; rows.performance_observation_groups[0].source_kind = 'import'
      rows.measurement_imports = [{ id: 'import-one', user_id: contextOwner, status: 'confirmed', verification_status: 'athlete_confirmed' }]
      rows[table][0].user_id = 'foreign-owner'
      await expect(readCoachingContext(contextClient(rows, { foreignRows: true }).db, new URLSearchParams({ tzOffset: '0' })))
        .rejects.toMatchObject({ status: 503, message: 'Coaching context is unavailable' })
    })

  it.each(['rir', 'provenance', 'updated_at', 'load'])('rejects changed assessment %s with unchanged coach revision', async field => {
    const rows = observationRows(), db = contextClient(rows, { onRead: (table, n) => {
      if (table === 'coach_strength_assessments' && n === 3) rows[table][0][field] = field === 'provenance' ? { source: 'corrected' }
        : field === 'updated_at' ? '2026-10-18T11:00:00Z' : field === 'load' ? 76 : 1
    } }).db
    await expect(readCoachingContext(db, new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 409 })
  })

  it('rejects changed observation values between the two evidence reads', async () => {
    const rows = observationRows(), db = contextClient(rows, { onRead: (table, n) => {
      if (table === 'performance_observation_values' && n === 2) rows[table][0].value_numeric = 21
    } }).db
    await expect(readCoachingContext(db, new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 409 })
  })

  it('reports actual source cap/count, source outage and empty observation window independently', async () => {
    const rows = observationRows(); rows.coach_strength_assessments = Array.from({ length: 17 }, (_, i) => assessment({ id: `source-${i}` }))
    rows.performance_observation_groups = []; rows.performance_observation_values = []
    const result = await readCoachingContext(contextClient(rows).db, new URLSearchParams({ tzOffset: '0' }))
    expect(result.metricsAndAssessments.strengthAssessments).toMatchObject({ status: 'partial', coverage: { sourceCount: 17, retrievedRecords: 16, complete: false } })
    expect(result.metricsAndAssessments.coverage.sourceCapExceeded).toBe(true)
    expect(result.metricsAndAssessments.observations.status).toBe('partial')
    const empty = await readCoachingContext(contextClient(contextRows()).db, new URLSearchParams({ tzOffset: '0' }))
    expect(empty.metricsAndAssessments.observations.status).toBe('no_records')
    expect(empty.metricsAndAssessments.observations).toMatchObject({ comprehensiveHistory: false, emptyMeaning: 'no_retained_compatible_samples_not_no_recorded_measurements' })
    const outage = await readCoachingContext(contextClient(contextRows(), { failTable: 'coach_strength_assessments' }).db, new URLSearchParams({ tzOffset: '0' }))
    expect(outage.metricsAndAssessments.strengthAssessments.status).toBe('unavailable')
    expect(outage.acceptedProgramming!.plan).toMatchObject({ id: 'accepted-one' })
  })
})
