import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { mcpActivityFixture, mcpOwnerClient } from '../database/mcp-activity-fixture'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { buildExternalPerformedWorkContext } from '@/app/lib/coach/external-performed-work-context'
import { parseQwikArrayRecordings, type RepRecording } from '@/app/lib/coach/rep-recording'
import { qwikArrayFixture, recordingOptions, recordingBlocks, recordingPatches, recordingProvenance } from './rep-recording-fixture'
import { measurement } from './activity-measurement-fixture'

let sql: PGlite, recordings: RepRecording[]
const owner = randomUUID(), other = randomUUID()
const policy = { clientId: 'synthetic-recording', issuer: 'https://recording.invalid', resource: 'https://recording.invalid/mcp' }
const root = 'blocks[2].segments[0].events[0].performed.sets'
async function actor(id = owner) { await sql.exec('SET ROLE authenticated'); await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
function tool(name: any, id = owner) { const client = mcpOwnerClient(sql, id); return { ...client,
  call: createActivityRecordTool(async () => ({ db: client.db, principal: { ...policy, subject: id, role: 'authenticated', expiresAt: Date.now() + 60000 } }), policy, name).call } }
async function call(name: string, input: unknown, id = owner): Promise<any> { return (await tool(name, id).call(input)).structuredContent.activity }
const command = (id: string, revision = 1, patches = recordingPatches(recordings)) => ({ entityId: id, expectedRevision: revision, requestId: randomUUID(),
  changes: { setRecordings: patches }, provenance: { fields: {} } })
async function seed(blocks = recordingBlocks(), customize?: (p: ReturnType<typeof captureProvenance>) => void) {
  const record = { workout_date: '2026-01-10', input_text: 'Synthetic source fixture only', notes: 'Retained synthetic notes', rpe: 6.5, blocks }
  const provenance = captureProvenance('workout', 'model_estimated', 'unreviewed')
  provenance.occurrence = { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }
  customize?.(provenance)
  const db = mcpOwnerClient(sql, owner).db
  const request: any = await db.rpc('begin_logging_request', { p_key: 'synthetic-recording:' + randomUUID(), p_fingerprint: 'b'.repeat(64) })
  const frozen: any = await db.rpc('freeze_logging_request_items', { p_request_id: request.data.id, p_items: [{ sourceItemId: 'synthetic:0', kind: 'workout',
    ...normalizeActivity('workout', record), provenance, inputMethod: 'text', eventAt: record.workout_date, eventPrecision: 'date' }] })
  expect(frozen.error).toBeNull()
  const saved: any = await db.rpc('commit_logging_request_item', { p_item_id: frozen.data[0].id }); expect(saved.error).toBeNull()
  return { id: saved.data.entityId, record, provenance }
}
async function projections() {
  await sql.exec('RESET ROLE')
  const result: Record<string, unknown> = {}
  for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) result[table] =
    (await sql.query<any>(`SELECT to_jsonb(t) row FROM ${table} t WHERE user_id=$1 ORDER BY id`, [owner])).rows
  await actor(); return result
}
function context(row: any) { return buildExternalPerformedWorkContext({ userId: owner, mode: 'current', asOf: new Date(Date.now() + 1000).toISOString(),
  startsOn: '2026-01-01', endsOn: '2026-12-31', available: true, complete: true,
  workouts: [{ ...row, user_id: owner, created_at: new Date().toISOString() }], revisions: [], completions: [] }) }
beforeAll(async () => {
  vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED', 'true'); sql = await mcpActivityFixture()
  await sql.query('INSERT INTO auth.users VALUES($1),($2)', [owner, other]); await actor()
  recordings = await parseQwikArrayRecordings(JSON.stringify(qwikArrayFixture()), recordingOptions)
}, 30000)
afterAll(async () => { vi.unstubAllEnvs(); await sql?.close() })

it('roundtrips four phase recordings through unchanged SQL, preserving eight sets, scalar missingness, provenance and projections', async () => {
  const seeded = await seed(), c = command(seeded.id), before = await projections()
  await sql.exec('RESET ROLE')
  await sql.exec("CREATE FUNCTION public.synthetic_recording_no_churn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Recording touched projections'; END $$;")
  for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) await sql.exec(`CREATE TRIGGER synthetic_recording_no_churn BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_recording_no_churn()`)
  await actor()
  let saved: any
  try { saved = await call('amend_workout', c); expect(await projections()).toEqual(before) }
  finally {
    await sql.exec('RESET ROLE')
    for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) await sql.exec(`DROP TRIGGER synthetic_recording_no_churn ON ${table}`)
    await actor()
  }
  const expected = structuredClone(seeded.record.blocks), sets = expected[2].segments[0].events[0].performed.sets
  recordings.forEach((r, i) => { sets[i + 3].velocity = { ...(sets[i + 3].velocity ?? {}), recording: r } })
  expect(saved.savedRecord.blocks).toEqual(expected)
  expect(saved.receipt).toMatchObject({ entityId: seeded.id, revision: 2, projectionsStatus: 'preserved_unchanged_inputs' })
  expect(saved.provenance.occurrence).toEqual(seeded.provenance.occurrence)
  expect(saved.savedRecord.notes).toBe(seeded.record.notes); expect(saved.savedRecord.rpe).toBe(6.5)
  expect(saved.provenance.fields.blocks).toEqual(seeded.provenance.fields.blocks)
  expect(saved.provenance.fields.quantities).toEqual(seeded.provenance.fields.quantities)
  expect(saved.provenance.fields[`${root}[3].velocity.recording.repetitions[0].eccentricRepetition.peak_velocity`]).toEqual(recordingProvenance())
  expect(saved.savedRecord.blocks[2].segments[0].events[0].performed.sets[3].velocity).not.toHaveProperty('value')
  const read = await call('get_activity_record', { kind: 'workout', entityId: seeded.id })
  expect(read.record.blocks).toEqual(expected); expect(read.record.capture_revision).toBe(2)
  const snapshots = await sql.query<any>('SELECT revision,record FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision', [seeded.id])
  expect(snapshots.rows.map(r => r.revision)).toEqual([1, 2]); expect(snapshots.rows[0].record.blocks).toEqual(seeded.record.blocks)
  expect(snapshots.rows[1].record.blocks).toEqual(expected)
  const external = context(read.record), event: any = external.records.find(r => r.sourcePath === 'blocks[2].segments[0].events[0]')
  expect(event.recordedEvent.performed.sets).toHaveLength(8)
  expect(event.recordedEvent.performed.sets[3].velocity.recording).toEqual(recordings[0])
  expect(event.recordedEvent.performed.sets[4].velocity.recording).toEqual(recordings[1])
  expect(event.recordedFieldProvenance.subtreeOverrides[`${root}[3].velocity.recording`]).toEqual({ origin: 'imported_unverified', reviewState: 'unreviewed', scope: 'all_recording_leaves' })
  expect(event.completionState).toBe('not_independently_verified')
  expect(external.coverage.omitted.some(r => r.reason === 'record_budget')).toBe(false)
  await call('amend_workout', { entityId: seeded.id, expectedRevision: 2, requestId: randomUUID(), changes: { notes: 'Later synthetic note' },
    provenance: { fields: { notes: { origin: 'athlete_reported', reviewState: 'corrected', sourceReferences: [] } } } })
  expect((await call('amend_workout', c)).savedRecord).toEqual(saved.savedRecord)
  expect((await call('get_activity_write_status', { requestId: c.requestId })).receipt).toEqual(saved.receipt)
  await expect(call('amend_workout', { ...c, changes: { setRecordings: [c.changes.setRecordings[0]] } })).rejects.toMatchObject({ status: 400 })
  await expect(call('amend_workout', { ...c, requestId: randomUUID() })).rejects.toMatchObject({ status: 409 })
})

it('rejects cross-owner reads/writes, duplicate sources, stale identities and invalid multi-path amendments atomically', async () => {
  const seeded = await seed(), c = command(seeded.id)
  await actor(other)
  await expect(call('get_activity_record', { kind: 'workout', entityId: seeded.id }, other)).rejects.toMatchObject({ status: 404 })
  await expect(call('amend_workout', c, other)).rejects.toMatchObject({ status: 404 }); await actor()
  const bad = structuredClone(c); bad.requestId = randomUUID(); bad.changes.setRecordings[3].setIndex = 99
  await expect(call('amend_workout', bad)).rejects.toMatchObject({ status: 400 })
  expect((await call('get_activity_record', { kind: 'workout', entityId: seeded.id })).record.blocks).toEqual(seeded.record.blocks)
  const dup = structuredClone(c); dup.requestId = randomUUID(); dup.changes.setRecordings[3].recording = dup.changes.setRecordings[2].recording
  await expect(call('amend_workout', dup)).rejects.toMatchObject({ status: 409 })
  await call('amend_workout', { ...c, requestId: randomUUID() })
  await expect(call('amend_workout', command(seeded.id, 2))).rejects.toMatchObject({ status: 409 })
  const repeated = command(seeded.id, 2, [recordingPatches(recordings)[2]]); repeated.changes.setRecordings[0].setIndex = 6
  await expect(call('amend_workout', repeated)).rejects.toMatchObject({ status: 409 })
  const replacement: any = command(seeded.id, 2, [recordingPatches(recordings)[0]])
  replacement.changes.setRecordings[0].expectedRecording = { fileSha256: recordings[0].source.file.sha256, sourceSetId: recordings[0].set.id }
  await expect(call('amend_workout', replacement)).rejects.toMatchObject({ status: 409 }) // exact source already attached
  replacement.requestId = randomUUID(); replacement.changes.setRecordings[0].recording = structuredClone(recordings[0])
  replacement.changes.setRecordings[0].recording.source.file.reference = 'synthetic:corrected-reference'
  replacement.changes.setRecordings[0].provenance.reviewState = 'corrected'
  expect((await call('amend_workout', replacement)).receipt.revision).toBe(3)
})

it('prevents a recording parent replacement from relabeling estimated descendants and preserves set_details IDs', async () => {
  const blocks = recordingBlocks(), sets = blocks[2].segments[0].events[0].performed.sets
  sets[3].velocity = { recording: recordings[0] }
  const seeded = await seed(blocks), c: any = command(seeded.id, 1, [recordingPatches(recordings)[0]])
  c.changes.setRecordings[0].expectedRecording = { fileSha256: recordings[0].source.file.sha256, sourceSetId: recordings[0].set.id }
  c.changes.setRecordings[0].recording = structuredClone(recordings[0]); c.changes.setRecordings[0].recording.set.notes = 'source correction'
  await expect(call('amend_workout', c)).rejects.toThrow('estimated recording')
  const detailBlocks = recordingBlocks(), performed = detailBlocks[2].segments[0].events[0].performed
  performed.set_details = performed.sets; delete performed.sets; performed.set_details.forEach((s: any) => { s.id = randomUUID() })
  const detail = await seed(detailBlocks), patches = recordingPatches(recordings).map(p => ({ ...p, collection: 'set_details' }))
  const saved = await call('amend_workout', command(detail.id, 1, patches))
  const expected = structuredClone(detailBlocks); recordings.forEach((r, i) => { const s = expected[2].segments[0].events[0].performed.set_details[i + 3]; s.velocity = { ...(s.velocity ?? {}), recording: r } })
  expect(saved.savedRecord.blocks).toEqual(expected)
})

it('recovers a lost committed response by the original request without a duplicate revision', async () => {
  const seeded = await seed(), c = command(seeded.id), client = mcpOwnerClient(sql, owner), original = client.db.rpc.bind(client.db)
  client.db.rpc = (async (...args: any[]) => { const result = await (original as any)(...args); if (args[0] === 'amend_logged_activity' && !result.error) throw new Error('Synthetic lost response'); return result }) as any
  const adapter = createActivityRecordTool(async () => ({ db: client.db, principal: { ...policy, subject: owner, role: 'authenticated', expiresAt: Date.now() + 60000 } }), policy, 'amend_workout')
  await expect(adapter.call(c)).rejects.toMatchObject({ status: 503 })
  const status = await call('get_activity_write_status', { requestId: c.requestId })
  expect(status.receipt.revision).toBe(2); expect((await call('amend_workout', c)).receipt).toEqual(status.receipt)
  expect((await call('get_activity_record', { kind: 'workout', entityId: seeded.id })).record.capture_revision).toBe(2)
})

it('keeps structured source unchanged when a later legacy scalar velocity amendment supplies its own summary', async () => {
  const seeded = await seed(), saved = await call('amend_workout', command(seeded.id))
  const scalar = measurement()
  const amended = await call('amend_workout', { entityId: seeded.id, expectedRevision: 2, requestId: randomUUID(),
    changes: { setMeasurements: [scalar] }, provenance: { fields: {} } })
  const expected = structuredClone(saved.savedRecord.blocks)
  Object.assign(expected[2].segments[0].events[0].performed.sets[3].velocity, scalar.velocity)
  expect(amended.savedRecord.blocks).toEqual(expected)
  expect(amended.savedRecord.blocks[2].segments[0].events[0].performed.sets[3].velocity.recording).toEqual(recordings[0])
})

it('does not traverse or replace unrelated malformed legacy segment/event containers', async () => {
  const blocks = recordingBlocks()
  blocks[0].segments = { retainedLegacy: true }
  blocks[1].segments = [{ rounds: 1, events: { retainedLegacy: null } }]
  const seeded = await seed(blocks), saved = await call('amend_workout', command(seeded.id))
  expect(saved.savedRecord.blocks.slice(0, 2)).toEqual(blocks.slice(0, 2))
  expect(saved.savedRecord.blocks[2].segments[0].events[0].performed.sets).toHaveLength(8)
})

it('reports malformed and oversized reader evidence without silently inventing or dropping other sets', async () => {
  const seeded = await seed(), blocks = structuredClone(seeded.record.blocks)
  blocks[2].segments[0].events[0].performed.sets[3].velocity = { value: 0.4, unit: 'm/s', recording: { schemaVersion: 999 } }
  const result = context({ ...seeded.record, id: seeded.id, blocks, capture_provenance: seeded.provenance })
  const event: any = result.records.find(r => r.sourcePath === 'blocks[2].segments[0].events[0]')
  expect(event.recordedEvent.performed.sets).toHaveLength(8); expect(event.recordedEvent.performed.sets[3].velocity).toEqual({ value: 0.4, unit: 'm/s' })
  expect(result.coverage.omitted.some(r => r.reason === 'invalid_structured_rep_recording')).toBe(true)
  const large = structuredClone(recordings[0]); large.source.file.reference = 's'.repeat(500)
  large.repetitions = Array.from({ length: 100 }, (_, i) => ({ ordinal: i + 1, concentricRepetition: { id: `synthetic-long-${i}`, rep_number: i, is_concentric: true,
    average_velocity: 0.3, peak_velocity: 0.8, start_frame: 2, end_frame: 80, peak_velocity_frame: 30,
    exercise_repetition_pauses: Array.from({ length: 30 }, (_, j) => ({ pause_number: j, start_frame: 40, end_frame: 42 })) } }))
  blocks[2].segments[0].events[0].performed.sets[3].velocity.recording = large
  const budget = context({ ...seeded.record, id: seeded.id, blocks, capture_provenance: seeded.provenance })
  expect(budget.coverage.omitted.some(r => r.reason === 'record_budget')).toBe(true)
})
