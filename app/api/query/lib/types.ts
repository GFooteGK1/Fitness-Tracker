/**
 * TypeScript interfaces for Holistic Query System
 * Supports intent-based routing and cross-domain fitness queries
 */

// Query intent types for classification
export type QueryIntent = 'WORKOUT_ONLY' | 'NUTRITION_ONLY' | 'CROSS_DOMAIN';

// Classification result from intent classifier
export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  reasoning: string;
  keywords: string[];
}

// Query context for processing
export interface QueryContext {
  userId: string;
  question: string;
  intent: QueryIntent;
  timeWindow: {
    start: Date;
    end: Date;
  };
}

// Workout data structure from domain fetcher
export interface WorkoutData {
  workouts: Array<{
    workout_date: string;
    input_text: string;
    primary_score: string | null;
    blocks: unknown;
    rpe: number | null;
    tags: string[];
  }>;
  benchmarkPrs: Array<{
    benchmark_name: string;
    date: string;
    score_value: number;
    score_display: string;
    rx_status: string;
  }>;
}

// Nutrition data structure from domain fetcher
export interface NutritionData {
  meals: Array<{
    meal_timestamp: string;
    meal_name: string;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    total_calories: number;
    meal_timing: string | null;
  }>;
  dailyTargets: {
    target_protein: number;
    target_carbs: number;
    target_fat: number;
    target_calories: number;
  } | null;
  dailySummaries: Array<{
    date: string;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    total_calories: number;
    meal_count: number;
  }>;
}

// Combined cross-domain data structure
export interface CrossDomainData {
  workout: WorkoutData;
  nutrition: NutritionData;
}

// Time window configuration
export interface TimeWindow {
  start: Date;
  end: Date;
}

// API Request interface
export interface QueryRequest {
  question: string;
  timeWindowDays?: number; // Optional, defaults to 180 (6 months)
}

// API Response interface
export interface QueryResponse {
  success: boolean;
  answer: string;
  metadata?: {
    intent: QueryIntent;
    confidence: number;
    dataFetched: {
      workouts?: number;
      meals?: number;
      prs?: number;
    };
    processingTimeMs: number;
  };
}

// Response generator parameters
export interface GenerateResponseParams {
  question: string;
  intent: QueryIntent;
  data: WorkoutData | NutritionData | CrossDomainData;
}

// Error response interface
export interface QueryErrorResponse {
  error: string;
  code?: string;
}
