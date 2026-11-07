import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'
import { NextRequest } from 'next/server'
import { asTargetOwner, targetFixture } from '../database/target-fixture'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET, POST, PUT } from '@/app/api/targets/route'

const owner = '99999999-9999-4999-8999-999999999999'
const other = '88888888-8888-4888-8888-888888888888'
const macros = { targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75 }
let sql: Awaited<ReturnType<typeof targetFixture>>, writes = 0
const rows = async () => (await sql.query('SELECT * FROM daily_targets ORDER BY user_id')).rows

// Actual SDK + canonical route; intercepted HTTP maps to private SQL, never a provider.
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input)), method = init?.method ?? 'GET'
  expect(url.pathname).toBe('/rest/v1/daily_targets')
  try {
    const value = await asTargetOwner(sql, owner, async tx => {
      if (method === 'POST') {
        const row = JSON.parse(String(init?.body)); expect(row.user_id).toBe(owner); writes++
        return (await tx.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET target_protein=EXCLUDED.target_protein,target_carbs=EXCLUDED.target_carbs,target_fat=EXCLUDED.target_fat,target_calories=EXCLUDED.target_calories,tolerance_pct=EXCLUDED.tolerance_pct RETURNING to_jsonb(daily_targets) value',
          [row.user_id,row.target_protein,row.target_carbs,row.target_fat,row.target_calories,row.tolerance_pct])).rows[0].value
      }
      expect(url.searchParams.get('user_id')).toBe('eq.' + owner)
      if (method === 'PATCH') {
        const row = JSON.parse(String(init?.body)), keys = Object.keys(row)
        expect(keys.every(key => ['target_protein','target_carbs','target_fat','target_calories','tolerance_pct'].includes(key))).toBe(true)
        writes++
        return (await tx.query(`UPDATE daily_targets SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE user_id=$${keys.length + 1} RETURNING to_jsonb(daily_targets) value`, [...keys.map(key => row[key]), owner])).rows[0].value
      }
      expect(method).toBe('GET')
      return (await tx.query('SELECT to_jsonb(t) value FROM daily_targets t WHERE user_id=$1', [owner])).rows[0].value
    })
    return Response.json(value, { status: method === 'POST' ? 201 : 200 })
  } catch (error: any) {
    return Response.json({ code: error.code, message: error.message }, { status: 400 })
  }
}
const sdk = new PostgrestClient('https://synthetic.invalid/rest/v1', { fetch: transport })
beforeAll(async () => {
  vi.stubGlobal('fetch', () => { throw new Error('Live network prohibited') })
  sql = await targetFixture()
  for (const id of [owner, other]) await sql.query('INSERT INTO auth.users(id) VALUES($1)', [id])
  vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, from: sdk.from.bind(sdk) } as any)
})
beforeEach(async () => {
  writes = 0
  await sql.exec('DELETE FROM daily_targets')
  for (const id of [owner, other]) await sql.query("INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct,updated_at) VALUES($1,150.25,200.5,60.75,1949.8,5,'2026-01-01Z')", [id])
})
afterAll(async () => { await sql?.close(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

for (const method of ['POST', 'PUT'] as const) {
  const call = (tolerancePct: unknown) => (method === 'POST' ? POST : PUT)(new NextRequest('http://localhost/api/targets', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...macros, tolerancePct, userId: other, user_id: other }),
  }))
  it.each([[0,0],[0.5,0.5],[12.34,12.34],[99.99,99.99],[99.994,99.99],[99.995,100],[99.999,100],[100,100]])(`${method} persists tolerance %s as %s without changing the other owner`, async (input, expected) => {
    const before = await rows(), response = await call(input)
    expect(response.status).toBe(method === 'POST' ? 201 : 200)
    expect(await response.json()).toMatchObject({ ...macros, userId: owner, targetCalories: 1949.8, tolerancePct: expected })
    const read = await GET(new NextRequest('http://localhost/api/targets'))
    expect((await read.json()).tolerancePct).toBe(expected)
    expect((await rows()).find((row: any) => row.user_id === other)).toEqual(before.find((row: any) => row.user_id === other))
  })
  it.each([-0.001, 100.001, 101, null, '100', true, {}])(`${method} rejects invalid tolerance %j before any write`, async input => {
    const before = await rows(), response = await call(input)
    expect(response.status).toBe(400); expect(writes).toBe(0); expect(await rows()).toEqual(before)
  })
}
