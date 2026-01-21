/**
 * Property-based tests for Prompt Templates
 * Feature: holistic-query-system, Property 8: Prompt selection matches intent type
 * Validates: Requirements 3.1, 4.1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getPromptForIntent,
  WORKOUT_SYSTEM_PROMPT,
  NUTRITION_SYSTEM_PROMPT,
  CROSS_DOMAIN_SYSTEM_PROMPT,
} from '../../app/api/query/lib/prompt-templates';
import { QueryIntent } from '../../app/api/query/lib/types';

// All valid intent types
const ALL_INTENTS: QueryIntent[] = ['WORKOUT_ONLY', 'NUTRITION_ONLY', 'CROSS_DOMAIN'];

describe('Prompt Templates Property Tests', () => {
  /**
   * Property 8: Prompt selection matches intent type
   * For any query with WORKOUT_ONLY intent, the selected system prompt SHALL be the workout-specialized prompt.
   * For any query with NUTRITION_ONLY intent, the selected system prompt SHALL be the nutrition-specialized prompt.
   * For any query with CROSS_DOMAIN intent, the selected system prompt SHALL be the cross-domain prompt.
   * Validates: Requirements 3.1, 4.1
   */
  it('Property 8: Prompt selection matches intent type', () => {
    // Generator for all valid intent types
    const intentGen = fc.constantFrom<QueryIntent>(...ALL_INTENTS);

    fc.assert(
      fc.property(intentGen, (intent) => {
        const prompt = getPromptForIntent(intent);

        // Verify correct prompt is returned for each intent
        switch (intent) {
          case 'WORKOUT_ONLY':
            expect(prompt).toBe(WORKOUT_SYSTEM_PROMPT);
            break;
          case 'NUTRITION_ONLY':
            expect(prompt).toBe(NUTRITION_SYSTEM_PROMPT);
            break;
          case 'CROSS_DOMAIN':
            expect(prompt).toBe(CROSS_DOMAIN_SYSTEM_PROMPT);
            break;
        }

        // Verify prompt is a non-empty string
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Each intent maps to a unique prompt
   * Ensures no two different intents return the same prompt
   */
  it('Each intent maps to a unique prompt', () => {
    const prompts = ALL_INTENTS.map(intent => getPromptForIntent(intent));
    const uniquePrompts = new Set(prompts);
    
    expect(uniquePrompts.size).toBe(ALL_INTENTS.length);
  });

  /**
   * Additional property: Prompts contain domain-relevant content
   * Verifies each prompt contains keywords relevant to its domain
   */
  it('Prompts contain domain-relevant content', () => {
    // Workout prompt should mention workout-related terms
    expect(WORKOUT_SYSTEM_PROMPT.toLowerCase()).toContain('workout');
    expect(WORKOUT_SYSTEM_PROMPT.toLowerCase()).toContain('fitness');
    
    // Nutrition prompt should mention nutrition-related terms
    expect(NUTRITION_SYSTEM_PROMPT.toLowerCase()).toContain('nutrition');
    expect(NUTRITION_SYSTEM_PROMPT.toLowerCase()).toContain('macro');
    
    // Cross-domain prompt should mention both domains
    expect(CROSS_DOMAIN_SYSTEM_PROMPT.toLowerCase()).toContain('workout');
    expect(CROSS_DOMAIN_SYSTEM_PROMPT.toLowerCase()).toContain('nutrition');
  });
});
