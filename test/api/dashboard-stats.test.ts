import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { GET } from '@/app/api/dashboard-stats/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

function createSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  data = [] as unknown[],
  error = null as { message: string } | null,
} = {}) {
  const order = vi.fn().mockResolvedValue({ data, error })
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order,
  }
  const from = vi.fn().mockReturnValue(query)

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: user ? null : { message: 'Unauthorized' },
        }),
      },
      from,
    },
    from,
    query,
  }
}

describe('GET /api/dashboard-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 before querying user data', async () => {
    const { client, from } = createSupabase({ user: null })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request('http://localhost/api/dashboard-stats'))

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it.each(['abc', '360junk', '1.5', '-721', '841'])(
    'rejects invalid timezone offset %s',
    async tzOffset => {
      const { client, from } = createSupabase()
      vi.mocked(createServerClient).mockResolvedValue(client as never)

      const response = await GET(new Request(
        `http://localhost/api/dashboard-stats?tzOffset=${tzOffset}`,
      ))

      expect(response.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
    },
  )

  it('returns typed aggregates with private cache controls', async () => {
    const { client, query } = createSupabase({
      data: [{
        id: 'workout-1',
        workout_date: '2026-07-22',
        created_at: '2026-07-22T12:00:00Z',
        blocks: [{ block_type: 'STRENGTH' }],
        input_text: 'Back squat',
      }],
    })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request(
      'http://localhost/api/dashboard-stats?tzOffset=360',
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.totalWorkouts).toBe(1)
    expect(body.strengthSessions).toBe(1)
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('returns 500 when workout aggregation input cannot be fetched', async () => {
    const { client } = createSupabase({ error: { message: 'query failed' } })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request('http://localhost/api/dashboard-stats'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch workouts: query failed' })
  })
})
