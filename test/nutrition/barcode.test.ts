import { describe, expect, it } from 'vitest'
import {
  parseBarcode,
  normalizeOpenFoodFactsProduct,
  scaleNutrition,
} from '@/app/lib/nutrition/barcode'
import { buildFoodCorrections } from '@/app/lib/nutrition/reviewed-food'

describe('barcode nutrition normalization', () => {
  it('normalizes UPC-A to the same lookup key as its EAN-13 representation', () => {
    expect(parseBarcode('034000-470693')).toEqual({
      value: '034000470693',
      lookupKey: '0034000470693',
    })
    expect(parseBarcode('0034000470693')?.lookupKey).toBe('0034000470693')
  })

  it('rejects non-digits, unsupported lengths, and bad GTIN check digits', () => {
    expect(parseBarcode('not-a-code')).toBeNull()
    expect(parseBarcode('12345')).toBeNull()
    expect(parseBarcode('034000470694')).toBeNull()
  })

  it('validates UPC-E codes using their expanded UPC-A checksum', () => {
    expect(parseBarcode('00554337')).toEqual({
      value: '00554337',
      lookupKey: '00554337',
    })
    expect(parseBarcode('0554337')).toEqual({
      value: '0554337',
      lookupKey: '00554337',
    })
    expect(parseBarcode('00554335')).toBeNull()
    expect(parseBarcode('0554336')).toBeNull()
  })

  it('prefers complete per-serving facts from an Open Food Facts product', () => {
    const draft = normalizeOpenFoodFactsProduct({
      product: {
        code: '0034000470693',
        product_name: 'Test cereal',
        brands: 'Test Brand',
        serving_size: '30 g',
        serving_quantity: '30',
        serving_quantity_unit: 'g',
        nutrition_data_per: '100g',
        nutriments: {
          proteins_serving: 4,
          carbohydrates_serving: 20,
          fat_serving: 2,
          'energy-kcal_serving': 120,
          proteins_100g: 13.3,
          carbohydrates_100g: 66.7,
          fat_100g: 6.7,
          'energy-kcal_100g': 400,
        },
      },
    }, '034000470693')

    expect(draft).toMatchObject({
      name: 'Test cereal',
      brand: 'Test Brand',
      barcode: '0034000470693',
      barcodeLookupKey: '0034000470693',
      servingAmount: 30,
      servingUnit: 'g',
      servingLabel: '30 g',
      nutritionBasis: 'per_serving',
      nutrition: { protein: 4, carbs: 20, fat: 2, calories: 120 },
      source: 'open_food_facts',
    })
  })

  it('falls back to the normalized 100 g facts when serving facts are incomplete', () => {
    const draft = normalizeOpenFoodFactsProduct({
      product: {
        code: '3017620422003',
        product_name: 'Test spread',
        nutriments: {
          proteins_100g: 6.3,
          carbohydrates_100g: 57.5,
          fat_100g: 30.9,
          'energy-kcal_100g': 539,
        },
      },
    }, '3017620422003')

    expect(draft).toMatchObject({
      servingAmount: 100,
      servingUnit: 'g',
      servingLabel: '100 g',
      nutritionBasis: 'per_100g',
      nutrition: { protein: 6.3, carbs: 57.5, fat: 30.9, calories: 539 },
    })
  })

  it('returns no draft when a product lacks required label facts', () => {
    expect(normalizeOpenFoodFactsProduct({
      product: { code: '3017620422003', product_name: 'No macros', nutriments: {} },
    }, '3017620422003')).toBeNull()
  })

  it('scales reviewed label facts in application code', () => {
    expect(scaleNutrition({ protein: 4, carbs: 20, fat: 2, calories: 120 }, 1.5)).toEqual({
      protein: 6,
      carbs: 30,
      fat: 3,
      calories: 180,
    })
  })

  it('retains the difference between source facts and user-reviewed corrections', () => {
    const source = normalizeOpenFoodFactsProduct({
      product: {
        code: '3017620422003',
        product_name: 'Test spread',
        serving_size: '20 g',
        serving_quantity: 20,
        serving_quantity_unit: 'g',
        nutriments: {
          proteins_serving: 1,
          carbohydrates_serving: 10,
          fat_serving: 6,
          'energy-kcal_serving': 108,
        },
      },
    }, '3017620422003')!

    expect(buildFoodCorrections(source, {
      ...source,
      servingLabel: '2 tbsp (22 g)',
      servingAmount: 22,
      nutrition: { ...source.nutrition, calories: 110 },
    })).toEqual({
      calories: { from: 108, to: 110 },
      servingLabel: { from: '20 g', to: '2 tbsp (22 g)' },
      servingAmount: { from: 20, to: 22 },
    })
  })
})
