import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/export/route'

// Real handler, PostgREST query serialization, jsPDF and autoTable; only Auth
// identity and the read-only data transport are synthetic. No sockets or secrets.
const origin = 'https://export-fixture.invalid'
const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const workout = (user: string, date: string, label: string) => ({
  id: '20000000-0000-4000-8000-000000000001', user_id: user, workout_date: date,
  input_text: label, blocks: [], notes: 'Steady', total_duration_min: 12.5,
})
const meal = (user: string, timestamp: string, label: string) => ({
  id: '30000000-0000-4000-8000-000000000001', user_id: user, meal_timestamp: timestamp,
  items: [{ food: label, calories: 398.9, protein: 37.5, carbs: 42.25, fat: 8.5 }],
  total_calories: 398.9, total_protein: 37.5, total_carbs: 42.25, total_fat: 8.5, photo_url: '',
})
let workouts: ReturnType<typeof workout>[]
let meals: ReturnType<typeof meal>[]
let user: { id: string; email: string } | null
let authError: Error | null
let failedTable: string | null
let reads: URL[]
let from: ReturnType<typeof vi.fn>

const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  expect(url.origin).toBe(origin)
  expect(init?.method ?? 'GET').toBe('GET')
  const table = url.pathname.slice('/rest/v1/'.length)
  expect(['workouts', 'meals', 'user_profiles']).toContain(table)
  expect(url.pathname).toBe('/rest/v1/' + table)
  reads.push(url)
  if (table === failedTable) return Response.json({ code: 'FIXTURE_FAILURE', message: 'Synthetic read failed' }, { status: 503 })
  if (table === 'user_profiles') {
    expect(url.searchParams.get('id')).toBe('eq.' + owner)
    return Response.json({ display_name: 'Synthetic Export Owner' })
  }
  const ownerFilter = url.searchParams.get('user_id')
  if (!ownerFilter?.startsWith('eq.')) throw new Error('Missing fixture owner predicate')
  const field = table === 'workouts' ? 'workout_date' : 'meal_timestamp'
  const bounds = url.searchParams.getAll(field)
  const lower = bounds.find(value => value.startsWith('gte.'))?.slice(4)
  const upper = bounds.find(value => value.startsWith('lte.'))?.slice(4)
  const rows: Record<string, unknown>[] = table === 'workouts' ? workouts : meals
  const selected = rows.filter(row => row.user_id === ownerFilter.slice(3)
    && (!lower || String(row[field]) >= lower) && (!upper || String(row[field]) <= upper))
    .sort((a, b) => String(a[field]).localeCompare(String(b[field])))
  return Response.json(selected)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-04-03T01:00:00Z'))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'))
  user = { id: owner, email: 'synthetic@example.invalid' }; authError = null; failedTable = null; reads = []
  workouts = [workout(owner, '2026-04-01', 'Synthetic Squat'), workout(other, '2026-04-01', 'Other owner workout'),
    workout(owner, '2026-03-31', 'Outside range workout'), workout(owner, '2026-04-02', 'Outside range workout')]
  meals = [meal(owner, '2026-04-02T01:00:00.000Z', 'Synthetic Oats'), meal(other, '2026-04-02T01:00:00.000Z', 'Other owner meal'),
    meal(owner, '2026-04-01T05:59:59.999Z', 'Outside range meal'), meal(owner, '2026-04-02T06:00:00.000Z', 'Outside range meal')]
  const rest = new PostgrestClient(origin + '/rest/v1', { fetch: transport })
  from = vi.fn(table => rest.from(table))
  vi.mocked(createServerClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user }, error: authError }) } } as never)
})
afterEach(() => {
  try { expect(globalThis.fetch).not.toHaveBeenCalled() }
  finally { vi.restoreAllMocks(); vi.useRealTimers() }
})

function request(format: string, type = 'all') {
  return new Request(origin + `/api/export?format=${format}&type=${type}&start=2026-04-01&end=2026-04-01&tzOffset=360`)
}
function expectReadScope(type: string) {
  expect(reads.map(url => url.pathname)).toEqual([
    ...(type !== 'meals' ? ['/rest/v1/workouts'] : []), ...(type !== 'workouts' ? ['/rest/v1/meals'] : []), '/rest/v1/user_profiles',
  ])
  for (const url of reads.filter(url => !url.pathname.endsWith('user_profiles'))) {
    expect(url.searchParams.get('user_id')).toBe('eq.' + owner)
    if (url.pathname.endsWith('workouts')) {
      expect(url.searchParams.getAll('workout_date')).toEqual(['gte.2026-04-01', 'lte.2026-04-01'])
      expect(url.searchParams.get('order')).toBe('workout_date.asc')
    } else {
      expect(url.searchParams.getAll('meal_timestamp')).toEqual(['gte.2026-04-01T06:00:00.000Z', 'lte.2026-04-02T05:59:59.999Z'])
      expect(url.searchParams.get('order')).toBe('meal_timestamp.asc')
    }
  }
}
async function pdfBody(response: Response, type: string) {
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('application/pdf')
  expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="sociusfit-${type}-2026-04-01-to-2026-04-01.pdf"`)
  // Inspect HTTP response bytes directly, never normalize the generator value.
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect([...bytes.slice(0, 5)]).toEqual([37, 80, 68, 70, 45])
  const pdf = Buffer.from(bytes).toString('latin1')
  expect(pdf).toContain('/Type /Page')
  const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(pdf)
  expect(trailer).not.toBeNull()
  expect(pdf.slice(Number(trailer![1]), Number(trailer![1]) + 4)).toBe('xref')
  for (const text of ['SociusFit', 'Synthetic Export Owner', 'Generated by SociusFit on 2026-04-02']) expect(pdf).toContain(`(${text}) Tj`)
  return pdf
}

describe('real PDF export response bytes', () => {
  it.each(['all', 'workouts', 'meals'])('downloads a valid %s PDF with only owned, in-range content', async type => {
    const pdf = await pdfBody(await GET(request('pdf', type)), type)
    expectReadScope(type)
    for (const forbidden of ['Other owner', 'Outside range']) expect(pdf).not.toContain(forbidden)
    if (type !== 'meals') expect(pdf).toContain('(Synthetic Squat) Tj')
    else expect(pdf).not.toContain('Synthetic Squat')
    if (type !== 'workouts') {
      for (const text of ['Synthetic Oats', '398.9', '37.5', '42.25', '8.5']) expect(pdf).toContain(`(${text}) Tj`)
    } else expect(pdf).not.toContain('Synthetic Oats')
  })
  it('downloads a valid empty PDF with zero summary and no tables', async () => {
    workouts = []; meals = []
    const pdf = await pdfBody(await GET(request('pdf')), 'all')
    expect(pdf).toContain('(Total Workouts: 0) Tj')
    expect(pdf).toContain('(Total Meals Logged: 0) Tj')
    expect(pdf).not.toContain('(Workouts) Tj'); expect(pdf).not.toContain('(Meals) Tj')
    expectReadScope('all')
  })
})

const workoutCsv = 'Date,Exercise,Sets,Reps,Weight,Notes,Duration (min)\n2026-04-01,Synthetic Squat,,,,Steady,12.5'
const mealCsv = 'Date,Meal Name,Calories,Protein (g),Carbs (g),Fat (g),Photo URL\n2026-04-01,Synthetic Oats,398.9,37.5,42.25,8.5,'
it.each(['all', 'workouts', 'meals'])('preserves exact %s CSV bytes, headers and read scope', async type => {
  const response = await GET(request('csv', type))
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
  expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="sociusfit-${type}-2026-04-01-to-2026-04-01.csv"`)
  const expected = type === 'all' ? `--- WORKOUTS ---\n${workoutCsv}\n\n--- MEALS ---\n${mealCsv}` : type === 'workouts' ? workoutCsv : mealCsv
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(expected))
  expectReadScope(type)
})
it.each(['missing user', 'auth error'])('returns unauthorized without reads for %s', async reason => {
  if (reason === 'missing user') user = null
  else authError = new Error('Synthetic auth failure')
  const response = await GET(request('pdf'))
  expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: 'Unauthorized' })
  expect(from).not.toHaveBeenCalled(); expect(reads).toEqual([])
})
it.each(['workouts', 'meals'])('preserves %s read-error response instead of a PDF', async table => {
  failedTable = table
  const response = await GET(request('pdf'))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Failed to fetch ' + table, details: 'Synthetic read failed' })
  expect(response.headers.get('Content-Disposition')).toBeNull()
  expect(reads.map(url => url.pathname)).toEqual(table === 'workouts' ? ['/rest/v1/workouts'] : ['/rest/v1/workouts', '/rest/v1/meals'])
})
it('preserves a 500 response when real jsPDF cannot build its output', async () => {
  const { default: jsPDF } = await import('jspdf')
  // A supported library hook injects a synthetic build failure, not a fake PDF.
  const hook: [string, (this: { internal: { pages: unknown[] } }) => void] = ['buildDocument', function () { this.internal.pages[1] = null }]
  const events = (jsPDF as unknown as { API: { events: unknown[] } }).API.events
  expect(Array.isArray(events)).toBe(true)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  events.push(hook)
  try {
    const response = await GET(request('pdf'))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'Export failed' })
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(errors).toHaveBeenCalled()
  } finally {
    const index = events.indexOf(hook)
    if (index >= 0) events.splice(index, 1)
  }
})
it('preserves invalid-format rejection without any table read', async () => {
  const response = await GET(request('invalid'))
  expect(response.status).toBe(400)
  expect(from).not.toHaveBeenCalled(); expect(reads).toEqual([])
})
