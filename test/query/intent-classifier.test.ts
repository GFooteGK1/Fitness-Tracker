/**
 * Property-based tests for Intent Classifier
 * Feature: holistic-query-system
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyIntent,
  WORKOUT_KEYWORDS,
  NUTRITION_KEYWORDS,
  CROSS_DOMAIN_TRIGGERS,
} from '../../app/api/query/lib/intent-classifier';
import { QueryIntent } from '../../app/api/query/lib/types';

// Valid intent types
const VALID_INTENTS: QueryIntent[] = ['WORKOUT_ONLY', 'NUTRITION_ONLY', 'CROSS_DOMAIN'];

describe('Intent Classifier Property Tests', () => {
  /**
   * Property 1: Intent classification returns valid type
   * For any user question string, the Intent Classifier SHALL return a classification
   * result with intent being exactly one of: WORKOUT_ONLY, NUTRITION_ONLY, or CROSS_DOMAIN.
   * Validates: Requirements 1.1
   */
  it('Property 1: Intent classification returns valid type', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (question) => {
        const result = await classifyIntent(question);
        
        // Intent must be one of the valid types
        expect(VALID_INTENTS).toContain(result.intent);
        
        // Confidence must be between 0 and 1
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        
        // Reasoning must be a non-empty string
        expect(typeof result.reasoning).toBe('string');
        expect(result.reasoning.length).toBeGreaterThan(0);
        
        // Keywords must be an array
        expect(Array.isArray(result.keywords)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Intent classification respects keyword domains
   * For any question containing workout-related keywords, the classification SHALL NOT be NUTRITION_ONLY.
   * For any question containing nutrition-related keywords, the classification SHALL NOT be WORKOUT_ONLY.
   * For any question containing keywords from both domains, the classification SHALL be CROSS_DOMAIN.
   * Validates: Requirements 1.2, 1.3, 1.4
   */
  it('Property 2: Intent classification respects keyword domains', async () => {
    // Generator for questions with only workout keywords
    const workoutOnlyQuestionGen = fc.constantFrom(...WORKOUT_KEYWORDS).map(
      keyword => `What is my ${keyword} progress?`
    );

    // Generator for questions with only nutrition keywords
    const nutritionOnlyQuestionGen = fc.constantFrom(...NUTRITION_KEYWORDS).map(
      keyword => `How much ${keyword} did I have today?`
    );

    // Generator for questions with both workout and nutrition keywords
    const crossDomainQuestionGen = fc.tuple(
      fc.constantFrom(...WORKOUT_KEYWORDS),
      fc.constantFrom(...NUTRITION_KEYWORDS)
    ).map(([workout, nutrition]) => `How does ${nutrition} affect my ${workout}?`);

    // Test workout-only questions don't return NUTRITION_ONLY
    await fc.assert(
      fc.asyncProperty(workoutOnlyQuestionGen, async (question) => {
        const result = await classifyIntent(question);
        expect(result.intent).not.toBe('NUTRITION_ONLY');
      }),
      { numRuns: 100 }
    );

    // Test nutrition-only questions don't return WORKOUT_ONLY
    await fc.assert(
      fc.asyncProperty(nutritionOnlyQuestionGen, async (question) => {
        const result = await classifyIntent(question);
        expect(result.intent).not.toBe('WORKOUT_ONLY');
      }),
      { numRuns: 100 }
    );

    // Test questions with both domains return CROSS_DOMAIN
    await fc.assert(
      fc.asyncProperty(crossDomainQuestionGen, async (question) => {
        const result = await classifyIntent(question);
        expect(result.intent).toBe('CROSS_DOMAIN');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Ambiguous questions default to CROSS_DOMAIN
   * For any question that contains no recognizable domain keywords or is empty/whitespace,
   * the Intent Classifier SHALL return CROSS_DOMAIN as the intent.
   * Validates: Requirements 1.5
   */
  it('Property 3: Ambiguous questions default to CROSS_DOMAIN', async () => {
    // Generator for questions without any domain keywords
    // Using simple words that don't contain any fitness/nutrition keywords
    const ambiguousQuestionGen = fc.array(
      fc.constantFrom('hello', 'what', 'how', 'when', 'where', 'why', 'is', 'the', 'my', 'data', 'show', 'me', 'tell', 'about'),
      { minLength: 1, maxLength: 10 }
    ).map(words => words.join(' ') + '?');

    await fc.assert(
      fc.asyncProperty(ambiguousQuestionGen, async (question: string) => {
        const result = await classifyIntent(question);
        expect(result.intent).toBe('CROSS_DOMAIN');
      }),
      { numRuns: 100 }
    );
  });
});
