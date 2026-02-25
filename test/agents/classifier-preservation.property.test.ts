/**
 * Preservation Property Tests - Classifier Meal Detection Fix
 *
 * Spec: classifier-meal-detection-fix
 * Property 2: Preservation - Non-Meal Input Behavior Unchanged
 *
 * **IMPORTANT**: These tests capture baseline behavior on UNFIXED code.
 * **EXPECTED OUTCOME**: Tests PASS on unfixed code (confirms baseline behavior to preserve).
 *
 * **GOAL**: Ensure that after the fix, all non-buggy inputs continue to be classified
 * exactly as they were before the fix. This prevents regressions.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect } from 'vitest'
import { classifyInput, classifyWithKeywords } from '@/app/lib/agents/classifier'
import * as fc from 'fast-check'

describe('Preservation - Workout Log Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.2: Workout logs should continue to return workout_log with confidence >= 0.7
   * 
   * Observed behavior on unfixed code:
   * - Input: "5 rounds: 10 DL 225#, 15 BJ — 14:07"
   * - Result: workout_log, confidence 0.7, domains: ["trainer"]
   */
  it('should preserve workout log classification for typical CrossFit workout', () => {
    const input = '5 rounds: 10 DL 225#, 15 BJ — 14:07'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('workout_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('trainer')
    expect(result.context.has_score).toBe(true)
  })

  it('should preserve workout log classification for AMRAP workouts', () => {
    const input = 'AMRAP 12 min: 5 pull-ups, 10 push-ups, 15 air squats'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('workout_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('trainer')
  })

  it('should preserve workout log classification for strength workouts', () => {
    const input = 'Back Squat 5x5 @ 225#'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('workout_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('trainer')
  })
})

describe('Preservation - Question Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.2: Questions should continue to return question with appropriate domains
   * 
   * Observed behavior on unfixed code:
   * - Input: "What's my best Fran time?"
   * - Result: question, confidence 0.7, domains: ["trainer"]
   */
  it('should preserve question classification for workout questions', () => {
    const input = "What's my best Fran time?"
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('trainer')
    expect(result.context.is_benchmark).toBe(true)
    expect(result.context.benchmark_name).toBe('fran')
  })

  it('should preserve question classification for general workout questions', () => {
    const input = 'How many workouts did I do this week?'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.domains).toContain('trainer')
  })

  it('should preserve classification for nutrition questions', () => {
    const input = 'How much protein did I eat today?'
    const result = classifyWithKeywords(input, 'text')

    // This classifies as mixed because it has both question marker and nutrition keywords
    expect(result.input_type).toBe('mixed')
    expect(result.domains).toContain('nutritionist')
  })
})

describe('Preservation - Cross-Domain Question Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.3: Cross-domain questions should continue to return question with domains ["socius"]
   * 
   * Observed behavior on unfixed code:
   * - Input: "How does my protein intake affect my recovery?"
   * - Result: question, confidence 0.7, domains: ["socius"]
   */
  it('should preserve cross-domain classification for affect questions', () => {
    const input = 'How does my protein intake affect my recovery?'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toEqual(['socius'])
  })

  it('should preserve cross-domain classification for correlation questions', () => {
    const input = 'Is there a correlation between my sleep and workout performance?'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.domains).toEqual(['socius'])
  })

  it('should preserve cross-domain classification for impact questions', () => {
    const input = 'What impact does my nutrition have on my strength gains?'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.domains).toEqual(['socius'])
  })

  it('should preserve cross-domain classification for relationship questions', () => {
    const input = 'What is the relationship between my recovery score and training volume?'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('question')
    expect(result.domains).toEqual(['socius'])
  })
})

describe('Preservation - Mixed Input Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.4: Mixed inputs should continue to return mixed with domains ["nutritionist", "trainer"]
   * 
   * Observed behavior on unfixed code:
   * - Input: "Had a protein shake after my deadlift session"
   * - Result: mixed, confidence 0.6, domains: ["trainer", "nutritionist"]
   */
  it('should preserve mixed classification for workout + meal inputs', () => {
    const input = 'Had a protein shake after my deadlift session'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('mixed')
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    expect(result.domains).toContain('trainer')
    expect(result.domains).toContain('nutritionist')
  })

  it('should preserve mixed classification for meal + workout combo', () => {
    const input = 'Ate chicken and rice before my workout'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('mixed')
    expect(result.domains).toContain('trainer')
    expect(result.domains).toContain('nutritionist')
  })

  it('should preserve mixed classification for post-workout meal', () => {
    const input = 'Had oatmeal and eggs after my morning run'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('mixed')
    expect(result.domains).toContain('trainer')
    expect(result.domains).toContain('nutritionist')
  })
})

describe('Preservation - Unclear Input Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.1: Unclear inputs should continue to return unclear with confidence < 0.5
   * 
   * Observed behavior on unfixed code:
   * - Input: "hey"
   * - Result: unclear, confidence 0.3, domains: []
   */
  it('should preserve unclear classification for greeting', () => {
    const input = 'hey'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('unclear')
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.domains).toEqual([])
  })

  it('should preserve unclear classification for hello', () => {
    const input = 'hello'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('unclear')
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.domains).toEqual([])
  })

  it('should preserve unclear classification for hi', () => {
    const input = 'hi'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('unclear')
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.domains).toEqual([])
  })

  it('should preserve unclear classification for random text', () => {
    const input = 'asdfghjkl'
    const result = classifyWithKeywords(input, 'text')

    expect(result.input_type).toBe('unclear')
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.domains).toEqual([])
  })
})

describe('Preservation - Meal Without Portions Classification (Keyword Fallback)', () => {
  /**
   * Requirement 3.6: Meal logs without portions should continue to be classified consistently
   * 
   * Observed behavior on unfixed code:
   * - Input: "Had a protein shake and banana"
   * - Result: mixed, confidence 0.6, domains: ["trainer", "nutritionist"]
   * 
   * NOTE: The current behavior classifies this as "mixed" because "shake" is in NUTRITION_KEYWORDS
   * but "banana" is not, so it may be picking up workout keywords. We preserve this behavior.
   */
  it('should preserve classification for protein shake without portions', () => {
    const input = 'Had a protein shake and banana'
    const result = classifyWithKeywords(input, 'text')

    // Preserve current behavior (mixed classification)
    expect(result.input_type).toBe('mixed')
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    expect(result.domains).toContain('nutritionist')
  })

  it('should preserve classification for simple meal without portions', () => {
    const input = 'Had chicken and rice'
    const result = classifyWithKeywords(input, 'text')

    // Should classify as meal_log since both "chicken" and "rice" are in NUTRITION_KEYWORDS
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
  })

  it('should preserve classification for breakfast without portions', () => {
    const input = 'Had eggs and oatmeal for breakfast'
    const result = classifyWithKeywords(input, 'text')

    // Should classify as meal_log
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
  })
})

describe('Preservation - Property-Based Tests (Keyword Fallback)', () => {
  /**
   * Property-based tests to ensure preservation across many input variations
   */

  it('should preserve workout classification for inputs with workout keywords', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('deadlift', 'squat', 'bench press', 'pull-up', 'amrap', 'emom'),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 20 }),
        (exercise, sets, reps) => {
          const input = `${sets}x${reps} ${exercise}`
          const result = classifyWithKeywords(input, 'text')
          
          // Should classify as workout_log with trainer domain
          expect(result.input_type).toBe('workout_log')
          expect(result.domains).toContain('trainer')
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should preserve question classification for inputs starting with question words', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('What', 'How', 'When', 'Where', 'Why', 'Who'),
        fc.constantFrom('workout', 'exercise'),
        (questionWord, keyword) => {
          const input = `${questionWord} is my ${keyword}?`
          const result = classifyWithKeywords(input, 'text')
          
          // Should classify as question (workout keywords trigger question classification)
          expect(result.input_type).toBe('question')
          expect(result.domains).toContain('trainer')
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should preserve cross-domain classification for inputs with cross-domain triggers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('affect', 'impact', 'correlation', 'relationship'),
        (trigger) => {
          const input = `How does my nutrition ${trigger} my performance?`
          const result = classifyWithKeywords(input, 'text')
          
          // Should classify as question with socius domain
          expect(result.input_type).toBe('question')
          expect(result.domains).toEqual(['socius'])
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should preserve unclear classification for inputs without keywords', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { minLength: 3, maxLength: 10 }),
        (chars) => {
          const randomString = chars.join('')
          const result = classifyWithKeywords(randomString, 'text')
          
          // Should classify as unclear with low confidence
          expect(result.input_type).toBe('unclear')
          expect(result.confidence).toBeLessThan(0.5)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})
