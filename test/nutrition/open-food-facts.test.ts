import { describe, expect, it, vi } from 'vitest'
import { lookupOpenFoodFactsProduct } from '@/app/lib/nutrition/open-food-facts'

describe('Open Food Facts adapter', () => {
  it('uses the current v3 product endpoint with a bounded field projection and app identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      product: {
        code: '3017620422003',
        product_name: 'Spread',
        nutriments: {
          proteins_100g: 6.3,
          carbohydrates_100g: 57.5,
          fat_100g: 30.9,
          'energy-kcal_100g': 539,
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await lookupOpenFoodFactsProduct('3017620422003', fetchImpl)

    expect(result?.name).toBe('Spread')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain('https://world.openfoodfacts.org/api/v3/product/3017620422003')
    expect(String(url)).toContain('fields=')
    expect(init.headers['User-Agent']).toContain('SociusFit/')
    expect(init.redirect).toBe('error')
  })

  it('returns null for a provider 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    await expect(lookupOpenFoodFactsProduct('3017620422003', fetchImpl)).resolves.toBeNull()
  })

  it('rejects oversized provider responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-length': '9999999' },
    }))
    await expect(lookupOpenFoodFactsProduct('3017620422003', fetchImpl)).rejects.toThrow('too large')
  })
})
