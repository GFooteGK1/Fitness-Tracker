import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/app/lib/dashboard-narrative-store', () => ({
  createDashboardNarrativeStore: vi.fn(() => ({ store: true })),
}))
vi.mock('@/app/lib/dashboard-narrative-service', () => ({
  getDashboardNarrative: vi.fn(),
}))
vi.mock('@/app/lib/llm/client', () => ({ complete: vi.fn() }))

import { GET } from '@/app/api/dashboard-narrative/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { getDashboardNarrative } from '@/app/lib/dashboard-narrative-service'

function client(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'Unauthorized' },
      }),
    },
  }
}

describe('GET /api/dashboard-narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('authenticates before composing a dashboard', async () => {
    vi.mocked(createServerClient).mockResolvedValue(client(null) as never)

    const response = await GET(new Request('http://localhost/api/dashboard-narrative?tzOffset=300'))

    expect(response.status).toBe(401)
    expect(getDashboardNarrative).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', '1.5', '-721', '841'])(
    'rejects invalid timezone offset %s',
    async tzOffset => {
      vi.mocked(createServerClient).mockResolvedValue(client({ id: 'user-1' }) as never)

      const response = await GET(new Request(
        `http://localhost/api/dashboard-narrative?tzOffset=${tzOffset}`,
      ))

      expect(response.status).toBe(400)
      expect(getDashboardNarrative).not.toHaveBeenCalled()
    },
  )

  it('derives the local cache day and returns private no-store output', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T02:00:00.000Z'))
    vi.mocked(createServerClient).mockResolvedValue(client({ id: 'user-1' }) as never)
    vi.mocked(getDashboardNarrative).mockResolvedValue({
      status: 'ready',
      cached: false,
      generatedAt: '2026-07-28T02:00:00.000Z',
      composition: { headline: 'Today', summary: 'Ready.', highlights: [] },
    })

    const response = await GET(new Request('http://localhost/api/dashboard-narrative?tzOffset=300'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(getDashboardNarrative).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      localDate: '2026-07-27',
      timezoneOffset: 300,
    }))
  })

  it('degrades to a 503 without exposing provider or database details', async () => {
    vi.mocked(createServerClient).mockResolvedValue(client({ id: 'user-1' }) as never)
    vi.mocked(getDashboardNarrative).mockRejectedValue(new Error('provider secret detail'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(new Request('http://localhost/api/dashboard-narrative?tzOffset=300'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Dashboard narrative unavailable' })
    expect(consoleError).toHaveBeenCalled()
  })
})
