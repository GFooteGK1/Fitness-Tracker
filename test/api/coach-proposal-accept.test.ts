import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/coach/proposals/[id]/accept/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/coach/athlete-context', () => ({ fetchCoachRuntimeContext: vi.fn() }))

const id = '11111111-1111-4111-8111-111111111111'
const request = () => new Request(`http://localhost/api/coach/proposals/${id}/accept`, {
  method: 'POST', body: JSON.stringify({ idempotencyKey: 'accept-proposal-key' }),
})

describe('proposal acceptance freshness response', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['40001', '40P01'])('returns an actionable conflict for %s without reporting acceptance or reading a changed plan', async code => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } })
    vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, rpc } as never)
    const response = await POST(request(), { params: Promise.resolve({ id }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'Your training information changed; refresh and create a new proposal' })
    expect(fetchCoachRuntimeContext).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('accept_adaptation_proposal', {
      p_proposal_id: id, p_idempotency_key: 'accept-proposal-key',
    })
  })

  it('lets the database preserve successful accepted replay without a new revision preflight', async () => {
    const accepted = { program_id: 'program', plan_version_id: 'plan', proposal_status: 'accepted' }
    const rpc = vi.fn().mockResolvedValue({ data: [accepted], error: null })
    vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, rpc } as never)
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({ storageAvailable: true } as never)
    const response = await POST(request(), { params: Promise.resolve({ id }) })
    expect(response.status).toBe(200)
    expect((await response.json()).accepted).toEqual(accepted)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
