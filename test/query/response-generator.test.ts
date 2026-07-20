/**
 * Unit tests for Response Generator
 * Feature: holistic-query-system
 * Validates: Requirements 3.1, 4.1, 7.3
 */

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateResponse,
  formatDataContext,
  ResponseGeneratorError,
} from '../../app/api/query/lib/response-generator';
import {
  WorkoutData,
  NutritionData,
  CrossDomainData,
  QueryIntent,
} from '../../app/api/query/lib/types';
import {
  WORKOUT_SYSTEM_PROMPT,
  NUTRITION_SYSTEM_PROMPT,
  CROSS_DOMAIN_SYSTEM_PROMPT,
} from '../../app/api/query/lib/prompt-templates';

vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }));
import { complete } from '../../app/lib/llm/client';

// Sample test data
const sampleWorkoutData: WorkoutData = {
  workouts: [
    {
      workout_date: '2026-01-15',
      input_text: 'Back Squat 5x5 @ 225lbs',
      primary_score: '225lbs',
      blocks: null,
      rpe: 8,
      tags: ['strength', 'legs'],
    },
  ],
  benchmarkPrs: [
    {
      benchmark_name: 'Fran',
      date: '2026-01-10',
      score_value: 180,
      score_display: '3:00',
      rx_status: 'rx',
    },
  ],
};

const sampleNutritionData: NutritionData = {
  meals: [
    {
      meal_timestamp: '2026-01-15T08:00:00Z',
      meal_name: 'Breakfast',
      total_protein: 35,
      total_carbs: 45,
      total_fat: 15,
      total_calories: 450,
      meal_timing: 'pre_workout',
    },
  ],
  dailyTargets: {
    target_protein: 180,
    target_carbs: 250,
    target_fat: 70,
    target_calories: 2400,
  },
  dailySummaries: [
    {
      date: '2026-01-15',
      total_protein: 150,
      total_carbs: 200,
      total_fat: 60,
      total_calories: 1950,
      meal_count: 4,
    },
  ],
};


const sampleCrossDomainData: CrossDomainData = {
  workout: sampleWorkoutData,
  nutrition: sampleNutritionData,
};

const emptyWorkoutData: WorkoutData = {
  workouts: [],
  benchmarkPrs: [],
};

const emptyNutritionData: NutritionData = {
  meals: [],
  dailyTargets: null,
  dailySummaries: [],
};

const emptyCrossDomainData: CrossDomainData = {
  workout: emptyWorkoutData,
  nutrition: emptyNutritionData,
};

// Configure the mocked LLM seam to return a given text.
function mockLlm(text: string) {
  vi.mocked(complete).mockResolvedValue({
    text,
    toolCalls: [],
    usage: { input: 0, output: 0 },
    stopReason: 'stop',
    model: 'test-model',
    provider: 'anthropic',
  });
}

describe('Response Generator Unit Tests', () => {
  const originalAnthropicModel = process.env.ANTHROPIC_MODEL;
  const originalAnthropicQueryModel = process.env.ANTHROPIC_QUERY_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_QUERY_MODEL;
  });

  afterEach(() => {
    if (originalAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = originalAnthropicModel;
    }
    if (originalAnthropicQueryModel === undefined) {
      delete process.env.ANTHROPIC_QUERY_MODEL;
    } else {
      process.env.ANTHROPIC_QUERY_MODEL = originalAnthropicQueryModel;
    }
  });

  describe('formatDataContext', () => {
    it('formats workout data correctly for WORKOUT_ONLY intent', () => {
      const context = formatDataContext('WORKOUT_ONLY', sampleWorkoutData);
      const parsed = JSON.parse(context);

      expect(parsed).toHaveProperty('workouts');
      expect(parsed).toHaveProperty('benchmark_prs');
      expect(parsed.workouts).toHaveLength(1);
      expect(parsed.workouts[0].date).toBe('2026-01-15');
      expect(parsed.benchmark_prs).toHaveLength(1);
    });

    it('formats nutrition data correctly for NUTRITION_ONLY intent', () => {
      const context = formatDataContext('NUTRITION_ONLY', sampleNutritionData);
      const parsed = JSON.parse(context);

      expect(parsed).toHaveProperty('meals');
      expect(parsed).toHaveProperty('daily_targets');
      expect(parsed).toHaveProperty('daily_summaries');
      expect(parsed.meals).toHaveLength(1);
      expect(parsed.daily_targets.target_protein).toBe(180);
    });

    it('formats cross-domain data correctly for CROSS_DOMAIN intent', () => {
      const context = formatDataContext('CROSS_DOMAIN', sampleCrossDomainData);
      const parsed = JSON.parse(context);

      expect(parsed).toHaveProperty('workout_data');
      expect(parsed).toHaveProperty('nutrition_data');
      expect(parsed.workout_data.workouts).toHaveLength(1);
      expect(parsed.nutrition_data.meals).toHaveLength(1);
    });

    it('throws error for mismatched intent and data type', () => {
      expect(() => formatDataContext('WORKOUT_ONLY', sampleNutritionData as any))
        .toThrow('Invalid data type for WORKOUT_ONLY intent');
      
      expect(() => formatDataContext('NUTRITION_ONLY', sampleWorkoutData as any))
        .toThrow('Invalid data type for NUTRITION_ONLY intent');
    });

    it('truncates long workout descriptions to 400 characters', () => {
      const longDescription = 'A'.repeat(500);
      const dataWithLongDesc: WorkoutData = {
        workouts: [{
          ...sampleWorkoutData.workouts[0],
          input_text: longDescription,
        }],
        benchmarkPrs: [],
      };

      const context = formatDataContext('WORKOUT_ONLY', dataWithLongDesc);
      const parsed = JSON.parse(context);

      expect(parsed.workouts[0].description.length).toBe(400);
    });
  });


  describe('generateResponse', () => {
    it('returns empty data message for WORKOUT_ONLY with no data', async () => {
      const result = await generateResponse({
        question: 'What is my deadlift PR?',
        intent: 'WORKOUT_ONLY',
        data: emptyWorkoutData,
      });

      expect(result).toContain("don't see any workout data");
    });

    it('returns empty data message for NUTRITION_ONLY with no data', async () => {
      const result = await generateResponse({
        question: 'How much protein did I eat?',
        intent: 'NUTRITION_ONLY',
        data: emptyNutritionData,
      });

      expect(result).toContain("don't see any meal data");
    });

    it('returns empty data message for CROSS_DOMAIN with no data', async () => {
      const result = await generateResponse({
        question: 'How does my diet affect my lifts?',
        intent: 'CROSS_DOMAIN',
        data: emptyCrossDomainData,
      });

      expect(result).toContain("don't see enough data");
    });

    it('calls the LLM with correct prompt for WORKOUT_ONLY', async () => {
      mockLlm('Your deadlift PR is 315lbs');

      const result = await generateResponse({
        question: 'What is my deadlift PR?',
        intent: 'WORKOUT_ONLY',
        data: sampleWorkoutData,
      });

      expect(complete).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(complete).mock.calls[0][0];
      expect(callArgs.purpose).toBe('query');
      expect(callArgs.system).toBe(WORKOUT_SYSTEM_PROMPT);
      expect(result).toBe('Your deadlift PR is 315lbs');
    });

    it('calls the LLM with correct prompt for NUTRITION_ONLY', async () => {
      mockLlm('You ate 150g of protein today');

      const result = await generateResponse({
        question: 'How much protein did I eat today?',
        intent: 'NUTRITION_ONLY',
        data: sampleNutritionData,
      });

      expect(complete).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(complete).mock.calls[0][0];
      expect(callArgs.system).toBe(NUTRITION_SYSTEM_PROMPT);
      expect(result).toBe('You ate 150g of protein today');
    });

    it('calls the LLM with correct prompt for CROSS_DOMAIN', async () => {
      mockLlm('Your protein intake correlates with better workout performance');

      const result = await generateResponse({
        question: 'How does my diet affect my lifts?',
        intent: 'CROSS_DOMAIN',
        data: sampleCrossDomainData,
      });

      expect(complete).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(complete).mock.calls[0][0];
      expect(callArgs.system).toBe(CROSS_DOMAIN_SYSTEM_PROMPT);
      expect(result).toBe('Your protein intake correlates with better workout performance');
    });
  });


  describe('error handling', () => {
    it('throws ResponseGeneratorError with API_RATE_LIMIT for 429 errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      vi.mocked(complete).mockRejectedValue(rateLimitError);

      await expect(
        generateResponse({
          question: 'Test question',
          intent: 'WORKOUT_ONLY',
          data: sampleWorkoutData,
        })
      ).rejects.toThrow(ResponseGeneratorError);
    });

    it('throws ResponseGeneratorError with API_ERROR for general API errors', async () => {
      vi.mocked(complete).mockRejectedValue(new Error('API Error'));

      await expect(
        generateResponse({
          question: 'Test question',
          intent: 'WORKOUT_ONLY',
          data: sampleWorkoutData,
        })
      ).rejects.toThrow(ResponseGeneratorError);
    });

    it('throws ResponseGeneratorError with INVALID_RESPONSE for an empty response', async () => {
      mockLlm(''); // no text content

      await expect(
        generateResponse({
          question: 'Test question',
          intent: 'WORKOUT_ONLY',
          data: sampleWorkoutData,
        })
      ).rejects.toThrow('Unexpected response format from AI');
    });
  });

  describe('prompt selection for each intent type', () => {
    const intents: QueryIntent[] = ['WORKOUT_ONLY', 'NUTRITION_ONLY', 'CROSS_DOMAIN'];
    const expectedPrompts = {
      WORKOUT_ONLY: WORKOUT_SYSTEM_PROMPT,
      NUTRITION_ONLY: NUTRITION_SYSTEM_PROMPT,
      CROSS_DOMAIN: CROSS_DOMAIN_SYSTEM_PROMPT,
    };
    const testData = {
      WORKOUT_ONLY: sampleWorkoutData,
      NUTRITION_ONLY: sampleNutritionData,
      CROSS_DOMAIN: sampleCrossDomainData,
    };

    intents.forEach((intent) => {
      it(`selects correct prompt for ${intent}`, async () => {
        mockLlm('Test response');

        await generateResponse({
          question: 'Test question',
          intent,
          data: testData[intent],
        });

        const callArgs = vi.mocked(complete).mock.calls[0][0];
        expect(callArgs.system).toBe(expectedPrompts[intent]);
      });
    });
  });
});
