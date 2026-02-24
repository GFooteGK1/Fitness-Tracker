/**
 * Socius Background Pattern Detection
 *
 * Runs asynchronously (fire-and-forget) after a workout or meal is logged.
 * Checks for known cross-domain patterns and creates insight records
 * with numeric confidence when confidence > 0.6.
 *
 * Validates: Requirements 4.2, 4.3, 4.5, 4.6
 */

import { createServerClient } from '@/app/lib/auth/supabase-server'
import { buildSociusContext } from './context-builder'
import type { SociusContext, PatternId, InsightPriority } from './types'

// ─── Types ───────────────────────────────────────────────────────────

export interface DetectedPattern {
  pattern_id: PatternId
  priority: InsightPriority
  confidence: number         // 0.0–1.0
  content: string
  data_context: Record<string, unknown>
}

// ─── Main Entry Point ────────────────────────────────────────────────

/**
 * Fire-and-forget background analysis after a workout or meal is logged.
 * Builds socius context, runs all pattern checkers, and inserts insights
 * for any patterns with confidence > 0.6.
 */
export async function triggerSociusBackground(userId: string): Promise<void> {
  const supabase = await createServerClient()
  const context = await buildSociusContext(userId)

  const checkers = [
    checkCaloricDeficit(context),
    checkOvertraining(context),
    checkNutritionPerformance(context),
    checkRecoveryVolume(context),
    checkProteinRecovery(context),
    checkSleepPerformance(context),
    checkHRVTrend(context),
    checkStrainNutrition(context),
    checkHydration(context),
    checkConsistentProgression(context),
  ]

  const detectedPatterns = checkers.filter(
    (p): p is DetectedPattern => p !== null && p.confidence > 0.6
  )

  for (const pattern of detectedPatterns) {
    await supabase.from('insights').insert({
      user_id: userId,
      pattern_id: pattern.pattern_id,
      priority: pattern.priority,
      confidence: pattern.confidence,
      content: pattern.content,
      data_context: pattern.data_context,
    })
  }
}

// ─── Pattern Checkers ────────────────────────────────────────────────

/**
 * CAL_DEF: Caloric deficit on a high-strain day.
 * Urgent when strain >= 14 AND calories < 1500.
 *
 * Validates: Requirements 4.2, 4.5
 */
export function checkCaloricDeficit(context: SociusContext): DetectedPattern | null {
  const strain = context.today.latest_whoop_strain
  const calories = context.today.macros_consumed.calories

  if (strain === null || calories === 0) return null

  if (strain >= 14 && calories < 1500) {
    return {
      pattern_id: 'CAL_DEF',
      priority: 'urgent',
      confidence: 0.8,
      content: `High strain day (${strain.toFixed(1)}) with only ${Math.round(calories)} calories logged. Consider fueling up to support recovery.`,
      data_context: { strain, calories },
    }
  }

  return null
}

/**
 * OVER_TRN: High workout volume with low recovery.
 * 5+ workouts in 30 days with avg recovery < 34 → notable.
 *
 * Validates: Requirements 4.2
 */
export function checkOvertraining(context: SociusContext): DetectedPattern | null {
  const { workout_count, whoop_avg_recovery } = context.thirty_day_summary

  if (whoop_avg_recovery === null) return null
  if (workout_count < 5) return null

  if (whoop_avg_recovery < 34) {
    const confidence = Math.min(0.9, 0.6 + (workout_count - 5) * 0.03)
    return {
      pattern_id: 'OVER_TRN',
      priority: 'notable',
      confidence,
      content: `${workout_count} workouts in the last 30 days with an average recovery of ${whoop_avg_recovery.toFixed(0)}%. Consider adding rest days.`,
      data_context: { workout_count, avg_recovery: whoop_avg_recovery },
    }
  }

  return null
}

/**
 * NUT_PERF: Correlation between nutrition adherence and workout performance.
 * When adherence is high (>= 90%) and workout count is solid (>= 8 in 30d) → informational.
 *
 * Validates: Requirements 4.2
 */
export function checkNutritionPerformance(context: SociusContext): DetectedPattern | null {
  const { workout_count, avg_daily_protein, avg_daily_calories } = context.thirty_day_summary
  const { protein: targetProtein, calories: targetCalories } = context.targets

  if (workout_count < 8 || targetProtein === 0 || targetCalories === 0) return null

  const proteinAdherence = (avg_daily_protein / targetProtein) * 100
  const calorieAdherence = (avg_daily_calories / targetCalories) * 100
  const avgAdherence = (proteinAdherence + calorieAdherence) / 2

  if (avgAdherence >= 90) {
    return {
      pattern_id: 'NUT_PERF',
      priority: 'informational',
      confidence: 0.7,
      content: `Strong nutrition-performance link: ${avgAdherence.toFixed(0)}% average adherence across ${workout_count} workouts this month.`,
      data_context: { workout_count, proteinAdherence, calorieAdherence, avgAdherence },
    }
  }

  return null
}

/**
 * REC_VOL: Recovery score < 34 but high workout count.
 * Low recovery with continued high volume → notable.
 *
 * Validates: Requirements 4.2
 */
export function checkRecoveryVolume(context: SociusContext): DetectedPattern | null {
  const recovery = context.today.latest_whoop_recovery
  const { workout_count } = context.thirty_day_summary

  if (recovery === null) return null
  if (workout_count < 5) return null

  if (recovery < 34) {
    return {
      pattern_id: 'REC_VOL',
      priority: 'notable',
      confidence: 0.75,
      content: `Current recovery is low (${recovery.toFixed(0)}%) with ${workout_count} workouts this month. Consider a lighter session or rest day.`,
      data_context: { recovery, workout_count },
    }
  }

  return null
}

/**
 * PRO_REC: Low protein (< 80% target) on recovery days.
 * When recovery is low and protein intake is also low → notable.
 *
 * Validates: Requirements 4.2
 */
export function checkProteinRecovery(context: SociusContext): DetectedPattern | null {
  const recovery = context.today.latest_whoop_recovery
  const proteinConsumed = context.today.macros_consumed.protein
  const proteinTarget = context.targets.protein

  if (recovery === null || proteinTarget === 0) return null
  if (proteinConsumed === 0) return null

  const proteinPct = (proteinConsumed / proteinTarget) * 100

  if (recovery < 50 && proteinPct < 80) {
    return {
      pattern_id: 'PRO_REC',
      priority: 'notable',
      confidence: 0.7,
      content: `Recovery is at ${recovery.toFixed(0)}% and protein is only ${proteinPct.toFixed(0)}% of target. Prioritize protein to support recovery.`,
      data_context: { recovery, proteinConsumed, proteinTarget, proteinPct },
    }
  }

  return null
}

/**
 * SLEEP_PERF: Sleep score < 60 with workout logged today.
 * Poor sleep on a training day → notable.
 *
 * Validates: Requirements 4.2
 */
export function checkSleepPerformance(context: SociusContext): DetectedPattern | null {
  const { whoop_avg_sleep_score } = context.thirty_day_summary
  const workoutsToday = context.today.workouts_logged

  if (whoop_avg_sleep_score === null) return null
  if (workoutsToday === 0) return null

  if (whoop_avg_sleep_score < 60) {
    return {
      pattern_id: 'SLEEP_PERF',
      priority: 'notable',
      confidence: 0.7,
      content: `Average sleep score is ${whoop_avg_sleep_score.toFixed(0)} with a workout logged today. Sleep quality may be affecting performance.`,
      data_context: { avg_sleep_score: whoop_avg_sleep_score, workouts_today: workoutsToday },
    }
  }

  return null
}

/**
 * HRV_TREND: HRV trending down over recent days.
 * Uses avg recovery as a proxy for HRV trend → informational.
 *
 * Validates: Requirements 4.2
 */
export function checkHRVTrend(context: SociusContext): DetectedPattern | null {
  const { whoop_avg_recovery } = context.thirty_day_summary

  if (whoop_avg_recovery === null) return null

  // Declining recovery trend suggests declining HRV
  if (whoop_avg_recovery < 50) {
    return {
      pattern_id: 'HRV_TREND',
      priority: 'informational',
      confidence: 0.65,
      content: `Average recovery trending low at ${whoop_avg_recovery.toFixed(0)}%. This may indicate declining HRV — consider monitoring stress and sleep.`,
      data_context: { avg_recovery: whoop_avg_recovery },
    }
  }

  return null
}

/**
 * STRAIN_NUT: High strain (>= 14) with low calorie adherence.
 * High strain day but not eating enough → notable.
 *
 * Validates: Requirements 4.2
 */
export function checkStrainNutrition(context: SociusContext): DetectedPattern | null {
  const strain = context.today.latest_whoop_strain
  const caloriesConsumed = context.today.macros_consumed.calories
  const caloriesTarget = context.targets.calories

  if (strain === null || caloriesTarget === 0) return null
  if (caloriesConsumed === 0) return null

  const calorieAdherence = (caloriesConsumed / caloriesTarget) * 100

  if (strain >= 14 && calorieAdherence < 70) {
    return {
      pattern_id: 'STRAIN_NUT',
      priority: 'notable',
      confidence: 0.75,
      content: `High strain (${strain.toFixed(1)}) but only ${calorieAdherence.toFixed(0)}% of calorie target consumed. Fuel up to match your output.`,
      data_context: { strain, caloriesConsumed, caloriesTarget, calorieAdherence },
    }
  }

  return null
}

/**
 * HYDRA: Hydration pattern — placeholder/informational.
 * Currently a placeholder that returns informational when data is available.
 *
 * Validates: Requirements 4.2
 */
export function checkHydration(context: SociusContext): DetectedPattern | null {
  // Hydration tracking is not yet implemented in the data model.
  // This is a placeholder that returns null until hydration data is available.
  return null
}

/**
 * CON_PROG: Consistent workout frequency (4+ days/week for 3+ weeks).
 * Consistent training pattern → informational.
 *
 * Validates: Requirements 4.2
 */
export function checkConsistentProgression(context: SociusContext): DetectedPattern | null {
  const { workout_count } = context.thirty_day_summary
  const { workout_days } = context.data_availability

  // 4+ workouts per week for ~4 weeks = 16+ workouts in 30 days
  // with workouts spread across 12+ distinct days
  if (workout_count >= 16 && workout_days >= 12) {
    return {
      pattern_id: 'CON_PROG',
      priority: 'informational',
      confidence: 0.7,
      content: `Great consistency! ${workout_count} workouts across ${workout_days} days this month. Consistent training is the foundation of progress.`,
      data_context: { workout_count, workout_days },
    }
  }

  return null
}
