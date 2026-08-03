import { describe, expect, it } from 'vitest'
import {
  MealPhotoAnalysisError,
  parseMealPhotoAnalysis,
} from '@/app/lib/nutrition/meal-photo-analysis'

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        food: 'Chicken breast',
        portion: '6 oz',
        protein: 42,
        carbs: 0,
        fat: 3,
        calories: 195,
      },
      {
        food: 'Brown rice',
        portion: '1 cup',
        protein: 5,
        carbs: 45,
        fat: 2,
        calories: 216,
      },
    ],
    total_protein: 499,
    total_carbs: 999,
    total_fat: 299,
    total_calories: 4999,
    confidence: 0.85,
    notes: 'Portions estimated from the image.',
    ...overrides,
  }
}

describe('parseMealPhotoAnalysis', () => {
  it('returns trimmed items and recomputes canonical totals from them', () => {
    const payload = validPayload({
      items: [
        {
          food: '  Chicken breast  ',
          portion: '  6 oz ',
          protein: 42,
          carbs: 0,
          fat: 3,
          calories: 195,
        },
        {
          food: 'Brown rice',
          portion: '1 cup',
          protein: 5,
          carbs: 45,
          fat: 2,
          calories: 216,
        },
      ],
    })

    expect(parseMealPhotoAnalysis(JSON.stringify(payload))).toEqual({
      items: [
        {
          food: 'Chicken breast',
          portion: '6 oz',
          protein: 42,
          carbs: 0,
          fat: 3,
          calories: 195,
        },
        {
          food: 'Brown rice',
          portion: '1 cup',
          protein: 5,
          carbs: 45,
          fat: 2,
          calories: 216,
        },
      ],
      total_protein: 47,
      total_carbs: 45,
      total_fat: 5,
      total_calories: 411,
      confidence: 0.85,
      notes: 'Portions estimated from the image.',
    })
  })

  it.each([
    ['unparseable text', 'not json'],
    ['an empty item list', JSON.stringify(validPayload({ items: [] }))],
    [
      'a non-finite item macro',
      JSON.stringify(validPayload()).replace('"protein":42', '"protein":1e400'),
    ],
    [
      'a negative item macro',
      JSON.stringify(validPayload({
        items: [{
          food: 'Chicken',
          portion: '6 oz',
          protein: -1,
          carbs: 0,
          fat: 3,
          calories: 195,
        }],
      })),
    ],
    [
      'an out-of-range item macro',
      JSON.stringify(validPayload({
        items: [{
          food: 'Chicken',
          portion: '6 oz',
          protein: 201,
          carbs: 0,
          fat: 3,
          calories: 195,
        }],
      })),
    ],
    ['a non-finite supplied total', JSON.stringify(validPayload()).replace('"total_calories":4999', '"total_calories":1e400')],
    ['an out-of-range supplied total', JSON.stringify(validPayload({ total_calories: 5001 }))],
    ['an out-of-range confidence', JSON.stringify(validPayload({ confidence: 1.01 }))],
  ])('rejects %s', (_label, text) => {
    expect(() => parseMealPhotoAnalysis(text)).toThrow(MealPhotoAnalysisError)
  })
})
