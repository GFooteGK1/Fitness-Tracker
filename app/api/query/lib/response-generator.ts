/**
 * Response Generator for Holistic Query System
 * Orchestrates AI response generation with domain-specific prompts
 * Requirements: 3.1, 4.1, 6.1, 6.2, 7.3
 */

import {
  QueryIntent,
  GenerateResponseParams,
  WorkoutData,
  NutritionData,
  CrossDomainData,
} from './types';
import { getPromptForIntent } from './prompt-templates';
import { complete } from '@/app/lib/llm/client';

// Error types for response generation
export class ResponseGeneratorError extends Error {
  constructor(
    message: string,
    public readonly code: 'API_TIMEOUT' | 'API_RATE_LIMIT' | 'API_ERROR' | 'INVALID_RESPONSE'
  ) {
    super(message);
    this.name = 'ResponseGeneratorError';
  }
}

/**
 * Type guard to check if data is WorkoutData
 */
function isWorkoutData(data: WorkoutData | NutritionData | CrossDomainData): data is WorkoutData {
  return 'workouts' in data && 'benchmarkPrs' in data && !('nutrition' in data);
}

/**
 * Type guard to check if data is NutritionData
 */
function isNutritionData(data: WorkoutData | NutritionData | CrossDomainData): data is NutritionData {
  return 'meals' in data && 'dailyTargets' in data && !('workout' in data);
}

/**
 * Type guard to check if data is CrossDomainData
 */
function isCrossDomainData(data: WorkoutData | NutritionData | CrossDomainData): data is CrossDomainData {
  return 'workout' in data && 'nutrition' in data;
}


/**
 * Formats workout data for inclusion in the AI prompt context
 */
function formatWorkoutContext(data: WorkoutData): string {
  const workoutsSummary = data.workouts.map(w => ({
    date: w.workout_date,
    description: w.input_text?.substring(0, 400) || '',
    score: w.primary_score,
    rpe: w.rpe,
    tags: w.tags,
  }));

  return JSON.stringify({
    workouts: workoutsSummary,
    benchmark_prs: data.benchmarkPrs,
  }, null, 2);
}

/**
 * Formats nutrition data for inclusion in the AI prompt context
 */
function formatNutritionContext(data: NutritionData): string {
  return JSON.stringify({
    meals: data.meals,
    daily_targets: data.dailyTargets,
    daily_summaries: data.dailySummaries,
  }, null, 2);
}

/**
 * Formats cross-domain data for inclusion in the AI prompt context
 */
function formatCrossDomainContext(data: CrossDomainData): string {
  const workoutContext = {
    workouts: data.workout.workouts.map(w => ({
      date: w.workout_date,
      description: w.input_text?.substring(0, 400) || '',
      score: w.primary_score,
      rpe: w.rpe,
      tags: w.tags,
    })),
    benchmark_prs: data.workout.benchmarkPrs,
  };

  const nutritionContext = {
    meals: data.nutrition.meals,
    daily_targets: data.nutrition.dailyTargets,
    daily_summaries: data.nutrition.dailySummaries,
  };

  return JSON.stringify({
    workout_data: workoutContext,
    nutrition_data: nutritionContext,
  }, null, 2);
}


/**
 * Formats data context based on intent type
 * @param intent - The query intent type
 * @param data - The fetched data (workout, nutrition, or cross-domain)
 * @returns Formatted JSON string for AI context
 */
export function formatDataContext(
  intent: QueryIntent,
  data: WorkoutData | NutritionData | CrossDomainData
): string {
  switch (intent) {
    case 'WORKOUT_ONLY':
      if (isWorkoutData(data)) {
        return formatWorkoutContext(data);
      }
      throw new Error('Invalid data type for WORKOUT_ONLY intent');
    
    case 'NUTRITION_ONLY':
      if (isNutritionData(data)) {
        return formatNutritionContext(data);
      }
      throw new Error('Invalid data type for NUTRITION_ONLY intent');
    
    case 'CROSS_DOMAIN':
      if (isCrossDomainData(data)) {
        return formatCrossDomainContext(data);
      }
      throw new Error('Invalid data type for CROSS_DOMAIN intent');
    
    default:
      // TypeScript exhaustiveness check
      const _exhaustiveCheck: never = intent;
      throw new Error(`Unknown intent type: ${_exhaustiveCheck}`);
  }
}

/**
 * Checks if the data contains any records
 */
function hasData(data: WorkoutData | NutritionData | CrossDomainData): boolean {
  if (isWorkoutData(data)) {
    return data.workouts.length > 0 || data.benchmarkPrs.length > 0;
  }
  if (isNutritionData(data)) {
    return data.meals.length > 0;
  }
  if (isCrossDomainData(data)) {
    return (
      data.workout.workouts.length > 0 ||
      data.workout.benchmarkPrs.length > 0 ||
      data.nutrition.meals.length > 0
    );
  }
  return false;
}

/**
 * Generates an empty data message based on intent
 */
function getEmptyDataMessage(intent: QueryIntent): string {
  switch (intent) {
    case 'WORKOUT_ONLY':
      return "I don't see any workout data logged yet. Try logging some workouts first, and then I can help you analyze your training!";
    case 'NUTRITION_ONLY':
      return "I don't see any meal data logged yet. Try logging some meals first, and then I can help you analyze your nutrition!";
    case 'CROSS_DOMAIN':
      return "I don't see enough data to analyze yet. Try logging some workouts and meals first, and then I can help you understand how your nutrition affects your performance!";
    default:
      return "I don't have enough data to answer your question. Please log some fitness data first.";
  }
}


// Duck-typed error status: works for any provider error object carrying a
// numeric `status` (Anthropic APIError, OpenAI errors, or a plain {status}).
function getAnthropicErrorStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message?.includes('timeout');
}

/**
 * Generates a response to a user's fitness query using AI
 * 
 * @param params - The generation parameters including question, intent, and data
 * @param anthropicClient - Optional Anthropic client (for testing)
 * @returns The generated response string
 * @throws ResponseGeneratorError for API-related errors
 * 
 * Requirements: 3.1, 4.1, 6.1, 6.2, 7.3
 */
export async function generateResponse(
  params: GenerateResponseParams
): Promise<string> {
  const { question, intent, data } = params;

  // Check for empty data and return helpful message
  if (!hasData(data)) {
    return getEmptyDataMessage(intent);
  }

  // Select appropriate prompt based on intent (Requirement 3.1, 4.1)
  const systemPrompt = getPromptForIntent(intent);

  // Format data context for Claude (Requirement 6.2)
  const dataContext = formatDataContext(intent, data);

  // Get current date for context (helps AI understand "today", "yesterday", etc.)
  const now = new Date();
  const currentDateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  try {
    // Call the LLM seam with assembled prompt and context (Requirement 6.1)
    const llmResult = await complete({
      purpose: 'query',
      maxTokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Current date: ${currentDateStr}

Question: ${question}

Data:
${dataContext}

Analyze the data and provide a conversational answer.`,
        },
      ],
    });

    if (llmResult.text) {
      return llmResult.text;
    }

    throw new ResponseGeneratorError(
      'Unexpected response format from AI',
      'INVALID_RESPONSE'
    );
  } catch (error) {
    // Handle API errors gracefully (Requirement 7.3)
    if (error instanceof ResponseGeneratorError) {
      throw error;
    }

    const status = getAnthropicErrorStatus(error);
    if (status !== null) {
      // Handle specific API error types
      if (status === 429) {
        throw new ResponseGeneratorError(
          'Service busy. Please try again in a moment.',
          'API_RATE_LIMIT'
        );
      }
      if (status === 408 || isTimeoutError(error)) {
        throw new ResponseGeneratorError(
          'Request timed out. Please try again.',
          'API_TIMEOUT'
        );
      }
      throw new ResponseGeneratorError(
        'Unable to process question. Please try again.',
        'API_ERROR'
      );
    }

    // Re-throw unknown errors
    throw new ResponseGeneratorError(
      'Unable to process question. Please try again.',
      'API_ERROR'
    );
  }
}
