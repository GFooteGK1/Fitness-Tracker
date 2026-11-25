import { PGlite } from '@electric-sql/pglite'
import { PostgrestClient } from '@supabase/postgrest-js'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/whoop/data/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const disconnected = '10000000-0000-4000-8000-000000000003'
const first = '20000000-0000-4000-8000-000000000001'
const second = '20000000-0000-4000-8000-000000000002'
const older = '20000000-0000-4000-8000-000000000003'
const newer = '20000000-0000-4000-8000-000000000004'
const expectedCoverage = { dateBasis: 'stored_date_label', eventTimePrecision: 'unknown' }

const sql = new PGlite()
const reads: URL[] = []
let subject: string | null
let fault: 'workout_denied' | 'workout_null' | 'token_denied' | null

function identifier(value: string) {
  if (!/^[a-z_]+$/.test(value)) throw new Error('Unexpected identifier in synthetic transport')
  return value
}

// Run the GET handler's real PostgREST query against the maintained DDL locally.
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  reads.push(url)
  const table = identifier(url.pathname.split('/').pop()!)
  expect(init?.method).toBe('GET')
  expect(url.hostname).toBe('synthetic.invalid')
  expect(url.searchParams.get('user_id')).toBe(`eq.${subject}`)
  if ((table === 'whoop_workouts' && fault === 'workout_denied') || (table === 'whoop_tokens' && fault === 'token_denied')) {
    return Response.json({ code: '42501', message: 'Synthetic private database error' }, { status: 403 })
  }
  if (table === 'whoop_workouts' && fault === 'workout_null') return Response.json(null)

  const params = url.searchParams
  const selection = params.get('select') ?? '*'
  const columns = selection === '*' ? '*' : selection.split(',').map(identifier).join(', ')
  const conditions: string[] = []
  const values: string[] = []
  const operators = { eq: '=', gte: '>=', lte: '<=' }
  for (const [column, filter] of params) {
    if (['select', 'order', 'limit'].includes(column)) continue
    const [operator, value] = filter.split('.', 2)
    if (!(operator in operators)) throw new Error('Unexpected synthetic filter')
    values.push(value)
    conditions.push(`${identifier(column)} ${operators[operator as keyof typeof operators]} $${values.length}`)
  }
  const order = (params.get('order') ?? '').split(',').filter(Boolean).map(term => {
    const [column, direction] = term.split('.')
    return `${identifier(column)} ${direction === 'desc' ? 'DESC' : 'ASC'}`
  })
  const limit = params.get('limit')
  const statement = `SELECT ${columns} FROM ${table} WHERE ${conditions.join(' AND ')}`
    + (order.length ? ` ORDER BY ${order.join(', ')}` : '') + (limit ? ` LIMIT ${Number(limit)}` : '')
  try {
    const result = await sql.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(q) AS row FROM (${statement}) q`, values)
    const rows = result.rows.map(item => item.row)
    const single = new Headers(init?.headers).get('accept') === 'application/vnd.pgrst.object+json'
    if (single && rows.length !== 1) {
      return Response.json({ code: 'PGRST116', details: `The result contains ${rows.length} rows` }, { status: 406 })
    }
    return Response.json(single ? rows[0] : rows)
  } catch (error) {
    const { code, message } = error as { code: string; message: string }
    return Response.json({ code, message }, { status: 400 })
  }
}

const sdk = new PostgrestClient('https://synthetic.invalid/rest/v1', { fetch: transport })
const db = {
  auth: { getUser: async () => ({ data: { user: subject ? { id: subject } : null }, error: null }) },
  from: sdk.from.bind(sdk),
}

function get(query: string) {
  return GET(new Request(`http://local.invalid/api/whoop/data?${query}`))
}

beforeAll(async () => {
  await sql.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT current_setting('request.jwt.claim.sub', true)::uuid $$;`)
  for (const migration of ['whoop-integration-migration.sql', 'whoop-v2-schema-fix.sql']) {
    await sql.exec(await readFile(new URL(`../../docs/migrations/${migration}`, import.meta.url), 'utf8'))
  }
  await sql.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [owner, other, disconnected])
  await sql.query(`INSERT INTO whoop_tokens (user_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope)
    VALUES ($1, 'fixture', 'fixture', '2026-12-01', 'read:workout')`, [owner])
  await sql.query("INSERT INTO whoop_sync_status (user_id, last_sync_at) VALUES ($1, '2026-11-24T06:00:00Z')", [owner])
  await sql.query(`INSERT INTO whoop_recovery (user_id, cycle_id, date, recovery_score) VALUES ($1, 1, '2026-11-20', 71)`, [owner])
  await sql.query(`INSERT INTO whoop_sleep (user_id, sleep_id, date, total_sleep_duration_ms) VALUES ($1, 'sleep-fixture', '2026-11-20', 1000)`, [owner])
  await sql.query(`INSERT INTO whoop_cycles (user_id, cycle_id, date, strain) VALUES ($1, 1, '2026-11-20', 12)`, [owner])
  await sql.query(`INSERT INTO whoop_workouts (id, user_id, whoop_workout_id, date, created_at, duration_ms) VALUES
    ($1, $5, 'same-day-first', '2026-11-20', '2026-11-24T06:00:00Z', 540000),
    ($2, $5, 'same-day-second', '2026-11-20', '2026-11-23T06:00:00Z', NULL),
    ($3, $5, 'older', '2026-11-19', '2026-11-20T01:00:00Z', NULL),
    ($4, $5, 'newer', '2026-11-21', '2026-11-20T02:00:00Z', NULL),
    (gen_random_uuid(), $6, 'another-owner', '2026-11-20', '2026-11-20T03:00:00Z', NULL)`,
  [first, second, older, newer, owner, other])
  await sql.exec('CREATE ROLE authenticated; GRANT USAGE ON SCHEMA auth, public TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; SET ROLE authenticated;')
}, 30_000)

afterAll(() => sql.close())

beforeEach(async () => {
  subject = owner
  fault = null
  reads.length = 0
  await sql.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [subject])
  vi.mocked(createServerClient).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof createServerClient>>)
})

describe('GET /api/whoop/data workout coverage', () => {
  it('filters inclusively by the owned stored labels and leaves occurrence times unknown', async () => {
    const response = await get(`type=workouts&startDate=2026-11-20&endDate=2026-11-20&user_id=${other}`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.workouts.map((row: { id: string }) => row.id)).toEqual([first, second])
    expect(body.workoutCoverage).toEqual({ ...expectedCoverage, status: 'available' })
    expect(body.workouts[0]).toMatchObject({ date: '2026-11-20', duration_ms: 540000 })
    expect(new Date(body.workouts[0].created_at).toISOString()).toBe('2026-11-24T06:00:00.000Z')
    for (const row of body.workouts) {
      expect(row).not.toHaveProperty('start_time')
      expect(row).not.toHaveProperty('end_time')
    }
    expect(reads.at(-1)?.searchParams.getAll('date')).toEqual(['gte.2026-11-20', 'lte.2026-11-20'])
  })

  it('applies the database limit after stable date ordering', async () => {
    const response = await get('type=workouts&limit=2')
    expect(response.status).toBe(200)
    expect((await response.json()).workouts.map((row: { id: string }) => row.id)).toEqual([newer, first])
    expect(reads.at(-1)?.searchParams.get('order')).toBe('date.desc,id.asc')
  })

  it('returns an empty array for a successful empty read', async () => {
    const response = await get('type=workouts&startDate=2026-11-22')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ workouts: [], workoutCoverage: { ...expectedCoverage, status: 'available' } })
  })

  it.each(['workout_denied', 'workout_null'] as const)('makes a %s result explicitly unavailable', async mode => {
    fault = mode
    const response = await get('type=workouts')
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ workouts: null, workoutCoverage: { ...expectedCoverage, status: 'unavailable' } })
    expect(JSON.stringify(body)).not.toContain('Synthetic private database error')
  })

  it('keeps recovery, sleep and strain available when the combined read cannot load workouts', async () => {
    fault = 'workout_denied'
    const response = await get('type=all')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ workouts: null, workoutCoverage: { ...expectedCoverage, status: 'unavailable' },
      recovery: { recovery_score: 71 }, sleep: { total_sleep_duration_ms: 1000 }, cycle: { strain: 12 } })
  })

  it.each([
    'startDate=2026-11-20T23%3A30%3A00-06%3A00',
    'endDate=2026-02-30',
    'startDate=2026-11-21&endDate=2026-11-20',
  ])('rejects unsupported workout bounds before querying tables (%s)', async query => {
    const response = await get(`type=workouts&${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error')
    expect(reads).toEqual([])
  })

  it('rejects a zero limit that would mask matching records', async () => {
    const response = await get('type=workouts&limit=0')
    expect(response.status).toBe(400)
    expect(reads).toEqual([])
  })

  it('distinguishes a missing connection from an unavailable connection lookup', async () => {
    subject = disconnected
    await sql.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [subject])
    const absent = await get('type=workouts')
    expect(absent.status).toBe(200)
    expect(await absent.json()).toMatchObject({ connectionStatus: 'disconnected', workouts: null,
      workoutCoverage: { ...expectedCoverage, status: 'not_connected' } })

    fault = 'token_denied'
    const unavailable = await get('type=workouts')
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toMatchObject({ workouts: null, workoutCoverage: { ...expectedCoverage, status: 'unavailable' } })
    expect(reads.every(url => url.pathname.endsWith('/whoop_tokens'))).toBe(true)
  })

  it('does not query workouts for a recovery-only request or any table without auth', async () => {
    const recovery = await get('type=recovery')
    expect(recovery.status).toBe(200)
    expect(await recovery.json()).not.toHaveProperty('workoutCoverage')
    expect(reads.some(url => url.pathname.endsWith('/whoop_workouts'))).toBe(false)

    reads.length = 0
    subject = null
    expect((await get('type=workouts')).status).toBe(401)
    expect(reads).toEqual([])
  })
})
