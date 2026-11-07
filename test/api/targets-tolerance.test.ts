import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'
import { NextRequest } from 'next/server'
import { recommendationFixture } from '../database/recommendation-fixture'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET, POST } from '@/app/api/targets/route'

const owner = '99999999-9999-4999-8999-999999999999'
const macros = { targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75 }
let sql: Awaited<ReturnType<typeof recommendationFixture>>
let writes = 0

// Installed SDK with intercepted HTTP and private fixture SQL; never a provider.
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  expect(url.pathname).toBe('/rest/v1/daily_targets')
  if (init?.method === 'POST') {
    const row = JSON.parse(String(init.body))
    expect(row.user_id).toBe(owner)
    writes++
    const result = await sql.query<{ value: Record<string, unknown> }>(
      'INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET tolerance_pct=EXCLUDED.tolerance_pct RETURNING to_jsonb(daily_targets) value',
      [row.user_id, row.target_protein, row.target_carbs, row.target_fat, row.target_calories, row.tolerance_pct])
    return Response.json(result.rows[0].value, { status: 201 })
  }
  expect(init?.method).toBe('GET')
  expect(url.searchParams.get('user_id')).toBe('eq.' + owner)
  const result = await sql.query<{ value: Record<string, unknown> }>(
    'SELECT to_jsonb(t) value FROM daily_targets t WHERE user_id=$1', [owner])
  return Response.json(result.rows[0].value)
}
const sdk = new PostgrestClient('https://synthetic.invalid/rest/v1', { fetch: transport })
const request = (tolerancePct: unknown) => new NextRequest('http://localhost/api/targets', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...macros, tolerancePct }),
})

beforeAll(async () => {
  vi.stubGlobal('fetch', () => { throw new Error('Live network prohibited') })
  sql = await recommendationFixture()
  await sql.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
  vi.mocked(createServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: sdk.from.bind(sdk),
  } as any)
})
afterAll(async () => { await sql?.close(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('round-trips zero and fractions through the canonical writer and fixture SQL', async () => {
  for (const tolerancePct of [0, 0.5, 5]) {
    const response = await POST(request(tolerancePct))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ ...macros, userId: owner, targetCalories: 1949.8, tolerancePct })
    const read = await GET(new NextRequest('http://localhost/api/targets'))
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ ...macros, userId: owner, targetCalories: 1949.8, tolerancePct })
  }
  const before = (await sql.query('SELECT * FROM daily_targets')).rows
  const writeCount = writes
  for (const invalid of [-1, 101, null, '0']) expect((await POST(request(invalid))).status).toBe(400)
  expect(writes).toBe(writeCount)
  expect((await sql.query('SELECT * FROM daily_targets')).rows).toEqual(before)
}, 30000)
