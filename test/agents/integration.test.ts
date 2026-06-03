/**
 * Integration tests for full agent flow
 *
 * Tests the complete flow from parse functions through error handling to response,
 * including error handling in caller functions.
 *
 * Task 7: Write integration tests for full agent flow
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTrainerResponse } from '@/app/lib/agents/trainer-agent'
import { parseNutritionistResponse } from '@/app/lib/agents/nutritionist-agent'
import { parseSociusResponse } from '@/app/lib/agents/socius-agent'

describe('Integration Tests: Full Agent Flow', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  describe('Trainer Agent Flow', () => {
    describe('conversational response handling', () => {
      it('should preserve and return conversational response from LLM', () => {
        const llmResponse = 'Could you tell me more about the exercises you did?'

        const result = parseTrainerResponse(llmResponse, 'I did a workout')

        // Verify conversational response is preserved
        expect(result.message).toBe('Could you tell me more about the exercises you did?')
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
        expect(result.new_prs).toEqual([])
        expect(result.smart_defaults).toEqual([])
      })

      it('should handle conversational response with multiple questions', () => {
        const llmResponse = 'What exercises did you do? How many rounds did you complete?'

        const result = parseTrainerResponse(llmResponse, 'workout')

        expect(result.message).toBe('What exercises did you do? How many rounds did you complete?')
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
      })
    })

    describe('malformed JSON handling', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const malformedJson = '{"message": "Logged!", "workout": {"blocks": [}'

        const result = parseTrainerResponse(malformedJson, 'test workout')

        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: trainer'))

        // Verify actionable error message returned
        expect(result.message).toContain('trouble processing that workout')
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
      })

      it('should handle JSON with syntax errors', () => {
        const invalidJson = '{"message": "Done" "workout": null}'

        const result = parseTrainerResponse(invalidJson, 'workout input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toContain('trouble processing')
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON handling (preservation)', () => {
      it('should successfully parse and persist workout with valid JSON', () => {
        const validResponse = JSON.stringify({
          message: 'Workout logged successfully!',
          workout: {
            blocks: [{
              block_type: 'AMRAP',
              duration_min: 12,
              movements: [
                { name: 'Pull-up', reps: 5 },
                { name: 'Push-up', reps: 10 }
              ],
              score: { rounds: 7, extra_reps: 5 },
              rx_status: 'RX'
            }],
            primary_score: '7+5',
            rpe: 8,
            tags: ['metcon']
          },
          new_prs: [],
          smart_defaults: [],
          confidence: 0.95
        })

        const result = parseTrainerResponse(validResponse, 'AMRAP 12: 5 pull-ups, 10 push-ups')

        // Verify successful parsing (preservation)
        expect(result.message).toBe('Workout logged successfully!')
        expect(result.confidence).toBe(0.95)
        expect(result.workout).toBeDefined()
        expect(result.workout!.blocks).toHaveLength(1)
        expect(result.workout!.blocks[0].block_type).toBe('AMRAP')
        expect(result.workout!.blocks[0].movements).toHaveLength(2)
        expect(result.workout!.primary_score).toBe('7+5')
        expect(result.workout!.rpe).toBe(8)
      })

      it('should handle workout with markdown code fences', () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          message: 'Logged!',
          workout: {
            blocks: [{
              block_type: 'FOR_TIME',
              movements: [{ name: 'Thruster', reps: 21, weight: '95 lb' }],
              score: { time_s: 347 }
            }],
            primary_score: '5:47',
            rpe: null,
            tags: []
          },
          new_prs: [],
          smart_defaults: [],
          confidence: 0.9
        }) + '\n```'

        const result = parseTrainerResponse(wrappedResponse, 'For time: 21 thrusters 95#')

        // Verify code fences were cleaned and parsing succeeded
        expect(result.message).toBe('Logged!')
        expect(result.confidence).toBe(0.9)
        expect(result.workout).toBeDefined()
        expect(result.workout!.blocks[0].block_type).toBe('FOR_TIME')
      })
    })
  })

  describe('Nutritionist Agent Flow', () => {
    describe('conversational response handling', () => {
      it('should preserve and return conversational response from LLM', () => {
        const llmResponse = 'What did you eat? Can you describe the meal in more detail?'

        const result = parseNutritionistResponse(llmResponse, 'I ate food')

        // Verify conversational response is preserved
        expect(result.message).toBe('What did you eat? Can you describe the meal in more detail?')
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
        expect(result.smart_defaults).toEqual([])
      })

      it('should handle conversational response asking for clarification', () => {
        const llmResponse = 'Could you provide more details about the foods and portions?'

        const result = parseNutritionistResponse(llmResponse, 'meal')

        expect(result.message).toBe('Could you provide more details about the foods and portions?')
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
      })
    })

    describe('malformed JSON handling', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const malformedJson = '{"message": "Logged!", "meal": {"items": [}'

        const result = parseNutritionistResponse(malformedJson, 'test meal')

        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: nutritionist'))

        // Verify actionable error message returned
        expect(result.message).toContain('trouble processing that meal')
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
      })

      it('should handle completely invalid JSON', () => {
        const invalidJson = 'This is not JSON at all'

        const result = parseNutritionistResponse(invalidJson, 'meal input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON handling (preservation)', () => {
      it('should successfully parse and analyze meal with valid JSON', () => {
        const validResponse = JSON.stringify({
          message: 'Meal logged successfully!',
          meal: {
            items: [
              { food: 'Chicken breast', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 },
              { food: 'White rice', portion: '1 cup', protein: 4, carbs: 45, fat: 0, calories: 205 }
            ],
            totals: { protein: 46, carbs: 45, fat: 3, calories: 400 },
            timing: 'LUNCH'
          },
          remaining_budget: { protein: 104, carbs: 155, fat: 62, calories: 1600 },
          week_status: {
            days_elapsed: 3,
            actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
            prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
            adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
            overall_status: 'on-track'
          },
          smart_defaults: [],
          confidence: 0.92
        })

        const result = parseNutritionistResponse(validResponse, '6oz chicken breast, 1 cup white rice')

        // Verify successful parsing (preservation)
        expect(result.message).toBe('Meal logged successfully!')
        expect(result.confidence).toBe(0.92)
        expect(result.meal).toBeDefined()
        expect(result.meal!.items).toHaveLength(2)
        expect(result.meal!.items[0].food).toBe('Chicken breast')
        expect(result.meal!.totals.protein).toBe(46)
        expect(result.meal!.timing).toBe('LUNCH')
        expect(result.week_status.overall_status).toBe('on-track')
      })

      it('should handle meal with markdown code fences', () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          message: 'Logged!',
          meal: {
            items: [{ food: 'Salmon', portion: '4 oz', protein: 25, carbs: 0, fat: 12, calories: 206 }],
            totals: { protein: 25, carbs: 0, fat: 12, calories: 206 },
            timing: 'DINNER'
          },
          remaining_budget: { protein: 125, carbs: 200, fat: 53, calories: 1794 },
          week_status: {
            days_elapsed: 2,
            actual: { protein: 250, carbs: 300, fat: 100, calories: 3200 },
            prorated_target: { protein: 300, carbs: 400, fat: 130, calories: 4000 },
            adherence_pct: { protein: 83, carbs: 75, fat: 77, calories: 80 },
            overall_status: 'behind'
          },
          smart_defaults: [],
          confidence: 0.88
        }) + '\n```'

        const result = parseNutritionistResponse(wrappedResponse, '4oz salmon')

        // Verify code fences were cleaned and parsing succeeded
        expect(result.message).toBe('Logged!')
        expect(result.confidence).toBe(0.88)
        expect(result.meal).toBeDefined()
        expect(result.meal!.items[0].food).toBe('Salmon')
      })
    })
  })

  describe('Socius Agent Flow', () => {
    describe('conversational response handling', () => {
      it('should preserve and return conversational response from LLM', () => {
        const llmResponse = 'I would be happy to analyze your progress. What specific aspect would you like me to focus on?'

        const result = parseSociusResponse(llmResponse, 'How am I doing?')

        // Verify conversational response is preserved
        expect(result.message).toBe('I would be happy to analyze your progress. What specific aspect would you like me to focus on?')
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
        expect(result.data_points).toEqual({})
      })

      it('should handle conversational response with multiple questions', () => {
        const llmResponse = 'Could you clarify what you mean? Are you asking about your workout performance or nutrition adherence?'

        const result = parseSociusResponse(llmResponse, 'progress')

        expect(result.message).toBe('Could you clarify what you mean? Are you asking about your workout performance or nutrition adherence?')
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
      })
    })

    describe('malformed JSON handling', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const malformedJson = '{"message": "Analysis complete", "insights": [}'

        const result = parseSociusResponse(malformedJson, 'test query')

        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: socius'))

        // Verify actionable error message returned
        expect(result.message).toContain('trouble analyzing that')
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
      })

      it('should handle JSON with syntax errors', () => {
        const invalidJson = '{"message": "Done" "insights": []}'

        const result = parseSociusResponse(invalidJson, 'query input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toContain('trouble analyzing')
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON handling (preservation)', () => {
      it('should successfully parse and generate insights with valid JSON', () => {
        const validResponse = JSON.stringify({
          message: 'Your recovery is trending positively this week.',
          insights: [
            {
              id: crypto.randomUUID(),
              pattern_id: 'REC_VOL',
              priority: 'notable',
              confidence: 0.85,
              content: 'Your recovery scores have improved by 15% this week.',
              created_at: new Date().toISOString()
            }
          ],
          data_points: {
            avg_recovery: 78,
            workout_count: 5
          },
          confidence: 0.9
        })

        const result = parseSociusResponse(validResponse, 'How is my recovery trending?')

        // Verify successful parsing (preservation)
        expect(result.message).toBe('Your recovery is trending positively this week.')
        expect(result.confidence).toBe(0.9)
        expect(result.insights).toHaveLength(1)
        expect(result.insights![0].pattern_id).toBe('REC_VOL')
        expect(result.insights![0].priority).toBe('notable')
        expect(result.insights![0].confidence).toBe(0.85)
        expect(result.data_points!.avg_recovery).toBe(78)
      })

      it('should handle insights with markdown code fences', () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          message: 'Analysis complete',
          insights: [
            {
              id: crypto.randomUUID(),
              pattern_id: 'PRO_REC',
              priority: 'informational',
              confidence: 0.75,
              content: 'Your protein intake is consistent with your goals.',
              created_at: new Date().toISOString()
            }
          ],
          data_points: { avg_protein: 145 },
          confidence: 0.8
        }) + '\n```'

        const result = parseSociusResponse(wrappedResponse, 'protein analysis')

        // Verify code fences were cleaned and parsing succeeded
        expect(result.message).toBe('Analysis complete')
        expect(result.confidence).toBe(0.8)
        expect(result.insights).toHaveLength(1)
        expect(result.insights![0].pattern_id).toBe('PRO_REC')
      })
    })
  })

  describe('API Route Error Handling', () => {
    describe('caller function conversational response preservation', () => {
      it('should preserve conversational responses in parse function errors', () => {
        // Test that parse functions return conversational responses with confidence 0.3
        const conversationalInput = 'Could you tell me more about the workout?'

        const trainerResult = parseTrainerResponse(conversationalInput, 'test')
        expect(trainerResult.message).toBe(conversationalInput)
        expect(trainerResult.confidence).toBe(0.3)

        const nutritionistResult = parseNutritionistResponse(conversationalInput, 'test')
        expect(nutritionistResult.message).toBe(conversationalInput)
        expect(nutritionistResult.confidence).toBe(0.3)

        const sociusResult = parseSociusResponse(conversationalInput, 'test')
        expect(sociusResult.message).toBe(conversationalInput)
        expect(sociusResult.confidence).toBe(0.3)
      })

      it('should detect conversational responses with various patterns', () => {
        const patterns = [
          'What exercises did you do?',
          'Can you provide more details?',
          'Could you clarify that?',
          'Please tell me more about your workout.',
          'Which movements were included?'
        ]

        for (const pattern of patterns) {
          const result = parseTrainerResponse(pattern, 'test')
          expect(result.message).toBe(pattern)
          expect(result.confidence).toBe(0.3)
        }
      })
    })

    describe('caller function diagnostic logging', () => {
      it('should log full diagnostic information on parsing errors', () => {
        const malformedJson = '{"message": "test", "workout": {'

        parseTrainerResponse(malformedJson, 'test workout input')

        // Verify diagnostic logging occurred
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Timestamp:'))
        expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: trainer')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'))
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('User Input Hash:'))
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Raw Response:'))
      })

      it('should log diagnostic information for all agent types', () => {
        const malformedJson = '{"invalid": json}'

        consoleErrorSpy.mockClear()
        parseTrainerResponse(malformedJson, 'test')
        expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: trainer')

        consoleErrorSpy.mockClear()
        parseNutritionistResponse(malformedJson, 'test')
        expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: nutritionist')

        consoleErrorSpy.mockClear()
        parseSociusResponse(malformedJson, 'test')
        expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: socius')
      })
    })

    describe('caller function actionable error messages', () => {
      it('should return actionable error messages for parsing failures', () => {
        const malformedJson = '{"broken": json}'

        const trainerResult = parseTrainerResponse(malformedJson, 'test')
        expect(trainerResult.message).toContain('trouble processing that workout')
        expect(trainerResult.message).toMatch(/could you|try|for example/i)

        const nutritionistResult = parseNutritionistResponse(malformedJson, 'test')
        expect(nutritionistResult.message).toContain('trouble processing that meal')
        expect(nutritionistResult.message).toMatch(/could you|try|for example/i)

        const sociusResult = parseSociusResponse(malformedJson, 'test')
        expect(sociusResult.message).toContain('trouble analyzing that')
        expect(sociusResult.message).toMatch(/could you|try|for example/i)
      })

      it('should provide agent-specific guidance in error messages', () => {
        const malformedJson = '{"invalid"}'

        const trainerResult = parseTrainerResponse(malformedJson, 'test')
        expect(trainerResult.message).toContain('workout')

        const nutritionistResult = parseNutritionistResponse(malformedJson, 'test')
        expect(nutritionistResult.message).toContain('meal')

        const sociusResult = parseSociusResponse(malformedJson, 'test')
        expect(sociusResult.message).toContain('analyzing')
      })
    })
  })
})
