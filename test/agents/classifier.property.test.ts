/**
 * Property-Based Tests for Agent Classifier
 *
 * Feature: agent-system, Property 1: Classifier output structure completeness
 *
 * *For any* text input and input mode, the Classifier output SHALL contain a valid
 * `input_type` (one of the defined enum values), a non-empty `domains` array (when
 * confidence >= 0.5), a `confidence` score between 0.0 and 1.0, and an
 * `extracted_context` object with all required boolean fields.
 *
 * Tests the keyword-based fallback classifier and the parseClassificationResult
 * function — the pure logic that can be property-tested without LLM calls.
 *
 * **Validates: Requirements 1.1, 1.7**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { classifyWithKeywords, parseClassificationResult } from '@/app/lib/agents/classifier'
import type { InputMode, InputType, AgentDomain } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

const VALID_INPUT_TYPES: InputType[] = ['workout_log', 'meal_log', 'question', 'mixed', 'unclear']
const VALID_DOMAINS: AgentDomain[] = ['trainer', 'nutritionist', 'socius']
const VALID_INPUT_MODES: InputMode[] = ['text', 'voice', 'photo', 'file']

const arbInputMode = fc.constantFrom<InputMode>(...VALID_INPUT_MODES)

describe('Classifier Properties', () => {

  /**
   * Property 1a: Keyword classifier always returns valid input_type
   */
  test.prop(
    [fc.string({ minLength: 0, maxLength: 500 }), arbInputMode],
    propertyConfig
  )('Property 1: keyword classifier returns valid input_type', (content, inputMode) => {
    const result = classifyWithKeywords(content, inputMode)
    expect(VALID_INPUT_TYPES).toContain(result.input_type)
  })

  /**
   * Property 1b: Keyword classifier confidence is always in [0, 1]
   */
  test.prop(
    [fc.string({ minLength: 0, maxLength: 500 }), arbInputMode],
    propertyConfig
  )('Property 1: keyword classifier confidence is in [0, 1]', (content, inputMode) => {
    const result = classifyWithKeywords(content, inputMode)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  /**
   * Property 1c: Keyword classifier domains are always valid AgentDomain values
   */
  test.prop(
    [fc.string({ minLength: 0, maxLength: 500 }), arbInputMode],
    propertyConfig
  )('Property 1: keyword classifier domains contain only valid values', (content, inputMode) => {
    const result = classifyWithKeywords(content, inputMode)
    for (const domain of result.domains) {
      expect(VALID_DOMAINS).toContain(domain)
    }
  })

  /**
   * Property 1d: Keyword classifier extracted_context has all required boolean fields
   */
  test.prop(
    [fc.string({ minLength: 0, maxLength: 500 }), arbInputMode],
    propertyConfig
  )('Property 1: keyword classifier context has required boolean fields', (content, inputMode) => {
    const result = classifyWithKeywords(content, inputMode)
    expect(typeof result.context.has_portions).toBe('boolean')
    expect(typeof result.context.has_score).toBe('boolean')
    expect(typeof result.context.is_benchmark).toBe('boolean')
  })

  /**
   * Property 1e: Workout keywords route to trainer domain
   */
  test.prop(
    [fc.constantFrom('deadlift', 'squat', 'amrap', 'emom', 'fran', 'murph', 'bench'), arbInputMode],
    propertyConfig
  )('Property 1: workout keywords route to trainer', (keyword, inputMode) => {
    const result = classifyWithKeywords(`Did ${keyword} today`, inputMode)
    expect(result.domains).toContain('trainer')
  })

  /**
   * Property 1f: Nutrition keywords route to nutritionist domain
   */
  test.prop(
    [fc.constantFrom('protein', 'calories', 'carbs', 'meal', 'chicken', 'rice', 'eggs'), arbInputMode],
    propertyConfig
  )('Property 1: nutrition keywords route to nutritionist', (keyword, inputMode) => {
    const result = classifyWithKeywords(`Had some ${keyword}`, inputMode)
    expect(result.domains).toContain('nutritionist')
  })
})

describe('parseClassificationResult Properties', () => {

  /**
   * Property 1g: parseClassificationResult always returns valid structure from valid JSON
   */
  test.prop(
    [
      fc.record({
        input_type: fc.constantFrom(...VALID_INPUT_TYPES),
        domains: fc.array(fc.constantFrom(...VALID_DOMAINS), { minLength: 1, maxLength: 3 }),
        confidence: fc.float({ min: 0, max: 1, noNaN: true }),
        context: fc.record({
          has_portions: fc.boolean(),
          has_score: fc.boolean(),
          is_benchmark: fc.boolean()
        })
      })
    ],
    propertyConfig
  )('Property 1: parseClassificationResult preserves valid structure', (input) => {
    const json = JSON.stringify(input)
    const result = parseClassificationResult(json)

    expect(VALID_INPUT_TYPES).toContain(result.input_type)
    expect(result.domains.length).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
    expect(typeof result.context.has_portions).toBe('boolean')
    expect(typeof result.context.has_score).toBe('boolean')
    expect(typeof result.context.is_benchmark).toBe('boolean')
  })

  /**
   * Property 1h: parseClassificationResult clamps confidence to [0, 1]
   */
  test.prop(
    [fc.float({ min: -10, max: 10, noNaN: true })],
    propertyConfig
  )('Property 1: parseClassificationResult clamps confidence to [0, 1]', (rawConfidence) => {
    const json = JSON.stringify({
      input_type: 'workout_log',
      domains: ['trainer'],
      confidence: rawConfidence,
      context: { has_portions: false, has_score: false, is_benchmark: false }
    })
    const result = parseClassificationResult(json)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  /**
   * Property 1i: parseClassificationResult defaults invalid input_type to 'unclear'
   */
  test.prop(
    [fc.string().filter(s => !VALID_INPUT_TYPES.includes(s as InputType))],
    propertyConfig
  )('Property 1: invalid input_type defaults to unclear', (badType) => {
    const json = JSON.stringify({
      input_type: badType,
      domains: ['trainer'],
      confidence: 0.8,
      context: { has_portions: false, has_score: false, is_benchmark: false }
    })
    const result = parseClassificationResult(json)
    expect(result.input_type).toBe('unclear')
  })
})
