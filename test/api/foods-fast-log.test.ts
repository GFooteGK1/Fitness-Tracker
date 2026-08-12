import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))

import { POST as logReviewedFood } from '@/app/api/foods/log/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

const user = { id: '11111111-1111-4111-8111-111111111111' }
const requestId = '33333333-3333-4333-8333-333333333333'

function clientWithFrom(from: ReturnType<typeof vi.fn>) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }, from }
}

describe('manual food logging route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores a reviewed manual label and logs scaled macros without an external lookup', async () => {
    const existingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const existingRequestEq = vi.fn(() => ({ maybeSingle: existingMaybeSingle }))
    const existingUserEq = vi.fn(() => ({ eq: existingRequestEq }))
    const mealSelect = vi.fn(() => ({ eq: existingUserEq }))
    const mealInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'meal-new' }, error: null })
    const mealInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: mealInsertSingle })) }))
    const catalogSingle = vi.fn().mockResolvedValue({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null })
    const catalogUpsert = vi.fn(() => ({ select: vi.fn(() => ({ single: catalogSingle })) }))
    const from = vi.fn((table: string) => table === 'meals' ? { select: mealSelect, insert: mealInsert } : { upsert: catalogUpsert })
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)

    const response = await logReviewedFood(new NextRequest('http://localhost/api/foods/log', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, timestamp: '2026-07-29T01:30:00.000Z', servings: 1.5, food: { name: 'Homemade bar', brand: '', source: 'manual_label', sourceKey: `manual:${requestId}`, servingAmount: 1, servingUnit: 'bar', servingLabel: '1 bar', nutritionBasis: 'per_serving', nutrition: { protein: 10, carbs: 20, fat: 5, calories: 165 }, sourceNutrition: { protein: 10, carbs: 20, fat: 5, calories: 165 }, sourcePayload: {} } }),
    }))

    expect(response.status).toBe(200)
    expect(catalogUpsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user.id, source: 'manual_label', barcode: null, name: 'Homemade bar' }), { onConflict: 'user_id,source,source_key' })
    expect(mealInsert).toHaveBeenCalledWith(expect.objectContaining({ entry_method: 'manual_label', total_protein: 15, total_carbs: 30, total_fat: 7.5, total_calories: 247.5, log_request_id: requestId }))
  })

  it('rejects non-manual food sources before writing', async () => {
    const from = vi.fn()
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)
    const response = await logReviewedFood(new NextRequest('http://localhost/api/foods/log', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, timestamp: '2026-07-29T01:30:00.000Z', servings: 1, food: { name: 'Bad', source: 'open_food_facts', nutrition: { protein: 1, carbs: 1, fat: 1, calories: 9 } } }),
    }))
    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
})
