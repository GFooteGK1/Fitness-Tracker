import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { PostgrestClient } from '@supabase/postgrest-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCoachingContextMcpServer } from '@/app/lib/coach/coaching-context-mcp'
import { mcpActivityFixture } from './mcp-activity-fixture'
import { sqlFile } from './fixture'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const workout = '20000000-0000-4000-8000-000000000001'
const lunch = '20000000-0000-4000-8000-000000000002'
const legacy = '20000000-0000-4000-8000-000000000003'
const foreign = '20000000-0000-4000-8000-000000000004'
const date = '2026-11-01'
const now = '2026-11-02T18:00:00.000Z'
const policy = { clientId: 'test-client', resource: 'https://socius.invalid/mcp', issuer: 'https://auth.invalid' }
const args = { startDate: date, endDate: date, timezone: 'America/Chicago', domains: ['workouts', 'meals', 'targets'] }
const provenance = JSON.stringify({ schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'corrected' },
  fields: { blocks: { origin: 'athlete_reported', reviewState: 'corrected' }, macros: { origin: 'model_estimated', reviewState: 'athlete_confirmed' } } })
const blocks = (reps: number) => JSON.stringify([{ block_type: 'STRENGTH', segments: [{ events: [{
  movement_name: 'Squat', performed: { sets: [{ reps: 5, load: { value: 135, unit: 'lb' } }, { reps, load: { value: 135, unit: 'lb' } }] },
}] }] }])
const items = (servings: number) => JSON.stringify([{ food: 'Lunch', portion: servings + ' servings',
  protein: servings * 20, carbs: servings * 30, fat: servings * 10, calories: servings * 290 }])

let sql: Awaited<ReturnType<typeof mcpActivityFixture>>
beforeAll(async () => {
  sql = await mcpActivityFixture()
  const targetPolicy = sqlFile('docs/migrations/food-tracking-migration.sql').match(/CREATE POLICY "Users can view their own targets"[^;]+;/)![0]
  await sql.exec('GRANT SELECT ON public.daily_targets TO authenticated; ALTER TABLE public.daily_targets ENABLE ROW LEVEL SECURITY; ' + targetPolicy)
  await sql.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, other])
  const entered = '2026-11-01T18:00:00Z'
  const corrected = '2026-11-02T15:00:00Z'
  await sql.query('INSERT INTO workouts(id,user_id,workout_date,input_text,blocks,capture_revision,capture_provenance,created_at,captured_at,updated_at) VALUES ($1,$2,$3,$4,$5,2,$6,$7,$8,$8)',
    [workout, owner, date, 'Synthetic workout', blocks(4), provenance, entered, corrected])
  await sql.query('INSERT INTO workouts(id,user_id,workout_date,input_text,blocks,created_at,updated_at,captured_at) VALUES ($1,$2,$3,$4,$5,$6,$6,$6),($7,$8,$9,$10,$5,$6,$6,$6)',
    [legacy, owner, '2026-10-31', 'Legacy workout', '[{"unknown":true}]', entered, foreign, other, date, 'Foreign workout'])
  await sql.query('INSERT INTO meals(id,user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories,capture_revision,capture_provenance,created_at,captured_at) VALUES ($1,$2,$3,$4,40,60,20,580,2,$5,$3,$6)',
    [lunch, owner, entered, items(2), provenance, corrected])
  for (const [kind, id, old, current, precision] of [
    ['workout', workout, { blocks: JSON.parse(blocks(5)) }, { blocks: JSON.parse(blocks(4)) }, 'timestamp'],
    ['meal', lunch, { items: JSON.parse(items(1)) }, { items: JSON.parse(items(2)) }, 'timestamp'],
  ] as const) {
    for (const [revision, record, captured] of [[1, old, entered], [2, current, corrected]] as const) {
      await sql.query("INSERT INTO activity_revisions(user_id,entity_kind,original_entity_id,revision,record,provenance,captured_at,event_at,event_precision,blocks,input_method,actor_id,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]','text',$1,gen_random_uuid())",
        [owner, kind, id, revision, JSON.stringify({ ...record, id, user_id: owner, capture_revision: revision }), provenance, captured, entered, precision])
    }
  }
  await sql.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES ($1,100,200,50,1650,0)', [owner])
  await sql.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES ($1,200,250,75,2475,5)', [other])
  const samples = [
    [other, '2026-11-01T18:00:00Z', 'Other athlete lunch'],
    [owner, '2026-11-01T04:59:59.999999Z', 'Before fall window'],
    [owner, '2026-11-01T05:00:00Z', 'Fall midnight'],
    [owner, '2026-11-01T06:30:00Z', 'First fall 1:30'],
    [owner, '2026-11-01T07:30:00Z', 'Second fall 1:30'],
    [owner, '2026-11-02T05:59:59.999999Z', 'Last fall fraction'],
    [owner, '2026-11-02T06:00:00Z', 'After fall window'],
    [owner, '2026-03-08T05:59:59.999999Z', 'Before spring window'],
    [owner, '2026-03-08T06:00:00Z', 'Spring midnight'],
    [owner, '2026-03-09T04:59:59.999999Z', 'Last spring fraction'],
    [owner, '2026-03-09T05:00:00Z', 'After spring window'],
  ]
  for (const [subject, at, food] of samples) {
    // Put adjacent fall-boundary meals in the second subject for the boundary
    // case. Give the primary correction oracle a clean Nov 1 meal count.
    const sampleOwner = food.includes('fall') || food.startsWith('Fall') ? other : subject
    await sql.query('INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) VALUES ($1,$2,$3,0,0,0,0)',
      [sampleOwner, at, JSON.stringify([{ food, portion: '1 serving', protein: 0, carbs: 0, fat: 0, calories: 0 }])])
  }
  await sql.query("INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) SELECT $1,'2026-04-17T18:00Z',$2,20,30,10,290 FROM generate_series(1,36)",
    [owner, items(1)])
  await sql.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks,created_at,updated_at,captured_at) SELECT $1,'2026-10-30','Many workouts',$2,$3,$3,$3 FROM generate_series(1,31)",
    [owner, blocks(4), entered])
  await sql.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks,created_at,updated_at,captured_at) VALUES ($1,'2026-10-28','Many movements',$2,$3,$3,$3)",
    [owner, JSON.stringify([{ block_type: 'STRENGTH', movements: Array.from({ length: 60 }, () => ({ name: 'Squat', reps: 5, sets: 1, weight: '135 lb' })) }]), entered])
}, 30_000)
afterAll(async () => { await sql?.close() })

// Exercise the real SDK URL construction and disposable database reads under RLS.
// The fixture implements only the GET filters this contract uses.
async function history(subject = owner, arguments_: Record<string, unknown> = args,
  options: { outage?: string; identity?: string; expired?: boolean; contaminate?: string } = {}) {
  await sql.exec('RESET ROLE')
  await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [options.identity ?? subject])
  await sql.exec('SET ROLE authenticated')
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.method ?? 'GET').toBe('GET')
    const url = new URL(String(input))
    const table = url.pathname.split('/').at(-1)!
    expect(['workouts', 'meals', 'activity_revisions', 'daily_targets']).toContain(table)
    expect(url.searchParams.get('user_id')).toBe('eq.' + subject)
    if (options.outage === table) return Response.json({ message: 'Private source fault' }, { status: 503 })
    const values: string[] = []
    const bind = (value: string) => '$' + values.push(value)
    const filters: string[] = []
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit'].includes(key)) continue
      if (key === 'or') {
        const pairs = [...value.matchAll(/and\(original_entity_id\.eq\.([a-f0-9-]+),revision\.eq\.(\d+)\)/g)]
        expect(pairs.length).toBeGreaterThan(0)
        filters.push('(' + pairs.map(([, id, revision]) => '(original_entity_id = ' + bind(id) + ' AND revision = ' + bind(revision) + ')').join(' OR ') + ')')
        continue
      }
      const [, op, operand] = /^(eq|gte|lte|lt)\.(.*)$/.exec(value)!
      expect(key).toMatch(/^[a-z_]+$/)
      filters.push(key + ' ' + { eq: '=', gte: '>=', lte: '<=', lt: '<' }[op] + ' ' + bind(operand))
    }
    const order = url.searchParams.get('order')?.split(',').map(part => {
      const [, key, direction] = /^([a-z_]+)\.(asc|desc)$/.exec(part)!
      return key + ' ' + direction
    })
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const select = url.searchParams.get('select')!
    expect(select).toMatch(/^([a-z_,]+|\*)$/)
    const where = ' WHERE ' + filters.join(' AND ')
    const rows = (await sql.query<{ value: unknown }>('SELECT to_jsonb(q) value FROM (SELECT ' + select + ' FROM ' + table + where +
      (order ? ' ORDER BY ' + order.join(',') : '') + ' LIMIT ' + limit + ') q', values)).rows
    const total = new Headers(init?.headers).get('prefer')?.includes('count=exact')
      ? (await sql.query<{ total: number }>('SELECT count(*)::int total FROM ' + table + where, values)).rows[0].total
      : '*'
    const response = rows.map(row => row.value)
    if (options.contaminate === table) response.push({ user_id: other, id: foreign, meal_timestamp: '2026-11-01T18:00:00Z' })
    return Response.json(response, { headers: { 'Content-Range': rows.length ? '0-' + (rows.length - 1) + '/' + total : '*/' + total } })
  })
  const postgrest = new PostgrestClient('https://fixture.invalid/rest/v1', { fetch })
  const db = { auth: { getUser: async () => ({ data: { user: { id: options.identity ?? subject } }, error: null }) },
    from: postgrest.from.bind(postgrest) } as unknown as SupabaseClient
  const server = createCoachingContextMcpServer(async () => ({ db, principal: { ...policy,
    subject, role: 'authenticated', expiresAt: Date.parse(now) + (options.expired ? 0 : 60_000) } }), policy, { writesEnabled: false })
  const client = new Client({ name: 'activity-history-fixture', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    expect((await client.listTools()).tools).toContainEqual(expect.objectContaining({ name: 'get_activity_history',
      annotations: expect.objectContaining({ readOnlyHint: true }) }))
    const result = await client.callTool({ name: 'get_activity_history', arguments: arguments_ })
    return { result, fetch }
  } finally {
    await client.close()
    await server.close()
    vi.useRealTimers()
    await sql.exec('RESET ROLE')
  }
}

it('recalls corrected occurrences by local date from a fresh MCP client and isolates the second athlete', async () => {
  const { result } = await history()
  expect(result.isError).toBe(false)
  expect(result.structuredContent).toMatchObject({ history: {
    readAt: now,
    window: { startDate: date, endDate: date, timezone: 'America/Chicago', startUtc: '2026-11-01T05:00:00.000Z', endUtcExclusive: '2026-11-02T06:00:00.000Z' },
    workouts: { totalCount: 1, occurrences: [{ id: workout, revision: 2, eventDate: date,
      eventAt: expect.any(String), eventPrecision: 'timestamp',
      details: { records: [{ recordedEvent: { performed: { sets: [{ reps: 5, load: { value: 135, unit: 'lb' } }, { reps: 4, load: { value: 135, unit: 'lb' } }] } } }] } }] },
    meals: { totalCount: 1, intakeCoverage: 'unknown', occurrences: [{ id: lunch, revision: 2, eventDate: date,
      items: [{ portion: '2 servings' }], macros: { protein: 40, carbs: 60, fat: 20, calories: 580 } }] },
    targets: { status: 'available', historicalEffective: 'unknown', current: { tolerancePct: 0 } },
  } })
  const text = (result.content as Array<{ text: string }>)[0].text
  expect(Date.parse(JSON.parse(text).history.workouts.occurrences[0].eventAt)).toBe(Date.parse('2026-11-01T18:00:00Z'))
  expect(JSON.parse(text)).toEqual(result.structuredContent)
  expect(text).not.toContain(foreign)
  expect((await history(other)).result.structuredContent).toMatchObject({ history: {
    workouts: { totalCount: 1, occurrences: [{ id: foreign }] },
    meals: { totalCount: 5 },
    targets: { status: 'available', current: { protein: 200 } },
  } })
  expect(JSON.stringify((await history(other)).result)).not.toContain(lunch)
  expect((await sql.query('SELECT revision FROM activity_revisions ORDER BY revision')).rows).toEqual([{ revision: 1 }, { revision: 1 }, { revision: 2 }, { revision: 2 }])
})

it.each([
  [other, date, ['Fall midnight', 'First fall 1:30', 'Second fall 1:30', 'Other athlete lunch', 'Last fall fraction']],
  [owner, '2026-03-08', ['Spring midnight', 'Last spring fraction']],
] as const)('includes each timestamp at the local DST window edges on %s, %s', async (subject, day, foods) => {
  const { result } = await history(subject, { ...args, startDate: day, endDate: day, domains: ['meals'] })
  const occurrences = foods.map(food => expect.objectContaining({ eventDate: day, items: [expect.objectContaining({ food })] }))
  expect(result.structuredContent).toMatchObject({ history: { meals: { occurrences,
    totals: { protein: 0, carbs: 0, fat: 0, calories: 0 }, totalsScope: 'all_logged_meals_in_window' } } })
})

it('keeps the date-only legacy occurrence when every detail is unavailable', async () => {
  const { result } = await history(owner, { ...args, startDate: '2026-10-31', endDate: '2026-10-31', domains: ['workouts'] })
  expect(result.structuredContent).toMatchObject({ history: { workouts: { status: 'partial', totalCount: 1,
    occurrences: [{ id: legacy, eventAt: '2026-10-31', eventPrecision: 'date', details: { status: 'unavailable', records: [] } }] },
    meals: { status: 'not_requested' } } })
})

it('uses a capped subtotal and reports the complete matched meal count', async () => {
  const { result } = await history(owner, { ...args, startDate: '2026-04-17', endDate: '2026-04-17', domains: ['meals'] })
  expect(result.structuredContent).toMatchObject({ history: { meals: {
    status: 'partial', totalCount: 36, returnedCount: 35, limit: 35, truncated: true, retrievalComplete: false,
    totals: { protein: 700, carbs: 1050, fat: 350, calories: 10150 }, totalsScope: 'subtotal_of_returned_meals_with_macros',
  } } })
})

it('reports workout count separately from projection truncation', async () => {
  const bounded = await history(owner, { ...args, startDate: '2026-10-30', endDate: '2026-10-30', domains: ['workouts'] })
  expect(bounded.result.structuredContent).toMatchObject({ history: { workouts: {
    status: 'partial', totalCount: 31, returnedCount: 30, limit: 30, truncated: true, retrievalComplete: false,
  } } })
  const omitted = await history(owner, { ...args, startDate: '2026-10-28', endDate: '2026-10-28', domains: ['workouts'] })
  expect(omitted.result.structuredContent).toMatchObject({ history: { workouts: {
    status: 'partial', totalCount: 1, returnedCount: 1, truncated: false, retrievalComplete: true,
    occurrences: [{ details: { status: 'partial', omissionCount: expect.any(Number), omitted: expect.arrayContaining([expect.objectContaining({ reason: 'record_budget' })]) } }],
  } } })
})

it('distinguishes empty logs from independent source failures', async () => {
  const empty = await history(other, { ...args, startDate: '2026-10-02', endDate: '2026-10-02' }, { outage: 'daily_targets' })
  expect(empty.result.structuredContent).toMatchObject({ history: {
    workouts: { status: 'no_records', returnedCount: 0 }, meals: { status: 'no_records', totalCount: 0, intakeCoverage: 'unknown' },
    targets: { status: 'unavailable', current: null, historicalEffective: 'unknown' },
  } })
  const fault = await history(owner, args, { outage: 'meals' })
  expect(fault.result.structuredContent).toMatchObject({ history: {
    workouts: { totalCount: 1 }, meals: { status: 'unavailable', totalCount: null, totals: null }, targets: { status: 'available' },
  } })
  const timeFault = await history(owner, args, { outage: 'activity_revisions' })
  expect(timeFault.result.structuredContent).toMatchObject({ history: { workouts: { timingStatus: 'partial', status: 'partial',
    totalCount: 1, occurrences: [{ id: workout, revision: 2, eventAt: date, eventPrecision: 'date' }] } } })
})

it.each([
  { startDate: '2026-02-30' }, { endDate: '2026-10-31' }, { endDate: '2026-11-08' },
  { timezone: 'Chicago' }, { timezone: '+06:00' }, { domains: [] }, { domains: ['meals', 'meals'] },
  { domains: ['whoop'] }, { owner: other },
])('rejects malformed or caller-selected owner input before any domain read (%j)', async invalid => {
  const { result, fetch } = await history(owner, { ...args, ...invalid })
  expect(result.isError).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})

it.each([{ identity: other }, { expired: true }])('rejects denied principals before any domain read (%j)', async options => {
  const { result, fetch } = await history(owner, args, options)
  expect(result.isError).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['workouts', 'meals', 'activity_revisions', 'daily_targets'])('fails closed for a foreign %s row even after RLS', async table => {
  const { result } = await history(owner, args, { contaminate: table })
  expect(JSON.stringify(result)).not.toContain(foreign)
  expect(result.structuredContent).toMatchObject({ history: table === 'activity_revisions'
    ? { workouts: { status: 'partial', timingStatus: 'partial' } }
    : { [table === 'daily_targets' ? 'targets' : table]: { status: 'unavailable' } } })
})
