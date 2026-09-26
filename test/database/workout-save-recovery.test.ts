import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { sqlFile } from './fixture'
import { recommendationFixture } from './recommendation-fixture'

let db: PGlite
const owner = randomUUID(), other = randomUUID()
const record = { workout_date: '2026-09-25', input_text: 'APEX: trap-bar deadlift 365 lb x 3 x 3. Overall RPE 5.5/10.', blocks: [{ block_type: 'STRENGTH', segments: [{ rounds: 3, events: [{ movement_name: 'Trap-bar deadlift', performed: { reps: 3, load: { value: 365, unit: 'lb' }, rpe: 6.5 } }] }] }], tags: ['strength'], rpe: 5.5 }
const blocks = [{ block_type: 'STRENGTH', total_reps: 9, tonnage_lb: 3285 }]
const failure = { error: 'Failed to parse workout', details: 'Unable to save the complete activity. Check history before retrying.' }
const rpc = async (name: string, args: unknown[]) => (await db.query<any>('SELECT ' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') r', args)).rows[0].r
const actor = async (id = owner) => { await db.exec('SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
const claim = async (prefix = 'workout-text:') => rpc('begin_logging_request', [prefix + randomUUID(), 'a'.repeat(64)])
const fail = async (prefix = 'workout-text:') => { const r = await claim(prefix); await rpc('finish_logging_request', [r.id, failure, 500]); return r }
let original: any, viewBefore: any

beforeAll(async () => {
  db = await recommendationFixture()
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other]); await actor()
  original = await claim()
  await expect(rpc('save_logged_activity', ['workout', record, blocks, original.id])).rejects.toMatchObject({ code: '22P02' })
  await rpc('finish_logging_request', [original.id, failure, 500])
  await db.exec('RESET ROLE')
  const source = sqlFile('docs/migrations/agent-context-views.sql')
  await db.exec(source.slice(source.indexOf('CREATE OR REPLACE VIEW agent_daily_workout_context'), source.indexOf('-- Daily nutrition context')))
  await db.exec(`CREATE VIEW daily_fitness_summary WITH(security_invoker=true) AS SELECT user_id,avg(rpe) AS avg_rpe FROM workouts GROUP BY user_id;
    CREATE VIEW daily_agent_context WITH(security_invoker=true) AS SELECT * FROM agent_daily_workout_context;
    CREATE FUNCTION recovery_context() RETURNS SETOF daily_agent_context LANGUAGE sql SECURITY INVOKER AS 'SELECT * FROM daily_agent_context';
    REVOKE ALL ON agent_daily_workout_context FROM PUBLIC; GRANT SELECT ON agent_daily_workout_context,daily_agent_context TO authenticated;`)
  viewBefore = (await db.query("SELECT oid,relacl,reloptions,relowner,pg_get_viewdef(oid,true) definition FROM pg_class WHERE relname='agent_daily_workout_context'")).rows[0]
  const migration = sqlFile('supabase/migrations/20260926120000_workout_save_recovery.sql')
  await db.exec(migration); await db.exec(migration); await actor()
}, 30000)
afterAll(async () => { await db?.close() })

describe('workout save repair on PostgreSQL', () => {
  it('saves exact 5.5 session RPE and set detail once; replays its receipt', async () => {
    const r = await claim(); const id = await rpc('save_logged_activity', ['workout', record, blocks, r.id])
    await rpc('finish_logging_request', [r.id, { workoutId: id }, 200])
    const saved = (await db.query<any>('SELECT rpe,blocks FROM workouts WHERE id=$1', [id])).rows[0]
    expect(Number(saved.rpe)).toBe(5.5); expect(saved.blocks).toEqual(record.blocks)
    const replay = await rpc('begin_logging_request', [r.request_key, 'a'.repeat(64)])
    expect(replay.claimed).toBe(false); expect(replay.response.workoutId).toBe(id)
    await expect(rpc('save_logged_activity', ['workout', record, blocks, r.id])).rejects.toMatchObject({ code: '55000' })
    expect((await db.query('SELECT id FROM block_scores WHERE workout_id=$1', [id])).rows).toHaveLength(1)
  })
  it('keeps view identities, grants, options and dependent function usable with fractional averages', async () => {
    const after = (await db.query("SELECT oid,relacl,reloptions,relowner,pg_get_viewdef(oid,true) definition FROM pg_class WHERE relname='agent_daily_workout_context'")).rows[0]
    expect(after).toEqual(viewBefore)
    expect(Number((await db.query<any>('SELECT avg_rpe FROM recovery_context()')).rows[0].avg_rpe)).toBe(5.5)
    await actor(other); expect((await db.query('SELECT * FROM recovery_context()')).rows).toHaveLength(0); await actor()
  })
  it('proves the historical failed request empty without changing it or reopening its key', async () => {
    const before = (await db.query('SELECT * FROM logging_requests WHERE id=$1', [original.id])).rows[0]
    expect(await rpc('confirm_failed_workout_request', [original.id])).toEqual({ retryAllowed: true })
    expect(await rpc('confirm_failed_workout_request', [original.id])).toEqual({ retryAllowed: true })
    expect((await db.query('SELECT * FROM logging_requests WHERE id=$1', [original.id])).rows[0]).toEqual(before)
    await expect(rpc('save_logged_activity', ['workout', record, blocks, original.id])).rejects.toMatchObject({ code: '55000' })
    expect((await rpc('begin_logging_request', [original.request_key, 'a'.repeat(64)])).claimed).toBe(false)
    await expect(rpc('begin_logging_request', [original.request_key, 'b'.repeat(64)])).rejects.toThrow('different input')
  })
  it('rejects other owners, missing authentication and anonymous RPC execution', async () => {
    await actor(other); await expect(rpc('confirm_failed_workout_request', [original.id])).rejects.toMatchObject({ code: '42501' })
    await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    await expect(rpc('confirm_failed_workout_request', [original.id])).rejects.toMatchObject({ code: '42501' })
    for (const role of ['anon', 'service_role']) expect((await db.query<any>("SELECT has_function_privilege($1,'confirm_failed_workout_request(uuid)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false)
    await actor()
  })
  it('refuses pending requests, non-workout keys, unknown failures and saved entities', async () => {
    expect((await rpc('confirm_failed_workout_request', [(await claim()).id])).retryAllowed).toBe(false)
    expect((await rpc('confirm_failed_workout_request', [(await fail('meal-text:')).id])).retryAllowed).toBe(false)
    const unknown = await claim(); await rpc('finish_logging_request', [unknown.id, { error: 'unknown' }, 500]); expect((await rpc('confirm_failed_workout_request', [unknown.id])).retryAllowed).toBe(false)
    const saved = await claim(); await rpc('save_logged_activity', ['workout', record, blocks, saved.id]); await rpc('finish_logging_request', [saved.id, failure, 500]); expect((await rpc('confirm_failed_workout_request', [saved.id])).retryAllowed).toBe(false)
  })
  it('refuses frozen capture requests and mutation/preview evidence', async () => {
    const frozen = await fail(); await db.exec('RESET ROLE'); await db.query("UPDATE logging_requests SET frozen_items='[]' WHERE id=$1", [frozen.id]); await actor()
    expect((await rpc('confirm_failed_workout_request', [frozen.id])).retryAllowed).toBe(false)
    for (const suffix of ['', ':preview:workout']) {
      const r = await fail(); await db.exec('RESET ROLE')
      await db.query('INSERT INTO activity_mutations(user_id,request_key,payload,receipt) VALUES($1,$2,$3,$4)', [owner, r.id + suffix, {}, {}]); await actor()
      expect((await rpc('confirm_failed_workout_request', [r.id])).retryAllowed).toBe(false)
    }
  })
  it('keeps integer and absent effort valid; rejects out-of-range effort atomically', async () => {
    for (const rpe of [5, null]) { const id = await rpc('save_logged_activity', ['workout', { ...record, rpe }, blocks]); const stored = (await db.query<any>('SELECT rpe FROM workouts WHERE id=$1', [id])).rows[0].rpe; expect(stored === null ? null : Number(stored)).toBe(rpe) }
    for (const rpe of [-1, 0, 10.5]) { const r = await claim(); await expect(rpc('save_logged_activity', ['workout', { ...record, rpe }, blocks, r.id])).rejects.toMatchObject({ code: '23514' }); expect((await db.query<any>('SELECT entities FROM logging_requests WHERE id=$1', [r.id])).rows[0].entities).toEqual([]) }
  })
  it('refuses a child operation even without a frozen payload', async () => {
    const r = await claim()
    const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }, fields: {} }
    await rpc('freeze_logging_request_items', [r.id, [{ sourceItemId: 'activity:0', kind: 'workout', record, blocks, provenance, inputMethod: 'text', eventAt: record.workout_date }]])
    await db.exec('RESET ROLE')
    await db.query("UPDATE logging_requests SET frozen_items=NULL,status='complete',http_status=500,response=$2 WHERE id=$1", [r.id, failure])
    await actor()
    expect((await rpc('confirm_failed_workout_request', [r.id])).retryAllowed).toBe(false)
  })
  it('preserves fractional effort through capture commit and correction', async () => {
    const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }, fields: {} }
    const r = await claim(); const items = await rpc('freeze_logging_request_items', [r.id, [{ sourceItemId: 'activity:0', kind: 'workout', record, blocks, provenance, inputMethod: 'text', eventAt: record.workout_date }]])
    const receipt = await rpc('commit_logging_request_item', [items[0].id])
    expect(Number((await db.query<any>('SELECT rpe FROM workouts WHERE id=$1', [receipt.entityId])).rows[0].rpe)).toBe(5.5)
    await rpc('amend_logged_activity', ['workout', receipt.entityId, 1, randomUUID(), { ...record, rpe: 6.5 }, blocks, provenance])
    expect(Number((await db.query<any>('SELECT rpe FROM workouts WHERE id=$1', [receipt.entityId])).rows[0].rpe)).toBe(6.5)
    const snapshots = (await db.query<any>('SELECT record FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision', [receipt.entityId])).rows
    expect(snapshots.map(x => x.record.reported_rpe)).toEqual([5.5, 6.5])
  })
  it('aborts and rolls back if an unreviewed view depends on effort', async () => {
    await db.exec('RESET ROLE')
    await db.exec('CREATE VIEW unreviewed_effort AS SELECT rpe FROM workouts')
    await expect(db.exec(sqlFile('supabase/migrations/20260926120000_workout_save_recovery.sql'))).rejects.toThrow('Unreviewed')
    await db.exec('ROLLBACK')
    const after = (await db.query("SELECT oid,relacl,reloptions,relowner,pg_get_viewdef(oid,true) definition FROM pg_class WHERE relname='agent_daily_workout_context'")).rows[0]
    expect(after).toEqual(viewBefore)
    await actor()
  })
})
