/**
 * Bug Condition Exploration Test - Classifier Meal Detection Fix
 *
 * Spec: classifier-meal-detection-fix
 * Property 1: Fault Condition - Meal Inputs with Portions Classified Correctly
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * **DO NOT attempt to fix the test or the code when it fails.**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 *
 * **GOAL**: Surface counterexamples that demonstrate the bug exists.
 *
 * The bug manifests when users provide meal descriptions with portions and common food items
 * (e.g., "I had 170g of 0% greek yogurt and 65g of peanut butter granola") — the classifier
 * returns `unclear` or confidence < 0.5 instead of confidently classifying as `meal_log`.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import { describe, it, expect } from 'vitest'
import { classifyInput, classifyWithKeywords } from '@/app/lib/agents/classifier'

describe('Bug Condition Exploration - Meal Detection with Portions (LLM Classifier)', () => {
  /**
   * Test Case 1: Yogurt and Granola
   * Input: "I had 170g of 0% greek yogurt and 65g of peanut butter granola"
   * Expected: meal_log, confidence >= 0.8, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear or confidence < 0.5 because "yogurt" and "granola" not in NUTRITION_KEYWORDS
   */
  it('should classify yogurt and granola with portions as meal_log', async () => {
    const input = 'I had 170g of 0% greek yogurt and 65g of peanut butter granola'
    const result = await classifyInput(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 2: Protein Shake with Fruits
   * Input: "Had 2 scoops protein powder, 1 banana, and 1 cup berries"
   * Expected: meal_log, confidence >= 0.8, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear or low confidence because "banana" and "berries" not in NUTRITION_KEYWORDS
   */
  it('should classify protein shake with fruits as meal_log', async () => {
    const input = 'Had 2 scoops protein powder, 1 banana, and 1 cup berries'
    const result = await classifyInput(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 3: Avocado and Eggs for Breakfast
   * Input: "Had 1 avocado and 2 eggs for breakfast"
   * Expected: meal_log, confidence >= 0.8, domains: ["nutritionist"], has_portions: true
   * Bug: May fail if "avocado" not in NUTRITION_KEYWORDS
   */
  it('should classify avocado and eggs with portions as meal_log', async () => {
    const input = 'Had 1 avocado and 2 eggs for breakfast'
    const result = await classifyInput(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  }, 10000)

  /**
   * Test Case 4: Chicken with Vegetables
   * Input: "Ate 6oz chicken breast with 1 cup broccoli and spinach"
   * Expected: meal_log, confidence >= 0.8, domains: ["nutritionist"], has_portions: true
   * Bug: May partially work but confidence may be lower than expected, "broccoli" and "spinach" not in keywords
   */
  it('should classify chicken with vegetables as meal_log', async () => {
    const input = 'Ate 6oz chicken breast with 1 cup broccoli and spinach'
    const result = await classifyInput(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })
})


describe('Bug Condition Exploration - Keyword Fallback (CRITICAL)', () => {
  /**
   * These tests target the keyword fallback specifically, which is where the bug manifests.
   * The LLM classifier may work correctly, but when it fails and falls back to keywords,
   * the bug appears because common food items are missing from NUTRITION_KEYWORDS.
   */

  /**
   * Test Case 1: Yogurt and Granola (Keyword Fallback)
   * Input: "I had 170g of 0% greek yogurt and 65g of peanut butter granola"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear or confidence < 0.5 because "yogurt" and "granola" not in NUTRITION_KEYWORDS
   */
  it('KEYWORD FALLBACK: should classify yogurt and granola with portions as meal_log', () => {
    const input = 'I had 170g of 0% greek yogurt and 65g of peanut butter granola'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 2: Protein Shake with Fruits (Keyword Fallback)
   * Input: "Had 2 scoops protein powder, 1 banana, and 1 cup berries"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear or low confidence because "banana" and "berries" not in NUTRITION_KEYWORDS
   */
  it('KEYWORD FALLBACK: should classify protein shake with fruits as meal_log', () => {
    const input = 'Had 2 scoops protein powder, 1 banana, and 1 cup berries'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 3: Avocado and Eggs for Breakfast (Keyword Fallback)
   * Input: "Had 1 avocado and 2 eggs for breakfast"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: May fail if "avocado" not in NUTRITION_KEYWORDS (but "eggs" is present)
   */
  it('KEYWORD FALLBACK: should classify avocado and eggs with portions as meal_log', () => {
    const input = 'Had 1 avocado and 2 eggs for breakfast'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 4: Chicken with Vegetables (Keyword Fallback)
   * Input: "Ate 6oz chicken breast with 1 cup broccoli and spinach"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: May partially work ("chicken" is in keywords) but confidence may be lower than expected
   */
  it('KEYWORD FALLBACK: should classify chicken with vegetables as meal_log', () => {
    const input = 'Ate 6oz chicken breast with 1 cup broccoli and spinach'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 5: Past-tense verb "had" without existing keywords
   * Input: "Had 100g granola with milk"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear because "granola" not in keywords and "had" not leveraged as meal indicator
   */
  it('KEYWORD FALLBACK: should leverage past-tense "had" as meal indicator', () => {
    const input = 'Had 100g granola with milk'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })

  /**
   * Test Case 6: Past-tense verb "ate" without existing keywords
   * Input: "Ate 1 banana and some almonds"
   * Expected: meal_log, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
   * Bug: Returns unclear because "banana" and "almonds" not in keywords and "ate" not leveraged
   */
  it('KEYWORD FALLBACK: should leverage past-tense "ate" as meal indicator', () => {
    const input = 'Ate 1 banana and some almonds'
    const result = classifyWithKeywords(input, 'text')

    // Expected behavior (will fail on unfixed code)
    expect(result.input_type).toBe('meal_log')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.domains).toContain('nutritionist')
    expect(result.context.has_portions).toBe(true)
  })
})
