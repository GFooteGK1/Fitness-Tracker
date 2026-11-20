// @vitest-environment jsdom
import { PostgrestClient } from '@supabase/postgrest-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nutritionCardMarkup, nutritionRendererScript } from '../../app/lib/coach/nutrition-app-ui'
import { createSociusNutritionTool, sociusNutritionTool } from '../../app/lib/coach/socius-nutrition-app'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const timezone = 'America/Chicago'
const now = '2026-11-02T02:00:00.000Z'
const start = '2026-11-01T05:00:00.000Z'
const end = '2026-11-02T06:00:00.000Z'
const policy = { clientId: 'test-client', resource: 'https://socius.invalid/mcp', issuer: 'https://auth.invalid' }
const target = { user_id: owner, target_protein: 100, target_carbs: 200, target_fat: 50, target_calories: 1650, tolerance_pct: 5 }
const macroRow = { total_protein: 20, total_carbs: 30, total_fat: 10, total_calories: 290 }
const meal = (index: number, timestamp = start, subject = owner) => ({
  id: '20000000-0000-4000-8000-' + String(index).padStart(12, '0'),
  user_id: subject, meal_timestamp: timestamp, items: [], ...macroRow,
})

function fixture(options: {
  targets?: typeof target[]
  brokenTable?: string
  subject?: string
  bypassOwner?: boolean
  apiLimit?: number
  unknownCount?: boolean
} = {}) {
  const meals: Array<Record<string, unknown>> = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.method).toBe('GET')
    const url = new URL(String(input))
    const table = url.pathname.split('/').at(-1)
    expect(url.searchParams.get('user_id')).toBe('eq.' + owner)
    if (options.brokenTable === table) return Response.json({ message: 'private provider error' }, { status: 503 })
    const belongs = (row: { user_id?: unknown }) => options.bypassOwner || row.user_id === owner
    if (table === 'daily_targets') return Response.json((options.targets ?? [target]).filter(belongs))
    expect(table).toBe('meals')
    expect(url.searchParams.get('select')).toBe('id,user_id,meal_timestamp,total_protein,total_carbs,total_fat,total_calories')
    expect(url.searchParams.get('order')).toBe('meal_timestamp.desc,id.desc')
    expect(new Headers(init?.headers).get('prefer')).toContain('count=exact')
    expect(url.searchParams.get('meal_timestamp')).toBe('gte.' + start)
    expect(url.searchParams.getAll('meal_timestamp')).toContain('lt.' + end)
    const matches = meals.filter(row => belongs(row) && Date.parse(String(row.meal_timestamp)) >= Date.parse(start)
      && Date.parse(String(row.meal_timestamp)) < Date.parse(end))
      .sort((a, b) => Date.parse(String(b.meal_timestamp)) - Date.parse(String(a.meal_timestamp))
        || String(b.id).localeCompare(String(a.id)))
    const rows = matches.slice(0, Math.min(Number(url.searchParams.get('limit')), options.apiLimit ?? Infinity))
    const count = options.unknownCount ? '*' : matches.length
    return Response.json(rows, { headers: { 'Content-Range': (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + count } })
  })
  const rest = new PostgrestClient('https://fixture.invalid/rest/v1', { fetch })
  const db = { auth: { getUser: async () => ({ data: { user: { id: options.subject ?? owner } }, error: null }) },
    from: rest.from.bind(rest) } as unknown as SupabaseClient
  const tool = createSociusNutritionTool(async () => ({ db,
    principal: { ...policy, subject: owner, role: 'authenticated', expiresAt: Date.now() + 60_000 } }), policy)
  return { meals, fetch, tool }
}

describe('SociusFit Nutrition tab', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
  afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

  it('reads the athlete’s local date, counts canonical rows after logging or correction, and excludes other days and owners', async () => {
    const { meals, tool } = fixture()
    meals.push(meal(1, '2026-11-01T04:59:59.999Z'), meal(2, end), meal(3, start, other))
    expect(sociusNutritionTool._meta.ui.visibility).toEqual(['app'])
    expect((await tool.call({ timezone }))._meta.nutrition).toEqual({
      date: '2026-11-01', timezone,
      readAt: now, mealStatus: 'no_records', mealCount: 0,
      totals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      targetStatus: 'available', targets: { protein: 100, carbs: 200, fat: 50, calories: 1650 },
    })

    meals.push({ ...meal(4, start), capture_input_method: 'manual' })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, totals: { protein: 20, carbs: 30, fat: 10, calories: 290 },
    })
    meals.push({ ...meal(5, '2026-11-02T05:59:59.999Z'), capture_input_method: 'photo' })
    Object.assign(meals[3], { total_protein: 25, total_calories: 310, capture_revision: 2 })
    const corrected = await tool.call({ timezone })
    expect(corrected._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 2, totals: { protein: 45, carbs: 60, fat: 20, calories: 600 },
    })
    expect(JSON.stringify(corrected)).not.toContain(owner)
    expect(JSON.stringify(corrected.content)).not.toMatch(/45|600|1650/)
  })

  it('keeps subtotal, no target, and source failure separate', async () => {
    const partial = fixture({ targets: [] })
    partial.meals.push(meal(1), { ...meal(2), total_calories: null })
    expect((await partial.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'partial', mealCount: 2, totals: { protein: 20, carbs: 30, fat: 10, calories: 290 },
      targetStatus: 'not_configured', targets: null,
    })
    const unavailable = fixture({ brokenTable: 'meals' })
    expect((await unavailable.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'unavailable', mealCount: null, totals: null, targetStatus: 'available',
    })
    const targetFailure = fixture({ brokenTable: 'daily_targets' })
    targetFailure.meals.push(meal(1))
    expect((await targetFailure.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, targetStatus: 'unavailable', targets: null,
    })
  })

  it('includes confirmed daily meals after the Activity detail cap', async () => {
    const { meals, tool } = fixture()
    meals.push(...Array.from({ length: 35 }, (_, index) => meal(index + 1)))
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 35, totals: { protein: 700, carbs: 1050, fat: 350, calories: 10150 },
    })
    meals.push({ ...meal(36, '2026-11-01T08:00:00.000Z'), total_protein: '25', total_calories: '310' })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 36, totals: { protein: 725, carbs: 1080, fat: 360, calories: 10460 },
    })
  })

  it('marks totals partial when the summary cap or a lower API cap omits logged meals', async () => {
    const { meals, tool } = fixture()
    meals.push(...Array.from({ length: 1000 }, (_, index) => meal(index + 1)))
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1000, totals: { protein: 20000, carbs: 30000, fat: 10000, calories: 290000 },
    })
    meals.push({ ...meal(1001, '2026-11-01T08:00:00.000Z'), total_protein: 25, total_calories: 310 })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'partial', mealCount: 1001, totals: { protein: 20005, carbs: 30000, fat: 10000, calories: 290020 },
    })

    const lower = fixture({ apiLimit: 1 })
    lower.meals.push(meal(1), meal(2))
    expect((await lower.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'partial', mealCount: 2, totals: { protein: 20 },
    })
    const unknown = fixture({ unknownCount: true })
    unknown.meals.push(meal(1))
    expect((await unknown.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'partial', mealCount: null, totals: { protein: 20 },
    })
  })

  it('rejects caller-supplied identity and does not return foreign source rows', async () => {
    const rejected = fixture({ subject: other })
    await expect(rejected.tool.call({ timezone })).rejects.toMatchObject({ status: 401 })
    await expect(rejected.tool.call({ timezone, userId: owner })).rejects.toMatchObject({ status: 400 })
    await expect(rejected.tool.call({ timezone: '+06:00' })).rejects.toMatchObject({ status: 400 })
    expect(rejected.fetch).not.toHaveBeenCalled()
    const foreign = fixture({ bypassOwner: true, targets: [{ ...target, user_id: other }] })
    foreign.meals.push(meal(1, start, other))
    expect((await foreign.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'unavailable', totals: null, targetStatus: 'unavailable', targets: null,
    })
  })

  it('renders accessible progress and preserves uncertainty on subsequent renders', async () => {
    document.body.innerHTML = nutritionCardMarkup
    const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
    const { meals, tool } = fixture()
    meals.push({ ...meal(1), total_protein: 125 })
    render((await tool.call({ timezone }))._meta.nutrition)
    const protein = document.querySelector<HTMLProgressElement>('[aria-label="Protein progress"]')
    expect(protein?.getAttribute('aria-valuetext')).toBe('125 g logged / 100 g target')
    expect(protein?.value).toBe(100)
    expect(document.body.textContent).toContain('Full-day intake is unknown.')
    expect(document.body.textContent).toContain('1 saved meal')

    render((await fixture({ brokenTable: 'meals' }).tool.call({ timezone }))._meta.nutrition)
    expect(document.querySelectorAll('progress')).toHaveLength(0)
    expect(document.getElementById('nutrition-meal-note')?.textContent).toBe('Logged macro totals are unavailable.')
    expect(document.getElementById('nutrition-progress')?.textContent).toContain('100 g target')
  })
})
