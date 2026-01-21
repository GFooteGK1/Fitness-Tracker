/**
 * Intent Classifier for Holistic Query System
 * Classifies user questions into WORKOUT_ONLY, NUTRITION_ONLY, or CROSS_DOMAIN
 * Uses keyword detection for fast, deterministic classification
 */

import { QueryIntent, ClassificationResult } from './types';

// Workout-related keywords (case-insensitive matching)
export const WORKOUT_KEYWORDS = [
  'workout',
  'exercise',
  'lift',
  'deadlift',
  'squat',
  'bench',
  'pr',
  'amrap',
  'emom',
  'reps',
  'sets',
  'weight',
  'strength',
  'metcon',
  'wod',
] as const;

// Nutrition-related keywords (case-insensitive matching)
export const NUTRITION_KEYWORDS = [
  'protein',
  'calories',
  'carbs',
  'fat',
  'meal',
  'food',
  'ate',
  'eating',
  'macros',
  'diet',
  'nutrition',
  'breakfast',
  'lunch',
  'dinner',
] as const;

// Cross-domain trigger phrases (indicate correlation questions)
export const CROSS_DOMAIN_TRIGGERS = [
  'affect',
  'impact',
  'correlation',
  'relationship',
  'before workout',
  'after workout',
  'performance and',
  'energy',
  'fuel',
] as const;

/**
 * Finds all matching keywords from a keyword list in the given text
 */
function findMatchingKeywords(text: string, keywords: readonly string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Classifies a user question into one of three intent types:
 * - WORKOUT_ONLY: Questions about workouts, exercises, PRs
 * - NUTRITION_ONLY: Questions about meals, macros, diet
 * - CROSS_DOMAIN: Questions about correlations or ambiguous questions
 * 
 * @param question - The user's natural language question
 * @returns ClassificationResult with intent, confidence, reasoning, and detected keywords
 */
export async function classifyIntent(question: string): Promise<ClassificationResult> {
  const normalizedQuestion = question.trim();
  
  // Find matching keywords in each category
  const workoutMatches = findMatchingKeywords(normalizedQuestion, WORKOUT_KEYWORDS);
  const nutritionMatches = findMatchingKeywords(normalizedQuestion, NUTRITION_KEYWORDS);
  const crossDomainMatches = findMatchingKeywords(normalizedQuestion, CROSS_DOMAIN_TRIGGERS);
  
  const allKeywords = [...workoutMatches, ...nutritionMatches, ...crossDomainMatches];
  
  // If cross-domain triggers are present, classify as CROSS_DOMAIN
  if (crossDomainMatches.length > 0) {
    return {
      intent: 'CROSS_DOMAIN',
      confidence: 0.9,
      reasoning: `Cross-domain triggers detected: ${crossDomainMatches.join(', ')}`,
      keywords: allKeywords,
    };
  }
  
  // If both workout and nutrition keywords are present, classify as CROSS_DOMAIN
  if (workoutMatches.length > 0 && nutritionMatches.length > 0) {
    return {
      intent: 'CROSS_DOMAIN',
      confidence: 0.85,
      reasoning: `Both workout and nutrition keywords detected`,
      keywords: allKeywords,
    };
  }
  
  // If only workout keywords are present
  if (workoutMatches.length > 0 && nutritionMatches.length === 0) {
    return {
      intent: 'WORKOUT_ONLY',
      confidence: 0.9,
      reasoning: `Workout keywords detected: ${workoutMatches.join(', ')}`,
      keywords: workoutMatches,
    };
  }
  
  // If only nutrition keywords are present
  if (nutritionMatches.length > 0 && workoutMatches.length === 0) {
    return {
      intent: 'NUTRITION_ONLY',
      confidence: 0.9,
      reasoning: `Nutrition keywords detected: ${nutritionMatches.join(', ')}`,
      keywords: nutritionMatches,
    };
  }
  
  // Default to CROSS_DOMAIN for ambiguous or empty questions
  // This ensures comprehensive data availability per Requirement 1.5
  return {
    intent: 'CROSS_DOMAIN',
    confidence: 0.5,
    reasoning: 'No domain-specific keywords detected, defaulting to cross-domain for comprehensive data',
    keywords: [],
  };
}
