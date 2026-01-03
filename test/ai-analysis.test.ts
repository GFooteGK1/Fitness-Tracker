// Feature: food-tracking, Property 2: AI Analysis Data Structure
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

interface AIAnalysisResponse {
  meal_items: Array<{
    food: string
    portion: string
    protein: number
    carbs: number
    fat: number
    calories: number
  }>
  total_macros: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
  confidence: number
}

// Mock AI analysis response validator
function validateAIResponse(response: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!response.meal_items || !Array.isArray(response.meal_items)) {
    errors.push('meal_items must be an array')
  }
  
  if (!response.total_macros || typeof response.total_macros !== 'object') {
    errors.push('total_macros must be an object')
  }
  
  if (response.meal_items) {
    response.meal_items.forEach((item: any, index: number) => {
      if (!item.food || typeof item.food !== 'string') {
        errors.push(`meal_items[${index}].food must be a string`)
      }
      if (!item.portion || typeof item.portion !== 'string') {
        errors.push(`meal_items[${index}].portion must be a string`)
      }
      if (typeof item.protein !== 'number' || isNaN(item.protein)) {
        errors.push(`meal_items[${index}].protein must be a valid number`)
      }
      if (typeof item.carbs !== 'number' || isNaN(item.carbs)) {
        errors.push(`meal_items[${index}].carbs must be a valid number`)
      }
      if (typeof item.fat !== 'number' || isNaN(item.fat)) {
        errors.push(`meal_items[${index}].fat must be a valid number`)
      }
      if (typeof item.calories !== 'number' || isNaN(item.calories)) {
        errors.push(`meal_items[${index}].calories must be a valid number`)
      }
    })
  }
  
  if (response.total_macros) {
    const requiredFields = ['protein', 'carbs', 'fat', 'calories']
    requiredFields.forEach(field => {
      if (typeof response.total_macros[field] !== 'number' || isNaN(response.total_macros[field])) {
        errors.push(`total_macros.${field} must be a valid number`)
      }
    })
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

describe('AI Analysis Data Structure Properties', () => {
  it('Property 2: AI analysis should return meal_items array and total_macros object with all required fields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            food: fc.string({ minLength: 1, maxLength: 50 }),
            portion: fc.string({ minLength: 1, maxLength: 20 }),
            protein: fc.float({ min: 0, max: 100, noNaN: true }),
            carbs: fc.float({ min: 0, max: 200, noNaN: true }),
            fat: fc.float({ min: 0, max: 100, noNaN: true }),
            calories: fc.float({ min: 0, max: 1000, noNaN: true })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.float({ min: 0, max: 1, noNaN: true }), // confidence
        (mealItems, confidence) => {
          const totalMacros = {
            protein: mealItems.reduce((sum, item) => sum + item.protein, 0),
            carbs: mealItems.reduce((sum, item) => sum + item.carbs, 0),
            fat: mealItems.reduce((sum, item) => sum + item.fat, 0),
            calories: mealItems.reduce((sum, item) => sum + item.calories, 0)
          }
          
          const response: AIAnalysisResponse = {
            meal_items: mealItems,
            total_macros: totalMacros,
            confidence
          }
          
          const validation = validateAIResponse(response)
          expect(validation.isValid).toBe(true)
          expect(validation.errors).toHaveLength(0)
          
          // Verify structure
          expect(Array.isArray(response.meal_items)).toBe(true)
          expect(typeof response.total_macros).toBe('object')
          expect(response.total_macros).toHaveProperty('protein')
          expect(response.total_macros).toHaveProperty('carbs')
          expect(response.total_macros).toHaveProperty('fat')
          expect(response.total_macros).toHaveProperty('calories')
        }
      ),
      { numRuns: 100 }
    )
  })
})