/**
 * Unit tests for agent parse functions
 *
 * Tests parseTrainerResponse, parseNutritionistResponse, and parseSociusResponse
 * with various input scenarios including conversational responses, malformed JSON,
 * valid JSON, markdown code fences, and empty responses.
 *
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTrainerResponse } from '@/app/lib/agents/trainer-agent'
import { parseNutritionistResponse } from '@/app/lib/agents/nutritionist-agent'
import { parseSociusResponse } from '@/app/lib/agents/socius-agent'

describe('Parse Functions', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  describe('parseTrainerResponse', () => {
    describe('conversational responses', () => {
      it('should preserve and return conversational response with question', () => {
        const input = 'Could you tell me more about the workout you did?'
        const result = parseTrainerResponse(input, 'test input')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
        expect(result.new_prs).toEqual([])
        expect(result.smart_defaults).toEqual([])
      })

      it('should preserve conversational response with clarifying phrase', () => {
        const input = 'Can you provide more details about the exercises you performed?'
        const result = parseTrainerResponse(input, 'workout')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
      })

      it('should handle conversational response with multiple sentences', () => {
        const input = 'I need more information to log this workout. What exercises did you do and how many reps?'
        const result = parseTrainerResponse(input, 'did workout')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('malformed JSON', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const input = '{"message": "Logged!", "workout": {"blocks": [}' // Missing closing brackets
        const result = parseTrainerResponse(input, 'test workout')

        // Error should be logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: trainer'))

        // Should return actionable error message
        expect(result.message).toContain('trouble processing that workout')
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
      })

      it('should handle JSON with trailing comma', () => {
        const input = '{"message": "Done", "workout": {"blocks": []},}'
        const result = parseTrainerResponse(input, 'workout input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toContain('trouble processing')
        expect(result.confidence).toBe(0.3)
      })

      it('should handle completely invalid JSON', () => {
        const input = 'This is not JSON at all'
        const result = parseTrainerResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON', () => {
      it('should successfully parse valid JSON response', () => {
        const input = JSON.stringify({
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

        const result = parseTrainerResponse(input, 'workout')

        expect(result.message).toBe('Workout logged successfully!')
        expect(result.confidence).toBe(0.95)
        expect(result.workout).toBeDefined()
        expect(result.workout!.blocks).toHaveLength(1)
        expect(result.workout!.blocks[0].block_type).toBe('AMRAP')
        expect(result.workout!.blocks[0].movements).toHaveLength(2)
        expect(result.workout!.primary_score).toBe('7+5')
        expect(result.workout!.rpe).toBe(8)
      })

      it('should normalize workout structure correctly', () => {
        const input = JSON.stringify({
          message: 'Done',
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
          confidence: 0.9
        })

        const result = parseTrainerResponse(input, 'test')

        expect(result.workout!.blocks[0].block_type).toBe('FOR_TIME')
        expect(result.workout!.blocks[0].movements[0].weight).toBe('95 lb')
        expect(result.workout!.blocks[0].score?.time_s).toBe(347)
        expect(result.workout!.rpe).toBeNull()
      })
    })

    describe('markdown code fences', () => {
      it('should clean and parse JSON wrapped in ```json code fence', () => {
        const input = '```json\n{"message": "Logged!", "workout": {"blocks": []}, "confidence": 0.8}\n```'
        const result = parseTrainerResponse(input, 'test')

        expect(result.message).toBe('Logged!')
        expect(result.confidence).toBe(0.8)
        expect(result.workout).toBeDefined()
      })

      it('should clean and parse JSON wrapped in ``` code fence without language', () => {
        const input = '```\n{"message": "Done", "confidence": 0.75}\n```'
        const result = parseTrainerResponse(input, 'test')

        expect(result.message).toBe('Done')
        expect(result.confidence).toBe(0.75)
      })

      it('should handle code fences with extra whitespace', () => {
        const input = '  ```json  \n  {"message": "Success", "confidence": 0.9}  \n  ```  '
        const result = parseTrainerResponse(input, 'test')

        expect(result.message).toBe('Success')
        expect(result.confidence).toBe(0.9)
      })
    })

    describe('empty response', () => {
      it('should handle empty string', () => {
        const input = ''
        const result = parseTrainerResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
        expect(result.workout).toBeUndefined()
      })

      it('should handle whitespace-only string', () => {
        const input = '   \n  \t  '
        const result = parseTrainerResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.confidence).toBe(0.3)
      })
    })
  })

  describe('parseNutritionistResponse', () => {
    describe('conversational responses', () => {
      it('should preserve and return conversational response with question', () => {
        const input = 'What did you eat today?'
        const result = parseNutritionistResponse(input, 'test input')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
        expect(result.smart_defaults).toEqual([])
      })

      it('should preserve conversational response asking for clarification', () => {
        const input = 'Could you describe your meal in more detail? What foods and portions?'
        const result = parseNutritionistResponse(input, 'ate food')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
      })

      it('should handle conversational response with multiple questions', () => {
        const input = 'I need more information. What did you eat? How much of each item?'
        const result = parseNutritionistResponse(input, 'meal')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('malformed JSON', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const input = '{"message": "Logged!", "meal": {"items": [}' // Missing closing brackets
        const result = parseNutritionistResponse(input, 'test meal')

        // Error should be logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: nutritionist'))

        // Should return actionable error message
        expect(result.message).toContain('trouble processing that meal')
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
      })

      it('should handle JSON with syntax errors', () => {
        const input = '{"message": "Done" "meal": null}'
        const result = parseNutritionistResponse(input, 'meal input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toContain('trouble processing')
        expect(result.confidence).toBe(0.3)
      })

      it('should handle invalid JSON structure', () => {
        const input = 'Not valid JSON'
        const result = parseNutritionistResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON', () => {
      it('should successfully parse valid JSON response', () => {
        const input = JSON.stringify({
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

        const result = parseNutritionistResponse(input, 'meal')

        expect(result.message).toBe('Meal logged successfully!')
        expect(result.confidence).toBe(0.92)
        expect(result.meal).toBeDefined()
        expect(result.meal!.items).toHaveLength(2)
        expect(result.meal!.items[0].food).toBe('Chicken breast')
        expect(result.meal!.totals.protein).toBe(46)
        expect(result.meal!.timing).toBe('LUNCH')
        expect(result.week_status.overall_status).toBe('on-track')
      })

      it('should normalize meal structure correctly', () => {
        const input = JSON.stringify({
          message: 'Done',
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
          confidence: 0.88
        })

        const result = parseNutritionistResponse(input, 'test')

        expect(result.meal!.items[0].food).toBe('Salmon')
        expect(result.meal!.totals.calories).toBe(206)
        expect(result.week_status.overall_status).toBe('behind')
      })
    })

    describe('markdown code fences', () => {
      it('should clean and parse JSON wrapped in ```json code fence', () => {
        const input = '```json\n{"message": "Logged!", "meal": {"items": [], "totals": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "timing": "SNACK"}, "remaining_budget": {"protein": 150, "carbs": 200, "fat": 65, "calories": 2000}, "week_status": {"days_elapsed": 0, "actual": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "prorated_target": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "adherence_pct": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "overall_status": "on-track"}, "confidence": 0.8}\n```'
        const result = parseNutritionistResponse(input, 'test')

        expect(result.message).toBe('Logged!')
        expect(result.confidence).toBe(0.8)
        expect(result.meal).toBeDefined()
      })

      it('should clean and parse JSON wrapped in ``` code fence without language', () => {
        const input = '```\n{"message": "Done", "remaining_budget": {"protein": 100, "carbs": 150, "fat": 50, "calories": 1400}, "week_status": {"days_elapsed": 0, "actual": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "prorated_target": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "adherence_pct": {"protein": 0, "carbs": 0, "fat": 0, "calories": 0}, "overall_status": "on-track"}, "confidence": 0.75}\n```'
        const result = parseNutritionistResponse(input, 'test')

        expect(result.message).toBe('Done')
        expect(result.confidence).toBe(0.75)
      })
    })

    describe('empty response', () => {
      it('should handle empty string', () => {
        const input = ''
        const result = parseNutritionistResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
        expect(result.meal).toBeUndefined()
      })

      it('should handle whitespace-only string', () => {
        const input = '   \n  \t  '
        const result = parseNutritionistResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.confidence).toBe(0.3)
      })
    })
  })

  describe('parseSociusResponse', () => {
    describe('conversational responses', () => {
      it('should preserve and return conversational response with question', () => {
        const input = 'How is your recovery trending this week?'
        const result = parseSociusResponse(input, 'test input')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
        expect(result.data_points).toEqual({})
      })

      it('should preserve conversational response asking for clarification', () => {
        const input = 'I would be happy to analyze your progress. What specific aspect would you like me to focus on?'
        const result = parseSociusResponse(input, 'how am i doing')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
      })

      it('should handle conversational response with multiple sentences', () => {
        const input = 'Could you clarify what you mean? Are you asking about your workout performance or nutrition adherence?'
        const result = parseSociusResponse(input, 'progress')

        expect(result.message).toBe(input)
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('malformed JSON', () => {
      it('should log error and return actionable message for malformed JSON', () => {
        const input = '{"message": "Analysis complete", "insights": [}' // Missing closing brackets
        const result = parseSociusResponse(input, 'test query')

        // Error should be logged
        expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Agent: socius'))

        // Should return actionable error message
        expect(result.message).toContain('trouble analyzing that')
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
      })

      it('should handle JSON with syntax errors', () => {
        const input = '{"message": "Done" "insights": []}'
        const result = parseSociusResponse(input, 'query input')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toContain('trouble analyzing')
        expect(result.confidence).toBe(0.3)
      })

      it('should handle invalid JSON structure', () => {
        const input = 'This is not JSON'
        const result = parseSociusResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
      })
    })

    describe('valid JSON', () => {
      it('should successfully parse valid JSON response', () => {
        const input = JSON.stringify({
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

        const result = parseSociusResponse(input, 'query')

        expect(result.message).toBe('Your recovery is trending positively this week.')
        expect(result.confidence).toBe(0.9)
        expect(result.insights ?? []).toHaveLength(1)
        expect(result.insights?.[0].pattern_id).toBe('REC_VOL')
        expect(result.insights?.[0].priority).toBe('notable')
        expect(result.insights?.[0].confidence).toBe(0.85)
        expect(result.data_points?.avg_recovery).toBe(78)
      })

      it('should filter out insights with empty content', () => {
        const input = JSON.stringify({
          message: 'Analysis complete',
          insights: [
            {
              id: crypto.randomUUID(),
              pattern_id: 'PRO_REC',
              priority: 'informational',
              confidence: 0.75,
              content: 'Valid insight content',
              created_at: new Date().toISOString()
            },
            {
              id: crypto.randomUUID(),
              pattern_id: 'CAL_DEF',
              priority: 'urgent',
              confidence: 0.9,
              content: '   ',  // Whitespace only
              created_at: new Date().toISOString()
            }
          ],
          data_points: {},
          confidence: 0.8
        })

        const result = parseSociusResponse(input, 'test')

        expect(result.insights ?? []).toHaveLength(1)
        expect(result.insights?.[0].pattern_id).toBe('PRO_REC')
      })

      it('should normalize insight structure correctly', () => {
        const input = JSON.stringify({
          message: 'Here are your insights',
          insights: [
            {
              pattern_id: 'OVER_TRN',
              priority: 'urgent',
              confidence: 0.95,
              content: 'You may be overtraining based on recent patterns.'
            }
          ],
          data_points: { workout_count: 7 },
          confidence: 0.88
        })

        const result = parseSociusResponse(input, 'test')

        expect(result.insights?.[0].id).toBeDefined()
        expect(result.insights?.[0].created_at).toBeDefined()
        expect(result.insights?.[0].content).toBe('You may be overtraining based on recent patterns.')
      })
    })

    describe('markdown code fences', () => {
      it('should clean and parse JSON wrapped in ```json code fence', () => {
        const input = '```json\n{"message": "Analysis complete", "insights": [], "data_points": {}, "confidence": 0.8}\n```'
        const result = parseSociusResponse(input, 'test')

        expect(result.message).toBe('Analysis complete')
        expect(result.confidence).toBe(0.8)
        expect(result.insights).toEqual([])
      })

      it('should clean and parse JSON wrapped in ``` code fence without language', () => {
        const input = '```\n{"message": "Done", "insights": [], "data_points": {}, "confidence": 0.75}\n```'
        const result = parseSociusResponse(input, 'test')

        expect(result.message).toBe('Done')
        expect(result.confidence).toBe(0.75)
      })

      it('should handle code fences with extra whitespace', () => {
        const input = '  ```json  \n  {"message": "Success", "insights": [], "data_points": {}, "confidence": 0.9}  \n  ```  '
        const result = parseSociusResponse(input, 'test')

        expect(result.message).toBe('Success')
        expect(result.confidence).toBe(0.9)
      })
    })

    describe('empty response', () => {
      it('should handle empty string', () => {
        const input = ''
        const result = parseSociusResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.message).toBeDefined()
        expect(result.confidence).toBe(0.3)
        expect(result.insights).toEqual([])
      })

      it('should handle whitespace-only string', () => {
        const input = '   \n  \t  '
        const result = parseSociusResponse(input, 'test')

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(result.confidence).toBe(0.3)
      })
    })
  })
})
