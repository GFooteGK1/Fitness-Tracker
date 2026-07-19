/**
 * Tests for POST /api/whoop/sync-all (Vercel Cron)
 *
 * Regression coverage for the service-role fix: a cron has no user session, so
 * the old cookie-scoped client saw zero rows under RLS and synced nobody while
 * reporting success. The route must now use a service-role client, find the
 * connected users, and sync each one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('../../app/lib/whoop/sync-service', () => ({
  incrementalSync: vi.fn(),
}))

import { POST } from '../../app/api/whoop/sync-all/route'
import { createServiceRoleClient } from '../../app/lib/auth/supabase-server'
import * as syncService from '../../app/lib/whoop/sync-service'

// A service-role client whose whoop_tokens select returns seeded users.
function serviceClientWithTokens(userIds: string[]) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: userIds.map((user_id) => ({ user_id })),
        error: null,
      }),
    })),
  }
}

function cronRequest(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/whoop/sync-all', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('POST /api/whoop/sync-all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the service-role client, finds users, and syncs each one', async () => {
    const client = serviceClientWithTokens(['user-1', 'user-2'])
    vi.mocked(createServiceRoleClient).mockReturnValue(client as any)
    vi.mocked(syncService.incrementalSync).mockResolvedValue({
      success: true,
      recordsSynced: { recovery: 1, sleep: 1, cycles: 1, workouts: 1 },
    })

    const response = await POST(cronRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(createServiceRoleClient).toHaveBeenCalled()
    expect(data.results.total).toBe(2)
    expect(data.results.successful).toBe(2)
    // Each user synced with the SAME service-role client threaded through.
    expect(syncService.incrementalSync).toHaveBeenCalledTimes(2)
    expect(syncService.incrementalSync).toHaveBeenCalledWith('user-1', client)
    expect(syncService.incrementalSync).toHaveBeenCalledWith('user-2', client)
  })

  it('returns 401 in production when the cron secret is wrong', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CRON_SECRET', 'right-secret')

    const response = await POST(cronRequest('Bearer wrong-secret'))
    expect(response.status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(syncService.incrementalSync).not.toHaveBeenCalled()
  })

  it('returns 500 in production when CRON_SECRET is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CRON_SECRET', '')

    const response = await POST(cronRequest('Bearer anything'))
    expect(response.status).toBe(500)
    expect(syncService.incrementalSync).not.toHaveBeenCalled()
  })
})
