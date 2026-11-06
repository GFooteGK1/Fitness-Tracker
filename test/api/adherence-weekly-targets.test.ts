import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { NextRequest } from 'next/server'
import { mcpActivityFixture } from '../database/mcp-activity-fixture'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET, POST } from '@/app/api/adherence/weekly/route'
import { POST as saveTargets } from '@/app/api/targets/route'

const unavailable = { error: 'Unable to load your daily targets. Please try again.' }
const missing = { error: 'Failed to fetch user targets. Please set your daily targets first.' }
const owner = randomUUID(), unconfiguredOwner = randomUUID()
type Mode = 'healthy' | 'service' | 'fetch' | 'multiple' | 'singular-error' | 'ambiguous-error' | 'invalid-json' | 'object' | 'null'
let sql: Awaited<ReturnType<typeof mcpActivityFixture>>
let mode: Mode = 'healthy', subject = owner, setup = true, writes = 0
const requests: Array<{ table: string; method: string; owner: string | null; start?: string }> = []
const stored = async () => ({
  targets: (await sql.query('SELECT to_jsonb(t) value FROM daily_targets t ORDER BY user_id')).rows,
  meals: (await sql.query('SELECT to_jsonb(m) value FROM meals m ORDER BY id')).rows,
})
let before: Awaited<ReturnType<typeof stored>>

/** Exercise the installed SDK without a provider: real fixture SQL, intercepted HTTP. */
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input)), table = url.pathname.split('/').pop()!
  const method = init?.method ?? 'GET', headers = new Headers(init?.headers)
  const trace = { table, method, owner: url.searchParams.get('user_id') } as typeof requests[number]
  requests.push(trace)
  expect(['daily_targets', 'meals']).toContain(table)
  if (method === 'POST') {
    if (!setup) throw new Error('Weekly reporting cannot write')
    expect(table).toBe('daily_targets')
    const row = JSON.parse(String(init?.body))
    expect(row.user_id).toBe(owner)
    writes++
    const result = await sql.query<{ value: Record<string, unknown> }>(
      'INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(daily_targets) value',
      [row.user_id, row.target_protein, row.target_carbs, row.target_fat, row.target_calories, row.tolerance_pct])
    return Response.json(result.rows[0].value, { status: 201 })
  }
  expect(method).toBe('GET')
  expect(trace.owner).toBe('eq.' + subject)
  if (table === 'meals') {
    const timestamps = url.searchParams.getAll('meal_timestamp')
    const start = timestamps.find(value => value.startsWith('gte.'))?.slice(4)
    const end = timestamps.find(value => value.startsWith('lt.'))?.slice(3)
    expect(start).toBeTruthy(); expect(end).toBeTruthy()
    trace.start = start
    const rows = await sql.query<{ value: Record<string, unknown> }>(
      'SELECT to_jsonb(m) value FROM (SELECT total_protein,total_carbs,total_fat,total_calories FROM meals WHERE user_id=$1 AND meal_timestamp >= $2 AND meal_timestamp < $3) m',
      [subject, start, end])
    return Response.json(rows.rows.map(row => row.value))
  }
  const rows = (await sql.query<{ value: Record<string, unknown> }>(
    'SELECT to_jsonb(t) value FROM daily_targets t WHERE user_id=$1 LIMIT 2', [subject])).rows.map(row => row.value)
  if (mode === 'fetch') throw new TypeError('Synthetic private transport detail')
  if (mode === 'service') return Response.json({ code: 'PGRST000', message: 'Synthetic private provider detail' }, { status: 503 })
  if (mode === 'singular-error' || mode === 'ambiguous-error') return Response.json({
    code: 'PGRST116', details: mode === 'singular-error' ? 'The result contains 10 rows' : null,
    message: 'Synthetic ambiguous singular response',
  }, { status: 406 })
  if (mode === 'invalid-json') return new Response('{', { status: 200 })
  if (mode === 'object') return Response.json(rows[0])
  if (mode === 'null') return Response.json(null)
  const selected = mode === 'multiple' ? [rows[0], rows[0]] : rows
  if (headers.get('accept') === 'application/vnd.pgrst.object+json') {
    if (selected.length !== 1) return Response.json({ code: 'PGRST116', details: 'The result contains ' + selected.length + ' rows' }, { status: 406 })
    return Response.json(selected[0])
  }
  expect(url.searchParams.get('limit')).toBe('2')
  return Response.json(selected)
}
const sdk = new PostgrestClient('https://synthetic.invalid/rest/v1', { fetch: transport })
const db = { auth: { getUser: async () => ({ data: { user: { id: subject } }, error: null }) },
  from: sdk.from.bind(sdk), rpc: () => { throw new Error('Weekly reporting cannot invoke write RPCs') } }
async function request(method: 'GET' | 'POST') {
  return method === 'GET'
    ? GET(new NextRequest('http://localhost/api/adherence/weekly?weekStart=2026-11-02&tzOffset=360'))
    : POST(new NextRequest('http://localhost/api/adherence/weekly', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tzOffset: 360 }) }))
}
beforeAll(async () => {
  vi.stubGlobal('fetch', () => { throw new Error('Live network is prohibited in this fixture') })
  sql = await mcpActivityFixture()
  await sql.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, unconfiguredOwner])
  vi.mocked(createServerClient).mockResolvedValue(db as any)
  const response = await saveTargets(new NextRequest('http://localhost/api/targets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75, tolerancePct: 0 }) }))
  expect(response.status).toBe(201)
  for (const [timestamp, protein, carbs, fat, calories] of [
    ['2026-11-02T23:30:00-06:00', 25.25, 10.5, 2.25, 163.25],
    ['2026-11-03T12:00:00-06:00', 0, 0, 0, 0],
  ] as const) {
    await sql.query('INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [owner, timestamp, JSON.stringify([{ food: 'Synthetic complete meal', portion: '1 serving', protein, carbs, fat, calories }]), protein, carbs, fat, calories])
  }
  setup = false
  before = await stored()
}, 30000)
beforeEach(() => {
  mode = 'healthy'; subject = owner; requests.length = 0
  vi.mocked(createServerClient).mockResolvedValue(db as any)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-11-06T20:00:00Z')
})
afterEach(async () => {
  expect(writes).toBe(1); expect(await stored()).toEqual(before)
  vi.useRealTimers(); vi.restoreAllMocks()
})
afterAll(async () => { await sql?.close(); vi.unstubAllGlobals() })

describe.each(['GET', 'POST'] as const)('%s weekly target reads', method => {
  it.each(['service', 'fetch', 'multiple', 'singular-error', 'ambiguous-error', 'invalid-json', 'object', 'null'] as const)(
    'returns only retry guidance for %s without starting meal summaries', async failure => {
      mode = failure
      const response = await request(method)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(unavailable)
      expect(requests.map(item => item.table)).toEqual(['daily_targets'])
    })
  it('preserves a saved fractional target, zero tolerance, meal fractions/zeros and local dates', async () => {
    const healthy = await request(method), body = await healthy.json()
    expect(healthy.status).toBe(200)
    expect(body.targets).toMatchObject({ userId: owner, targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1949.8, tolerancePct: 0 })
    expect(body).toMatchObject({ daysWithData: 2, daysElapsed: 5, weekStart: '2026-11-02', weekEnd: '2026-11-08' })
    expect(body.cumulativeData).toMatchObject({ totalProtein: 25.25, totalCarbs: 10.5, totalFat: 2.25, totalCalories: 163.25 })
    expect(body.weeklyAdherence.dailyScores.map((day: any) => [day.date, day.dailyTotals.protein]))
      .toEqual([['2026-11-02', 25.25], ['2026-11-03', 0]])
    expect(requests.filter(item => item.table === 'meals')).toHaveLength(7)
    expect(requests.find(item => item.table === 'meals')?.start).toBe('2026-11-02T06:00:00.000Z')
  })
  it('recovers the exact healthy target and report after a transient target-read failure', async () => {
    const healthy = await request(method), body = await healthy.json()
    expect(healthy.status).toBe(200)
    mode = 'service'; const failed = await request(method)
    expect(failed.status).toBe(500); expect(await failed.json()).toEqual(unavailable)
    mode = 'healthy'; const recovered = await request(method)
    expect(recovered.status).toBe(200); expect(await recovered.json()).toEqual(body)
  })
  it('keeps setup guidance for confirmed absence without reading another owner target or meals', async () => {
    subject = unconfiguredOwner
    const response = await request(method)
    expect(response.status).toBe(404); expect(await response.json()).toEqual(missing)
    expect(requests.map(item => item.table)).toEqual(['daily_targets'])
  })
  it('rejects data accompanied by a read error before meal queries', async () => {
    const result = { data: null, error: { code: 'PGRST116', message: 'Synthetic incomplete read' } }
    const row = { user_id: owner, target_protein: 150.25, target_carbs: 200.5, target_fat: 60.75, target_calories: 1949.8, tolerance_pct: 0, updated_at: '2026-11-02T12:00:00Z' }
    const partial = vi.fn((_table: string) => ({ select: () => ({ eq: () => ({
      single: async () => ({ ...result, data: row }),
      limit: async () => ({ ...result, data: [row] }),
    }) }) }))
    vi.mocked(createServerClient).mockResolvedValue({ ...db, from: partial } as any)
    const response = await request(method)
    expect(response.status).toBe(500); expect(await response.json()).toEqual(unavailable)
    expect(partial.mock.calls.map(call => call[0])).toEqual(['daily_targets'])
  })
})
