/**
 * Cross-Domain TypeScript Interfaces for SociusFit
 * Supports holistic fitness insights across workout and nutrition data
 */

// User Profile for personalization and context
export interface UserProfile {
  userId: string;
  fitnessGoals: string[]; // ["weight_loss", "muscle_gain", "performance", "general_health"]
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
  bodyMetrics: {
    height_cm?: number;
    weight_kg?: number;
    body_fat_pct?: number;
    age?: number;
  };
  preferences: {
    units?: 'metric' | 'imperial';
    notifications?: boolean;
    privacy_level?: 'private' | 'friends' | 'public';
  };
  medicalConditions: string[]; // ["lactose_intolerant", "gluten_free", "vegetarian"]
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced Meal Entry with workout context
export interface EnhancedMealEntry {
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
  // Cross-domain fields
  workoutId?: string;
  mealTiming?: 'pre_workout' | 'post_workout' | 'general' | 'recovery';
  workoutCorrelationWindow?: string; // ISO 8601 duration
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced Workout Entry with nutrition context
export interface EnhancedWorkoutEntry {
  id: string;
  userId: string;
  workoutDate: Date;
  inputText: string;
  blocks: any; // JSONB workout structure
  primaryScore?: string;
  totalDurationMin?: number;
  tags: string[];
  notes?: string;
  rpe?: number; // 1-10
  parseConfidence?: number;
  // Cross-domain fields
  nutritionQualityScore?: number; // 0-1
  hydrationLevel?: number; // 1-5
  energyLevel?: number; // 1-5
  preWorkoutMealId?: string;
  postWorkoutMealId?: string;
  createdAt: Date;
}

// Fitness correlations for AI insights
export interface FitnessCorrelation {
  id: string;
  userId: string;
  correlationType: string; // 'nutrition_performance', 'meal_timing_energy', 'macro_recovery'
  timeWindow: string; // ISO 8601 duration
  correlationStrength: number; // -1.0 to 1.0
  dataPoints: number;
  insights: {
    summary?: string;
    recommendations?: string[];
    confidence?: number;
    factors?: Record<string, number>;
  };
  metadata: Record<string, any>;
  calculatedAt: Date;
  expiresAt: Date;
}

// Daily fitness summary combining workout and nutrition
export interface DailyFitnessSummary {
  userId: string;
  date: Date;
  // Workout metrics
  workoutCount: number;
  avgRpe?: number;
  avgEnergyLevel?: number;
  avgHydrationLevel?: number;
  // Nutrition metrics
  mealCount: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
  // Cross-domain metrics
  preWorkoutMeals: number;
  postWorkoutMeals: number;
}

// Meal timing analysis
export interface MealWorkoutTiming {
  mealId: string;
  mealTiming: 'pre_workout' | 'post_workout' | 'concurrent';
  timeDifference: string; // ISO 8601 duration
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
}

// Cross-domain insights for AI recommendations
export interface HolisticInsight {
  type: 'nutrition_performance' | 'meal_timing' | 'recovery_nutrition' | 'energy_optimization';
  title: string;
  description: string;
  recommendations: string[];
  confidence: number; // 0-1
  dataPoints: number;
  timeframe: string;
  relatedWorkouts?: string[];
  relatedMeals?: string[];
}

// API response types
export interface CrossDomainAnalysisResponse {
  insights: HolisticInsight[];
  correlations: FitnessCorrelation[];
  summary: DailyFitnessSummary;
  recommendations: {
    nutrition: string[];
    workout: string[];
    timing: string[];
  };
}

// Database insert types (camelCase to snake_case)
export interface UserProfileInsert {
  user_id: string;
  fitness_goals?: string[];
  activity_level?: string;
  body_metrics?: Record<string, any>;
  preferences?: Record<string, any>;
  medical_conditions?: string[];
}

export interface FitnessCorrelationInsert {
  user_id: string;
  correlation_type: string;
  time_window?: string;
  correlation_strength?: number;
  data_points?: number;
  insights?: Record<string, any>;
  metadata?: Record<string, any>;
}

// Re-export existing types with enhancements
export * from './food-tracking';

// Utility types for cross-domain queries
export interface CrossDomainQuery {
  userId: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  includeWorkouts?: boolean;
  includeNutrition?: boolean;
  includeCorrelations?: boolean;
}

export interface NutritionWorkoutCorrelation {
  workoutId: string;
  workoutDate: Date;
  workoutType: string;
  performance: {
    rpe?: number;
    energyLevel?: number;
    primaryScore?: string;
  };
  nutrition: {
    preWorkout?: EnhancedMealEntry;
    postWorkout?: EnhancedMealEntry;
    dailyTotals: {
      protein: number;
      carbs: number;
      fat: number;
      calories: number;
    };
  };
  correlation: {
    strength: number;
    insights: string[];
  };
}