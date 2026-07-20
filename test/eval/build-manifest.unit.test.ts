/**
 * Unit tests for the Nutrition5k CSV row parser (pure).
 */
import { describe, it, expect } from 'vitest'
import { parseNutrition5kRow } from '../../scripts/eval/build-manifest'

describe('parseNutrition5kRow', () => {
  it('parses dish totals into truth (carb->carbs, mass->mass_g)', () => {
    // dish_id, calories, mass, fat, carb, protein, <ingredients...>
    const line = 'dish_1556572657,431.5,340.2,12.3,41.0,32.5,ingr_0001,chicken,120,...'
    expect(parseNutrition5kRow(line)).toEqual({
      dishId: 'dish_1556572657',
      truth: { protein: 32.5, carbs: 41.0, fat: 12.3, calories: 431.5, mass_g: 340.2 },
    })
  })

  it('skips a header row', () => {
    expect(parseNutrition5kRow('dish_id,total_calories,total_mass,total_fat,total_carb,total_protein')).toBeNull()
  })

  it('skips blank / too-short / malformed rows', () => {
    expect(parseNutrition5kRow('')).toBeNull()
    expect(parseNutrition5kRow('dish_x,1,2,3')).toBeNull()
    expect(parseNutrition5kRow('dish_x,notanumber,2,3,4,5')).toBeNull()
  })
})
