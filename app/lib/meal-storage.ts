/**
 * Meal Storage Service
 * Handles meal data storage with audit trail and error handling
 */

import { createClient } from '@supabase/supabase-js'
import { MealEntry, MealInsert, FoodItem, ValidationResult } from './types/food-tracking'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Validates meal data before storage
 * Requirements: 3.1, 7.1, 7.2, 7.3, 7.4
 */
export function validateMealData(mealData: Partial<MealInsert>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!mealData.user_id) {
    errors.push('User ID is required')
  }

  if (!mealData.meal_timestamp) {
    errors.push('Meal timestamp is required')
  }

  if (!mealData.items || !Array.isArray(mealData.items) || mealData.items.length === 0) {
    errors.push('At least one food item is required')
  }

  // Validate macro values are present and non-negative
  const macroFields = ['total_protein', 'total_carbs', 'total_fat', 'total_calories'] as const
  for (const field of macroFields) {
    const value = mealData[field]
    if (value === undefined || value === null) {
      errors.push(`${field} is required`)
    } else if (typeof value !== 'number' || value < 0) {
      errors.push(`${field} must be a non-negative number`)
    }
  }

  // Data quality validation - flag unreasonable values
  if (typeof mealData.total_protein === 'number' && mealData.total_protein > 500) {
    warnings.push('Protein value exceeds 500g - flagging for review')
  }

  if (typeof mealData.total_calories === 'number' && mealData.total_calories > 5000) {
    warnings.push('Calorie value exceeds 5000 - flagging for review')
  }

  // Validate food items structure
  if (mealData.items && Array.isArray(mealData.items)) {
    mealData.items.forEach((item: FoodItem, index: number) => {
      if (!item.food || typeof item.food !== 'string') {
        errors.push(`Food item ${index + 1}: food name is required`)
      }
      if (!item.portion || typeof item.portion !== 'string') {
        errors.push(`Food item ${index + 1}: portion is required`)
      }
      
      const itemMacros = ['protein', 'carbs', 'fat', 'calories'] as const
      for (const macro of itemMacros) {
        if (typeof item[macro] !== 'number' || item[macro] < 0) {
          errors.push(`Food item ${index + 1}: ${macro} must be a non-negative number`)
        }
      }
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Stores meal data in Supabase with audit trail
 * Requirements: 3.1, 3.4, 3.5
 */
export async function storeMealData(mealData: MealInsert): Promise<{ 
  success: boolean
  mealId?: string
  error?: string
  warnings?: string[]
}> {
  try {
    // Validate data first
    const validation = validateMealData(mealData)
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      }
    }

    // Set needs_review flag based on validation warnings or data quality issues
    const needsReview = validation.warnings.length > 0 || 
                       (mealData.total_protein && mealData.total_protein > 500) ||
                       (mealData.total_calories && mealData.total_calories > 5000) ||
                       (mealData.ai_confidence && mealData.ai_confidence < 0.6)

    // Prepare meal data for insertion
    const mealToInsert = {
      ...mealData,
      needs_review: needsReview,
      manual_override: mealData.manual_override || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Insert meal data
    const { data: meal, error: insertError } = await supabase
      .from('meals')
      .insert(mealToInsert)
      .select()
      .single()

    if (insertError) {
      console.error('Meal storage error:', insertError)
      
      // Handle specific database constraint violations
      if (insertError.code === '23505') {
        return {
          success: false,
          error: 'Duplicate meal entry detected'
        }
      }
      
      if (insertError.code === '23503') {
        return {
          success: false,
          error: 'Invalid user reference'
        }
      }
      
      if (insertError.code === '23514') {
        return {
          success: false,
          error: 'Data constraint violation - check macro values are non-negative'
        }
      }

      return {
        success: false,
        error: `Database error: ${insertError.message}`
      }
    }

    return {
      success: true,
      mealId: meal.id,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    }

  } catch (error) {
    console.error('Unexpected error storing meal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Updates existing meal data with audit trail
 * Requirements: 8.2, 8.3, 8.4
 */
export async function updateMealData(
  mealId: string, 
  updates: Partial<MealInsert>,
  isManualOverride: boolean = false
): Promise<{ 
  success: boolean
  error?: string
  warnings?: string[]
}> {
  try {
    // Validate updates
    const validation = validateMealData(updates)
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      }
    }

    // Prepare update data with audit trail
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    // Set manual override flags if this is a manual correction
    if (isManualOverride) {
      updateData.manual_override = true
      updateData.reviewed_at = new Date().toISOString()
    }

    // Set needs_review flag based on validation warnings
    if (validation.warnings.length > 0) {
      updateData.needs_review = true
    }

    const { error: updateError } = await supabase
      .from('meals')
      .update(updateData)
      .eq('id', mealId)

    if (updateError) {
      console.error('Meal update error:', updateError)
      return {
        success: false,
        error: `Update failed: ${updateError.message}`
      }
    }

    return {
      success: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    }

  } catch (error) {
    console.error('Unexpected error updating meal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Retrieves meal by ID with error handling
 */
export async function getMealById(mealId: string): Promise<{
  success: boolean
  meal?: MealEntry
  error?: string
}> {
  try {
    const { data: meal, error } = await supabase
      .from('meals')
      .select('*')
      .eq('id', mealId)
      .single()

    if (error) {
      return {
        success: false,
        error: `Failed to retrieve meal: ${error.message}`
      }
    }

    // Convert database format to TypeScript interface
    const mealEntry: MealEntry = {
      id: meal.id,
      userId: meal.user_id,
      mealTimestamp: new Date(meal.meal_timestamp),
      photoUrl: meal.photo_url,
      photoExpiresAt: meal.photo_expires_at ? new Date(meal.photo_expires_at) : undefined,
      items: meal.items,
      totalProtein: parseFloat(meal.total_protein),
      totalCarbs: parseFloat(meal.total_carbs),
      totalFat: parseFloat(meal.total_fat),
      totalCalories: parseFloat(meal.total_calories),
      needsReview: meal.needs_review,
      manualOverride: meal.manual_override,
      aiConfidence: meal.ai_confidence ? parseFloat(meal.ai_confidence) : undefined,
      reviewedAt: meal.reviewed_at ? new Date(meal.reviewed_at) : undefined,
      createdAt: new Date(meal.created_at),
      updatedAt: new Date(meal.updated_at)
    }

    return {
      success: true,
      meal: mealEntry
    }

  } catch (error) {
    console.error('Error retrieving meal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}