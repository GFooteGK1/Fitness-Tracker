/**
 * Target Management Service
 * Business logic for daily nutritional targets
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */

import { DailyTargets, DailyTargetsInsert, ValidationResult } from './types/food-tracking'

/**
 * Validates daily target values
 * Requirements: 4.5 - Validate positive target values
 */
export function validateTargets(targets: Partial<DailyTargets>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for positive values
  if (targets.targetProtein !== undefined && targets.targetProtein <= 0) {
    errors.push('Target protein must be a positive number')
  }

  if (targets.targetCarbs !== undefined && targets.targetCarbs <= 0) {
    errors.push('Target carbs must be a positive number')
  }

  if (targets.targetFat !== undefined && targets.targetFat <= 0) {
    errors.push('Target fat must be a positive number')
  }

  if (targets.targetCalories !== undefined && targets.targetCalories <= 0) {
    errors.push('Target calories must be a positive number')
  }

  // Check tolerance percentage range
  if (targets.tolerancePct !== undefined && (targets.tolerancePct < 0 || targets.tolerancePct > 100)) {
    errors.push('Tolerance percentage must be between 0 and 100')
  }

  // Validate reasonable ranges (warnings, not errors)
  if (targets.targetProtein !== undefined && targets.targetProtein > 300) {
    warnings.push('Target protein seems very high (>300g). Please verify.')
  }

  if (targets.targetCalories !== undefined && targets.targetCalories > 5000) {
    warnings.push('Target calories seems very high (>5000). Please verify.')
  }

  if (targets.targetCalories !== undefined && targets.targetCalories < 1000) {
    warnings.push('Target calories seems very low (<1000). Please verify.')
  }

  // Check macro balance (calories should roughly match macro calories)
  if (targets.targetProtein !== undefined && targets.targetCarbs !== undefined && 
      targets.targetFat !== undefined && targets.targetCalories !== undefined) {
    
    const calculatedCalories = (targets.targetProtein * 4) + (targets.targetCarbs * 4) + (targets.targetFat * 9)
    const calorieDifference = Math.abs(calculatedCalories - targets.targetCalories)
    const percentDifference = (calorieDifference / targets.targetCalories) * 100

    if (percentDifference > 20) {
      warnings.push(`Macro calories (${Math.round(calculatedCalories)}) don't match target calories (${targets.targetCalories}). Difference: ${Math.round(percentDifference)}%`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Creates default targets for a new user
 * Requirements: 4.2 - Apply default 5% tolerance
 */
export function createDefaultTargets(userId: string): DailyTargets {
  return {
    userId,
    targetProtein: 0,
    targetCarbs: 0,
    targetFat: 0,
    targetCalories: 0,
    tolerancePct: 5.0, // Default 5% tolerance
    updatedAt: new Date()
  }
}

/**
 * Converts DailyTargets to database insert format
 */
export function targetsToInsert(targets: DailyTargets): DailyTargetsInsert {
  return {
    user_id: targets.userId,
    target_protein: targets.targetProtein,
    target_carbs: targets.targetCarbs,
    target_fat: targets.targetFat,
    target_calories: targets.targetCalories,
    tolerance_pct: targets.tolerancePct
  }
}

/**
 * Converts database row to DailyTargets format
 */
export function dbRowToTargets(row: any): DailyTargets {
  return {
    userId: row.user_id,
    targetProtein: parseFloat(row.target_protein),
    targetCarbs: parseFloat(row.target_carbs),
    targetFat: parseFloat(row.target_fat),
    targetCalories: parseFloat(row.target_calories),
    tolerancePct: parseFloat(row.tolerance_pct),
    updatedAt: new Date(row.updated_at)
  }
}

/**
 * Calculates recommended targets based on user profile
 * This is a helper function for future UI implementation
 */
export function calculateRecommendedTargets(
  weight: number, // in kg
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active',
  goal: 'maintain' | 'lose' | 'gain'
): Partial<DailyTargets> {
  // Base metabolic rate calculation (simplified)
  let bmr = weight * 22 // Rough estimate for adults

  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  }

  let targetCalories = bmr * activityMultipliers[activityLevel]

  // Adjust for goal
  switch (goal) {
    case 'lose':
      targetCalories *= 0.85 // 15% deficit
      break
    case 'gain':
      targetCalories *= 1.15 // 15% surplus
      break
    // maintain stays the same
  }

  // Calculate macro targets (example ratios for CrossFit athletes)
  const targetProtein = weight * 2.2 // 2.2g per kg body weight
  const targetFat = targetCalories * 0.25 / 9 // 25% of calories from fat
  const targetCarbs = (targetCalories - (targetProtein * 4) - (targetFat * 9)) / 4

  return {
    targetProtein: Math.round(targetProtein),
    targetCarbs: Math.round(targetCarbs),
    targetFat: Math.round(targetFat),
    targetCalories: Math.round(targetCalories),
    tolerancePct: 5.0
  }
}