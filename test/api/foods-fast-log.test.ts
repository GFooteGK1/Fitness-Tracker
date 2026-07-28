import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/nutrition/open-food-facts', () => ({ lookupOpenFoodFactsProduct: vi.fn() }))

import { GET as lookupBarcode } from '@/app/api/foods/barcode/route'
import { POST as logReviewedFood } from '@/app/api/foods/log/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { lookupOpenFoodFactsProduct } from '@/app/lib/nutrition/open-food-facts'

const user = { id: '11111111-1111-4111-8111-111111111111' }
const requestId = '33333333-3333-4333-8333-333333333333'

function clientWithFrom(from: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  }
}

function savedCatalogQuery(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  const limit = vi.fn(() => ({ maybeSingle }))
  const order = vi.fn(() => ({ limit }))
  const barcodeEq = vi.fn(() => ({ order }))
  const userEq = vi.fn(() => ({ eq: barcodeEq }))
  return { select: vi.fn(() => ({ eq: userEq })) }
}

describe('food catalog and barcode routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a previously reviewed user food before calling the public provider', async () => {
    const from = vi.fn(() => savedCatalogQuery({
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Saved cereal',
      brand: 'Brand',
      barcode: '0034000470693',
      barcode_lookup_key: '0034000470693',
      source: 'open_food_facts',
      source_key: '0034000470693',
      source_ref: '0034000470693',
      serving_amount: '30',
      serving_unit: 'g',
      serving_label: '30 g',
      nutrition_basis: 'per_serving',
      protein: '4',
      carbs: '20',
      fat: '2',
      calories: '120',
      source_nutrition: { protein: 4, carbs: 20, fat: 2, calories: 120 },
      source_payload: { providerSchema: 'open_food_facts_v3' },
    }))
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)

    const response = await lookupBarcode(new NextRequest('http://localhost/api/foods/barcode?code=034000470693'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.food).toMatchObject({ name: 'Saved cereal', catalogEntryId: expect.any(String) })
    expect(body.origin).toBe('catalog')
    expect(lookupOpenFoodFactsProduct).not.toHaveBeenCalled()
  })

  it('uses Open Food Facts when the user catalog has no barcode match', async () => {
    const from = vi.fn(() => savedCatalogQuery(null))
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)
    vi.mocked(lookupOpenFoodFactsProduct).mockResolvedValue({
      name: 'Provider cereal',
      brand: 'Brand',
      barcode: '0034000470693',
      barcodeLookupKey: '0034000470693',
      source: 'open_food_facts',
      sourceKey: '0034000470693',
      sourceRef: '0034000470693',
      servingAmount: 30,
      servingUnit: 'g',
      servingLabel: '30 g',
      nutritionBasis: 'per_serving',
      nutrition: { protein: 4, carbs: 20, fat: 2, calories: 120 },
      sourceNutrition: { protein: 4, carbs: 20, fat: 2, calories: 120 },
      sourcePayload: { providerSchema: 'open_food_facts_v3' },
    })

    const response = await lookupBarcode(new NextRequest('http://localhost/api/foods/barcode?code=034000470693'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.origin).toBe('open_food_facts')
    expect(body.food.name).toBe('Provider cereal')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('stores a reviewed manual label and logs scaled macros without an LLM call', async () => {
    const existingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const existingRequestEq = vi.fn(() => ({ maybeSingle: existingMaybeSingle }))
    const existingUserEq = vi.fn(() => ({ eq: existingRequestEq }))
    const mealSelect = vi.fn(() => ({ eq: existingUserEq }))
    const mealInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'meal-new' }, error: null })
    const mealInsert = vi.fn(() => ({
      select: vi.fn(() => ({ single: mealInsertSingle })),
    }))
    const catalogSingle = vi.fn().mockResolvedValue({
      data: { id: '44444444-4444-4444-8444-444444444444' },
      error: null,
    })
    const catalogUpsert = vi.fn(() => ({
      select: vi.fn(() => ({ single: catalogSingle })),
    }))
    const from = vi.fn((table: string) => table === 'meals'
      ? { select: mealSelect, insert: mealInsert }
      : { upsert: catalogUpsert })
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)

    const response = await logReviewedFood(new NextRequest('http://localhost/api/foods/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        timestamp: '2026-07-29T01:30:00.000Z',
        servings: 1.5,
        food: {
          name: 'Homemade bar',
          brand: '',
          source: 'manual_label',
          sourceKey: `manual:${requestId}`,
          servingAmount: 1,
          servingUnit: 'bar',
          servingLabel: '1 bar',
          nutritionBasis: 'per_serving',
          nutrition: { protein: 10, carbs: 20, fat: 5, calories: 165 },
          sourceNutrition: { protein: 10, carbs: 20, fat: 5, calories: 165 },
          sourcePayload: {},
        },
      }),
    }))

    expect(response.status).toBe(200)
    expect(catalogUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      source: 'manual_label',
      name: 'Homemade bar',
    }), { onConflict: 'user_id,source,source_key' })
    expect(mealInsert).toHaveBeenCalledWith(expect.objectContaining({
      entry_method: 'manual_label',
      total_protein: 15,
      total_carbs: 30,
      total_fat: 7.5,
      total_calories: 247.5,
      log_request_id: requestId,
      items: [expect.objectContaining({
        food: 'Homemade bar',
        portion: '1.5 × 1 bar',
        nutritionSource: expect.objectContaining({ source: 'manual_label' }),
      })],
    }))
    expect(lookupOpenFoodFactsProduct).not.toHaveBeenCalled()
  })

  it('rejects invalid reviewed macros before writing', async () => {
    const from = vi.fn()
    vi.mocked(createServerClient).mockResolvedValue(clientWithFrom(from) as never)

    const response = await logReviewedFood(new NextRequest('http://localhost/api/foods/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        timestamp: '2026-07-29T01:30:00.000Z',
        servings: 1,
        food: { name: 'Bad', nutrition: { protein: -1 } },
      }),
    }))

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
})
