/**
 * TypeScript interfaces for Food Tracking Feature
 * Based on the database schema and design requirements
 */

// Relative portion size options (hand-based estimates)
export type RelativePortionSize = 
  | 'palm'        // ~3-4oz protein
  | 'fist'        // ~1 cup carbs/veggies
  | 'cupped-hand' // ~½ cup grains/snacks
  | 'thumb'       // ~1 tbsp fats/oils
  | 'half-plate'  // large portion
  | 'quarter-plate'; // small portion

// Exact measurement units
export type MeasurementUnit = 'g' | 'oz' | 'cup' | 'tsp' | 'tbsp';

// Fractional amounts for exact measurements
export type FractionalAmount = '1/8' | '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | '1' | '1.5' | '2' | '3' | '4';

// Portion specification - either relative or exact
export interface PortionSpec {
  type: 'relative' | 'exact';
  relative?: RelativePortionSize;
  exact?: {
    amount: number | FractionalAmount;
    unit: MeasurementUnit;
  };
}

// Core food item interface for individual food items within a meal
export interface FoodItem {
  food: string;
  portion: string;           // AI's initial portion description
  portionSpec?: PortionSpec; // User-specified portion for refinement
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
  analysis?: {
    items: FoodItem[];
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    total_calories: number;
    confidence: number;
    notes?: string;
  };
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