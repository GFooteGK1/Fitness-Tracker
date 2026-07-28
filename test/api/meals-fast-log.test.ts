import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))

import { GET as getCommonMeals } from '@/app/api/meals/common/route'
import { POST as quickLogMeal } from '@/app/api/meals/quick-log/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

const user = { id: '11111111-1111-4111-8111-111111111111' }
const sourceMealId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'

function authedClient(from: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  }
}

describe('fast meal logging routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns deterministic user-scoped common meals without an LLM call', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: sourceMealId,
          meal_timestamp: '2026-07-28T12:00:00.000Z',
          items: [{ food: 'Eggs', portion: '2', protein: 12, carbs: 1, fat: 10, calories: 140 }],
          total_protein: '12',
          total_carbs: '1',
          total_fat: '10',
          total_calories: '140',
          needs_review: false,
          manual_override: true,
          reviewed_at: '2026-07-28T12:05:00.000Z',
        },
      ],
      error: null,
    })
    const order = vi.fn(() => ({ limit }))
    const userEq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq: userEq }))
    const from = vi.fn(() => ({ select }))
    vi.mocked(createServerClient).mockResolvedValue(authedClient(from) as never)

    const response = await getCommonMeals(new NextRequest('http://localhost/api/meals/common?limit=4'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(userEq).toHaveBeenCalledWith('user_id', user.id)
    expect(body.meals[0]).toMatchObject({ sourceMealId, title: 'Eggs', timesLogged: 1 })
  })

  it('copies a source meal into a new timestamp and records quick-log provenance', async () => {
    const sourceMeal = {
      id: sourceMealId,
      items: [{ food: 'Eggs', portion: '2', protein: 12, carbs: 1, fat: 10, calories: 140 }],
      total_protein: '12',
      total_carbs: '1',
      total_fat: '10',
      total_calories: '140',
      needs_review: false,
      manual_override: true,
      reviewed_at: '2026-07-28T12:05:00.000Z',
      ai_confidence: '0.9',
    }
    const sourceSingle = vi.fn().mockResolvedValue({ data: sourceMeal, error: null })
    const sourceUserEq = vi.fn(() => ({ single: sourceSingle }))
    const sourceIdEq = vi.fn(() => ({ eq: sourceUserEq }))
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'new-meal' }, error: null })
    const insertSelect = vi.fn(() => ({ single: insertSingle }))
    const insert = vi.fn(() => ({ select: insertSelect }))
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: sourceIdEq })),
      insert,
    }))
    vi.mocked(createServerClient).mockResolvedValue(authedClient(from) as never)

    const response = await quickLogMeal(new NextRequest('http://localhost/api/meals/quick-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceMealId,
        requestId,
        timestamp: '2026-07-29T01:30:00.000Z',
      }),
    }))

    expect(response.status).toBe(200)
    expect(sourceUserEq).toHaveBeenCalledWith('user_id', user.id)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      meal_timestamp: '2026-07-29T01:30:00.000Z',
      source_meal_id: sourceMealId,
      log_request_id: requestId,
      entry_method: 'quick_log',
      photo_url: null,
      total_calories: 140,
    }))
    const insertCalls = insert.mock.calls as unknown as Array<[Record<string, unknown>]>
    expect(insertCalls[0][0].reviewed_at).not.toBe(sourceMeal.reviewed_at)
  })

  it('rejects malformed identifiers before reading meal history', async () => {
    const from = vi.fn()
    vi.mocked(createServerClient).mockResolvedValue(authedClient(from) as never)

    const response = await quickLogMeal(new NextRequest('http://localhost/api/meals/quick-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceMealId: 'bad', requestId: 'bad', timestamp: 'not-a-date' }),
    }))

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
})
