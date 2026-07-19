/**
 * Tests for POST /api/meals/cleanup
 *
 * Regression coverage for Fitness-Tracker-0tr.2 (fail-closed token) and the
 * service-role fix: with no CLEANUP_TOKEN configured the endpoint must refuse
 * (500), not run for everyone; and when it does run it uses a service-role
 * client so it can see/delete expired photos across all users.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('../../app/lib/storage', () => ({
  cleanupExpiredPhotos: vi.fn(),
}))

import { POST } from '../../app/api/meals/cleanup/route'
import { createServiceRoleClient } from '../../app/lib/auth/supabase-server'
import { cleanupExpiredPhotos } from '../../app/lib/storage'

function cleanupRequest(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/meals/cleanup', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('POST /api/meals/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed with 500 when CLEANUP_TOKEN is not configured', async () => {
    vi.stubEnv('CLEANUP_TOKEN', '')

    const response = await POST(cleanupRequest('Bearer anything'))
    expect(response.status).toBe(500)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(cleanupExpiredPhotos).not.toHaveBeenCalled()
  })

  it('returns 401 when the token does not match', async () => {
    vi.stubEnv('CLEANUP_TOKEN', 'right-token')

    const response = await POST(cleanupRequest('Bearer wrong-token'))
    expect(response.status).toBe(401)
    expect(cleanupExpiredPhotos).not.toHaveBeenCalled()
  })

  it('runs cleanup with a service-role client when the token matches', async () => {
    vi.stubEnv('CLEANUP_TOKEN', 'right-token')
    const client = { marker: 'service-role' }
    vi.mocked(createServiceRoleClient).mockReturnValue(client as any)
    vi.mocked(cleanupExpiredPhotos).mockResolvedValue({ success: true, deletedCount: 3 })

    const response = await POST(cleanupRequest('Bearer right-token'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.deletedCount).toBe(3)
    expect(createServiceRoleClient).toHaveBeenCalled()
    expect(cleanupExpiredPhotos).toHaveBeenCalledWith(client)
  })
})
