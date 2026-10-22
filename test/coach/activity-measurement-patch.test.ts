import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { mcpActivityFixture, mcpOwnerClient } from '../database/mcp-activity-fixture'
import { sqlFile } from '../database/fixture'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { buildExternalPerformedWorkContext } from '@/app/lib/coach/external-performed-work-context'
import { measurement, measurementBlocks, measurementField as field } from './activity-measurement-fixture'

let sql: PGlite
const owner = randomUUID(), other = randomUUID()
const migration = 'supabase/migrations/20261022164908_activity_measurement_corrections.sql'
const policy = { clientId: 'synthetic-shape', issuer: 'https://shape.invalid', resource: 'https://shape.invalid/mcp' }
const leaf = 'blocks[2].segments[0].events[0].performed.sets[3].velocity'
async function actor(id = owner) { await sql.exec('SET ROLE authenticated'); await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
function tool(name: any, id = owner) { const client = mcpOwnerClient(sql, id); return { ...client,
  call: createActivityRecordTool(async () => ({ db: client.db, principal: { ...policy, subject: id, role: 'authenticated', expiresAt: Date.now() + 60000 } }), policy, name).call } }
async function call(name: string, input: unknown, id = owner): Promise<any> { return (await tool(name, id).call(input)).structuredContent.activity }
const amendment = (id: string, revision: number, patch = measurement()) => ({ entityId: id, expectedRevision: revision, requestId: randomUUID(),
  changes: { setMeasurements: [patch] }, provenance: { fields: {} } })
async function seed(blocks = measurementBlocks(), origin = 'model_estimated') {
  const record = { workout_date: '2026-10-20', input_text: 'Synthetic fixture only', notes: 'Original synthetic note', rpe: 7.5, blocks }
  const provenance = captureProvenance('workout', origin as any, origin === 'athlete_reported' ? 'athlete_confirmed' : 'unreviewed')
  provenance.occurrence = field() as any
  provenance.fields['blocks[2].segments[0].events[0].performed.sets[0].load.value'] = field('model_estimated', 'unreviewed') as any
  const db = mcpOwnerClient(sql, owner).db
  const request: any = await db.rpc('begin_logging_request', { p_key: 'synthetic-shape:' + randomUUID(), p_fingerprint: 'a'.repeat(64) })
  const frozen: any = await db.rpc('freeze_logging_request_items', { p_request_id: request.data.id, p_items: [{ sourceItemId: 'synthetic:0', kind: 'workout',
    ...normalizeActivity('workout', record), provenance, inputMethod: 'text', eventAt: record.workout_date, eventPrecision: 'date' }] })
  expect(frozen.error).toBeNull()
  const saved: any = await db.rpc('commit_logging_request_item', { p_item_id: frozen.data[0].id }); expect(saved.error).toBeNull()
  return { id: saved.data.entityId, record, provenance }
}
async function projections() {
  // Disposable test-inspection role only; never widen owner grants to inspect rows.
  await sql.exec('RESET ROLE')
  const result: Record<string, unknown> = {}
  for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) result[table] =
    (await sql.query<any>(`SELECT to_jsonb(t) row FROM ${table} t WHERE user_id=$1 ORDER BY id`, [owner])).rows
  await actor(); return result
}
async function guardProjections(on: boolean) {
  await sql.exec('RESET ROLE')
  if (on) {
    await sql.exec("CREATE OR REPLACE FUNCTION public.synthetic_forbid_projection_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic forbidden projection churn'; END $$;")
    for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) await sql.exec(`CREATE TRIGGER synthetic_no_churn BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_forbid_projection_change()`)
  } else for (const table of ['block_scores', 'personal_records', 'benchmark_prs']) await sql.exec(`DROP TRIGGER synthetic_no_churn ON ${table}`)
  await actor()
}
beforeAll(async () => { vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED', 'true'); sql = await mcpActivityFixture(false);
  await sql.query('INSERT INTO auth.users VALUES($1),($2)', [owner, other]); await actor() }, 30000)
afterAll(async () => { vi.unstubAllEnvs(); await sql?.close() })

it('proves baseline churn, then installs idempotently without altering function identity/security/ACL', async () => {
  const original = await seed(), before = await projections()
  await call('amend_workout', { entityId: original.id, expectedRevision: 1, requestId: randomUUID(), changes: { notes: 'Baseline probe' }, provenance: { fields: { notes: field() } } })
  expect(await projections()).not.toEqual(before) // negative control: old SQL really rebuilds IDs
  await sql.exec('RESET ROLE')
  const security = () => sql.query("SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE proname='mutate_capture_activity'")
  const prior = (await security()).rows
  await sql.exec(sqlFile(migration)); await sql.exec(sqlFile(migration))
  expect((await security()).rows).toEqual(prior)
  await actor()
})

it('patches the revision-bound ID-less set while preserving all other JSON and exact provenance', async () => {
  const seeded = await seed(), command = amendment(seeded.id, 1), before = await projections()
  const saved = await call('amend_workout', command)
  const expected = structuredClone(seeded.record.blocks); expected[2].segments[0].events[0].performed.sets[3].velocity = command.changes.setMeasurements[0].velocity
  expect(saved.savedRecord.blocks).toEqual(expected); expect(saved.savedRecord.rpe).toBe(7.5)
  expect(saved.receipt).toMatchObject({ entityId: seeded.id, revision: 2, projectionsStatus: 'preserved_unchanged_inputs' })
  expect(saved.provenance.occurrence).toEqual(seeded.provenance.occurrence)
  expect(Object.fromEntries(Object.entries(saved.provenance.fields).filter(([path]) => !path.startsWith(leaf)))).toEqual(seeded.provenance.fields)
  for (const key of Object.keys(command.changes.setMeasurements[0].velocity)) expect(saved.provenance.fields[`${leaf}.${key}`]).toEqual(field())
  expect(await projections()).toEqual(before)
  const next = amendment(seeded.id, 2); next.changes.setMeasurements[0].setIndex = 2
  await call('amend_workout', next)
  expect((await call('amend_workout', command)).savedRecord).toEqual(saved.savedRecord)
  expect((await call('get_activity_write_status', { requestId: command.requestId })).receipt).toEqual(saved.receipt)
  await expect(call('amend_workout', { ...command, changes: next.changes })).rejects.toMatchObject({ status: 400 })
  await expect(call('amend_workout', { ...command, requestId: randomUUID() })).rejects.toMatchObject({ status: 409 })
  await actor(other)
  await expect(call('amend_workout', { ...command, requestId: randomUUID() }, other)).rejects.toMatchObject({ status: 404 })
  await actor()
})

it('retains set_details spelling, existing IDs, unknown measurement metadata and explicit nulls', async () => {
  const blocks = measurementBlocks(), performed = blocks[2].segments[0].events[0].performed
  performed.set_details = performed.sets; delete performed.sets
  performed.set_details[3].id = randomUUID(); performed.set_details[3].velocity = { vendorNote: 'retained', value: null }
  const seeded = await seed(blocks, 'athlete_reported'), patch = measurement(); patch.collection = 'set_details'; patch.velocity.device = null as any; patch.velocity.measuredAt = null as any
  const saved = await call('amend_workout', amendment(seeded.id, 1, patch))
  const expected = structuredClone(blocks); expected[2].segments[0].events[0].performed.set_details[3].velocity = { vendorNote: 'retained', ...patch.velocity }
  expect(saved.savedRecord.blocks).toEqual(expected)
  expect(saved.provenance.fields['blocks[2].segments[0].events[0].performed.set_details[3].velocity.device']).toEqual(field())
})

it('keeps existing estimated velocity origins and applies multiple paths atomically', async () => {
  const blocks = measurementBlocks(); blocks[2].segments[0].events[0].performed.sets[3].velocity = measurement().velocity
  const seeded = await seed(blocks), command = amendment(seeded.id, 1)
  await expect(call('amend_workout', command)).rejects.toThrow('estimated measurement')
  const patch = measurement(); patch.provenance = Object.fromEntries(Object.keys(patch.velocity).map(key => [key, field('model_estimated', 'corrected')]))
  const saved = await call('amend_workout', amendment(seeded.id, 1, patch))
  expect(saved.provenance.fields[`${leaf}.value`]).toEqual(field('model_estimated', 'corrected'))
  const invalid = measurement(); invalid.setIndex = 99
  await expect(call('amend_workout', { ...amendment(seeded.id, 2), changes: { setMeasurements: [{ ...patch, setIndex: 2 }, invalid] } })).rejects.toMatchObject({ status: 400 })
  expect((await call('get_activity_record', { kind: 'workout', entityId: seeded.id })).record).toEqual(saved.savedRecord)
})

it('preserves nonempty complete PR history/control rows and never touches projections for notes/readiness/VBT', async () => {
  const blocks = measurementBlocks()
  blocks[1].block_type = 'FOR_TIME'; blocks[1].block_score = { time_s: 100 }; blocks[1].title = 'Synthetic timed benchmark'
  await seed(blocks, 'athlete_reported') // same exercise control establishes previous-value history
  const stronger = structuredClone(blocks); stronger[1].segments[0].events[0].performed.load.value = 20
  const seeded = await seed(stronger, 'athlete_reported')
  // Seed legacy benchmark assertion to verify its exact identity survives metadata corrections.
  await sql.exec('RESET ROLE')
  await sql.query("INSERT INTO benchmark_prs(user_id,benchmark_name,date,score_value,score_display,rx_status,is_pr,workout_id) VALUES($1,'Synthetic timed benchmark','2026-10-20',100,'100','rx',true,$2)", [owner, seeded.id])
  await actor(); const before = await projections()
  expect((before.personal_records as any[]).length).toBeGreaterThan(2); expect((before.benchmark_prs as any[]).length).toBeGreaterThan(0)
  await guardProjections(true)
  try {
    await call('amend_workout', { entityId: seeded.id, expectedRevision: 1, requestId: randomUUID(), changes: { notes: 'Synthetic note' }, provenance: { fields: { notes: field() } } })
    await call('amend_workout', { entityId: seeded.id, expectedRevision: 2, requestId: randomUUID(), changes: { readiness: { scale: '1-5', value: 4, reportedAt: null, notes: null } }, provenance: { fields: { readiness: field() } } })
    await call('amend_workout', amendment(seeded.id, 3))
    expect(await projections()).toEqual(before)
  } finally { await guardProjections(false) }
})

it('database derives recomputation from actual facts/date/eligibility despite caller projection placeholders', async () => {
  const seeded = await seed(measurementBlocks(), 'athlete_reported'), before = await projections()
  const db = mcpOwnerClient(sql, owner).db
  const raw = async (record: any, provenance: any, revision: number) => db.rpc('amend_logged_activity', { p_kind: 'workout', p_entity_id: seeded.id,
    p_expected_revision: revision, p_request_id: randomUUID(), p_record: record, p_blocks: [{}, {}, {}], p_provenance: provenance })
  const record = structuredClone(seeded.record); record.blocks[1].segments[0].events[0].performed.load.value = 40
  expect((await raw(record, seeded.provenance, 1)).error).toBeNull(); expect(await projections()).not.toEqual(before)
  const weightHistory = async () => (await projections()).personal_records as any[]
  expect((await weightHistory()).some(({ row }) => row.workout_id === seeded.id && row.pr_type === 'weight' && row.value === 40)).toBe(true)
  let snapshot = await projections(); record.workout_date = '2026-10-19'
  expect((await raw(record, seeded.provenance, 2)).error).toBeNull(); expect(await projections()).not.toEqual(snapshot)
  expect((await weightHistory()).filter(({ row }) => row.workout_id === seeded.id).every(({ row }) => row.achieved_at.startsWith('2026-10-19'))).toBe(true)
  snapshot = await projections(); const changed = structuredClone(seeded.provenance); changed.fields.quantities = field('imported_unverified', 'unreviewed') as any
  expect((await raw(record, changed, 3)).error).toBeNull(); expect(await projections()).not.toEqual(snapshot)
  expect((await weightHistory()).filter(({ row }) => row.workout_id === seeded.id)).toEqual([])
})

it('rejects malformed paths/units/leaves and incompatible replacements before creating a ledger', async () => {
  const seeded = await seed(), command = amendment(seeded.id, 1), patch = measurement(), adapter = tool('amend_workout')
  const bads = [
    ...[-1, 0.5, 1000, '3'].map(setIndex => ({ ...patch, setIndex })),
    { ...patch, collection: 'prescribed' }, { ...patch, path: '__proto__' },
    ...['km/h', 'M/S'].map(unit => ({ ...patch, velocity: { ...patch.velocity, unit } })),
    ...[NaN, Infinity, -1, '0.47', 11].map(value => ({ ...patch, velocity: { ...patch.velocity, value } })),
    { ...patch, velocity: { ...patch.velocity, measuredAt: '2026-02-30T12:00:00Z' } },
    { ...patch, provenance: { value: field() } }, { ...patch, velocity: { ...patch.velocity, score: 10 } },
  ]
  for (const bad of bads) await expect(adapter.call({ ...command, changes: { setMeasurements: [bad] } })).rejects.toMatchObject({ status: 400 })
  await expect(adapter.call({ ...command, changes: { setMeasurements: [patch, patch] } })).rejects.toMatchObject({ status: 400 })
  await expect(adapter.call({ ...command, changes: { setMeasurements: [patch], blocks: [] } })).rejects.toMatchObject({ status: 400 })
  expect(adapter.calls).toEqual([])
  // Syntactically valid paths must still address existing supported source objects.
  for (const change of [{ setIndex: 99 }, { eventIndex: 99 }, { blockIndex: 0 }, { collection: 'set_details' }])
    await expect(call('amend_workout', { ...command, requestId: randomUUID(), changes: { setMeasurements: [{ ...patch, ...change }] } })).rejects.toMatchObject({ status: 400 })
  expect((await call('get_activity_record', { kind: 'workout', entityId: seeded.id })).record.capture_revision).toBe(1)
})

it('rolls back snapshot failure and recovers committed response loss with the original request', async () => {
  const seeded = await seed(), command = amendment(seeded.id, 1), before = await projections()
  await sql.exec('RESET ROLE')
  await sql.exec("CREATE FUNCTION public.synthetic_snapshot_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.revision=2 THEN RAISE EXCEPTION 'Synthetic snapshot failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_snapshot_fail BEFORE INSERT ON activity_revisions FOR EACH ROW EXECUTE FUNCTION public.synthetic_snapshot_fail();")
  await actor(); await expect(call('amend_workout', command)).rejects.toMatchObject({ status: 503 })
  expect((await call('get_activity_record', { kind: 'workout', entityId: seeded.id })).record.blocks).toEqual(seeded.record.blocks)
  expect(await projections()).toEqual(before)
  await sql.exec('RESET ROLE'); await sql.exec('DROP TRIGGER synthetic_snapshot_fail ON activity_revisions'); await actor()
  const client = mcpOwnerClient(sql, owner), original = client.db.rpc.bind(client.db)
  client.db.rpc = (async (...args: any[]) => { const result = await (original as any)(...args); if (args[0] === 'amend_logged_activity' && !result.error) throw new Error('Synthetic lost response'); return result }) as any
  const adapter = createActivityRecordTool(async () => ({ db: client.db, principal: { ...policy, subject: owner, role: 'authenticated', expiresAt: Date.now() + 60000 } }), policy, 'amend_workout')
  await expect(adapter.call(command)).rejects.toMatchObject({ status: 503 })
  const status = await call('get_activity_write_status', { requestId: command.requestId })
  expect(status.receipt.revision).toBe(2); expect((await call('amend_workout', command)).receipt).toEqual(status.receipt)
})

it('retains boolean VBT as unverified source context and does not infer velocity', async () => {
  const seeded = await seed(), blocks = structuredClone(seeded.record.blocks); blocks[2].segments[0].events[0].performed.sets[1].vbt = 'yes'
  const context = buildExternalPerformedWorkContext({ userId: owner, mode: 'current', asOf: new Date(Date.now() + 1000).toISOString(), startsOn: '2026-10-19', endsOn: '2026-10-22',
    available: true, complete: true, workouts: [{ ...seeded.record, blocks, id: seeded.id, user_id: owner, created_at: new Date().toISOString(), capture_provenance: seeded.provenance }], revisions: [], completions: [] })
  const event: any = context.records.find(row => row.sourcePath === 'blocks[2].segments[0].events[0]')
  expect(event.recordedEvent.performed.sets).toHaveLength(8)
  expect(event.recordedEvent.performed.sets[3]).toMatchObject({ vbt: true }); expect(event.recordedEvent.performed.sets[2]).toMatchObject({ vbt: false })
  expect(event.recordedEvent.performed.sets[3].velocity).toBeUndefined(); expect(event.recordedEvent.performed.sets[1].vbt).toBeUndefined()
  expect(event.completionState).toBe('not_independently_verified')
  expect(context.coverage.omitted.some(row => row.sourcePath.endsWith('.sets[1].vbt') && row.reason === 'unsupported_recorded_scalar_shape')).toBe(true)
})

it('default-off correction gate starts no mutation request', async () => {
  vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED', 'false')
  try { const adapter = tool('amend_workout'); await expect(adapter.call(amendment(randomUUID(), 1))).rejects.toMatchObject({ status: 503 }); expect(adapter.calls).toEqual([]) }
  finally { vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED', 'true') }
})
