import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerClient } from '@/app/lib/auth/supabase-server'

const { cookies, helper } = vi.hoisted(() => ({ cookies: vi.fn(), helper: vi.fn() }))
vi.mock('next/headers', () => ({ cookies }))
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerComponentClient: helper }))

beforeEach(() => { vi.clearAllMocks() })
describe('Next async cookie bridge', () => {
  it('waits for request cookies before the synchronous legacy adapter reads them', async () => {
    let resolve!: (value: { get: (name: string) => { value: string } }) => void
    cookies.mockReturnValue(new Promise(done => { resolve = done }))
    helper.mockImplementation(({ cookies: read }) => ({ owner: read().get('session').value }))
    const pending = createServerClient()
    expect(helper).not.toHaveBeenCalled()
    resolve({ get: () => ({ value: 'synthetic-owner-a' }) })
    await expect(pending).resolves.toEqual({ owner: 'synthetic-owner-a' })
  })
  it('does not share a cookie store between requests or suppress retrieval errors', async () => {
    cookies.mockResolvedValueOnce({ get: () => ({ value: 'owner-a' }) })
      .mockResolvedValueOnce({ get: () => ({ value: 'owner-b' }) })
      .mockRejectedValueOnce(new Error('Request scope unavailable'))
    helper.mockImplementation(({ cookies: read }) => ({ owner: read().get('session').value }))
    await expect(createServerClient()).resolves.toEqual({ owner: 'owner-a' })
    await expect(createServerClient()).resolves.toEqual({ owner: 'owner-b' })
    await expect(createServerClient()).rejects.toThrow('Request scope unavailable')
    expect(helper).toHaveBeenCalledTimes(2)
  })
})
