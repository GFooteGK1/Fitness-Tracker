import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { upsert, from, getUser } = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn(), getUser: vi.fn() }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: async () => ({ auth: { getUser }, from }) }))
import { POST } from '@/app/api/profile/onboarding/route'

describe('minimal onboarding API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    from.mockReturnValue({ upsert })
    upsert.mockReturnValue({ select: () => ({ single: async () => ({ data: { user_id: 'user-1' }, error: null }) }) })
  })
  const request = (body_metrics: unknown) => new NextRequest('http://localhost/api/profile/onboarding', { method: 'POST', body: JSON.stringify({ body_metrics, fitness_goals: ['performance'], activity_level: 'moderately_active' }) })
  it('saves age and goals without body defaults or generated targets', async () => {
    const result = await POST(request({ age: 30 }))
    expect(result.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ body_metrics: { age: 30 } }), expect.anything())
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('user_profiles')
  })
  it.each([{ age: 12 }, { age: '30' }, {}, { age: 30, height_cm: null }, { age: 30, weight_kg: 2 }])('rejects invalid age or supplied measurements %j before writes', async metrics => {
    expect((await POST(request(metrics))).status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })
})
