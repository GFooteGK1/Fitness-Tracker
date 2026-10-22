import { describe, expect, it } from 'vitest'
import { buildExternalPerformedWorkContext as build } from '@/app/lib/coach/external-performed-work-context'
import { buildPerformedWorkContext, buildPerformedWorkEvidence } from '@/app/lib/coach/performed-work-context'
import { normalizePerformedDoseEvidence } from '@/app/lib/coach/performed-dose-evidence'
import { segmentedSnapshot } from '../fixtures/segmented-workouts'

type Obj = Record<string, any>
const block = (input: ReturnType<typeof segmentedSnapshot>) => (input.workouts[0].blocks as Obj[])[0]
const event = (input: ReturnType<typeof segmentedSnapshot>) => block(input).segments[0].events[0] as Obj
function one() { const input = segmentedSnapshot(); input.workouts = [input.workouts[0]]; block(input).segments[0].events = [event(input)]; return input }

describe('external-only segmented factual context', () => {
  it('retains eight nested performed.sets and legacy movement sets without deriving a set count', () => {
    const input = one(), sets = Array.from({ length: 8 }, (_, index) => ({ reps: index + 1, load: { value: 30 + index, unit: 'kg' } }))
    event(input).performed = { sets }
    const result = build(input), record = result.records[0] as Obj
    expect(record.recordedEvent.performed.sets).toEqual(sets)
    expect(record.quantities.sets.kind).toBe('unknown')
    block(input).movements = [{ name: 'Synthetic deadlift', sets }]; delete block(input).segments
    const legacy = build(input)
    expect(legacy.nestedSetContexts).toHaveLength(1)
    expect(legacy.nestedSetContexts[0].recordedSets).toEqual(sets)
    expect(legacy.nestedSetContexts[0].sourcePath).toBe('blocks[0].movements[0].sets')
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: { blocks: { origin: 'copied_template', reviewState: 'unreviewed' } } }
    const template = build(input)
    expect(template.nestedSetContexts).toEqual([])
    expect(template.coverage.omitted.some(item => item.reason === 'unreviewed_template_or_import')).toBe(true)
  })
  it('projects all representative sources without altering shared numeric/compiler/planning evidence', () => {
    const input = segmentedSnapshot(), before = structuredClone(input)
    const shared = buildPerformedWorkEvidence(input), prompt = buildPerformedWorkContext(input)
    const normalized = normalizePerformedDoseEvidence({ ...input, retrievalComplete: true, athleteCoverage: 'unknown', completions: [] })
    const result = build(input)
    expect(result).toMatchObject({ authority: 'factual_context_only', numericPolicyEligible: false, status: 'available',
      coverage: { complete: true, retrievalComplete: true, selectedRecords: 31, includedRecords: 31, additionalOmissions: 0, omitted: [], issues: [] } })
    expect(result.blockContexts).toHaveLength(8)
    expect(new Set(result.records.map(record => record.workoutId)).size).toBe(5)
    expect(result.coverage.usedRecordCharacters).toBeLessThanOrEqual(64000)
    expect(input).toEqual(before)
    expect(buildPerformedWorkEvidence(input)).toEqual(shared)
    expect(buildPerformedWorkContext(input)).toEqual(prompt)
    expect(prompt.records).toEqual([])
    expect(normalized.exposures).toEqual([])
  })

  it('keeps source paths, provenance, prescription, rounds and scores separate from actual quantities', () => {
    const result = build(segmentedSnapshot()), r = result.records[0] as Obj
    expect(r).toMatchObject({ recordKind: 'segmented_logged_event', sourcePath: 'blocks[0].segments[0].events[0]',
      recordedName: 'Synthetic movement 0', origin: 'model_estimated', reviewState: 'unreviewed', basis: 'estimated_work',
      completionState: 'not_independently_verified', movementId: null,
      quantities: { sets: { kind: 'unknown' }, repetitions: { kind: 'exact', value: 5 }, load: { kind: 'exact', value: 40 } },
      segmentContext: { recordedRounds: 2 }, recordedEvent: { prescribed: { reps: 9, load: { value: 99 } } } })
    expect(result.blockContexts[0]).toMatchObject({ authority: 'unverified_recorded_block_context', recorded: { block_score: { tonnage_lb: 800, is_pr: true } } })
    expect(result.records.some(record => record.origin === 'legacy_unknown' && record.reviewState === 'unreviewed')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('confirmed_prescription')
  })

  it('retains ranges, set details, per-leg counts, subreps, zeros and recorded time/distance units without aggregation', () => {
    const result = build(segmentedSnapshot()), records = result.records as Obj[]
    expect(records[1].quantities.load).toMatchObject({ kind: 'exact', value: 0 })
    expect(records[3]).toMatchObject({ quantities: { durationMinutes: { kind: 'unknown', reason: 'recorded_seconds_not_converted_to_minutes' } }, recordedEvent: { performed: { time_s: 45 } } })
    expect(records[4]).toMatchObject({ quantities: { sets: { kind: 'exact', value: 2 }, repetitions: { kind: 'unknown' } },
      recordedEvent: { performed: { set_details: [{ reps: 3 }, { reps: 4 }] } } })
    expect(records[5].recordedEvent.performed.set_details[0]).toMatchObject({ legs: 2, reps_per_leg: 4 })
    expect(records[6].quantities.repetitions).toMatchObject({ kind: 'bounded', min: 3, max: 6, sourcePath: 'blocks[0].segments[0].events[0].performed.rep_range' })
    expect(records[7].recordedEvent.performed.subreps).toEqual({ value: 8, unit: 'alternating' })
    const input = one(); event(input).performed.load.unit = 'stone'
    expect(build(input).records[0]).toMatchObject({ loadUnit: null, recordedEvent: { performed: { load: { unit: 'stone' } } } })
  })

  it('retains exact-path corrections for nested amounts, names, rounds and scores', () => {
    const input = one(), path = 'blocks[0].segments[0].events[0]'
    event(input).performed = { set_details: [{ reps: 3, load: { value: 20, unit: 'kg' } }] }
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: Object.fromEntries([
      `${path}.performed.set_details[0].reps`, `${path}.performed.set_details[0].load.unit`, `${path}.movement_name`,
      'blocks[0].segments[0].rounds', 'blocks[0].block_score.tonnage_lb',
    ].map(key => [key, { origin: 'athlete_reported', reviewState: 'corrected' }])) }
    const result = build(input), r = result.records[0] as Obj
    expect(r.recordedFieldProvenance).toMatchObject({ scope: 'retained_scalar_leaves', default: { origin: 'legacy_unknown' },
      overrides: { [`${path}.performed.set_details[0].reps`]: { origin: 'athlete_reported', reviewState: 'corrected' },
        [`${path}.performed.set_details[0].load.unit`]: { origin: 'athlete_reported', reviewState: 'corrected' } } })
    expect(r.nameProvenance.reviewState).toBe('corrected')
    expect(r.segmentContext.roundsProvenance.reviewState).toBe('corrected')
    expect(result.blockContexts[0].fieldProvenance.overrides['blocks[0].block_score.tonnage_lb'].reviewState).toBe('corrected')
  })

  it('does not leak private objects through nominal scalar leaves and reports unsupported details', () => {
    const input = one(), b = block(input), e = event(input)
    b.title = { secret: 'PRIVATE_BLOCK' }; b.segments[0].rounds = { secret: 'PRIVATE_ROUNDS' }
    e.performed.reps = { secret: 'PRIVATE_REPS' }; e.performed.load.value = { secret: 'PRIVATE_LOAD' }
    e.performed.extra = 'PRIVATE_EXTRA'; e.performed.set_details = [{ reps: 2, private_note: 'PRIVATE_SET' }, null]
    b.block_score.rx_status = ['PRIVATE_RX']; e.prescribed.load.unit = { secret: 'PRIVATE_UNIT' }
    const result = build(input)
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'unsupported_recorded_scalar_shape' }), expect.objectContaining({ reason: 'unsupported_recorded_field' }), expect.objectContaining({ reason: 'invalid_recorded_set_detail' })]))
    expect(JSON.stringify(result)).not.toContain('PRIVATE_')
  })

  it('never falls back to prescription, merges repeated names, or chooses between conflicting reported repetitions', () => {
    const input = one(), e = event(input)
    delete e.performed
    expect(build(input)).toMatchObject({ status: 'partial', records: [], coverage: { includedRecords: 0 } })
    e.performed = { reps: 0, rep_range: { min: 2, max: 4 } }
    const conflict = build(input)
    expect(conflict.records[0].quantities.repetitions).toMatchObject({ kind: 'unknown', reason: 'multiple_recorded_repetition_forms' })
    expect(conflict.coverage.complete).toBe(false)
    e.performed = { reps: 0, load: { value: -1, unit: 'kg' } }
    block(input).segments.push({ rounds: 1, events: [structuredClone(e)] })
    const result = build(input)
    expect(result.records).toHaveLength(2)
    expect(result.records[0].quantities.repetitions).toMatchObject({ kind: 'exact', value: 0 })
    expect(result.records[0].quantities.load.kind).toBe('unknown')
    expect(result.records[1].sourcePath).toContain('segments[1]')
  })

  it('rejects owner mismatches and reuses date/capture/noncompletion/source gates', () => {
    const foreign = one(); foreign.workouts[0].user_id = 'other'
    expect(() => build(foreign)).toThrow('ownership')
    const completion = one(); completion.completions = [{ id: 'foreign', user_id: 'other', prescribed_session_id: 'session', occurred_at: completion.asOf, created_at: completion.asOf, responses: {} }]
    expect(() => build(completion)).toThrow('ownership')
    for (const patch of [{ workout_date: '2026-10-11' }, { workout_date: '2026-02-30' }, { updated_at: '2026-10-20T00:00:00Z' }, { execution_status: 'in_progress' }, { execution_source: 'program_runner' }]) {
      const input = one(); Object.assign(input.workouts[0], patch)
      expect(build(input).records).toEqual([])
      expect(build(input).coverage.complete).toBe(false)
    }
    const unavailable = one(); unavailable.available = false
    expect(build(unavailable)).toMatchObject({ status: 'unavailable', records: [] })
    const partial = one(); partial.complete = false
    expect(build(partial).coverage).toMatchObject({ complete: false, retrievalComplete: false })
  })

  it('keeps malformed/unknown blocks partial and rejects mixed representations without duplicate native facts', () => {
    const input = one(); block(input).movements = [{ name: 'Native', reps: 5 }]
    expect(build(input)).toMatchObject({ status: 'partial', records: [] })
    delete block(input).movements; block(input).segments.push(null, { events: [] })
    const result = build(input)
    expect(result.records).toHaveLength(1)
    expect(result.coverage.omitted.some(value => value.reason === 'invalid_or_empty_segment_events')).toBe(true)
    expect(result.coverage.complete).toBe(false)
  })

  it('preserves wrapper paths, immutable snapshots and deletion semantics', () => {
    const input = one(); input.workouts[0].blocks = { blocks: input.workouts[0].blocks }
    expect(build(input).records[0].sourcePath).toBe('blocks.blocks[0].segments[0].events[0]')
    input.mode = 'historical_replay'
    input.revisions = [{ id: 'snapshot', user_id: input.userId, entity_kind: 'workout', original_entity_id: input.workouts[0].id,
      revision: 1, record: structuredClone(input.workouts[0]), provenance: input.workouts[0].capture_provenance,
      captured_at: input.workouts[0].created_at, event_at: input.workouts[0].created_at, deleted: false }]
    expect(build(input).records[0].snapshotId).toBe('snapshot')
    input.revisions[0].deleted = true
    expect(build(input).records).toEqual([])
    input.mode = 'current'; input.workouts = []
    expect(build(input).records).toEqual([])
  })

  it('bounds record output and omission accounting without silently truncating a record', () => {
    const input = one(); event(input).performed.set_details = Array.from({ length: 2000 }, () => ({ reps: 3, load: { value: 20, unit: 'kg' } }))
    const result = build(input)
    expect(result.records).toEqual([])
    expect(result.coverage.usedRecordCharacters).toBeLessThanOrEqual(64000)
    expect(result.coverage.omitted.some(value => value.reason === 'record_budget')).toBe(true)
    const many = one(); Object.assign(event(many), Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`unsupported${i}`, 'private'])))
    const bounded = build(many)
    expect(bounded.coverage.omitted).toHaveLength(128)
    expect(bounded.coverage.additionalOmissions).toBe(72)
    expect(bounded.coverage.complete).toBe(false)
  })
})
