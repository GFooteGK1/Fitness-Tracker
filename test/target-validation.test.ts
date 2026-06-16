// Feature: food-tracking, Property 6: Target Validation and Storage
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { calculateTargetCalories, targetsToInsert, validateTargets } from '@/app/lib/target-management'

describe('Target Validation Properties', () => {
  it('Property 6: Macro targets should be validated as positive numbers', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -100, max: 500, noNaN: true }), // protein
        fc.float({ min: -100, max: 800, noNaN: true }), // carbs
        fc.float({ min: -100, max: 200, noNaN: true }), // fat
        (protein: number, carbs: number, fat: number) => {
          const inputTargets = {
            targetProtein: protein,
            targetCarbs: carbs,
            targetFat: fat
          }
          
          const validation = validateTargets(inputTargets)
          
          // All positive values should be valid
          if (protein > 0 && carbs > 0 && fat > 0) {
            expect(validation.isValid).toBe(true)
            expect(validation.errors).toHaveLength(0)
          }
          
          // Any non-positive value should be invalid
          if (protein <= 0 || carbs <= 0 || fat <= 0) {
            expect(validation.isValid).toBe(false)
            expect(validation.errors.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('calculates target calories from protein, carbs, and fat grams', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 300, noNaN: true }),
        fc.float({ min: 1, max: 800, noNaN: true }),
        fc.float({ min: 1, max: 200, noNaN: true }),
        (protein: number, carbs: number, fat: number) => {
          const expectedCalories = Math.round(((protein * 4) + (carbs * 4) + (fat * 9)) * 10) / 10

          expect(calculateTargetCalories(protein, carbs, fat)).toBe(expectedCalories)
          expect(targetsToInsert({
            userId: 'test-user',
            targetProtein: protein,
            targetCarbs: carbs,
            targetFat: fat,
            targetCalories: 1,
            tolerancePct: 5.0,
            updatedAt: new Date()
          }).target_calories).toBe(expectedCalories)
        }
      ),
      { numRuns: 100 }
    )
  })
})
