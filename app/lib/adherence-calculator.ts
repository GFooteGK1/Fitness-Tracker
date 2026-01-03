/**
 * Adherence Calculator Service
 * Calculates daily adherence scores and status based on targets
 */

import { MacroTotals, DailyTargets, AdherenceStatus, DailySummary } from './types/food-tracking'

// Weekly adherence interfaces
export interface WeeklyAdherenceScore {
  weekStart: Date
  weekEnd: Date
  dailyScores: DailyAdherenceScore[]
  averageScore: number
  proteinWeeklyScore: number
  carbsWeeklyScore: number
  fatWeeklyScore: number
  caloriesWeeklyScore: number
}

export interface DailyAdherenceScore {
  date: Date
  adherenceStatus: AdherenceStatus
  dailyTotals: MacroTotals
}

export interface CorrectionGuidance {
  weeklyScore: number
  needsImprovement: boolean
  proteinGuidance?: string
  carbsGuidance?: string
  fatGuidance?: string
  caloriesGuidance?: string
  overallGuidance: string
}

/**
 * Calculates adherence status for daily intake vs targets
 * Requirements: 5.3, 6.3, 6.4
 */
export function calculateAdherenceStatus(
  dailyTotals: MacroTotals,
  targets: DailyTargets
): AdherenceStatus {
  const toleranceDecimal = targets.tolerancePct / 100

  // Calculate adherence for each macro
  const proteinAdherence = calculateMacroAdherence(
    dailyTotals.protein,
    targets.targetProtein,
    toleranceDecimal
  )

  const carbsAdherence = calculateMacroAdherence(
    dailyTotals.carbs,
    targets.targetCarbs,
    toleranceDecimal
  )

  const fatAdherence = calculateMacroAdherence(
    dailyTotals.fat,
    targets.targetFat,
    toleranceDecimal
  )

  const caloriesAdherence = calculateMacroAdherence(
    dailyTotals.calories,
    targets.targetCalories,
    toleranceDecimal
  )

  // Calculate overall score as average of all macro scores
  const overallScore = (proteinAdherence + carbsAdherence + fatAdherence + caloriesAdherence) / 4

  // Check if within tolerance (all macros within ±tolerance%)
  const withinTolerance = proteinAdherence === 100 && 
                         carbsAdherence === 100 && 
                         fatAdherence === 100 && 
                         caloriesAdherence === 100

  return {
    proteinAdherence,
    carbsAdherence,
    fatAdherence,
    caloriesAdherence,
    overallScore: Math.round(overallScore * 100) / 100, // Round to 2 decimal places
    withinTolerance
  }
}

/**
 * Calculates adherence score for a single macro
 * Within tolerance = 100%, outside tolerance = (1 - deviation/target) × 100
 */
function calculateMacroAdherence(
  actual: number,
  target: number,
  toleranceDecimal: number
): number {
  if (target <= 0) return 0

  const deviation = Math.abs(actual - target)
  const toleranceAmount = target * toleranceDecimal

  // If within tolerance, score is 100%
  if (deviation <= toleranceAmount) {
    return 100
  }

  // If outside tolerance, calculate score as (1 - deviation/target) × 100
  // Ensure score doesn't go below 0
  const score = Math.max(0, (1 - deviation / target) * 100)
  return Math.round(score * 100) / 100 // Round to 2 decimal places
}

/**
 * Checks if photo URLs are still valid (not expired)
 * Requirements: 10.4
 */
export function isPhotoUrlValid(photoExpiresAt?: Date): boolean {
  if (!photoExpiresAt) return false
  return new Date() < photoExpiresAt
}

/**
 * Calculates daily macro totals from meals
 * Requirements: 5.1, 5.3
 */
export function calculateDailyTotals(meals: any[]): MacroTotals {
  return meals.reduce(
    (totals, meal) => ({
      protein: totals.protein + parseFloat(meal.total_protein || 0),
      carbs: totals.carbs + parseFloat(meal.total_carbs || 0),
      fat: totals.fat + parseFloat(meal.total_fat || 0),
      calories: totals.calories + parseFloat(meal.total_calories || 0)
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}

/**
 * Calculates weekly adherence scores from daily summaries
 * Requirements: 6.5 - Compute weekly scores as average of daily scores
 */
export function calculateWeeklyAdherence(
  dailySummaries: DailySummary[],
  targets: DailyTargets,
  weekStart: Date
): WeeklyAdherenceScore {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6) // 7 days total

  // Calculate daily adherence scores
  const dailyScores: DailyAdherenceScore[] = dailySummaries.map(summary => {
    const dailyTotals: MacroTotals = {
      protein: summary.totalProtein,
      carbs: summary.totalCarbs,
      fat: summary.totalFat,
      calories: summary.totalCalories
    }

    const adherenceStatus = calculateAdherenceStatus(dailyTotals, targets)

    return {
      date: summary.date,
      adherenceStatus,
      dailyTotals
    }
  })

  // Calculate weekly averages for each macro
  const proteinScores = dailyScores.map(d => d.adherenceStatus.proteinAdherence)
  const carbsScores = dailyScores.map(d => d.adherenceStatus.carbsAdherence)
  const fatScores = dailyScores.map(d => d.adherenceStatus.fatAdherence)
  const caloriesScores = dailyScores.map(d => d.adherenceStatus.caloriesAdherence)

  const proteinWeeklyScore = calculateAverage(proteinScores)
  const carbsWeeklyScore = calculateAverage(carbsScores)
  const fatWeeklyScore = calculateAverage(fatScores)
  const caloriesWeeklyScore = calculateAverage(caloriesScores)

  // Overall weekly score is average of all macro scores
  const averageScore = (proteinWeeklyScore + carbsWeeklyScore + fatWeeklyScore + caloriesWeeklyScore) / 4

  return {
    weekStart,
    weekEnd,
    dailyScores,
    averageScore: Math.round(averageScore * 100) / 100,
    proteinWeeklyScore: Math.round(proteinWeeklyScore * 100) / 100,
    carbsWeeklyScore: Math.round(carbsWeeklyScore * 100) / 100,
    fatWeeklyScore: Math.round(fatWeeklyScore * 100) / 100,
    caloriesWeeklyScore: Math.round(caloriesWeeklyScore * 100) / 100
  }
}

/**
 * Generates correction guidance for low adherence
 * Requirements: 9.1, 9.2, 9.3 - Generate specific correction guidance
 */
export function generateCorrectionGuidance(
  weeklyAdherence: WeeklyAdherenceScore,
  targets: DailyTargets
): CorrectionGuidance {
  const needsImprovement = weeklyAdherence.averageScore < 90

  if (!needsImprovement) {
    return {
      weeklyScore: weeklyAdherence.averageScore,
      needsImprovement: false,
      overallGuidance: "Great job! You're meeting your nutritional targets consistently."
    }
  }

  const guidance: CorrectionGuidance = {
    weeklyScore: weeklyAdherence.averageScore,
    needsImprovement: true,
    overallGuidance: ""
  }

  // Calculate average daily totals for the week
  const avgDailyTotals = calculateWeeklyAverages(weeklyAdherence.dailyScores)

  // Generate specific guidance for each macro
  if (weeklyAdherence.proteinWeeklyScore < 90) {
    guidance.proteinGuidance = generateProteinGuidance(avgDailyTotals.protein, targets.targetProtein)
  }

  if (weeklyAdherence.carbsWeeklyScore < 90) {
    guidance.carbsGuidance = generateCarbsGuidance(avgDailyTotals.carbs, targets.targetCarbs)
  }

  if (weeklyAdherence.fatWeeklyScore < 90) {
    guidance.fatGuidance = generateFatGuidance(avgDailyTotals.fat, targets.targetFat)
  }

  if (weeklyAdherence.caloriesWeeklyScore < 90) {
    guidance.caloriesGuidance = generateCaloriesGuidance(avgDailyTotals.calories, targets.targetCalories)
  }

  // Generate overall guidance
  guidance.overallGuidance = generateOverallGuidance(weeklyAdherence.averageScore, guidance)

  return guidance
}

/**
 * Helper function to calculate average of an array
 */
function calculateAverage(scores: number[]): number {
  if (scores.length === 0) return 0
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

/**
 * Calculate weekly averages from daily scores
 */
function calculateWeeklyAverages(dailyScores: DailyAdherenceScore[]): MacroTotals {
  if (dailyScores.length === 0) {
    return { protein: 0, carbs: 0, fat: 0, calories: 0 }
  }

  const totals = dailyScores.reduce(
    (acc, day) => ({
      protein: acc.protein + day.dailyTotals.protein,
      carbs: acc.carbs + day.dailyTotals.carbs,
      fat: acc.fat + day.dailyTotals.fat,
      calories: acc.calories + day.dailyTotals.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )

  return {
    protein: totals.protein / dailyScores.length,
    carbs: totals.carbs / dailyScores.length,
    fat: totals.fat / dailyScores.length,
    calories: totals.calories / dailyScores.length
  }
}

/**
 * Generate protein-specific guidance
 * Requirements: 9.2 - Suggest adding protein servings with gram amounts
 */
function generateProteinGuidance(avgProtein: number, targetProtein: number): string {
  const difference = targetProtein - avgProtein
  
  if (difference > 0) {
    const servings = Math.ceil(difference / 25) // Assume ~25g protein per serving
    return `Add ${servings} protein serving${servings > 1 ? 's' : ''} daily (about ${Math.round(difference)}g more protein). Try adding chicken breast, Greek yogurt, or protein powder.`
  } else {
    const excess = Math.abs(difference)
    return `Reduce protein intake by about ${Math.round(excess)}g daily. Consider smaller portions or fewer protein-rich snacks.`
  }
}

/**
 * Generate carbs-specific guidance
 * Requirements: 9.3 - Suggest reducing carb servings with gram amounts
 */
function generateCarbsGuidance(avgCarbs: number, targetCarbs: number): string {
  const difference = targetCarbs - avgCarbs
  
  if (difference > 0) {
    const servings = Math.ceil(difference / 30) // Assume ~30g carbs per serving
    return `Add ${servings} carb serving${servings > 1 ? 's' : ''} daily (about ${Math.round(difference)}g more carbs). Try adding rice, oats, or fruit.`
  } else {
    const excess = Math.abs(difference)
    const servings = Math.ceil(excess / 30)
    return `Reduce carb intake by ${servings} serving${servings > 1 ? 's' : ''} daily (about ${Math.round(excess)}g less carbs). Consider smaller portions of rice, bread, or pasta.`
  }
}

/**
 * Generate fat-specific guidance
 */
function generateFatGuidance(avgFat: number, targetFat: number): string {
  const difference = targetFat - avgFat
  
  if (difference > 0) {
    return `Add about ${Math.round(difference)}g more healthy fats daily. Try adding nuts, avocado, or olive oil.`
  } else {
    const excess = Math.abs(difference)
    return `Reduce fat intake by about ${Math.round(excess)}g daily. Consider using less oil, smaller portions of nuts, or leaner protein sources.`
  }
}

/**
 * Generate calories-specific guidance
 */
function generateCaloriesGuidance(avgCalories: number, targetCalories: number): string {
  const difference = targetCalories - avgCalories
  
  if (difference > 0) {
    return `Increase daily intake by about ${Math.round(difference)} calories. Add healthy snacks or slightly larger portions.`
  } else {
    const excess = Math.abs(difference)
    return `Reduce daily intake by about ${Math.round(excess)} calories. Consider smaller portions or fewer snacks.`
  }
}

/**
 * Generate overall guidance summary
 * Requirements: 9.4 - Provide guidance in user-friendly language
 */
function generateOverallGuidance(weeklyScore: number, guidance: CorrectionGuidance): string {
  const improvements = []
  
  if (guidance.proteinGuidance) improvements.push('protein')
  if (guidance.carbsGuidance) improvements.push('carbs')
  if (guidance.fatGuidance) improvements.push('fat')
  if (guidance.caloriesGuidance) improvements.push('calories')

  if (improvements.length === 0) {
    return "You're doing well overall! Keep up the good work."
  }

  const scoreDescription = weeklyScore >= 80 ? 'close to your targets' : 
                          weeklyScore >= 70 ? 'making progress' : 
                          'need some adjustments'

  return `Your weekly adherence score is ${weeklyScore.toFixed(1)}% - you're ${scoreDescription}. Focus on improving your ${improvements.join(' and ')} intake this week.`
}