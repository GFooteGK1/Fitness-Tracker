import { describe, it, expect } from 'vitest'
import { parseTrainerResponse } from '@/app/lib/agents/trainer-agent'

describe('Trainer Enhanced Error Handling', () => {
  it('should handle conversational responses with questions', () => {
    const conversationalResponse = "Could you tell me more about the workout? What exercises did you do?"
    const result = parseTrainerResponse(conversationalResponse, 'test workout')

    expect(result.message).toBe(conversationalResponse)
    expect(result.confidence).toBe(0.3)
    expect(result.workout).toBeUndefined()
  })

  it('should handle conversational responses with clarifying phrases', () => {
    const conversationalResponse = "I need more information about your workout. Can you provide the exercises and reps?"
    const result = parseTrainerResponse(conversationalResponse, 'test workout')

    expect(result.message).toBe(conversationalResponse)
    expect(result.confidence).toBe(0.3)
    expect(result.workout).toBeUndefined()
  })

  it('should handle malformed JSON with user-friendly error', () => {
    const malformedJSON = '{"message": "test", "workout": {'
    const result = parseTrainerResponse(malformedJSON, 'test workout')

    expect(result.message).toContain('trouble processing')
    expect(result.confidence).toBe(0.3)
    expect(result.workout).toBeUndefined()
  })

  it('should strip markdown code fences and parse valid JSON', () => {
    const jsonWithFences = '```json\n{"message": "Great workout!", "confidence": 0.9}\n```'
    const result = parseTrainerResponse(jsonWithFences, 'test workout')

    expect(result.message).toBe('Great workout!')
    expect(result.confidence).toBe(0.9)
  })

  it('should handle valid JSON without code fences', () => {
    const validJSON = '{"message": "Workout logged!", "confidence": 0.95}'
    const result = parseTrainerResponse(validJSON, 'test workout')

    expect(result.message).toBe('Workout logged!')
    expect(result.confidence).toBe(0.95)
  })

  it('should preserve workout data in valid responses', () => {
    const validResponse = JSON.stringify({
      message: "Workout logged!",
      workout: {
        blocks: [{
          block_type: "AMRAP",
          duration_min: 12,
          movements: [
            { name: "Pull-up", reps: 5 },
            { name: "Push-up", reps: 10 }
          ],
          score: { rounds: 7, extra_reps: 5 }
        }],
        primary_score: "7+5",
        rpe: 8,
        tags: ["metcon"]
      },
      confidence: 0.9
    })

    const result = parseTrainerResponse(validResponse, 'test workout')

    expect(result.message).toBe('Workout logged!')
    expect(result.workout).toBeDefined()
    expect(result.workout?.blocks).toHaveLength(1)
    expect(result.workout?.blocks[0].block_type).toBe('AMRAP')
    expect(result.workout?.rpe).toBe(8)
    expect(result.confidence).toBe(0.9)
  })

  it('should handle empty response gracefully', () => {
    const emptyResponse = ''
    const result = parseTrainerResponse(emptyResponse, 'test workout')

    expect(result.message).toBeDefined()
    expect(result.confidence).toBe(0.3)
  })

  it('should handle response with BOM characters', () => {
    const responseWithBOM = '\uFEFF{"message": "Test", "confidence": 0.8}'
    const result = parseTrainerResponse(responseWithBOM, 'test workout')

    expect(result.message).toBe('Test')
    expect(result.confidence).toBe(0.8)
  })
})
