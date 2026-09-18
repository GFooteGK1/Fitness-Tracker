import { canSurfaceLegacyInsight } from './legacy-insight-guard'
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
    (p): p is DetectedPattern => p !== null && canSurfaceLegacyInsight(p) && p.confidence > 0.6
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

/** Retained compatibility entry point; unsupported legacy inference is permanently retired. */
export function checkCaloricDeficit(_context: SociusContext): DetectedPattern | null {
  // Retired: this legacy context cannot establish the required source evidence.
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

/** Retained compatibility entry point; unsupported legacy inference is permanently retired. */
export function checkNutritionPerformance(_context: SociusContext): DetectedPattern | null {
  // Retired: this legacy context cannot establish the required source evidence.
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

/** Retained compatibility entry point; partial protein logs cannot establish recovery effects. */
export function checkProteinRecovery(_context: SociusContext): DetectedPattern | null {
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

/** Retained compatibility entry point; unsupported legacy inference is permanently retired. */
export function checkHRVTrend(_context: SociusContext): DetectedPattern | null {
  // Retired: this legacy context cannot establish the required source evidence.
  return null
}

/** Retained compatibility entry point; unsupported legacy inference is permanently retired. */
export function checkStrainNutrition(_context: SociusContext): DetectedPattern | null {
  // Retired: this legacy context cannot establish the required source evidence.
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
