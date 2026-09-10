import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { single } = vi.hoisted(() => ({ single: vi.fn() }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: 'user-1' } }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }) }))
import { GET } from '@/app/auth/callback/route'

describe('auth callback minimal profile routing', () => {
  it.each([{ age: 30, destination: '/dashboard' }, { age: 12, destination: '/onboarding' }, { age: undefined, destination: '/onboarding' }])('routes age $age to $destination', async ({ age, destination }) => {
    single.mockResolvedValue({ data: { body_metrics: { age }, fitness_goals: ['performance'] }, error: null })
    const result = await GET(new NextRequest('http://localhost/auth/callback?code=example'))
    expect(result.headers.get('location')).toBe(`http://localhost${destination}`)
  })
})
