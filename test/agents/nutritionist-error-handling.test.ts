import { describe, it, expect } from 'vitest'
import { parseNutritionistResponse } from '../../app/lib/agents/nutritionist-agent'

/**
 * Test suite for Nutritionist agent enhanced error handling
 *
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4
 */
describe('Nutritionist Agent - Enhanced Error Handling', () => {
  describe('Valid JSON responses', () => {
    it('should parse valid JSON response', () => {
      const validResponse = JSON.stringify({
        message: 'Meal logged successfully',
        meal: {
          items: [
            { food: 'Chicken', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 }
          ],
          totals: { protein: 42, carbs: 0, fat: 3, calories: 195 },
          timing: 'DINNER'
        },
        remaining_budget: { protein: 108, carbs: 200, fat: 47, calories: 1805 },
        week_status: {
          days_elapsed: 3,
          actual: { protein: 450, carbs: 600, fat: 150, calories: 6000 },
          prorated_target: { protein: 450, carbs: 600, fat: 150, calories: 6000 },
          adherence_pct: { protein: 1.0, carbs: 1.0, fat: 1.0, calories: 1.0 },
          overall_status: 'on-track'
        },
        confidence: 0.9
      })

      const result = parseNutritionistResponse(validResponse, 'chicken breast for dinner')

      expect(result.message).toBe('Meal logged successfully')
      expect(result.meal).toBeDefined()
      expect(result.meal?.items).toHaveLength(1)
      expect(result.confidence).toBe(0.9)
    })

    it('should handle JSON with markdown code fences', () => {
      const responseWithFences = '```json\n' + JSON.stringify({
        message: 'Meal received',
        remaining_budget: { protein: 100, carbs: 200, fat: 50, calories: 1800 },
        week_status: {
          days_elapsed: 1,
          actual: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          prorated_target: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          adherence_pct: { protein: 1.0, carbs: 1.0, fat: 1.0, calories: 1.0 },
          overall_status: 'on-track'
        },
        confidence: 0.8
      }) + '\n```'

      const result = parseNutritionistResponse(responseWithFences, 'salmon and rice')

      expect(result.message).toBe('Meal received')
      expect(result.confidence).toBe(0.8)
    })
  })

  describe('Conversational responses', () => {
    it('should detect and extract conversational response', () => {
      const conversationalResponse = "I need more information about your meal. What did you eat?"

      const result = parseNutritionistResponse(conversationalResponse, 'I ate something')

      expect(result.message).toContain('more information')
      expect(result.confidence).toBe(0.3)
      expect(result.meal).toBeUndefined()
    })

    it('should handle question-based conversational response', () => {
      const questionResponse = "Could you tell me what portion size you had?"

      const result = parseNutritionistResponse(questionResponse, 'chicken')

      expect(result.message).toContain('portion size')
      expect(result.confidence).toBe(0.3)
    })
  })

  describe('Malformed JSON responses', () => {
    it('should handle incomplete JSON', () => {
      const incompleteJson = '{"message": "Meal logged", "meal": {'

      const result = parseNutritionistResponse(incompleteJson, 'steak and potatoes')

      expect(result.message).toBeDefined()
      expect(result.confidence).toBe(0.3)
      expect(result.meal).toBeUndefined()
    })

    it('should handle JSON with syntax errors', () => {
      const malformedJson = '{"message": "Meal logged" "meal": null}'

      const result = parseNutritionistResponse(malformedJson, 'pasta')

      expect(result.message).toBeDefined()
      expect(result.confidence).toBe(0.3)
    })

    it('should handle empty response', () => {
      const emptyResponse = ''

      const result = parseNutritionistResponse(emptyResponse, 'lunch')

      expect(result.message).toBeDefined()
      expect(result.confidence).toBe(0.3)
    })
  })

  describe('Macro validation preservation', () => {
    it('should preserve macro validation logic', () => {
      const validMealResponse = JSON.stringify({
        message: 'Meal logged',
        meal: {
          items: [
            { food: 'Chicken', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 }
          ],
          totals: { protein: 42, carbs: 0, fat: 3, calories: 195 },
          timing: 'DINNER'
        },
        remaining_budget: { protein: 108, carbs: 200, fat: 47, calories: 1805 },
        week_status: {
          days_elapsed: 1,
          actual: { protein: 42, carbs: 0, fat: 3, calories: 195 },
          prorated_target: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          adherence_pct: { protein: 0.84, carbs: 0.0, fat: 0.12, calories: 0.22 },
          overall_status: 'behind'
        },
        confidence: 0.9
      })

      const result = parseNutritionistResponse(validMealResponse, 'chicken breast')

      expect(result.meal).toBeDefined()
      expect(result.meal?.totals.protein).toBe(42)
      expect(result.meal?.totals.calories).toBe(195)
      expect(result.remaining_budget.protein).toBe(108)
    })
  })

  describe('Type safety', () => {
    it('should normalize meal timing to valid values', () => {
      const responseWithInvalidTiming = JSON.stringify({
        message: 'Meal logged',
        meal: {
          items: [{ food: 'Eggs', portion: '2 eggs', protein: 12, carbs: 1, fat: 10, calories: 140 }],
          totals: { protein: 12, carbs: 1, fat: 10, calories: 140 },
          timing: 'INVALID_TIMING'
        },
        remaining_budget: { protein: 138, carbs: 199, fat: 40, calories: 1860 },
        week_status: {
          days_elapsed: 1,
          actual: { protein: 12, carbs: 1, fat: 10, calories: 140 },
          prorated_target: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          adherence_pct: { protein: 0.24, carbs: 0.01, fat: 0.4, calories: 0.16 },
          overall_status: 'behind'
        },
        confidence: 0.7
      })

      const result = parseNutritionistResponse(responseWithInvalidTiming, 'eggs for breakfast')

      expect(result.meal).toBeDefined()
      expect(result.meal?.timing).toBe('SNACK') // Falls back to SNACK
    })

    it('should clamp confidence values to 0-1 range', () => {
      const responseWithInvalidConfidence = JSON.stringify({
        message: 'Meal logged',
        remaining_budget: { protein: 100, carbs: 200, fat: 50, calories: 1800 },
        week_status: {
          days_elapsed: 1,
          actual: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          prorated_target: { protein: 50, carbs: 100, fat: 25, calories: 900 },
          adherence_pct: { protein: 1.0, carbs: 1.0, fat: 1.0, calories: 1.0 },
          overall_status: 'on-track'
        },
        confidence: 1.5
      })

      const result = parseNutritionistResponse(responseWithInvalidConfidence, 'meal')

      expect(result.confidence).toBe(1.0) // Clamped to max 1.0
    })
  })
})
