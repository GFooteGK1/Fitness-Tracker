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
const weekStart = '2026-10-26T05:00:00.000Z'
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
  brokenWindowStart?: string
  limitedWindowStart?: string
} = {}) {
  const meals: Array<Record<string, unknown>> = []
  const mealWindows: Array<{ start: string; end: string }> = []
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
    expect(url.searchParams.get('limit')).toBe('1000')
    const filters = url.searchParams.getAll('meal_timestamp')
    expect(filters).toHaveLength(2)
    const from = filters.find(filter => filter.startsWith('gte.'))?.slice(4)
    const until = filters.find(filter => filter.startsWith('lt.'))?.slice(3)
    expect(from).toBeDefined()
    expect(until).toBeDefined()
    expect(Date.parse(from!)).toBeLessThan(Date.parse(until!))
    mealWindows.push({ start: from!, end: until! })
    if (options.brokenWindowStart === from) return Response.json({ message: 'private provider error' }, { status: 503 })
    const matches = meals.filter(row => belongs(row) && Date.parse(String(row.meal_timestamp)) >= Date.parse(from!)
      && Date.parse(String(row.meal_timestamp)) < Date.parse(until!))
      .sort((a, b) => Date.parse(String(b.meal_timestamp)) - Date.parse(String(a.meal_timestamp))
        || String(b.id).localeCompare(String(a.id)))
    const apiLimit = options.limitedWindowStart === from ? 1 : options.apiLimit ?? Infinity
    const rows = matches.slice(0, Math.min(Number(url.searchParams.get('limit')), apiLimit))
    const count = options.unknownCount ? '*' : matches.length
    return Response.json(rows, { headers: { 'Content-Range': (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + count } })
  })
  const rest = new PostgrestClient('https://fixture.invalid/rest/v1', { fetch })
  const db = { auth: { getUser: async () => ({ data: { user: { id: options.subject ?? owner } }, error: null }) },
    from: rest.from.bind(rest) } as unknown as SupabaseClient
  const tool = createSociusNutritionTool(async () => ({ db,
    principal: { ...policy, subject: owner, role: 'authenticated', expiresAt: Date.now() + 60_000 } }), policy)
  return { meals, mealWindows, fetch, tool }
}

describe('SociusFit Nutrition tab', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
  afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

  it('reads the athlete’s local date, counts canonical rows after logging or correction, and excludes other days and owners', async () => {
    const { meals, mealWindows, tool } = fixture()
    meals.push(meal(1, '2026-11-01T04:59:59.999Z'), meal(2, end), meal(3, start, other))
    expect(sociusNutritionTool._meta.ui.visibility).toEqual(['app'])
    expect((await tool.call({ timezone }))._meta.nutrition).toEqual({
      date: '2026-11-01', timezone,
      readAt: now, mealStatus: 'no_records', mealCount: 0,
      totals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      targetStatus: 'available', targets: { protein: 100, carbs: 200, fat: 50, calories: 1650 },
      weekToDate: { startDate: '2026-10-26', endDate: '2026-11-01', days: 7,
        loggedDays: 1, mealStatus: 'available', totals: { protein: 20, carbs: 30, fat: 10, calories: 290 },
        targetStatus: 'available', targets: { protein: 700, carbs: 1400, fat: 350, calories: 11550 } },
    })
    expect(mealWindows).toHaveLength(2)
    expect(mealWindows).toEqual(expect.arrayContaining([{ start, end }, { start: weekStart, end }]))

    meals.push({ ...meal(4, start), capture_input_method: 'manual' })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, totals: { protein: 20, carbs: 30, fat: 10, calories: 290 },
    })
    meals.push({ ...meal(5, '2026-11-02T05:59:59.999Z'), capture_input_method: 'photo' })
    Object.assign(meals[3], { total_protein: 25, total_calories: 310, capture_revision: 2 })
    const corrected = await tool.call({ timezone })
    expect(corrected._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 2, totals: { protein: 45, carbs: 60, fat: 20, calories: 600 },
      weekToDate: { mealStatus: 'available', loggedDays: 2, totals: { protein: 65, carbs: 90, fat: 30, calories: 890 } },
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
      weekToDate: { mealStatus: 'partial', loggedDays: null, totals: { protein: 20, carbs: 30, fat: 10, calories: 290 },
        targetStatus: 'not_configured', targets: null },
    })
    const unavailable = fixture({ brokenTable: 'meals' })
    expect((await unavailable.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'unavailable', mealCount: null, totals: null, targetStatus: 'available',
      weekToDate: { mealStatus: 'unavailable', loggedDays: null, totals: null, targetStatus: 'available' },
    })
    const targetFailure = fixture({ brokenTable: 'daily_targets' })
    targetFailure.meals.push(meal(1))
    expect((await targetFailure.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, targetStatus: 'unavailable', targets: null,
      weekToDate: { mealStatus: 'available', loggedDays: 1, targetStatus: 'unavailable', targets: null },
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
      weekToDate: { mealStatus: 'available', loggedDays: 1, totals: { protein: 20000, calories: 290000 } },
    })
    meals.push({ ...meal(1001, '2026-11-01T08:00:00.000Z'), total_protein: 25, total_calories: 310 })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'partial', mealCount: 1001, totals: { protein: 20005, carbs: 30000, fat: 10000, calories: 290020 },
      weekToDate: { mealStatus: 'partial', loggedDays: null, totals: { protein: 20005, calories: 290020 } },
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
      weekToDate: { mealStatus: 'partial', loggedDays: null, totals: { protein: 20 } },
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
      weekToDate: { mealStatus: 'unavailable', loggedDays: null, totals: null, targetStatus: 'unavailable', targets: null },
    })
  })

  it('starts a new week on local Monday and distinguishes an empty week from a saved zero-valued meal', async () => {
    vi.setSystemTime('2026-11-23T07:00:00.000Z')
    const { meals, tool, mealWindows } = fixture()
    const mondayStart = '2026-11-23T06:00:00.000Z'
    const tuesdayStart = '2026-11-24T06:00:00.000Z'
    const zeroTotals = { protein: 0, carbs: 0, fat: 0, calories: 0 }
    meals.push(meal(1, '2026-11-23T05:59:59.999Z'), meal(2, tuesdayStart), meal(3, mondayStart, other))
    const empty = (await tool.call({ timezone }))._meta.nutrition
    expect(empty).toMatchObject({ date: '2026-11-23', mealStatus: 'no_records', mealCount: 0, totals: zeroTotals,
      weekToDate: { startDate: '2026-11-23', endDate: '2026-11-23', days: 1, mealStatus: 'no_records', loggedDays: 0,
        totals: zeroTotals, targetStatus: 'available', targets: empty.targets } })
    expect(mealWindows.length).toBeGreaterThan(0)
    expect(mealWindows.every(window => window.start === mondayStart && window.end === tuesdayStart)).toBe(true)

    document.body.innerHTML = nutritionCardMarkup
    const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
    render(empty)
    expect(document.getElementById('nutrition-week-coverage')?.textContent).toBe('0 of 1 day with saved meals.')
    expect(document.getElementById('nutrition-week-progress')?.textContent).toContain('0%')

    meals.push({ ...meal(4, mondayStart), total_protein: 0, total_carbs: 0, total_fat: 0, total_calories: 0 })
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({ mealStatus: 'available', mealCount: 1, totals: zeroTotals,
      weekToDate: { mealStatus: 'available', loggedDays: 1, totals: zeroTotals } })
  })

  it('includes the 169-hour fall-back week and its last instant with seven civil days', async () => {
    const { meals, tool, mealWindows } = fixture()
    meals.push(meal(1, '2026-10-26T04:59:59.999Z'), meal(2, weekStart),
      meal(3, '2026-11-02T05:59:59.999Z'), meal(4, end))
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1,
      weekToDate: { startDate: '2026-10-26', endDate: '2026-11-01', days: 7, mealStatus: 'available', loggedDays: 2,
        totals: { protein: 40, carbs: 60, fat: 20, calories: 580 },
        targets: { protein: 700, carbs: 1400, fat: 350, calories: 11550 } },
    })
    expect(mealWindows).toContainEqual({ start: weekStart, end })
    expect((Date.parse(end) - Date.parse(weekStart)) / 3_600_000).toBe(169)
  })

  it('keeps a Monday-through-Wednesday range across a civil year boundary', async () => {
    vi.setSystemTime('2025-01-01T18:00:00.000Z')
    const { meals, tool, mealWindows } = fixture()
    const weekBoundary = '2024-12-30T06:00:00.000Z'
    const dayBoundary = '2025-01-01T06:00:00.000Z'
    const nextBoundary = '2025-01-02T06:00:00.000Z'
    meals.push(meal(1, '2024-12-30T05:59:59.999Z'), meal(2, weekBoundary), meal(3, dayBoundary), meal(4, nextBoundary))
    expect((await tool.call({ timezone }))._meta.nutrition).toMatchObject({ date: '2025-01-01', mealCount: 1,
      weekToDate: { startDate: '2024-12-30', endDate: '2025-01-01', days: 3, mealStatus: 'available', loggedDays: 2,
        totals: { protein: 40, carbs: 60, fat: 20, calories: 580 }, targets: { protein: 300, carbs: 600, fat: 150, calories: 4950 } } })
    expect(mealWindows).toHaveLength(2)
    expect(mealWindows).toEqual(expect.arrayContaining([{ start: weekBoundary, end: nextBoundary }, { start: dayBoundary, end: nextBoundary }]))
  })

  it('shows week-to-date macro progress against elapsed days including a day with no saved records', async () => {
    vi.setSystemTime('2026-11-25T18:00:00.000Z')
    const configured = { ...target, target_protein: 200, target_carbs: 250, target_fat: 80, target_calories: 2520 }
    const { meals, tool, mealWindows, fetch } = fixture({ targets: [configured] })
    const monday = '2026-11-23T06:00:00.000Z'
    const wednesday = '2026-11-25T06:00:00.000Z'
    const thursday = '2026-11-26T06:00:00.000Z'
    meals.push({ ...meal(1, monday), total_protein: 200 }, { ...meal(2, wednesday), total_protein: 250 },
      meal(3, '2026-11-23T05:59:59.999Z'), meal(4, thursday), meal(5, monday, other))
    const result = await tool.call({ timezone })
    expect(result._meta.nutrition).toMatchObject({ date: '2026-11-25', mealStatus: 'available', mealCount: 1, totals: { protein: 250 },
      targets: { protein: 200 },
      weekToDate: { startDate: '2026-11-23', endDate: '2026-11-25', days: 3, loggedDays: 2, mealStatus: 'available',
        totals: { protein: 450, carbs: 60, fat: 20, calories: 580 }, targetStatus: 'available',
        targets: { protein: 600, carbs: 750, fat: 240, calories: 7560 } } })
    expect(mealWindows).toEqual(expect.arrayContaining([{ start: monday, end: thursday }, { start: wednesday, end: thursday }]))
    expect(fetch.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/daily_targets'))).toHaveLength(1)
    expect(JSON.stringify(result.content)).not.toMatch(/450|600|7560/)
    expect(JSON.stringify(result)).not.toContain(owner)

    document.body.innerHTML = nutritionCardMarkup
    const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
    render(result._meta.nutrition)
    expect(document.getElementById('nutrition-week')?.hidden).toBe(false)
    expect(document.getElementById('nutrition-week-range')?.textContent).toMatch(/23.*25/)
    expect(document.getElementById('nutrition-week-coverage')?.textContent).toBe('2 of 3 days with saved meals.')
    expect(document.getElementById('nutrition-week-progress')?.textContent).toContain('75%')
    const protein = document.querySelector<HTMLProgressElement>('[aria-label="Protein week-to-date progress"]')
    expect(protein?.value).toBe(450)
    expect(protein?.max).toBe(600)
    expect(document.querySelector<HTMLProgressElement>('[aria-label="Protein progress"]')?.max).toBe(200)

    // A correction beyond the cumulative target still displays the real
    // percentage while the visual progress bar stops at its target.
    Object.assign(meals[0], { total_protein: 500 })
    render((await tool.call({ timezone }))._meta.nutrition)
    const afterCorrection = document.querySelector<HTMLProgressElement>('[aria-label="Protein week-to-date progress"]')
    expect(afterCorrection?.getAttribute('aria-valuetext')).toContain('750 g logged / 600 g target')
    expect(afterCorrection?.getAttribute('aria-valuetext')).toContain('125%')
    expect(afterCorrection?.value).toBe(600)
  })

  it('keeps the day available when a prior-day macro is invalid or the week read is capped', async () => {
    for (const options of [{}, { limitedWindowStart: weekStart }]) {
      const { meals, tool } = fixture(options)
      meals.push({ ...meal(1, weekStart), total_calories: null }, meal(2))
      if (options.limitedWindowStart) meals[0].total_calories = 290
      const result = await tool.call({ timezone })
      expect(result._meta.nutrition).toMatchObject({ mealStatus: 'available', mealCount: 1, totals: { protein: 20 },
        weekToDate: { mealStatus: 'partial', loggedDays: null, totals: { protein: 20, carbs: 30, fat: 10, calories: 290 } } })

      document.body.innerHTML = nutritionCardMarkup
      const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
      render(result._meta.nutrition)
      const week = document.getElementById('nutrition-week-progress')
      expect(week?.textContent).toContain('20 g')
      expect(week?.textContent).not.toMatch(/\d+(?:\.\d+)?%/)
      expect(document.getElementById('nutrition-week-meal-note')?.textContent).toMatch(/subtotal/i)
      expect(document.getElementById('nutrition-week-coverage')?.textContent).toBe('Logged-day coverage is unavailable.')
      expect(document.querySelector('[aria-label="Protein week-to-date progress"]')).toBeNull()
      expect(document.querySelector('[aria-label="Protein progress"]')).not.toBeNull()
    }
  })

  it('renders a failed week independently and clears comparison when current targets are missing', async () => {
    const isolated = fixture({ brokenWindowStart: weekStart })
    isolated.meals.push(meal(1))
    const result = await isolated.tool.call({ timezone })
    expect(result._meta.nutrition).toMatchObject({ mealStatus: 'available', mealCount: 1, totals: { protein: 20 },
      weekToDate: { mealStatus: 'unavailable', loggedDays: null, totals: null, targetStatus: 'available' } })
    document.body.innerHTML = nutritionCardMarkup
    const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
    render(result._meta.nutrition)
    expect(document.getElementById('nutrition-week-meal-note')?.textContent).toMatch(/unavailable/i)
    expect(document.querySelector('[aria-label="Protein week-to-date progress"]')).toBeNull()
    expect(document.querySelector('[aria-label="Protein progress"]')).not.toBeNull()

    const missing = fixture({ targets: [] })
    missing.meals.push(meal(1, weekStart), meal(2))
    const next = await missing.tool.call({ timezone })
    expect(next._meta.nutrition).toMatchObject({ targetStatus: 'not_configured',
      weekToDate: { mealStatus: 'available', loggedDays: 2, totals: { protein: 40 }, targetStatus: 'not_configured', targets: null } })
    render(next._meta.nutrition)
    expect(document.getElementById('nutrition-week-progress')?.textContent).toContain('40 g')
    expect(document.getElementById('nutrition-week-target-note')?.hidden).toBe(false)
    expect(document.querySelector('[aria-label="Protein week-to-date progress"]')).toBeNull()
    expect(document.getElementById('nutrition-week-progress')?.textContent).not.toMatch(/\d+(?:\.\d+)?%/)
  })

  it('preserves the daily card and clears obsolete weekly values on missing or malformed week data', async () => {
    const { meals, tool } = fixture()
    meals.push(meal(1))
    const nutrition = (await tool.call({ timezone }))._meta.nutrition
    document.body.innerHTML = nutritionCardMarkup
    const render = new Function('document', nutritionRendererScript + '\nreturn renderNutrition;')(document)
    render(nutrition)
    expect(document.querySelector('[aria-label="Protein week-to-date progress"]')).not.toBeNull()

    render({ ...nutrition, weekToDate: { ...nutrition.weekToDate, days: 99 } })
    expect(document.getElementById('nutrition-week')?.textContent).toContain('Week-to-date nutrition is unavailable.')
    expect(document.querySelector('[aria-label="Protein week-to-date progress"]')).toBeNull()
    expect(document.querySelector('[aria-label="Protein progress"]')).not.toBeNull()

    const { weekToDate, ...dailyOnly } = nutrition
    expect(weekToDate).toBeDefined()
    render(dailyOnly)
    expect(document.getElementById('nutrition-week')?.hidden).toBe(true)
    expect(document.getElementById('nutrition-card')?.hidden).toBe(false)
    expect(document.querySelector('[aria-label="Protein progress"]')).not.toBeNull()
  })

  it('fails closed on a foreign or duplicate prior-day row without erasing the day', async () => {
    const unexpected = fixture({ bypassOwner: true })
    unexpected.meals.push(meal(1, weekStart, other), meal(2))
    expect((await unexpected.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, weekToDate: { mealStatus: 'unavailable', loggedDays: null, totals: null },
    })
    const duplicate = fixture()
    duplicate.meals.push(meal(1, weekStart), meal(1, weekStart), meal(2))
    expect((await duplicate.tool.call({ timezone }))._meta.nutrition).toMatchObject({
      mealStatus: 'available', mealCount: 1, weekToDate: { mealStatus: 'unavailable', loggedDays: null, totals: null },
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
