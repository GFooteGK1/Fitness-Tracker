// Feature: food-tracking, Property 11: Manual Override Tracking
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

interface MealEntry {
  id: string
  originalAIData: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
  currentData: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
  manualOverride: boolean
  reviewedAt?: Date
}

// Mock manual override functions
function applyManualOverride(
  meal: MealEntry, 
  overrides: Partial<{ protein: number; carbs: number; fat: number; calories: number }>
): MealEntry {
  const updatedMeal = { ...meal }
  
  // Preserve original AI data
  updatedMeal.originalAIData = { ...meal.originalAIData }
  
  // Apply overrides to current data
  updatedMeal.currentData = {
    ...meal.currentData,
    ...overrides
  }
  
  // Set manual override flag and timestamp
  updatedMeal.manualOverride = true
  updatedMeal.reviewedAt = new Date()
  
  return updatedMeal
}

describe('Manual Override Properties', () => {
  it('Property 11: Manual corrections should preserve original AI data, set override flag, and timestamp review', () => {
    fc.assert(
      fc.property(
        fc.record({
          protein: fc.float({ min: 0, max: 200, noNaN: true }),
          carbs: fc.float({ min: 0, max: 300, noNaN: true }),
          fat: fc.float({ min: 0, max: 100, noNaN: true }),
          calories: fc.float({ min: 0, max: 2000, noNaN: true })
        }), // original AI data
        fc.record({
          protein: fc.option(fc.float({ min: 0, max: 200, noNaN: true })),
          carbs: fc.option(fc.float({ min: 0, max: 300, noNaN: true })),
          fat: fc.option(fc.float({ min: 0, max: 100, noNaN: true })),
          calories: fc.option(fc.float({ min: 0, max: 2000, noNaN: true }))
        }), // override values
        (originalData, overrides) => {
          const originalMeal: MealEntry = {
            id: 'test-meal-1',
            originalAIData: originalData,
            currentData: originalData,
            manualOverride: false
          }
          
          // Filter out null values from overrides
          const validOverrides = Object.fromEntries(
            Object.entries(overrides).filter(([_, value]) => value !== null)
          ) as Partial<{ protein: number; carbs: number; fat: number; calories: number }>
          
          const updatedMeal = applyManualOverride(originalMeal, validOverrides)
          
          // Original AI data should be preserved
          expect(updatedMeal.originalAIData).toEqual(originalData)
          
          // Manual override flag should be set
          expect(updatedMeal.manualOverride).toBe(true)
          
          // Review timestamp should be set
          expect(updatedMeal.reviewedAt).toBeInstanceOf(Date)
          expect(updatedMeal.reviewedAt!.getTime()).toBeLessThanOrEqual(Date.now())
          
          // Current data should reflect overrides
          Object.entries(validOverrides).forEach(([key, value]) => {
            expect(updatedMeal.currentData[key as keyof typeof updatedMeal.currentData]).toBe(value)
          })
          
          // Non-overridden values should remain from original
          Object.keys(originalData).forEach(key => {
            if (!(key in validOverrides)) {
              expect(updatedMeal.currentData[key as keyof typeof updatedMeal.currentData])
                .toBe(originalData[key as keyof typeof originalData])
            }
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})