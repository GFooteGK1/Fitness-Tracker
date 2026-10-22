import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { projectProviderTiming } from '@/app/lib/whoop/provider-timing'
import { upsertWhoopTiming } from '@/app/lib/whoop/timing-upsert'
import { legacyIdentity, providerPayload, syntheticOther, syntheticTimingOwner, timingNow } from '../fixtures/whoop-provider-timing'

vi.mock('@/app/lib/whoop/timing-owner', () => ({ isWhoopTimingOwner: (id: unknown) => id === '11111111-1111-4111-8111-111111111111' }))
const tables = [
  ['whoop_recovery', 'cycle_id', 'recovery_score'], ['whoop_sleep', 'sleep_id', 'sleep_performance_percentage'], ['whoop_cycles', 'cycle_id', 'strain'],
] as const
const common = ['provider_created_at', 'provider_updated_at', 'provider_interval_start', 'provider_interval_end',
  'timing_ingested_at', 'provider_timezone_offset', 'provider_score_state', 'timing_mapping_version', 'timing_provenance']
async function fixture() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`)
  for (const [table, id, score] of tables) {
    await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
      ${id} text NOT NULL,date date NOT NULL,${score} numeric,created_at timestamptz DEFAULT now(),UNIQUE(user_id,${id}));
      ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner ON public.${table} TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;`)
    for (const owner of [syntheticTimingOwner, syntheticOther]) {
      await db.query(`INSERT INTO ${table}(user_id,${id},date,${score},created_at) VALUES($1,'42','2026-10-18',17.125,'2026-10-18T12:00:00.123456Z')`, [owner])
    }
  }
  return db
}
async function oldRows(db: PGlite) {
  return Promise.all(tables.map(async ([table, id, score]) => (await db.query(`SELECT jsonb_agg(jsonb_build_array(id,user_id,${id},date,${score},created_at) ORDER BY id)::text AS digest FROM ${table}`)).rows))
}
async function security(db: PGlite) {
  return Promise.all([
    `SELECT relname,relowner,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class WHERE relname IN('whoop_recovery','whoop_sleep','whoop_cycles') ORDER BY relname`,
    `SELECT tablename,policyname,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`,
    `SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`,
    `SELECT p.proname,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN('public','auth') ORDER BY p.proname`,
    `SELECT table_name,column_name,column_default FROM information_schema.columns WHERE table_schema='public'
      AND column_name NOT LIKE 'provider_%' AND column_name NOT LIKE 'timing_%' ORDER BY table_name,column_name`,
  ].map(async q => (await db.query(q)).rows))
}
async function write(db: PGlite, values: Record<string, unknown>) {
  const keys = Object.keys(values)
  await db.query(`INSERT INTO whoop_cycles(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')})
    ON CONFLICT(user_id,cycle_id) DO UPDATE SET ${keys.map(k => `${k}=EXCLUDED.${k}`).join(',')}`, Object.values(values))
}
async function timingSnapshot(db: PGlite) {
  return (await db.query(`SELECT id,provider_created_at::text,provider_updated_at::text,provider_interval_start::text,
    provider_interval_end::text,timing_ingested_at::text,provider_timezone_offset,provider_score_state,timing_mapping_version,timing_provenance
    FROM whoop_cycles WHERE user_id=$1 AND cycle_id='42'`, [syntheticTimingOwner])).rows[0]
}

describe.each([
  ['proposal', 'docs/proposals/recovery-timing-owner/add-provider-timing.sql'],
  ['recovered historical migration', 'supabase/migrations/20261019154246_owner_whoop_provider_timing_nullable.sql'],
])('%s on disposable synthetic PostgreSQL only', (_name, path) => {
const sql = readFileSync(path, 'utf8')
describe('data, schema and security', () => {
  let db: PGlite, beforeRows: unknown, beforeSecurity: unknown
  beforeAll(async () => { db = await fixture(); beforeRows = await oldRows(db); beforeSecurity = await security(db); await db.exec(sql) }, 30_000)
  beforeEach(async () => { await db.exec('BEGIN') })
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await db?.close() })
  it('preserves every seeded old row/count and all policies, grants, indexes, functions and triggers', async () => {
    expect(await oldRows(db)).toEqual(beforeRows); expect(await security(db)).toEqual(beforeSecurity)
    for (const [table] of tables) {
      expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows).toEqual([{ n: 2 }])
      const rows = (await db.query(`SELECT * FROM ${table}`)).rows
      for (const row of rows) for (const key of [...common, ...(table === 'whoop_recovery' ? ['provider_sleep_id'] : table === 'whoop_sleep' ? ['provider_cycle_id'] : [])]) expect((row as Record<string, unknown>)[key]).toBeNull()
    }
  })
  it('adds exactly29 nullable columns, no defaults, with explicit microsecond precision', async () => {
    const rows = (await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: unknown; datetime_precision: number }>(
      `SELECT table_name,column_name,data_type,is_nullable,column_default,datetime_precision FROM information_schema.columns
       WHERE table_schema='public' AND (column_name LIKE 'provider_%' OR column_name LIKE 'timing_%') ORDER BY table_name,column_name`)).rows
    expect(rows).toHaveLength(29)
    for (const row of rows) {
      expect(row.is_nullable).toBe('YES'); expect(row.column_default).toBeNull()
      if (row.column_name.endsWith('_at') || ['provider_interval_start', 'provider_interval_end'].includes(row.column_name)) {
        expect(row.data_type).toBe('timestamp with time zone'); expect(row.datetime_precision).toBe(6)
      } else expect(row.data_type).toBe(row.column_name === 'timing_provenance' ? 'jsonb' : 'text')
    }
  })
  it('keeps existing owner RLS isolation after nullable DDL', async () => {
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [syntheticTimingOwner]); await db.exec('SET LOCAL ROLE authenticated')
    for (const [table, id] of tables) {
      expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows).toEqual([{ n: 1 }])
      expect((await db.query(`UPDATE ${table} SET provider_score_state='denied' WHERE user_id=$1 RETURNING id`, [syntheticOther])).rows).toEqual([])
      expect((await db.query(`UPDATE ${table} SET provider_score_state='owner' WHERE user_id=$1 RETURNING id`, [syntheticTimingOwner])).rows).toHaveLength(1)
      await db.exec('SAVEPOINT cross_owner')
      await expect(db.query(`INSERT INTO ${table}(user_id,${id},date) VALUES($1,'43','2026-10-18')`, [syntheticOther])).rejects.toMatchObject({ code: '42501' })
      await db.exec('ROLLBACK TO SAVEPOINT cross_owner')
    }
  })
  it('retains microseconds and exact old timing on malformed/rollback legacy-only writes; valid re-ingestion updates only the same identity', async () => {
    const identity = { ...legacyIdentity('cycle'), strain: 17.125 }
    const a = projectProviderTiming('cycle', providerPayload('cycle'), identity, timingNow)!
    await write(db, { ...identity, ...a })
    const first = await timingSnapshot(db)
    expect((first as Record<string, unknown>).provider_created_at).toContain('.123456')
    // Same supplied-column shape as current legacy PostgREST upserts, no new timing keys.
    await write(db, { ...identity, strain: 29.5 })
    expect(await timingSnapshot(db)).toEqual(first)
    expect((await db.query('SELECT strain::float8 AS score FROM whoop_cycles WHERE user_id=$1', [syntheticTimingOwner])).rows).toEqual([{ score: 29.5 }])
    const b = projectProviderTiming('cycle', { ...providerPayload('cycle'), updated_at: '2026-10-19T11:45:00.654321Z' }, identity, '2026-10-19T12:01:00Z')!
    await write(db, { ...identity, ...b }); const second = await timingSnapshot(db)
    expect((second as Record<string, unknown>).id).toBe((first as Record<string, unknown>).id)
    expect((second as Record<string, unknown>).provider_updated_at).toContain('.654321')
    await write(db, { ...identity, ...b }); expect(await timingSnapshot(db)).toEqual(second)
    expect((await db.query('SELECT count(*)::int AS n FROM whoop_cycles')).rows).toEqual([{ n: 2 }])
    await write(db, { ...identity, strain: 12.5 }); expect(await timingSnapshot(db)).toEqual(second)
  })
  it('does not commit a marker or health update for a failed row upsert', async () => {
    const identity = { ...legacyIdentity('cycle'), strain: 17.125 }, a = projectProviderTiming('cycle', providerPayload('cycle'), identity, timingNow)!
    await write(db, { ...identity, ...a }); const first = await timingSnapshot(db)
    await db.exec('SAVEPOINT bad_write')
    await expect(write(db, { ...identity, ...a, strain: 99, timing_ingested_at: 'not-a-time' })).rejects.toThrow()
    await db.exec('ROLLBACK TO SAVEPOINT bad_write')
    expect(await timingSnapshot(db)).toEqual(first)
    expect((await db.query('SELECT strain::float8 AS score FROM whoop_cycles WHERE user_id=$1', [syntheticTimingOwner])).rows).toEqual([{ score: 17.125 }])
  })
  it('keeps duplicate conflict IDs atomic instead of splitting a rejected legacy bulk into successful health writes', async () => {
    const identity = { ...legacyIdentity('cycle'), strain: 17.125 }
    const snapshot = projectProviderTiming('cycle', providerPayload('cycle'), identity, timingNow)!
    await write(db, { ...identity, ...snapshot }); const before = await timingSnapshot(db)
    const calls: object[][] = []
    const adapter = { from: () => ({ upsert: async (rows: Record<string, unknown>[]) => {
      calls.push(rows); const keys = Object.keys(rows[0]), values = rows.flatMap(r => keys.map(k => r[k]))
      await db.exec('SAVEPOINT duplicate_bulk')
      try {
        await db.query(`INSERT INTO whoop_cycles(${keys.join(',')}) VALUES ${rows.map((_, i) => `(${keys.map((_, k) => `$${i * keys.length + k + 1}`).join(',')})`).join(',')}
          ON CONFLICT(user_id,cycle_id) DO UPDATE SET ${keys.map(k => `${k}=EXCLUDED.${k}`).join(',')}`, values)
        return { error: null }
      } catch (error) { await db.exec('ROLLBACK TO SAVEPOINT duplicate_bulk'); return { error } }
    } }) } as unknown as SupabaseClient
    const rows = [{ ...identity, strain: 1 }, { ...identity, strain: 2 }]
    const result = await upsertWhoopTiming(adapter, 'cycle', syntheticTimingOwner, rows,
      [providerPayload('cycle'), { ...providerPayload('cycle'), created_at: 'bad' }])
    expect(result.error).toMatchObject({ code: '21000' }); expect(calls).toEqual([rows])
    expect(await timingSnapshot(db)).toEqual(before)
    expect((await db.query('SELECT strain::float8 AS score FROM whoop_cycles WHERE user_id=$1', [syntheticTimingOwner])).rows).toEqual([{ score: 17.125 }])
  })
})

describe('proposal DDL failure is atomic and not silently repeatable', () => {
  it('rolls back the first table if a later table already has a proposed column', async () => {
    const db = await fixture()
    try {
      await db.exec('ALTER TABLE whoop_sleep ADD COLUMN provider_created_at text')
      const before = await oldRows(db)
      await expect(db.exec(sql)).rejects.toThrow(); await db.exec('ROLLBACK')
      expect((await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='whoop_recovery' AND column_name='provider_created_at'`)).rows).toEqual([])
      expect(await oldRows(db)).toEqual(before)
    } finally { await db.close() }
  }, 30_000)
})

})
