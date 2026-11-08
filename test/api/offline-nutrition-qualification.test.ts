import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { PostgrestClient } from '@supabase/postgrest-js'
import { NextRequest } from 'next/server'
import { recommendationFixture } from '../database/recommendation-fixture'
import { sqlFile } from '../database/fixture'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { POST as onboard } from '@/app/api/profile/onboarding/route'
import { GET as readTarget, POST as writeTarget } from '@/app/api/targets/route'

// Private, in-memory operator rehearsal. Nothing here is exported or accepts a
// connection string, credentials, environment configuration or a production UID.
// The barriers model the approved operator protocol, NOT target API idempotency,
// hosted worker discovery, provider Auth/session behavior or a production cleaner.
const origin = 'http://127.0.0.1:19001'
const profile = { body_metrics: { age: 40 }, fitness_goals: ['general_health'],
  activity_level: 'moderately_active', preferences: { units: 'metric', notifications: false, privacy_level: 'private' } }
const target = { targetProtein: 150, targetCarbs: 200, targetFat: 60, targetCalories: 1940, tolerancePct: 100 }
const tables = ['daily_targets', 'user_profiles', 'recommendations', 'recommendation_refresh_state',
  'recommendation_events', 'recommendation_suppressions', 'recommendation_publications',
  'logging_coverage_confirmations', 'view_templates', 'view_compositions'] as const
type Table = typeof tables[number]
let sql: Awaited<ReturnType<typeof recommendationFixture>>
let owner: string
const control = randomUUID()
let controlBefore: unknown
let globalBefore: unknown
let pending = 0, unknownSave = false, targetWrites = 0
let trace: string[] = []

function guard(id: string, endpoint: string, table: string, action: string, allowed: readonly string[]) {
  if (id !== owner || id === control) throw new Error('Not the designated synthetic owner')
  if (new URL(endpoint).origin !== origin) throw new Error('Not the exact local fixture endpoint')
  if (!tables.includes(table as Table)) throw new Error('Unexpected fixture table')
  if (!allowed.includes(action)) throw new Error('Unexpected fixture action')
}

async function snapshot(id: string) {
  const result: Record<string, unknown> = {}
  // Actual fixture catalog inventory: compare all owned tables, not just counts.
  const inventory = await sql.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' ORDER BY table_name")
  for (const { table_name } of inventory.rows) {
    if (!/^[a-z_]+$/.test(table_name)) throw new Error('Unexpected fixture identifier')
    result[table_name] = (await sql.query(`SELECT to_jsonb(t) value FROM public.${table_name} t WHERE user_id=$1 ORDER BY to_jsonb(t)::text`, [id])).rows
  }
  result.auth = (await sql.query('SELECT * FROM auth.users WHERE id=$1', [id])).rows
  return result
}
const globalTemplate = async () => (await sql.query('SELECT to_jsonb(t) value FROM view_templates t WHERE user_id IS NULL ORDER BY id')).rows
const revision = async (id = owner) => (await sql.query<{ source_revision: number }>('SELECT source_revision FROM recommendation_refresh_state WHERE user_id=$1', [id])).rows[0]?.source_revision

const intercept: typeof fetch = async (input, init) => {
  const url = new URL(String(input)), table = url.pathname.split('/').pop()!, action = init?.method ?? 'GET'
  guard(owner, url.href, table, action, ['GET', 'POST'])
  if (!['daily_targets', 'user_profiles'].includes(table) || url.pathname !== '/rest/v1/' + table) throw new Error('Unexpected canonical route table')
  if (action === 'GET') {
    if (url.searchParams.get('user_id') !== 'eq.' + owner) throw new Error('Missing exact owner filter')
    trace.push('GET:' + table)
    const row = (await sql.query<{ value: unknown }>(`SELECT to_jsonb(t) value FROM ${table} t WHERE user_id=$1`, [owner])).rows[0]
    return row ? Response.json(row.value) : Response.json({ code: 'PGRST116', details: 'The result contains 0 rows' }, { status: 406 })
  }
  const row = JSON.parse(String(init?.body))
  guard(row.user_id, url.href, table, action, ['POST'])
  let value: unknown
  if (table === 'user_profiles') {
    const keys = Object.keys(row).sort()
    expect(keys).toEqual(['activity_level', 'body_metrics', 'fitness_goals', 'preferences', 'user_id'])
    value = (await sql.query<{ value: unknown }>('INSERT INTO user_profiles(user_id,body_metrics,fitness_goals,activity_level,preferences) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET body_metrics=EXCLUDED.body_metrics,fitness_goals=EXCLUDED.fitness_goals,activity_level=EXCLUDED.activity_level,preferences=EXCLUDED.preferences RETURNING to_jsonb(user_profiles) value',
      [owner, JSON.stringify(row.body_metrics), JSON.stringify(row.fitness_goals), row.activity_level, JSON.stringify(row.preferences)])).rows[0].value
  } else {
    value = (await sql.query<{ value: unknown }>('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET target_protein=EXCLUDED.target_protein,target_carbs=EXCLUDED.target_carbs,target_fat=EXCLUDED.target_fat,target_calories=EXCLUDED.target_calories,tolerance_pct=EXCLUDED.tolerance_pct RETURNING to_jsonb(daily_targets) value',
      [owner, row.target_protein, row.target_carbs, row.target_fat, row.target_calories, row.tolerance_pct])).rows[0].value
    targetWrites++
  }
  trace.push('COMMIT:' + table)
  return Response.json(value, { status: 201 })
}
const sdk = new PostgrestClient(origin + '/rest/v1', { fetch: intercept })

async function setupProfile() {
  guard(owner, origin, 'user_profiles', 'POST', ['POST'])
  const response = await onboard(new NextRequest(origin + '/api/profile/onboarding', { method: 'POST', body: JSON.stringify(profile) }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ profile: { user_id: owner, ...profile }, targets: null })
}

function save(body = target, endpoint = origin, id = owner) {
  guard(id, endpoint, 'daily_targets', 'POST', ['POST'])
  if (pending || unknownSave) throw new Error('Reconcile pending/unknown save before retry')
  return writeTarget(new NextRequest(endpoint + '/api/targets', { method: 'POST', body: JSON.stringify(body) }))
}
function loseAcknowledgement() {
  const request = save()
  pending++
  let release!: () => void, committed!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const serverCommitted = new Promise<void>(resolve => { committed = resolve })
  const delivery = (async () => {
    try {
      expect((await request).status).toBe(201)
      committed()
      await gate // Request remains in flight after the independent DB commit.
      unknownSave = true; trace.push('ACK_LOST')
      throw new TypeError('Synthetic response lost')
    } finally { pending-- }
  })()
  return { release, serverCommitted, delivery }
}
async function reconcile() {
  guard(owner, origin, 'daily_targets', 'GET', ['GET'])
  if (pending) throw new Error('Wait for the enumerated request to settle')
  const response = await readTarget(new NextRequest(origin + '/api/targets'))
  expect(response.status).toBe(200)
  const stored = await response.json()
  expect(stored).toMatchObject({ userId: owner, ...target })
  unknownSave = false
  trace.push('RECONCILED')
  return stored
}

async function removeOwned(table: string, id = owner, endpoint = origin, action = 'DELETE') {
  guard(id, endpoint, table, action, ['DELETE'])
  if (pending || unknownSave) throw new Error('Pending/unreconciled work blocks cleanup')
  const lease = (await sql.query<{ active: boolean }>('SELECT lease_token IS NOT NULL AND lease_expires_at>clock_timestamp() active FROM recommendation_refresh_state WHERE user_id=$1', [owner])).rows[0]
  if (lease?.active) throw new Error('Active recommendation lease blocks cleanup')
  trace.push('DELETE:' + table)
  await sql.query(`DELETE FROM ${table} WHERE user_id=$1`, [owner])
}
async function cleanup(interrupt = false) {
  // Both source deletions precede final derived cleanup; coverage also dirties.
  await removeOwned('daily_targets')
  if (interrupt) throw new Error('Synthetic interruption after committed target deletion')
  for (const table of ['logging_coverage_confirmations', 'user_profiles', 'view_compositions', 'view_templates',
    'recommendation_refresh_state', 'recommendations', 'recommendation_publications']) await removeOwned(table)
  // Native recommendation FK cascades remove events/suppressions, no schema bypass.
  guard(owner, origin, 'user_profiles', 'DELETE', ['DELETE'])
  if (pending || unknownSave) throw new Error('Unsettled Auth fixture cleanup')
  await sql.query('DELETE FROM auth.users WHERE id=$1', [owner])
  trace.push('DELETE:fixture_auth')
}

async function seedDependents(id: string) {
  const r = randomUUID(), fingerprint = 'a'.repeat(64)
  const decision = { schemaVersion: 1, kind: 'abstain', ruleId: 'no_eligible_action', ruleVersion: '1',
    policyVersion: 'bounded-actions-1', runtimeFingerprint: fingerprint, scopeKey: 'synthetic', evidenceFingerprint: fingerprint,
    sourceRevision: 1, responseRevision: 0, localDate: '2026-11-08', tzOffset: 0, validUntil: '2099-01-01T00:00:00Z',
    planVersionId: null, intentMemoryId: null, intentVersion: null, goalId: null, title: 'Synthetic fixture',
    reason: 'No eligible action', reasonCodes: ['no_eligible_action'], missing: [], conflicts: [], destination: null, sources: [], outcome: null }
  await sql.query('INSERT INTO recommendations(id,user_id,decision,rule_id,policy_version,runtime_fingerprint,scope_key,evidence_fingerprint,source_revision,response_revision,local_date,timezone_offset,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$6,1,0,$8,0,$9)',
    [r, id, JSON.stringify(decision), decision.ruleId, decision.policyVersion, fingerprint, decision.scopeKey, decision.localDate, decision.validUntil])
  await sql.query('INSERT INTO recommendation_refresh_state(user_id,current_recommendation_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET current_recommendation_id=EXCLUDED.current_recommendation_id', [id, r])
  await sql.query("INSERT INTO recommendation_events(user_id,recommendation_id,request_id,event_type,payload) VALUES($1,$2,$3,'shown',$4)", [id, r, randomUUID(), JSON.stringify({ synthetic: true })])
  await sql.query("INSERT INTO recommendation_suppressions(user_id,scope_key,evidence_fingerprint,response,recommendation_id) VALUES($1,'synthetic',$2,'deferred',$3)", [id, fingerprint, r])
  await sql.query('INSERT INTO recommendation_publications(user_id,lease_token,payload,result) VALUES($1,$2,$3,$4)', [id, randomUUID(), JSON.stringify({ synthetic: true }), JSON.stringify({ recommendations: [decision] })])
  await sql.query("INSERT INTO logging_coverage_confirmations(user_id,domain,local_date,timezone_offset,coverage_through,status,source_revision,nutrition_revision,request_id,payload) VALUES($1,'nutrition','2026-11-08',0,'2026-11-08T12:00:00Z','unknown',1,0,$2,$3)", [id, randomUUID(), JSON.stringify({ synthetic: true })])
  await sql.query("INSERT INTO view_templates(user_id,view_type,version,template) VALUES($1,'dashboard',1,$2)", [id, JSON.stringify({ schemaVersion: 1, tone: 'concise', showNarrative: false, sections: [] })])
  await sql.query("INSERT INTO view_compositions(user_id,view_type,local_date,template_version,template_fingerprint,facts_fingerprint,composition,provider,model) VALUES($1,'dashboard','2026-11-08',1,$2,$2,$3,'synthetic','not-called')", [id, fingerprint, JSON.stringify({ synthetic: true })])
}
async function completeFixture() {
  await setupProfile()
  expect((await save()).status).toBe(201)
  await seedDependents(owner)
}
async function assertRemoved() {
  for (const table of tables) expect((await sql.query(`SELECT user_id FROM ${table} WHERE user_id=$1`, [owner])).rows, table).toEqual([])
  expect((await sql.query('SELECT id FROM auth.users WHERE id=$1', [owner])).rows).toEqual([])
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Global network veto') }))
  for (const module of [http, https]) vi.spyOn(module, 'request').mockImplementation(() => { throw new Error('Global network veto') })
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Global network veto') })
  sql = await recommendationFixture()
  const source = sqlFile('docs/migrations/complete-holistic-migration.sql'), start = source.indexOf('CREATE TABLE user_profiles (')
  await sql.exec(source.slice(start, source.indexOf('\n);', start) + 3))
  await sql.exec(sqlFile('docs/migrations/view-templates-migration.sql'))
  await sql.exec(sqlFile('docs/migrations/view-compositions-migration.sql'))
  await sql.query('INSERT INTO auth.users(id) VALUES($1)', [control])
  await sql.query('INSERT INTO user_profiles(user_id,body_metrics,fitness_goals) VALUES($1,$2,$3)', [control, '{"age":55}', '["performance"]'])
  await sql.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,120,180,50,1650,12.34)', [control])
  await seedDependents(control)
  controlBefore = await snapshot(control); globalBefore = await globalTemplate()
}, 30000)
beforeEach(async () => {
  owner = randomUUID(); await sql.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
  pending = 0; unknownSave = false; targetWrites = 0; trace = []
  vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, from: sdk.from.bind(sdk) } as any)
})
afterEach(async () => {
  expect(await snapshot(control)).toEqual(controlBefore)
  expect(await globalTemplate()).toEqual(globalBefore)
})
afterAll(async () => { await sql?.close(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('OQ-01 persists exact profile-only onboarding without creating targets', async () => {
  await setupProfile()
  expect((await sql.query('SELECT * FROM daily_targets WHERE user_id=$1', [owner])).rows).toEqual([])
  expect(targetWrites).toBe(0); expect(trace).toEqual(['COMMIT:user_profiles'])
})
it('OQ-02 persists the canonical 100% target and derives calories rather than trusting input', async () => {
  await setupProfile()
  const response = await save({ ...target, targetCalories: 1 })
  expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ userId: owner, ...target })
  expect(await reconcile()).toMatchObject(target); expect(targetWrites).toBe(1)
})
it('OQ-03 loses one committed acknowledgement, reconciles persisted values, and never replays', async () => {
  await setupProfile()
  const lost = loseAcknowledgement()
  await lost.serverCommitted
  const inFlight = await snapshot(owner)
  await expect(cleanup()).rejects.toThrow('Pending')
  expect(await snapshot(owner)).toEqual(inFlight)
  lost.release()
  await expect(lost.delivery).rejects.toThrow('Synthetic response lost')
  const beforeRead = await snapshot(owner)
  expect(() => save()).toThrow('Reconcile')
  await expect(cleanup()).rejects.toThrow('unreconciled')
  await reconcile()
  expect(trace).toEqual(['COMMIT:user_profiles', 'COMMIT:daily_targets', 'ACK_LOST', 'GET:daily_targets', 'RECONCILED'])
  expect(targetWrites).toBe(1); expect(await snapshot(owner)).toEqual(beforeRead)
})
it('OQ-04 preserves native noncascade and composite FK failures atomically', async () => {
  await completeFixture()
  const before = await snapshot(owner)
  const constraints = (await sql.query<any>("SELECT c.relname table_name,pg_get_constraintdef(k.oid) definition,k.confdeltype FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.contype='f' AND c.relname IN ('daily_targets','user_profiles','recommendation_refresh_state')")).rows
  for (const table of ['daily_targets', 'user_profiles']) expect(constraints).toEqual(expect.arrayContaining([expect.objectContaining({ table_name: table, confdeltype: 'a' })]))
  expect(constraints.some(row => row.definition.includes('FOREIGN KEY (current_recommendation_id, user_id) REFERENCES recommendations(id, user_id)'))).toBe(true)
  await expect(sql.query('DELETE FROM auth.users WHERE id=$1', [owner])).rejects.toMatchObject({ code: '23503' })
  expect(await snapshot(owner)).toEqual(before)
  await expect(sql.query('DELETE FROM recommendations WHERE user_id=$1', [owner])).rejects.toMatchObject({ code: '23503' })
  expect(await snapshot(owner)).toEqual(before)
})
it('OQ-05 catches derived-first cleanup and deletes dirty sources before final state', async () => {
  await completeFixture()
  await removeOwned('recommendation_refresh_state')
  await removeOwned('daily_targets')
  expect(await revision()).toBeDefined() // Known-bad order recreates state.
  const afterTarget = await revision()
  await removeOwned('logging_coverage_confirmations')
  expect(Number(await revision())).toBeGreaterThan(Number(afterTarget))
  await cleanup(); await assertRemoved()
})
it('OQ-06 resumes after a committed interruption and is harmless once clean', async () => {
  await completeFixture()
  await expect(cleanup(true)).rejects.toThrow('interruption')
  expect((await sql.query('SELECT user_id FROM daily_targets WHERE user_id=$1', [owner])).rows).toEqual([])
  expect((await sql.query('SELECT user_id FROM user_profiles WHERE user_id=$1', [owner])).rows).toHaveLength(1)
  expect(await revision()).toBeDefined()
  await cleanup(); await assertRemoved()
  const clean = await snapshot(owner); await cleanup(); expect(await snapshot(owner)).toEqual(clean)
})
it('OQ-07 blocks pending/unknown delivery and active leases before every delete', async () => {
  await completeFixture()
  let settle!: () => void
  const gate = new Promise<void>(resolve => { settle = resolve })
  pending++
  const background = (async () => {
    try {
      await gate
      await sql.query('UPDATE recommendation_refresh_state SET processed_context=$2 WHERE user_id=$1', [owner, '{"syntheticSettled":true}'])
    } finally { pending-- }
  })()
  const before = await snapshot(owner)
  await expect(cleanup()).rejects.toThrow('Pending'); expect(await snapshot(owner)).toEqual(before)
  settle(); await background
  const settled = await snapshot(owner)
  unknownSave = true; await expect(cleanup()).rejects.toThrow('unreconciled'); expect(await snapshot(owner)).toEqual(settled)
  await reconcile()
  await sql.query("UPDATE recommendation_refresh_state SET lease_token=$2,lease_expires_at=clock_timestamp()+interval '1 hour' WHERE user_id=$1", [owner, randomUUID()])
  const leased = await snapshot(owner); await expect(cleanup()).rejects.toThrow('Active recommendation lease'); expect(await snapshot(owner)).toEqual(leased)
  await sql.query('UPDATE recommendation_refresh_state SET lease_token=NULL,lease_expires_at=NULL WHERE user_id=$1', [owner])
  await cleanup(); await assertRemoved()
  await background; await assertRemoved() // No enumerated late work can repopulate.
  expect(trace.filter(value => value.startsWith('DELETE:'))[0]).toBe('DELETE:daily_targets')
})
it('OQ-08 keeps the full unrelated owner and global template unchanged through cleanup', async () => {
  await completeFixture(); await cleanup(); await assertRemoved()
  expect(await snapshot(control)).toEqual(controlBefore); expect(await globalTemplate()).toEqual(globalBefore)
})
it('OQ-09 rejects foreign owner, lookalike endpoint, table and action without mutation', async () => {
  await completeFixture(); const before = await snapshot(owner), writes = targetWrites, operations = trace.length
  const outside = randomUUID() // Neither designated fixture owner nor protected control.
  expect(() => save(target, origin, control)).toThrow('synthetic owner')
  expect(() => save(target, origin, outside)).toThrow('synthetic owner')
  expect(() => save(target, 'http://127.0.0.1.attacker.invalid:19001')).toThrow('exact local')
  await expect(removeOwned('daily_targets', control)).rejects.toThrow('synthetic owner')
  await expect(removeOwned('daily_targets', outside)).rejects.toThrow('synthetic owner')
  await expect(removeOwned('daily_targets', owner, 'https://example.invalid')).rejects.toThrow('exact local')
  await expect(removeOwned('workouts')).rejects.toThrow('Unexpected fixture table')
  await expect(removeOwned('daily_targets', owner, origin, 'TRUNCATE')).rejects.toThrow('Unexpected fixture action')
  await expect(intercept(origin + '/rest/v1/daily_targets', { method: 'DELETE' })).rejects.toThrow('Unexpected fixture action')
  await expect(intercept(origin + '/rest/v1/user_profiles', { method: 'POST', body: JSON.stringify({ user_id: control }) })).rejects.toThrow('synthetic owner')
  await expect(intercept(origin + '/rest/v1/user_profiles', { method: 'POST', body: JSON.stringify({ user_id: outside }) })).rejects.toThrow('synthetic owner')
  await expect(intercept('https://example.invalid/rest/v1/daily_targets')).rejects.toThrow('exact local')
  expect(targetWrites).toBe(writes); expect(trace).toHaveLength(operations); expect(await snapshot(owner)).toEqual(before)
})
it('OQ-10 vetoes unexpected global network and detects the premature-retry procedure', async () => {
  expect(() => fetch('https://example.invalid')).toThrow('Global network veto')
  expect(() => http.request('http://example.invalid')).toThrow('Global network veto')
  expect(() => https.request('https://example.invalid')).toThrow('Global network veto')
  expect(() => new net.Socket().connect(19001, '127.0.0.1')).toThrow('Global network veto')
  await setupProfile(); expect((await save()).status).toBe(201); unknownSave = true
  const before = await snapshot(owner); expect(() => save()).toThrow('Reconcile'); expect(targetWrites).toBe(1)
  expect(await snapshot(owner)).toEqual(before); await reconcile(); expect(targetWrites).toBe(1)
})
