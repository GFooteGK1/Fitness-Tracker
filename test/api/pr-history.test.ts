import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { GET } from '@/app/api/pr-history/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
  count?: number | null
}

function createQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    ilike: vi.fn(),
    then: vi.fn((resolve?: (value: QueryResult) => unknown) =>
      Promise.resolve(resolve ? resolve(result) : result)),
  }

  for (const method of ['select', 'eq', 'order', 'range', 'ilike'] as const) {
    query[method].mockReturnValue(query)
  }

  return query
}

function createSupabase(
  historyResult: QueryResult = { data: [], error: null, count: 0 },
  summaryResult: QueryResult = { data: [], error: null },
) {
  const historyQuery = createQuery(historyResult)
  const summaryQuery = createQuery(summaryResult)
  const from = vi.fn()
    .mockReturnValueOnce(historyQuery)
    .mockReturnValueOnce(summaryQuery)

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    },
    from,
    historyQuery,
    summaryQuery,
  }
}

function request(query = '') {
  return new Request(`http://localhost:3000/api/pr-history${query}`)
}

describe('GET /api/pr-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 401 before querying records when authentication fails', async () => {
    const from = vi.fn()
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Unauthorized' },
        }),
      },
      from,
    } as never)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(from).not.toHaveBeenCalled()
  })

  it('applies filters and pagination and returns summary counts', async () => {
    const records = [{ id: 'pr-1', exercise: 'Back Squat', pr_type: 'weight' }]
    const { client, from, historyQuery } = createSupabase(
      { data: records, error: null, count: 1 },
      {
        data: [
          { achieved_at: '2026-07-22T10:00:00Z' },
          { achieved_at: '2026-07-05T10:00:00Z' },
          { achieved_at: '2026-02-01T10:00:00Z' },
          { achieved_at: '2025-12-01T10:00:00Z' },
        ],
        error: null,
      },
    )
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(request('?exercise=%20Back%20Squat%20&prType=weight&limit=20&offset=10'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      records,
      total: 1,
      summary: {
        thisWeek: 1,
        thisMonth: 2,
        thisYear: 3,
        allTime: 4,
      },
    })
    expect(from).toHaveBeenNthCalledWith(1, 'personal_records')
    expect(from).toHaveBeenNthCalledWith(2, 'personal_records')
    expect(historyQuery.range).toHaveBeenCalledWith(10, 29)
    expect(historyQuery.ilike).toHaveBeenCalledWith('exercise', '%Back Squat%')
    expect(historyQuery.eq).toHaveBeenCalledWith('pr_type', 'weight')
  })

  it.each([
    ['?limit=0', 'limit must be an integer between 1 and 100'],
    ['?limit=101', 'limit must be an integer between 1 and 100'],
    ['?limit=1abc', 'limit must be an integer between 1 and 100'],
    ['?offset=-1', 'offset must be an integer between 0 and 10000'],
    ['?offset=1.5', 'offset must be an integer between 0 and 10000'],
    ['?offset=10001', 'offset must be an integer between 0 and 10000'],
    ['?prType=distance', 'prType must be one of: weight, reps, time, volume'],
    [`?exercise=${'x'.repeat(101)}`, 'exercise must be 100 characters or fewer'],
  ])('rejects invalid query %s', async (query, expectedError) => {
    const { client, from } = createSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(request(query))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: expectedError })
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 500 when the paginated history query fails', async () => {
    const { client, from } = createSupabase({
      data: null,
      error: { message: 'relation does not exist' },
      count: null,
    })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch PR history' })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('returns 500 instead of a misleading zero summary when the summary query fails', async () => {
    const { client } = createSupabase(
      { data: [], error: null, count: 0 },
      { data: null, error: { message: 'summary failed' } },
    )
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch PR summary' })
  })
})
