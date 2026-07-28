import { describe, expect, it } from 'vitest'
import {
  buildMealSignature,
  rankCommonMeals,
  type MealHistoryRow,
} from '@/app/lib/nutrition/fast-log'

const eggs = {
  food: 'Eggs',
  portion: '2 large',
  protein: 12,
  carbs: 1,
  fat: 10,
  calories: 140,
}

function meal(overrides: Partial<MealHistoryRow> = {}): MealHistoryRow {
  return {
    id: 'meal-1',
    meal_timestamp: '2026-07-28T12:00:00.000Z',
    items: [eggs],
    total_protein: 12,
    total_carbs: 1,
    total_fat: 10,
    total_calories: 140,
    needs_review: false,
    manual_override: true,
    reviewed_at: '2026-07-28T12:05:00.000Z',
    ...overrides,
  }
}

describe('meal reuse ranking', () => {
  it('builds the same signature regardless of item order and presentation casing', () => {
    const coffee = {
      food: 'Coffee',
      portion: '12 oz',
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 5,
    }

    expect(buildMealSignature([eggs, coffee])).toBe(buildMealSignature([
      { ...coffee, food: '  COFFEE  ' },
      { ...eggs, food: 'eggs' },
    ]))
  })

  it('ranks exact repeated meals by frequency, then recency, with a stable tie break', () => {
    const rows = [
      meal({ id: 'eggs-1', meal_timestamp: '2026-07-20T12:00:00.000Z' }),
      meal({ id: 'eggs-2', meal_timestamp: '2026-07-27T12:00:00.000Z' }),
      meal({
        id: 'oats-1',
        meal_timestamp: '2026-07-28T12:00:00.000Z',
        items: [{ ...eggs, food: 'Oats' }],
      }),
    ]

    const ranked = rankCommonMeals(rows, 4)

    expect(ranked).toHaveLength(2)
    expect(ranked[0]).toMatchObject({ sourceMealId: 'eggs-2', timesLogged: 2 })
    expect(ranked[1]).toMatchObject({ sourceMealId: 'oats-1', timesLogged: 1 })
  })

  it('drops malformed rows instead of offering an unsafe quick-log copy', () => {
    const ranked = rankCommonMeals([
      meal({ id: 'valid' }),
      meal({ id: 'empty', items: [] }),
      meal({ id: 'negative', total_calories: -1 }),
      meal({ id: 'bad-date', meal_timestamp: 'not-a-date' }),
      meal({ id: 'unreviewed', needs_review: true }),
    ])

    expect(ranked.map(entry => entry.sourceMealId)).toEqual(['valid'])
  })
})
