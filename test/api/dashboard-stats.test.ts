import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { GET } from '@/app/api/dashboard-stats/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { randomUUID } from 'node:crypto'
import { loggingContext, saveActivity } from '@/app/lib/logging/server'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { mcpActivityFixture, mcpOwnerClient } from '../database/mcp-activity-fixture'

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

  it('categorizes supported persisted legacy types while preserving owner scope, dates and cache policy', async () => {
    let cleanupDb: Awaited<ReturnType<typeof mcpActivityFixture>> | undefined
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    vi.stubGlobal('fetch', () => { throw new Error('Unexpected network call in local fixture') })
    try {
      const sql = await mcpActivityFixture(); cleanupDb = sql
      const owner = randomUUID()
      await sql.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
      await sql.exec('SET ROLE authenticated')
      await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
      const sourceBlocks = [{ block_type: null, type: 'CARDIO' }, { block_type: null, type: 'STRENGTH' },
        { type: 'CARDIO' }, { block_type: 'STRENGTH', type: 'CARDIO' }]
      for (const block of sourceBlocks) {
        const writer = mcpOwnerClient(sql, owner)
        const request = await writer.db.rpc('begin_logging_request', {
          p_key: `synthetic-dashboard:${randomUUID()}`, p_fingerprint: 'd'.repeat(64),
        })
        expect(request.error).toBeNull()
        await loggingContext.run({ id: request.data.id, userId: owner, inputMethod: 'manual' }, () =>
          saveActivity(writer.db, 'workout', { workout_date: '2026-10-20', input_text: 'Synthetic completed session',
            blocks: [{ ...block, title: 'Synthetic block', movements: [{ name: 'Synthetic movement', reps: 5 }] }] }, [], undefined,
          { inputMethod: 'manual', provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed') }))
      }
      // Installed SQL's independent block projection agrees with writer nullish precedence.
      expect((await sql.query<{ block_type: string }>('SELECT block_type FROM block_scores ORDER BY block_type')).rows
        .map(row => row.block_type)).toEqual(['CARDIO', 'CARDIO', 'STRENGTH', 'STRENGTH'])
      const storedRows = async () => (await sql.query<{ value: Record<string, unknown> }>(
        'SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1 ORDER BY id', [owner])).rows.map(row => row.value)
      const before = await storedRows()
      expect(before).toHaveLength(4)
      expect(before.filter(row => (row.blocks as Array<Record<string, unknown>>)[0].block_type === null)).toHaveLength(2)
      const { client, query, from } = createSupabase({ user: { id: owner }, data: before })
      const writes = vi.fn(() => { throw new Error('Unexpected dashboard RPC') })
      Object.assign(client, { rpc: writes })
      vi.mocked(createServerClient).mockResolvedValue(client as never)
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-20T20:00:00Z')
      const response = await GET(new Request('http://localhost/api/dashboard-stats?tzOffset=0'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ totalWorkouts: 4, monthToDate: 4,
        strengthSessions: 2, metcons: 0, cardio: 2, currentMonth: 'October 2026' })
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(from).toHaveBeenCalledExactlyOnceWith('workouts')
      expect(query.eq).toHaveBeenCalledExactlyOnceWith('user_id', owner)
      expect(writes).not.toHaveBeenCalled()
      expect(await storedRows()).toEqual(before)
    } finally {
      await cleanupDb?.close()
      vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
    }
  }, 30000)
})
