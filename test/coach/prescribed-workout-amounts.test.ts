import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExternalPerformedWorkContext as build } from '@/app/lib/coach/external-performed-work-context'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'
import { buildPerformedWorkContext } from '@/app/lib/coach/performed-work-context'
import { segmentedSnapshot } from '../fixtures/segmented-workouts'
import { contextClient, contextOwner, contextRows } from '../fixtures/coaching-context'

type Obj = Record<string, any>
// Synthetic names, amounts and IDs; only the observed field shapes are reused.
const event = (prescribed: Obj, performed: Obj = { reps: 2, time_s: 11 }) => ({ movement_name: 'Synthetic hold', performed, prescribed })
function snapshot(events = [event({ duration: { value: 33, unit: 's' } })], wrapped = false) {
  const input = segmentedSnapshot(), row = input.workouts[0]
  row.id = 'synthetic-prescribed-aliases'; row.workout_date = '2026-10-18'
  row.created_at = row.updated_at = '2026-10-18T12:00:00Z'
  const blocks = [{ ...(row.blocks as Obj[])[0], segments: [{ rounds: 3, events }] }]
  row.blocks = wrapped ? { blocks } : blocks
  input.workouts = [row]
  return input
}
const records = (input: ReturnType<typeof snapshot>) => build(input).records as Obj[]

describe('external prescribed duration and per-side amounts are raw intent only', () => {
  it('retains two duration objects and per-side forms exactly without changing performed quantities or input', () => {
    const prescriptions = [{ duration: { value: 33, unit: 's' } }, { duration: { value: 21, unit: 's' } },
      { reps_per_side: 7 }, { duration_per_side: { value: 45, unit: 's' } }]
    const input = snapshot(prescriptions.map(p => event(p))), saved = structuredClone(input)
    const internal = buildPerformedWorkContext(input), result = build(input), rows = result.records as Obj[]
    expect(result).toMatchObject({ status: 'available', authority: 'factual_context_only', numericPolicyEligible: false,
      coverage: { retrievalComplete: true, complete: true, selectedRecords: 4, includedRecords: 4, omitted: [], issues: [] } })
    expect(rows.map(r => r.recordedEvent.prescribed)).toEqual(prescriptions)
    expect(rows.map(r => r.sourcePath)).toEqual([0, 1, 2, 3].map(i => `blocks[0].segments[0].events[${i}]`))
    for (const r of rows) {
      expect(r.recordedEvent.performed).toEqual({ reps: 2, time_s: 11 })
      expect(r.quantities.repetitions).toMatchObject({ kind: 'exact', value: 2 })
      expect(r.quantities.durationMinutes.kind).toBe('unknown')
      expect(r).toMatchObject({ basis: 'estimated_work', origin: 'model_estimated', reviewState: 'unreviewed', completionState: 'not_independently_verified', movementId: null })
    }
    expect(result.segmentedEventLimitations.join(' ')).toContain('not confirmation of performed work')
    expect(input).toEqual(saved)
    expect(buildPerformedWorkContext(input)).toEqual(internal)
  })

  it('does not create a performed record from a prescription alone or support new performed aliases implicitly', () => {
    const input = snapshot([event({ duration: { value: 33, unit: 's' } }, {})])
    expect(build(input)).toMatchObject({ records: [], coverage: { complete: false, omitted: [expect.objectContaining({ reason: 'no_reported_performance' })] } })
    const other = snapshot([event({ duration: { value: 33, unit: 's' } }, { reps: 2, duration: { value: 99, unit: 's' } })])
    expect(records(other)[0].recordedEvent.performed).toEqual({ reps: 2 })
    expect(build(other).coverage.omitted).toContainEqual(expect.objectContaining({ sourcePath: 'blocks[0].segments[0].events[0].performed.duration', reason: 'unsupported_recorded_field' }))
  })

  it('preserves zero, finite fractional values, unfamiliar units, explicit null and absence without fabrication', () => {
    const prescriptions = [{ duration: { value: 0, unit: 'ticks' }, duration_per_side: { value: 1.25, unit: 'min' }, reps_per_side: 0.5 },
      { duration: null, duration_per_side: { value: 8 }, reps_per_side: null }, { duration: { unit: 'unknown' } }, {}]
    const input = snapshot(prescriptions.map(p => event(p))), result = build(input)
    expect((result.records as Obj[]).map(r => r.recordedEvent.prescribed)).toEqual(prescriptions)
    expect(result.coverage.omitted).toEqual([])
    expect((result.records as Obj[]).every(r => r.quantities.durationMinutes.kind === 'unknown')).toBe(true)
  })

  it('keeps coexisting forms separate and preserves unrelated ambiguity notices', () => {
    const p = { time_s: 77, duration: { value: 33, unit: 's' }, duration_per_side: { value: 21, unit: 'min' }, reps: 19, reps_per_side: 7 }
    const input = snapshot([event(p, { reps: 2, rep_range: { min: 3, max: 5 } })]), result = build(input), r = result.records[0] as Obj
    expect(r.recordedEvent.prescribed).toEqual(p)
    expect(r.quantities.repetitions).toMatchObject({ kind: 'unknown', reason: 'multiple_recorded_repetition_forms' })
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.omitted).toContainEqual(expect.objectContaining({ reason: 'ambiguous_recorded_repetitions' }))
  })

  it.each([
    [{ duration: '33s' }, 'duration'], [{ duration: [] }, 'duration'],
    [{ reps_per_side: '7' }, 'reps_per_side'], [{ reps_per_side: { private: 'DO-NOT-EXPORT' } }, 'reps_per_side'],
    [{ reps_per_side: NaN }, 'reps_per_side'], [{ reps_per_side: Infinity }, 'reps_per_side'],
    [{ duration: { value: '33', unit: 's' } }, 'duration.value'],
    [{ duration: { value: Infinity, unit: 's' } }, 'duration.value'],
    [{ duration: { value: { private: 'DO-NOT-EXPORT' }, unit: 's' } }, 'duration.value'],
    [{ duration: { value: 33, unit: { private: 'DO-NOT-EXPORT' } } }, 'duration.unit'],
    [{ duration_per_side: { value: 21, unit: false } }, 'duration_per_side.unit'],
    [{ duration_per_side: { value: 21, unit: 's', privateMetadata: 'DO-NOT-EXPORT' } }, 'duration_per_side.privateMetadata'],
  ])('reports malformed or private prescribed leaves %j without coercion/leakage', (prescribed, suffix) => {
    const result = build(snapshot([event(prescribed)]))
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.omitted).toContainEqual(expect.objectContaining({ sourcePath: `blocks[0].segments[0].events[0].prescribed.${suffix}` }))
    expect(result.records).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('DO-NOT-EXPORT')
    expect((result.records[0] as Obj).recordedEvent.performed).toEqual({ reps: 2, time_s: 11 })
  })

  it.each([false, true])('preserves exact corrected leaf provenance without upgrading performed facts (wrapped=%s)', wrapped => {
    const input = snapshot([event({ duration: { value: 33, unit: 's' }, reps_per_side: 7, duration_per_side: { value: 21, unit: 's' } })], wrapped)
    const root = wrapped ? 'blocks.blocks' : 'blocks', p = `${root}[0].segments[0].events[0]`
    const paths = ['duration.value', 'duration.unit', 'reps_per_side', 'duration_per_side.value', 'duration_per_side.unit'].map(k => `${p}.prescribed.${k}`)
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: { blocks: { origin: 'model_estimated', reviewState: 'unreviewed' },
      quantities: { origin: 'model_estimated', reviewState: 'unreviewed' },
      ...Object.fromEntries(paths.map(k => [k, { origin: 'athlete_reported', reviewState: 'corrected' }])) } }
    const saved = structuredClone(input), r = records(input)[0]
    expect(r.sourcePath).toBe(p)
    expect(r.recordedFieldProvenance).toEqual({ scope: 'retained_scalar_leaves', default: { origin: 'model_estimated', reviewState: 'unreviewed' },
      overrides: Object.fromEntries(paths.map(k => [k, { origin: 'athlete_reported', reviewState: 'corrected' }])) })
    expect(r).toMatchObject({ origin: 'model_estimated', reviewState: 'unreviewed', basis: 'estimated_work', snapshotId: null, revision: 1 })
    expect(input).toEqual(saved)
  })

  it('charges new fields to the existing record budget and omits an oversized record whole', () => {
    const result = build(snapshot([event({ duration: { value: 33, unit: 'x'.repeat(64_000) } })]))
    expect(result.records).toEqual([])
    expect(result.coverage).toMatchObject({ selectedRecords: 1, includedRecords: 0, complete: false })
    expect(result.coverage.usedRecordCharacters).toBeLessThanOrEqual(64_000)
    expect(result.coverage.omitted).toContainEqual(expect.objectContaining({ reason: 'record_budget' }))
  })
})

describe('prescribed aliases through the existing owned coaching context', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-10-19T00:13:53.447Z'); vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false') })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
  it('returns all four fields with owner-filtered SELECTs, original saved plan and zero writes/network', async () => {
    const rows = contextRows(), input = snapshot([event({ duration: { value: 33, unit: 's' } }), event({ duration: { value: 21, unit: 's' } }),
      event({ reps_per_side: 7 }), event({ duration_per_side: { value: 45, unit: 's' } })])
    rows.workouts = input.workouts.map(row => ({ ...row, user_id: contextOwner }))
    const saved = structuredClone(rows), { db, writes, traces } = contextClient(rows)
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    const result = await readCoachingContext(db, new URLSearchParams({ tzOffset: '300', days: '7' }))
    expect(result.performedWork).toMatchObject({ authority: 'factual_context_only', numericPolicyEligible: false,
      coverage: { selectedRecords: 4, includedRecords: 4, complete: true, omitted: [] } })
    expect((result.performedWork?.records as Obj[]).map(r => r.recordedEvent.prescribed)).toEqual([
      { duration: { value: 33, unit: 's' } }, { duration: { value: 21, unit: 's' } },
      { reps_per_side: 7 }, { duration_per_side: { value: 45, unit: 's' } },
    ])
    expect(result.acceptedProgramming?.todaySessions[0].prescription).toEqual(saved.prescribed_sessions[0].prescription)
    expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === contextOwner))).toBe(true)
    expect(rows).toEqual(saved)
    expect(writes).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
  })
})
