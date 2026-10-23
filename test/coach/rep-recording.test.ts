import { expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { assertRepRecording, parseQwikArrayRecordings, summarizeRepRecording } from '@/app/lib/coach/rep-recording'
import { validateActivityToolInput } from '@/app/lib/coach/activity-record-contract'
import { qwikArrayFixture, recordingOptions, recordingPatches } from './rep-recording-fixture'

it('preserves actual-format phase source values, signs, order, frames, pauses, units and original byte identity', async () => {
  const source = qwikArrayFixture(), raw = JSON.stringify(source, null, 2)
  const records = await parseQwikArrayRecordings(raw, recordingOptions)
  expect(records).toHaveLength(4)
  for (const [i, r] of records.entries()) {
    expect(r.source.file.sha256).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(r.source.file.byteLength).toBe(Buffer.byteLength(raw)); expect(r.source.setIndex).toBe(i)
    expect(r.set.rpe).toBe(i === 0 ? '<6' : '6.5'); expect(r.set.plate_diameter).toBe(45)
    expect(r.units).toEqual({ velocity: 'm/s', rangeOfMotion: 'm', duration: 'ms', frames: 'index', plateDiameter: null })
    for (const [j, rep] of r.repetitions.entries()) {
      expect(rep.ordinal).toBe(j + 1)
      expect(rep.concentricRepetition).toEqual(source[i].exercise_repetitions[j].concentricRepetition)
      expect(rep.eccentricRepetition).toEqual(source[i].exercise_repetitions[j].eccentricRepetition)
    }
    expect(r.rawTrace).toEqual({ field: 'bar_path', state: 'array', scalarCount: 4 })
    expect(JSON.stringify(r)).not.toContain('ignored_vendor_metadata')
    expect(r).not.toHaveProperty('value'); expect(r).not.toHaveProperty('device')
  }
  expect(records[0].repetitions[0].concentricRepetition).toMatchObject({ average_velocity: 0.41, peak_velocity: 0.81, rep_number: 4, duration_millis: 720 })
  expect(records[0].repetitions[0].eccentricRepetition).toMatchObject({ average_velocity: -0.7, peak_velocity: -1.12, range_of_motion_meters: -0.52 })
  expect(records[1].qualityFlags).toEqual([{ code: 'starts_at_frame_one', repOrdinal: 1, phase: 'concentricRepetition' }])
  expect(records[0].qualityFlags).toEqual([])
  const compact = await parseQwikArrayRecordings(JSON.stringify(source), recordingOptions)
  expect(compact[0].source.file.sha256).not.toBe(records[0].source.file.sha256)
})

it('distinguishes absent/null phases and metrics, raw traces and zero without inferring missing measurements', async () => {
  const source: any = qwikArrayFixture()
  delete source[0].exercise_repetitions[0].eccentricRepetition
  source[0].exercise_repetitions[1].eccentricRepetition = null
  delete source[0].exercise_repetitions[0].concentricRepetition.peak_velocity
  source[0].exercise_repetitions[1].concentricRepetition.peak_velocity = null
  source[0].exercise_repetitions[0].concentricRepetition.average_velocity = 0
  delete source[0].bar_path; source[1].bar_path = null; source[2].bar_path = []
  const records = await parseQwikArrayRecordings(JSON.stringify(source), recordingOptions)
  expect(records[0].repetitions[0]).not.toHaveProperty('eccentricRepetition')
  expect(records[0].repetitions[1].eccentricRepetition).toBeNull()
  expect(records[0].repetitions[0].concentricRepetition).not.toHaveProperty('peak_velocity')
  expect(records[0].repetitions[1].concentricRepetition?.peak_velocity).toBeNull()
  expect(records.map(r => r.rawTrace)).toEqual([
    { field: 'bar_path', state: 'absent', scalarCount: null }, { field: 'bar_path', state: 'null', scalarCount: null },
    { field: 'bar_path', state: 'array', scalarCount: 0 }, { field: 'bar_path', state: 'array', scalarCount: 4 }])
  expect(summarizeRepRecording(records[0], 'concentricRepetition', 'average_velocity')).toMatchObject({ includedCount: 2, missingCount: 0, min: 0 })
  expect(summarizeRepRecording(records[0], 'concentricRepetition', 'peak_velocity')).toMatchObject({ includedCount: 0, missingCount: 2, mean: null })
})

it('derives named arithmetic summaries separately, includes boundary caveats and never mutates source', async () => {
  const records = await parseQwikArrayRecordings(JSON.stringify(qwikArrayFixture()), recordingOptions), before = structuredClone(records)
  expect(summarizeRepRecording(records[1], 'concentricRepetition', 'average_velocity')).toEqual({ method: 'rep-arithmetic-summary-1', phase: 'concentricRepetition',
    metric: 'average_velocity', unit: 'm/s', includedCount: 4, missingCount: 0, boundaryPolicy: 'include_with_caveat', mean: (0.32 + 0.46 + 0.48 + 0.51) / 4, min: 0.32, max: 0.51 })
  expect(summarizeRepRecording(records[0], 'eccentricRepetition', 'peak_velocity').mean).toBe(-1.12)
  expect(records).toEqual(before)
})

it('rejects malformed source, ambiguous selections and unsupported wrapped exports without coercion', async () => {
  for (const raw of ['{}', 'null', '{', '[]', ' '.repeat(5_000_001), JSON.stringify({ export_format_version: '1.10', sets: qwikArrayFixture() })]) {
    await expect(parseQwikArrayRecordings(raw, recordingOptions)).rejects.toThrow()
  }
  for (const change of [
    (s: any) => { s[0].exercise_repetitions[0].concentricRepetition.average_velocity = '0.4' },
    (s: any) => { s[0].bar_path = [null] },
    (s: any) => { s[0].date = '2026-02-30T12:00:00Z' },
    (s: any) => { s[0].weight_unit = 'stone' },
    (s: any) => { s.push(s[0]) },
  ]) {
    const source = qwikArrayFixture(); change(source)
    await expect(parseQwikArrayRecordings(JSON.stringify(source), recordingOptions)).rejects.toThrow()
  }
  await expect(parseQwikArrayRecordings(JSON.stringify(qwikArrayFixture()), { ...recordingOptions, sourceSetIds: ['absent'] })).rejects.toThrow()
})

it('validates phase semantics and typed amendments before any request is started', async () => {
  const [r] = await parseQwikArrayRecordings(JSON.stringify(qwikArrayFixture()), recordingOptions)
  const command = (recording: unknown) => ({ entityId: randomUUID(), requestId: randomUUID(), expectedRevision: 1,
    changes: { setRecordings: recordingPatches([recording]) }, provenance: { fields: {} } })
  expect(() => validateActivityToolInput('amend_workout', command(r))).not.toThrow()
  const mutations = [
    (x: any) => { x.repetitions[0].concentricRepetition.average_velocity = NaN },
    (x: any) => { x.repetitions[0].concentricRepetition.average_velocity = Infinity },
    (x: any) => { x.repetitions[0].concentricRepetition.average_velocity = '0.4' },
    (x: any) => { x.repetitions[0].concentricRepetition.start_frame = -1 },
    (x: any) => { x.repetitions[0].concentricRepetition.end_frame = 0 },
    (x: any) => { x.repetitions[0].concentricRepetition.peak_velocity_frame = 10000 },
    (x: any) => { x.repetitions[0].concentricRepetition.is_concentric = false },
    (x: any) => { x.repetitions[1].concentricRepetition.id = x.repetitions[0].concentricRepetition.id },
    (x: any) => { x.repetitions[1].ordinal = 1 },
    (x: any) => { x.repetitions[0].concentricRepetition.exercise_repetition_pauses[0].end_frame = 3 },
    (x: any) => { x.units.velocity = 'km/h' }, (x: any) => { x.source.file.sha256 = 'bad' },
    (x: any) => { x.rawTrace.scalarCount = null }, (x: any) => { x.qualityFlags.push({ code: 'invalid_rep' }) },
    (x: any) => { x.bar_path = [1, 2] }, (x: any) => { x.source.file.reference = 'x'.repeat(501) },
  ]
  for (const mutate of mutations) { const bad = structuredClone(r); mutate(bad); expect(() => assertRepRecording(bad)).toThrow(); expect(() => validateActivityToolInput('amend_workout', command(bad))).toThrow() }
  const c: any = command(r); c.changes.setRecordings.push(c.changes.setRecordings[0]); expect(() => validateActivityToolInput('amend_workout', c)).toThrow('Duplicate')
  const c2: any = command(r); c2.changes.setRecordings[0].provenance.origin = 'athlete_reported'; expect(() => validateActivityToolInput('amend_workout', c2)).toThrow()
  const c3: any = command(r); c3.changes.blocks = []; expect(() => validateActivityToolInput('amend_workout', c3)).toThrow()
})
