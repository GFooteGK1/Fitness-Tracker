import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { syntheticOther, syntheticSleep, syntheticTimingOwner } from '../fixtures/whoop-provider-timing'
import { sqlFile } from './fixture'

const tables = [
  { table: 'whoop_recovery', key: 'cycle_id', keyType: 'bigint', recordId: 42, metric: 'recovery_score' },
  { table: 'whoop_sleep', key: 'sleep_id', keyType: 'text', recordId: syntheticSleep, metric: 'sleep_performance_percentage' },
  { table: 'whoop_cycles', key: 'cycle_id', keyType: 'bigint', recordId: 42, metric: 'strain' },
] as const
type Domain = typeof tables[number]
type Payload = { version: string | null; mappingVersion?: string }

const earlier = '2026-11-21T06:25:00.123455Z'
const current = '2026-11-21T06:25:00.123456Z'
const later = '2026-11-21T06:25:00.123457Z'
const timingMapping = 'whoop_timing_owner_v1'
let db: PGlite

async function store(domain: Domain, owner: string, metric: number, timing?: Payload) {
  const { table, key, recordId, metric: column } = domain
  const columns: string[] = [column]
  const values: Array<string | number | null> = [owner, recordId, metric]
  if (timing) {
    columns.push('provider_updated_at', 'timing_mapping_version')
    values.push(timing.version, timing.mappingVersion ?? timingMapping)
  }
  const assignments = columns.map(name => `${name}=EXCLUDED.${name}`).join(', ')
  const parameters = values.map((_, index) => `$${index + 1}`).join(', ')
  return (await db.query<{ id: string }>(
    `INSERT INTO public.${table}(user_id, ${key}, ${columns.join(', ')}) VALUES (${parameters})
      ON CONFLICT (user_id, ${key}) DO UPDATE SET ${assignments} RETURNING id`,
    values,
  )).rows
}

async function read({ table, metric }: Domain, owner: string) {
  return (await db.query<{ id: string; metric: number; version: string | null }>(
    `SELECT id, ${metric}::float8 AS metric,
      to_char(provider_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version
      FROM public.${table} WHERE user_id=$1`, [owner],
  )).rows
}

async function finishBatch(checkpoint: Date, counts: Record<string, number>) {
  await db.query(`
    INSERT INTO public.whoop_sync_status(user_id, last_sync_at, records_synced, status)
    VALUES ($1, $2, $3, 'idle')
    ON CONFLICT (user_id) DO UPDATE SET last_sync_at=EXCLUDED.last_sync_at,
      records_synced=EXCLUDED.records_synced, status=EXCLUDED.status
  `, [syntheticTimingOwner, checkpoint.toISOString(), JSON.stringify(counts)])
}

async function readBatch() {
  return (await db.query<{ checkpoint: Date; counts: Record<string, number> }>(
    'SELECT last_sync_at AS checkpoint, records_synced AS counts FROM public.whoop_sync_status WHERE user_id=$1',
    [syntheticTimingOwner],
  )).rows
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
  `)
  for (const { table, key, keyType, metric } of tables) {
    await db.exec(`
      CREATE TABLE public.${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        ${key} ${keyType} NOT NULL, ${metric} numeric, UNIQUE(user_id, ${key}));
      ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner ON public.${table} TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
      GRANT SELECT, INSERT, UPDATE ON public.${table} TO authenticated, service_role;
    `)
  }
  await db.exec(`
    CREATE TABLE public.whoop_sync_status(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
      last_sync_at timestamptz, next_sync_at timestamptz, status text DEFAULT 'idle',
      error_message text, records_synced jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.whoop_sync_status ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner ON public.whoop_sync_status TO authenticated
      USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
    GRANT SELECT, INSERT, UPDATE ON public.whoop_sync_status TO authenticated, service_role;
  `)
  await db.exec(sqlFile('supabase/migrations/20261019154246_owner_whoop_provider_timing_nullable.sql'))
  await db.exec(sqlFile('supabase/migrations/20261121195138_protect_whoop_provider_version.sql'))
}, 30_000)

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK') })
afterAll(async () => { await db?.close() })

describe('WHOOP provider version fence in PostgreSQL', () => {
  it.each(['guard_whoop_provider_version', 'guard_whoop_batch_checkpoint'])(
    'keeps %s unavailable as a direct app-role operation',
    async guard => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const { rows } = await db.query(
          "SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed",
          [role, `public.${guard}()`],
        )
        expect(rows).toEqual([{ allowed: false }])
      }
    },
  )

  it.each(tables)('preserves $table against delayed, duplicate and unversioned writes', async domain => {
    const [seed] = await store(domain, syntheticTimingOwner, 70, { version: current })
    await db.exec('SET LOCAL ROLE service_role')
    expect(await store(domain, syntheticTimingOwner, 56, { version: earlier })).toEqual([])
    expect(await store(domain, syntheticTimingOwner, 92, { version: current })).toEqual([])
    expect(await store(domain, syntheticTimingOwner, 10, { version: null })).toEqual([])
    expect(await store(domain, syntheticTimingOwner, 11)).toEqual([])
    expect(await read(domain, syntheticTimingOwner)).toEqual([{ id: seed.id, metric: 70, version: current }])

    expect(await store(domain, syntheticTimingOwner, 75, { version: later })).toEqual([seed])
    expect(await read(domain, syntheticTimingOwner)).toEqual([{ id: seed.id, metric: 75, version: later }])
  })

  it('preserves legacy unversioned behavior and scopes the fence to the retained owner timing marker', async () => {
    const domain = tables[0]
    const [unversioned] = await store(domain, syntheticTimingOwner, 70)
    const [other] = await store(domain, syntheticOther, 75, { version: current, mappingVersion: 'unrelated_mapping' })
    await db.exec('SET LOCAL ROLE service_role')
    expect(await store(domain, syntheticTimingOwner, 72)).toEqual([unversioned])
    expect(await store(domain, syntheticOther, 77)).toEqual([other])
    expect(await read(domain, syntheticTimingOwner)).toEqual([{ id: unversioned.id, metric: 72, version: null }])
    expect(await read(domain, syntheticOther)).toEqual([{ id: other.id, metric: 77, version: current }])
  })

  it('preserves the authenticated owner RLS boundary', async () => {
    const domain = tables[0]
    const [own] = await store(domain, syntheticTimingOwner, 70, { version: current })
    await store(domain, syntheticOther, 78, { version: current })

    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [syntheticTimingOwner])
    await db.exec('SET LOCAL ROLE authenticated')
    expect(await read(domain, syntheticOther)).toEqual([])
    expect(await store(domain, syntheticTimingOwner, 71, { version: later })).toEqual([own])
    await expect(store(domain, syntheticOther, 99, { version: later })).rejects.toMatchObject({ code: '42501' })
  })
})

describe('WHOOP completed batch checkpoint fence in PostgreSQL', () => {
  it('retains the checkpoint and its counts when an older overlapping run finishes last', async () => {
    const base = Date.now() - 60_000
    const older = new Date(base - 1_000)
    const newer = new Date(base + 1_000)
    const latest = new Date(base + 2_000)
    await db.exec('SET LOCAL ROLE service_role')

    await finishBatch(newer, { recovery: 5, sleep: 4 })
    await finishBatch(older, { recovery: 3, sleep: 2 })
    expect(await readBatch()).toEqual([{ checkpoint: newer, counts: { recovery: 5, sleep: 4 } }])

    await finishBatch(latest, { recovery: 1, sleep: 1 })
    expect(await readBatch()).toEqual([{ checkpoint: latest, counts: { recovery: 1, sleep: 1 } }])
  })

  it('replaces a bad future checkpoint and its counts with a completed batch', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60_000)
    const valid = new Date(Date.now() - 60_000)
    await db.exec('SET LOCAL ROLE service_role')

    await finishBatch(future, { recovery: 2 })
    await finishBatch(valid, { recovery: 1, sleep: 1 })
    expect(await readBatch()).toEqual([{ checkpoint: valid, counts: { recovery: 1, sleep: 1 } }])
  })
})
