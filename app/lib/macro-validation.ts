import { FoodItem, MacroTotals, ValidationResult } from '@/app/lib/types/food-tracking'

// Validation thresholds as per requirements 7.1, 7.2
const MAX_PROTEIN_PER_MEAL = 500 // grams
const MAX_CALORIES_PER_MEAL = 5000 // calories

/**
 * Calculate total macros from individual food items
 * Validates Requirements 2.3, 5.3
 */
export function calculateTotalMacros(items: FoodItem[]): MacroTotals {
  return items.reduce(
    (totals, item) => ({
      protein: Math.round((totals.protein + item.protein) * 100) / 100, // Round to 2 decimal places
      carbs: Math.round((totals.carbs + item.carbs) * 100) / 100,
      fat: Math.round((totals.fat + item.fat) * 100) / 100,
      calories: Math.round((totals.calories + item.calories) * 100) / 100,
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}

/**
 * Validate macro values are within reasonable ranges
 * Validates Requirements 7.1, 7.2, 7.3
 */
export function validateMacroRanges(macros: MacroTotals): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for required fields (Requirement 7.4)
  if (macros.protein === undefined || macros.protein === null) {
    errors.push('Protein value is required')
  }
  if (macros.carbs === undefined || macros.carbs === null) {
    errors.push('Carbohydrates value is required')
  }
  if (macros.fat === undefined || macros.fat === null) {
    errors.push('Fat value is required')
  }
  if (macros.calories === undefined || macros.calories === null) {
    errors.push('Calories value is required')
  }

  // Check for negative values
  if (macros.protein < 0) errors.push('Protein cannot be negative')
  if (macros.carbs < 0) errors.push('Carbohydrates cannot be negative')
  if (macros.fat < 0) errors.push('Fat cannot be negative')
  if (macros.calories < 0) errors.push('Calories cannot be negative')

  // Check maximum thresholds (Requirements 7.1, 7.2)
  if (macros.protein > MAX_PROTEIN_PER_MEAL) {
    warnings.push(`Protein value (${macros.protein}g) exceeds reasonable limit (${MAX_PROTEIN_PER_MEAL}g)`)
  }
  
  if (macros.calories > MAX_CALORIES_PER_MEAL) {
    warnings.push(`Calorie value (${macros.calories}) exceeds reasonable limit (${MAX_CALORIES_PER_MEAL})`)
  }

  // Additional reasonableness checks
  if (macros.carbs > 1000) {
    warnings.push(`Carbohydrate value (${macros.carbs}g) seems unusually high`)
  }
  
  if (macros.fat > 300) {
    warnings.push(`Fat value (${macros.fat}g) seems unusually high`)
  }

  // Check calorie calculation consistency (rough validation)
  const calculatedCalories = (macros.protein * 4) + (macros.carbs * 4) + (macros.fat * 9)
  const calorieDeviation = Math.abs(macros.calories - calculatedCalories) / calculatedCalories
  
  if (calorieDeviation > 0.3) { // Allow 30% deviation for estimation errors
    warnings.push(`Calorie value (${macros.calories}) doesn't match macro calculation (${Math.round(calculatedCalories)})`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate individual food items
 * Validates Requirements 2.1, 2.2
 */
export function validateFoodItems(items: FoodItem[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!Array.isArray(items)) {
    errors.push('Food items must be an array')
    return { isValid: false, errors, warnings }
  }

  if (items.length === 0) {
    warnings.push('No food items found in meal')
  }

  items.forEach((item, index) => {
    // Check required fields
    if (!item.food || typeof item.food !== 'string' || item.food.trim() === '') {
      errors.push(`Item ${index + 1}: Food name is required`)
    }
    
    if (!item.portion || typeof item.portion !== 'string' || item.portion.trim() === '') {
      errors.push(`Item ${index + 1}: Portion description is required`)
    }

    // Check numeric values
    const numericFields: (keyof Pick<FoodItem, 'protein' | 'carbs' | 'fat' | 'calories'>)[] = 
      ['protein', 'carbs', 'fat', 'calories']
    
    numericFields.forEach(field => {
      const value = item[field]
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`Item ${index + 1}: ${field} must be a valid number`)
      } else if (value < 0) {
        errors.push(`Item ${index + 1}: ${field} cannot be negative`)
      }
    })

    // Individual item reasonableness checks
    if (typeof item.protein === 'number' && item.protein > 200) {
      warnings.push(`Item ${index + 1}: Protein value (${item.protein}g) seems very high for a single food item`)
    }
    
    if (typeof item.calories === 'number' && item.calories > 2000) {
      warnings.push(`Item ${index + 1}: Calorie value (${item.calories}) seems very high for a single food item`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Determine if meal needs review based on validation results
 * Validates Requirements 7.3
 */
export function shouldFlagForReview(
  macroValidation: ValidationResult,
  itemValidation: ValidationResult,
  aiConfidence?: number
): boolean {
  // Flag if there are any validation errors
  if (!macroValidation.isValid || !itemValidation.isValid) {
    return true
  }

  // Flag if there are warnings about unreasonable values
  const hasUnreasonableValues = macroValidation.warnings.some(warning => 
    warning.includes('exceeds reasonable limit')
  )
  
  if (hasUnreasonableValues) {
    return true
  }

  // Flag if AI confidence is low (< 0.6)
  if (aiConfidence !== undefined && aiConfidence < 0.6) {
    return true
  }

  return false
}

/**
 * Complete validation pipeline for meal data
 * Combines all validation checks
 */
export function validateMealData(
  items: FoodItem[],
  totalMacros: MacroTotals,
  aiConfidence?: number
): {
  isValid: boolean
  needsReview: boolean
  errors: string[]
  warnings: string[]
  calculatedTotals: MacroTotals
} {
  // Validate individual items
  const itemValidation = validateFoodItems(items)
  
  // Calculate totals from items for consistency check
  const calculatedTotals = calculateTotalMacros(items)
  
  // Validate macro ranges
  const macroValidation = validateMacroRanges(totalMacros)
  
  // Check consistency between provided totals and calculated totals
  const consistencyErrors: string[] = []
  const tolerance = 0.1 // Allow 0.1g/calorie difference for rounding
  
  if (Math.abs(totalMacros.protein - calculatedTotals.protein) > tolerance) {
    consistencyErrors.push(`Protein total (${totalMacros.protein}g) doesn't match sum of items (${calculatedTotals.protein}g)`)
  }
  if (Math.abs(totalMacros.carbs - calculatedTotals.carbs) > tolerance) {
    consistencyErrors.push(`Carbs total (${totalMacros.carbs}g) doesn't match sum of items (${calculatedTotals.carbs}g)`)
  }
  if (Math.abs(totalMacros.fat - calculatedTotals.fat) > tolerance) {
    consistencyErrors.push(`Fat total (${totalMacros.fat}g) doesn't match sum of items (${calculatedTotals.fat}g)`)
  }
  if (Math.abs(totalMacros.calories - calculatedTotals.calories) > tolerance) {
    consistencyErrors.push(`Calories total (${totalMacros.calories}) doesn't match sum of items (${calculatedTotals.calories})`)
  }

  // Combine all validation results
  const allErrors = [
    ...itemValidation.errors,
    ...macroValidation.errors,
    ...consistencyErrors
  ]
  
  const allWarnings = [
    ...itemValidation.warnings,
    ...macroValidation.warnings
  ]

  const isValid = allErrors.length === 0
  const needsReview = shouldFlagForReview(macroValidation, itemValidation, aiConfidence)

  return {
    isValid,
    needsReview,
    errors: allErrors,
    warnings: allWarnings,
    calculatedTotals
  }
}