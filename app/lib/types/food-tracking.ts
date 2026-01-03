/**
 * TypeScript interfaces for Food Tracking Feature
 * Based on the database schema and design requirements
 */

// Core food item interface for individual food items within a meal
export interface FoodItem {
  food: string;
  portion: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

// Main meal entry interface matching the meals table
export interface MealEntry {
  id: string;
  userId: string;
  mealTimestamp: Date;
  photoUrl?: string;
  photoExpiresAt?: Date;
  items: FoodItem[];
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
  needsReview: boolean;
  manualOverride: boolean;
  aiConfidence?: number;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Daily nutritional targets interface matching daily_targets table
export interface DailyTargets {
  userId: string;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  targetCalories: number;
  tolerancePct: number;
  updatedAt: Date;
}

// Daily summary interface matching daily_summaries view
export interface DailySummary {
  userId: string;
  date: Date;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
  mealCount: number;
  adherenceScore?: number;
  withinTolerance?: boolean;
}

// Macro totals utility interface for calculations
export interface MacroTotals {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

// AI analysis response interface for Claude API integration
export interface NutritionalAnalysis {
  meal_items: FoodItem[];
  total_macros: MacroTotals;
  confidence: number;
}

// Adherence status interface for progress tracking
export interface AdherenceStatus {
  proteinAdherence: number;
  carbsAdherence: number;
  fatAdherence: number;
  caloriesAdherence: number;
  overallScore: number;
  withinTolerance: boolean;
}

// Meal updates interface for manual overrides
export interface MealUpdates {
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
  totalCalories?: number;
  items?: FoodItem[];
  manualOverride?: boolean;
  reviewedAt?: Date;
}

// Database insert/update interfaces (camelCase to snake_case mapping)
export interface MealInsert {
  user_id: string;
  meal_timestamp: string;
  photo_url?: string;
  photo_expires_at?: string;
  items: FoodItem[];
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_calories: number;
  needs_review?: boolean;
  manual_override?: boolean;
  ai_confidence?: number;
  reviewed_at?: string;
}

export interface DailyTargetsInsert {
  user_id: string;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_calories: number;
  tolerance_pct?: number;
}

// API response interfaces
export interface MealUploadResponse {
  mealId: string;
  analysisStatus: 'processing' | 'complete' | 'failed';
  photoUrl?: string | null;
  expiresAt?: string;
  storageWarning?: string;
  storageStatus?: 'success' | 'failed';
  fallbackAction?: string;
  shouldRetry?: boolean;
  retryAfter?: number;
}

export interface DailyMealsResponse {
  meals: MealEntry[];
  dailyTotals: MacroTotals;
  adherence: AdherenceStatus;
}

// Error handling interfaces
export interface FoodTrackingError {
  code: string;
  message: string;
  details?: any;
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}