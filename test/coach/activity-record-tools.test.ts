import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { mcpActivityFixture, mcpOwnerClient } from '../database/mcp-activity-fixture'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'
import { canonicalActivityJson, validateActivityToolInput, type ActivityToolName } from '@/app/lib/coach/activity-record-contract'
import { buildExternalPerformedWorkContext } from '@/app/lib/coach/external-performed-work-context'
import { sqlFile } from '../database/fixture'

let sql: PGlite
const owner = randomUUID(), other = randomUUID()
const policy = { clientId: 'synthetic-client', issuer: 'https://auth.invalid', resource: 'https://socius.invalid/api/mcp' }
const principal = (subject = owner) => ({ ...policy, subject, role: 'authenticated', expiresAt: Date.now() + 60000 })
const field = (origin = 'athlete_reported', reviewState = 'athlete_confirmed') => ({ origin, reviewState, sourceReferences: ['synthetic:test'] })
const provenance = (keys: string[], origin?: string, state?: string) => ({ occurrence: field(), fields: Object.fromEntries(keys.map(key => [key, field(origin, state)])) })
const workout = () => ({ workout_date: '2026-10-20', input_text: 'Synthetic deadlift session', notes: 'Original note', rpe: 7.5,
  blocks: [{ block_type: 'STRENGTH', title: 'Synthetic trap bar', segments: [{ rounds: null, events: [{ movement_name: 'Trap-bar deadlift',
    performed: { set_details: Array.from({ length: 8 }, (_, i) => ({ id: randomUUID(), reps: 3, load: { value: 80 + i * 5, unit: 'kg' },
      rpe: i === 7 ? 7.5 : null, velocity: { value: 0.6 - i * 0.02, unit: 'm/s', metric: 'mean_concentric', device: 'Synthetic sensor', measuredAt: '2026-10-20T12:00:00Z' } })) } }] }] }] })
const meal = () => ({ meal_timestamp: '2026-10-20T23:40:00-05:00', meal_timing: 'DINNER', items: [
  { food: 'Synthetic food A', portion: '100 g', protein: 20, carbs: 30, fat: 10, calories: 290 },
  { food: 'Synthetic food B', portion: '1 serving', protein: 6, carbs: 0, fat: 5, calories: 69 }] })
const mealProvenance = () => provenance(['meal_timestamp', 'meal_timing', 'items', 'quantities', 'macros'], 'model_estimated', 'unreviewed')
const workoutProvenance = () => provenance(['workout_date', 'input_text', 'notes', 'rpe', 'blocks', 'quantities'])
async function actor(id = owner) { await sql.exec('SET ROLE authenticated'); await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
function tool(name: ActivityToolName, id = owner) { const client = mcpOwnerClient(sql, id); return { ...client, call: createActivityRecordTool(async () => ({ principal: principal(id), db: client.db }), policy, name).call } }
async function call(name: ActivityToolName, input: unknown, id = owner): Promise<any> { return (await tool(name, id).call(input)).structuredContent.activity }
const count = async (table: string) => Number((await sql.query<any>(`SELECT count(*) count FROM ${table}`)).rows[0].count)
beforeAll(async () => { vi.stubEnv('SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED', 'true'); sql = await mcpActivityFixture(); await sql.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other]); await actor() }, 30000)
afterAll(async () => { await sql?.close() })

describe('typed MCP persistence through installed owner RPCs and real PostgreSQL', () => {
  it('creates all eight sets once; corrects notes, one set/VBT and readiness with stable identity and original history', async () => {
    const record = workout(), requestId = randomUUID(), input = { requestId, record, provenance: workoutProvenance() }
    const first = await call('create_workout', input)
    expect(first).toMatchObject({ state: 'saved', readback: 'verified_saved_revision', receipt: { entityKind: 'workout', revision: 1 }, savedRecord: { rpe: 7.5 } })
    expect(first.savedRecord.blocks).toEqual(record.blocks)
    const id = first.receipt.entityId
    const notesInput = { requestId: randomUUID(), entityId: id, expectedRevision: 1, changes: { notes: 'Original note\nVBT addendum' }, provenance: provenance(['notes']) }
    const notes = await call('amend_workout', notesInput)
    expect(notes.receipt.revision).toBe(2); expect(notes.savedRecord.blocks).toEqual(record.blocks)
    const changed = structuredClone(record.blocks); changed[0].segments[0].events[0].performed.set_details[1].velocity.value = 0.51
    const corrected = await call('amend_workout', { requestId: randomUUID(), entityId: id, expectedRevision: 2, changes: { blocks: changed, rpe: 8.5 }, provenance: provenance(['blocks', 'quantities', 'rpe']) })
    expect(corrected.receipt).toMatchObject({ entityId: id, revision: 3 })
    expect(corrected.savedRecord.blocks[0].segments[0].events[0].performed.set_details[1].id).toBe(record.blocks[0].segments[0].events[0].performed.set_details[1].id)
    const readiness = { scale: '1-5', value: 4, reportedAt: '2026-10-20T11:55:00Z', notes: null }
    const ready = await call('amend_workout', { requestId: randomUUID(), entityId: id, expectedRevision: 3, changes: { readiness }, provenance: provenance(['readiness']) })
    expect(ready.savedRecord.blocks[0].session_readiness).toEqual(readiness)
    expect(ready.savedRecord.blocks[0].segments).toEqual(changed[0].segments)
    expect((await call('amend_workout', notesInput)).receipt).toEqual(notes.receipt)
    expect((await call('amend_workout', notesInput)).savedRecord).toEqual(notes.savedRecord)
    expect((await call('create_workout', input)).receipt).toEqual(first.receipt)
    expect((await call('create_workout', input)).savedRecord).toEqual(first.savedRecord)
    expect((await call('get_activity_record', { kind: 'workout', entityId: id })).record.capture_revision).toBe(4)
    expect((await call('get_activity_write_status', { requestId })).savedRecord).toEqual(first.savedRecord)
    const rows = (await sql.query<any>('SELECT revision,record FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision', [id])).rows
    expect(rows.map(row => row.revision)).toEqual([1, 2, 3, 4]); expect(rows[0].record.blocks).toEqual(record.blocks)
    const projection = buildExternalPerformedWorkContext({ userId: owner, mode: 'current', asOf: new Date(Date.now() + 1000).toISOString(), startsOn: '2026-10-19', endsOn: '2026-10-22',
      available: true, complete: true, workouts: [{ ...ready.savedRecord, rpe: 8.5 }], revisions: [], completions: [] })
    expect((projection.records[0] as any).recordedEvent.performed.set_details).toEqual(changed[0].segments[0].events[0].performed.set_details)
    expect(projection.blockContexts[0].recorded.session_readiness).toEqual(readiness)
  })

  it('recomputes meal totals, retains estimates after corrections, handles offset timestamp and exact replays', async () => {
    const record = meal(), input = { requestId: randomUUID(), record, provenance: mealProvenance() }
    const first = await call('create_meal', input)
    expect(first.savedRecord).toMatchObject({ total_protein: 26, total_carbs: 30, total_fat: 15, total_calories: 359, needs_review: true })
    expect(Date.parse(first.eventAt)).toBe(Date.parse(record.meal_timestamp))
    expect(first.receipt.eventAt).toBe(record.meal_timestamp)
    const items = structuredClone(record.items); items[1].protein = 8
    const amended = await call('amend_meal', { requestId: randomUUID(), entityId: first.receipt.entityId, expectedRevision: 1, changes: { items }, provenance: { fields: provenance(['items', 'quantities', 'macros'], 'model_estimated', 'corrected').fields } })
    expect(amended.savedRecord).toMatchObject({ total_protein: 28, total_calories: 359, needs_review: false })
    expect(amended.provenance.fields.macros.origin).toBe('model_estimated')
    expect((await call('create_meal', input)).savedRecord.total_protein).toBe(26)
    await expect(call('amend_meal', { requestId: randomUUID(), entityId: first.receipt.entityId, expectedRevision: 2, changes: { items }, provenance: { fields: provenance(['items', 'quantities', 'macros']).fields } })).rejects.toThrow('estimated origin')
    const before = await count('meals'); await call('create_meal', { ...input, requestId: randomUUID() }); expect(await count('meals')).toBe(before + 1)
  })

  it('rejects key reuse across payload/action, stale revision and ownership; keeps real RLS grants restrictive', async () => {
    const input = { requestId: randomUUID(), record: workout(), provenance: workoutProvenance() }
    const saved = await call('create_workout', input), id = saved.receipt.entityId
    await expect(call('create_workout', { ...input, record: { ...input.record, rpe: 6 } })).rejects.toThrow('different input')
    await expect(call('create_meal', { requestId: input.requestId, record: meal(), provenance: mealProvenance() })).rejects.toThrow('different input')
    const amend = { requestId: randomUUID(), entityId: id, expectedRevision: 1, changes: { notes: 'winner' }, provenance: provenance(['notes']) }
    await call('amend_workout', amend)
    await expect(call('amend_workout', { ...amend, requestId: randomUUID() })).rejects.toMatchObject({ status: 409 })
    await actor(other)
    await expect(call('get_activity_record', { kind: 'workout', entityId: id }, other)).rejects.toMatchObject({ status: 404 })
    await expect(call('amend_workout', { ...amend, requestId: randomUUID(), expectedRevision: 2 }, other)).rejects.toMatchObject({ status: 404 })
    expect(await call('get_activity_write_status', { requestId: input.requestId }, other)).toMatchObject({ state: 'unconfirmed', absenceProvesNoWrite: false })
    await expect(sql.query('SELECT amend_logged_activity($1,$2,2,$3,$4,$5,$6)', ['workout', id, randomUUID(), input.record, [], input.provenance])).rejects.toMatchObject({ code: '42501' })
    await actor()
    for (const table of ['workouts', 'meals', 'activity_revisions']) expect((await sql.query<any>("SELECT has_table_privilege('authenticated',$1,'UPDATE') allowed", [table])).rows[0].allowed).toBe(false)
    expect((await call('get_activity_record', { kind: 'workout', entityId: id })).record.notes).toBe('winner')
  })

  it('validates malformed records/unknowns before RPC; never converts missing nutrition to zero', async () => {
    const base = { requestId: randomUUID(), record: meal(), provenance: mealProvenance() }
    const bads = [ { ...base, user_id: other }, { ...base, record: { ...base.record, total_calories: 1 } },
      { ...base, record: { ...base.record, meal_timestamp: '2026-02-30T12:00:00Z' } },
      ...[null, -1, NaN, Infinity, '12'].map(protein => ({ ...base, record: { ...base.record, items: [{ ...base.record.items[0], protein }] } })),
      { ...base, record: { ...base.record, items: [{ food: 'missing', portion: 'unknown' }] } } ]
    const adapter = tool('create_meal')
    for (const bad of bads) await expect(adapter.call(bad)).rejects.toMatchObject({ status: 400 })
    expect(adapter.calls).toEqual([])
    expect(canonicalActivityJson({ b: 2, a: 1 })).toBe(canonicalActivityJson({ a: 1, b: 2 }))
    const w = workout(); w.blocks[0].segments[0].events[0].performed.set_details[1].id = w.blocks[0].segments[0].events[0].performed.set_details[0].id
    expect(() => validateActivityToolInput('create_workout', { requestId: randomUUID(), record: w, provenance: workoutProvenance() })).toThrow('unique stable ID')
  })

  it('recovers response loss after a real commit, with no duplicate row or revision', async () => {
    const input = { requestId: randomUUID(), record: meal(), provenance: mealProvenance() }
    const ownerClient = mcpOwnerClient(sql, owner), original = ownerClient.db.rpc.bind(ownerClient.db)
    let lost = false
    ownerClient.db.rpc = (async (...args: any[]) => {
      const result = await (original as any)(...args)
      if (args[0] === 'commit_logging_request_item' && !result.error) { lost = true; throw new Error('Synthetic lost transport') }
      return result
    }) as any
    const adapter = createActivityRecordTool(async () => ({ principal: principal(), db: ownerClient.db }), policy, 'create_meal')
    const before = await count('meals')
    await expect(adapter.call(input)).rejects.toThrow('unconfirmed'); expect(lost).toBe(true)
    const recovered = await call('get_activity_write_status', { requestId: input.requestId })
    expect(recovered).toMatchObject({ state: 'saved', receipt: { revision: 1 } })
    expect((await call('create_meal', input)).receipt).toEqual(recovered.receipt)
    expect(await count('meals')).toBe(before + 1)
  })

  it('fails closed for principal/DB owner mismatch before any query or RPC', async () => {
    const client = mcpOwnerClient(sql, other)
    const adapter = createActivityRecordTool(async () => ({ principal: principal(), db: client.db }), policy, 'create_meal')
    await expect(adapter.call({ requestId: randomUUID(), record: meal(), provenance: mealProvenance() })).rejects.toMatchObject({ status: 401 })
    expect(client.calls).toEqual([])
  })

  it('rolls canonical insertion back if the audit snapshot fails, then resumes the same frozen request', async () => {
    const input = { requestId: randomUUID(), record: meal(), provenance: mealProvenance() }, before = await count('meals')
    await sql.exec(`RESET ROLE; CREATE FUNCTION synthetic_reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic snapshot failure'; END $$;
      CREATE TRIGGER synthetic_snapshot_failure BEFORE INSERT ON activity_revisions FOR EACH ROW EXECUTE FUNCTION synthetic_reject_snapshot();`)
    await actor()
    await expect(call('create_meal', input)).rejects.toMatchObject({ status: 503 })
    expect(await count('meals')).toBe(before)
    expect(await call('get_activity_write_status', { requestId: input.requestId })).toMatchObject({ state: 'unconfirmed' })
    await sql.exec('RESET ROLE; DROP TRIGGER synthetic_snapshot_failure ON activity_revisions; DROP FUNCTION synthetic_reject_snapshot();')
    await actor()
    const saved = await call('create_meal', input)
    expect(saved).toMatchObject({ state: 'saved', receipt: { revision: 1 } }); expect(await count('meals')).toBe(before + 1)
  })

  it('preserves unrelated meal metadata, parse confidence, and estimated descendant provenance', async () => {
    const m = await call('create_meal', { requestId: randomUUID(), record: meal(), provenance: mealProvenance() })
    const w = await call('create_workout', { requestId: randomUUID(), record: workout(), provenance: workoutProvenance() })
    const path = 'blocks[0].segments[0].events[0].performed.set_details[0].load.value'
    await sql.exec('RESET ROLE')
    await sql.query("UPDATE meals SET ai_confidence=0.62,entry_method='quick_log',source_meal_id=id WHERE id=$1", [m.receipt.entityId])
    const source = structuredClone(w.provenance); source.fields[path] = field('model_estimated', 'unreviewed')
    await sql.query('UPDATE workouts SET parse_confidence=0.73,capture_provenance=$2 WHERE id=$1', [w.receipt.entityId, source])
    await actor()
    const changed = await call('amend_meal', { requestId: randomUUID(), entityId: m.receipt.entityId, expectedRevision: 1, changes: { meal_timing: 'SNACK' }, provenance: { fields: provenance(['meal_timing'], 'model_estimated', 'corrected').fields } })
    expect(changed.savedRecord).toMatchObject({ ai_confidence: 0.62, entry_method: 'quick_log', source_meal_id: m.receipt.entityId, needs_review: true })
    const note = await call('amend_workout', { requestId: randomUUID(), entityId: w.receipt.entityId, expectedRevision: 1, changes: { notes: 'metadata preserved' }, provenance: { fields: provenance(['notes']).fields } })
    expect(note.savedRecord.parse_confidence).toBe(0.73); expect(note.provenance.fields[path]).toEqual(source.fields[path])
    await expect(call('amend_workout', { requestId: randomUUID(), entityId: w.receipt.entityId, expectedRevision: 2, changes: { blocks: w.savedRecord.blocks }, provenance: { fields: provenance(['blocks', 'quantities']).fields } })).rejects.toThrow('estimated origin')
  })

  it('amends supported completed program execution without changing its accepted prescription/check-in', async () => {
    await sql.exec('RESET ROLE')
    const setup = sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0].replaceAll(', TRUE)', ', FALSE)')
    await sql.exec(`${setup}\nCOMMIT;`)
    const setting = async (key: string) => (await sql.query<any>('SELECT current_setting($1) v', [`atomic_completion_test.${key}`])).rows[0].v
    const user = await setting('user_1'), session = await setting('session_modified')
    await actor(user)
    const feedback = { schemaVersion: 2, feedbackVersion: 2, outcome: 'modified', sessionRpe: 7.5, energy: null, pain: null, note: null,
      provenance: { sessionRpe: { origin: 'athlete_reported', reviewState: 'athlete_confirmed' }, energy: { origin: 'unknown', reviewState: 'unreviewed' }, pain: { origin: 'unknown', reviewState: 'unreviewed' } } }
    const record = workout()
    const saved = (await sql.query<any>('SELECT record_coach_session_capture($1,\'completed\',$2,$3,$4,$5,$6) r', [session, feedback, '2026-10-20T12:00:00Z', randomUUID(),
      { mode: 'modified', workoutDate: '2026-10-20', inputText: record.input_text, blocks: record.blocks, totalDurationMinutes: null }, []])).rows[0].r
    const before = (await sql.query<any>('SELECT to_jsonb(s) session,to_jsonb(p) plan FROM prescribed_sessions s JOIN training_plan_versions p ON p.id=s.plan_version_id WHERE s.id=$1', [session])).rows[0]
    const checkin = (await sql.query<any>('SELECT to_jsonb(c) r FROM coach_checkins c WHERE id=$1', [saved.result.checkin_id])).rows[0].r
    const correction = { requestId: randomUUID(), entityId: saved.result.workout_id, expectedRevision: 1, changes: { notes: 'Corrected VBT note' }, provenance: { fields: provenance(['notes']).fields } }
    const amended = await call('amend_workout', correction, user)
    expect(amended.receipt).toMatchObject({ entityId: saved.result.workout_id, revision: 2 })
    expect(amended.savedRecord.execution_source).toBe('program_runner')
    expect((await sql.query('SELECT to_jsonb(s) session,to_jsonb(p) plan FROM prescribed_sessions s JOIN training_plan_versions p ON p.id=s.plan_version_id WHERE s.id=$1', [session])).rows[0]).toEqual(before)
    expect((await sql.query<any>('SELECT to_jsonb(c) r FROM coach_checkins c WHERE id=$1', [saved.result.checkin_id])).rows[0].r).toEqual(checkin)
    expect((await call('amend_workout', correction, user)).receipt).toEqual(amended.receipt)
    const legacy = (await sql.query<any>('SELECT record_coach_session_capture($1,\'completed\',$2,$3,$4,$5,$6) r', [await setting('session_as_prescribed'),
      { ...feedback, outcome: 'as_planned' }, '2026-10-20T12:00:00Z', randomUUID(),
      { mode: 'as_prescribed', workoutDate: '2026-10-20', inputText: null, blocks: null, totalDurationMinutes: null }, []])).rows[0].r
    const original = (await call('get_activity_record', { kind: 'workout', entityId: legacy.result.workout_id }, user)).record
    await expect(call('amend_workout', { ...correction, entityId: legacy.result.workout_id, requestId: randomUUID() }, user)).rejects.toThrow('unsupported by the installed audited correction contract')
    expect((await call('get_activity_record', { kind: 'workout', entityId: legacy.result.workout_id }, user)).record).toEqual(original)
    await actor()
  })

  it('looks up timestamp-precision workout metadata from the exact owned revision', async () => {
    const record = workout(), eventAt = '2026-10-20T23:40:00-05:00'
    const db = mcpOwnerClient(sql, owner).db
    const request = await db.rpc('begin_logging_request', { p_key: `synthetic-timestamp:${randomUUID()}`, p_fingerprint: 'a'.repeat(64) })
    const p = workoutProvenance()
    const frozen = await db.rpc('freeze_logging_request_items', { p_request_id: request.data.id, p_items: [{ sourceItemId: 'synthetic:0', kind: 'workout', record, blocks: [{}],
      provenance: { schemaVersion: 1, ...p }, inputMethod: 'manual', eventAt, eventPrecision: 'timestamp', eventTimezoneOffset: 300 }] })
    expect(frozen.error).toBeNull()
    const saved = await db.rpc('commit_logging_request_item', { p_item_id: frozen.data[0].id })
    expect(saved.error).toBeNull()
    const lookup = await call('get_activity_record', { kind: 'workout', entityId: saved.data.entityId })
    expect(lookup.eventPrecision).toBe('timestamp'); expect(Date.parse(lookup.eventAt)).toBe(Date.parse(eventAt))
    expect(lookup.eventSource).toBe('saved_revision'); expect(lookup.record.capture_revision).toBe(1)
  })
})
