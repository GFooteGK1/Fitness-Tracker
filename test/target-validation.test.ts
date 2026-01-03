// Feature: food-tracking, Property 6: Target Validation and Storage
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

interface DailyTargets {
  targetProtein: number
  targetCarbs: number
  targetFat: number
  targetCalories: number
  tolerancePct: number
}

// Mock target validation function
function validateTargets(targets: Partial<DailyTargets>): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (targets.targetProtein !== undefined && targets.targetProtein <= 0) {
    errors.push('Protein target must be positive')
  }
  if (targets.targetCarbs !== undefined && targets.targetCarbs <= 0) {
    errors.push('Carbs target must be positive')
  }
  if (targets.targetFat !== undefined && targets.targetFat <= 0) {
    errors.push('Fat target must be positive')
  }
  if (targets.targetCalories !== undefined && targets.targetCalories <= 0) {
    errors.push('Calories target must be positive')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

function createTargetsWithDefaults(targets: Partial<DailyTargets>): DailyTargets {
  return {
    targetProtein: targets.targetProtein || 150,
    targetCarbs: targets.targetCarbs || 200,
    targetFat: targets.targetFat || 70,
    targetCalories: targets.targetCalories || 2000,
    tolerancePct: targets.tolerancePct || 5.0 // Default 5% tolerance
  }
}

describe('Target Validation Properties', () => {
  it('Property 6: All target values should be validated as positive numbers with default 5% tolerance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -100, max: 500, noNaN: true }), // protein
        fc.float({ min: -100, max: 800, noNaN: true }), // carbs
        fc.float({ min: -100, max: 200, noNaN: true }), // fat
        fc.float({ min: -100, max: 5000, noNaN: true }), // calories
        (protein: number, carbs: number, fat: number, calories: number) => {
          const inputTargets = {
            targetProtein: protein,
            targetCarbs: carbs,
            targetFat: fat,
            targetCalories: calories
          }
          
          const validation = validateTargets(inputTargets)
          
          // All positive values should be valid
          if (protein > 0 && carbs > 0 && fat > 0 && calories > 0) {
            expect(validation.isValid).toBe(true)
            expect(validation.errors).toHaveLength(0)
            
            // Should apply default tolerance
            const targets = createTargetsWithDefaults(inputTargets)
            expect(targets.tolerancePct).toBe(5.0)
          }
          
          // Any non-positive value should be invalid
          if (protein <= 0 || carbs <= 0 || fat <= 0 || calories <= 0) {
            expect(validation.isValid).toBe(false)
            expect(validation.errors.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})