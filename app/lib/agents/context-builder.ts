import { freshCoachRecommendation } from '@/app/lib/recommendations/coach-context'
import { isWhoopSyncEligible } from './whoop-context-eligibility'
import { canSurfaceLegacyInsight } from './legacy-insight-guard'
import { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  PassiveContext, TrainerContext, NutritionistContext, SociusContext,
  MacroTotals, MacroTargets, WorkoutBlock, UserProfile,
  UserWeeklyState, MealSummary, MealItem, ChatMessage, RecentInsight,
  RecentWorkout, BenchmarkPR, ThirtyDaySummary, DataAvailability
} from './types'
import { MOVEMENT_ALIASES, PORTION_DEFAULTS } from './constants'
import { fetchRecentChat, fetchPendingUrgentInsights } from './chat-persistence'
import { projectTodaysProgram } from '@/app/lib/coach/todays-program'
import { localDateToUTCStart, localDateToUTCEnd } from '@/app/lib/timezone-utils'
import { fetchProgrammingReadinessContext } from './programming-context'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'

// ─── Passive Context Cache ────────────────────────────────────────────
// Short-lived per-user cache for the 8-query passive context fetch.
// Back-to-back messages (common in conversation) reuse the cached context
// rather than re-querying the database on every single agent call.
// 30-second TTL keeps data fresh enough for interactive use.

const PASSIVE_CACHE_TTL_MS = 30_000
interface PassiveCacheEntry { context: PassiveContext; expiresAt: number; tzOffset: number }
const passiveContextCache = new Map<string, PassiveCacheEntry>()

/** Invalidate cache for a user — call after a workout or meal is persisted. */
export function invalidatePassiveCache(userId: string): void {
  passiveContextCache.delete(userId)
}

// ─── Default Targets ─────────────────────────────────────────────────

// Numeric placeholders preserve arithmetic compatibility. They are never confirmed targets.
const UNKNOWN_TARGETS: MacroTargets = { protein: 0, carbs: 0, fat: 0, calories: 0, tolerance_pct: 0 }

// ─── Base Context Builder ────────────────────────────────────────────

/**
 * Build the shared passive context for all agents.
 *
 * @param userId  - Supabase user ID
 * @param tzOffset - User's local timezone offset in minutes (local − UTC).
 *                   For CST (UTC-6) pass -360.  Defaults to 0 (UTC).
 *                   Used to surface the correct local time and date to agents.
 */
export async function buildPassiveContext(userId: string, tzOffset = 0): Promise<PassiveContext> {
  const cacheNow = Date.now()
  const cached = passiveContextCache.get(userId)
  const currentLocal = new Date(cacheNow + tzOffset * 60_000)
  const currentDate = `${currentLocal.getUTCFullYear()}-${String(currentLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(currentLocal.getUTCDate()).padStart(2, '0')}`

  const supabase = await createServerClient()

  // Connection/sync state is refreshed even when other passive data is cached.
  const [whoop, currentRecommendation] = await Promise.all([fetchCurrentWhoop(supabase, userId, currentDate, cacheNow),freshCoachRecommendation(supabase,userId,tzOffset)])
  if (cached && cacheNow < cached.expiresAt && cached.tzOffset === tzOffset && cached.context.current_date === currentDate) {
    return { ...cached.context, ...currentRecommendation, whoop_context: whoop.context, has_whoop: whoop.connected,
      today: { ...cached.context.today, latest_whoop_recovery: whoop.recovery, latest_whoop_strain: whoop.strain } }
  }

  const [targetState, todaysMeals, todaysWorkouts,
         recentChat, pendingInsights, weekSummaries, userProfile] = await Promise.all([
    fetchDailyTargets(supabase, userId),
    fetchTodaysMeals(supabase, userId, tzOffset),
    fetchTodaysWorkouts(supabase, userId, tzOffset),
    fetchRecentChat(supabase, userId, 20),
    fetchPendingInsightsForContext(supabase, userId),
    fetchWeekToDateSummaries(supabase, userId, tzOffset),
    fetchUserProfile(supabase, userId)
  ])

  const targets = targetState.targets
  const consumed = aggregateMacros(todaysMeals)
  const remaining = targetState.confirmed ? calculateRemaining(consumed, targets) : { protein: 0, carbs: 0, fat: 0, calories: 0 }
  const week = calculateWeekAdherence(weekSummaries, targets)

  // Compute user's local time by shifting UTC server time by tzOffset.
  // This ensures agents see the correct local time/day even on UTC servers (Vercel).
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset * 60_000)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayOfWeek = days[localNow.getUTCDay()]
  const h = localNow.getUTCHours()
  const m = String(localNow.getUTCMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const localTimeStr = `${h % 12 || 12}:${m} ${ampm}`
  const localDateStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  const context: PassiveContext = {
    ...currentRecommendation,
    user_id: userId,
    targets,
    targets_confirmed: targetState.confirmed,
    whoop_context: whoop.context,
    today: {
      meals_logged: todaysMeals.length,
      macros_consumed: consumed,
      macros_remaining: remaining,
      workouts_logged: todaysWorkouts.length,
      latest_whoop_recovery: whoop.recovery,
      latest_whoop_strain: whoop.strain
    },
    week,
    recent_chat: recentChat,
    pending_insights: pendingInsights,
    current_time: localTimeStr,                // e.g. "6:30 PM" (local time)
    day_of_week: dayOfWeek,                    // e.g. "Wednesday" (local day)
    current_date: localDateStr,                // e.g. "2026-02-28" (local date)
    has_whoop: whoop.connected,
    user_profile: userProfile ?? undefined
  }

  passiveContextCache.set(userId, { context, expiresAt: Date.now() + PASSIVE_CACHE_TTL_MS, tzOffset })
  return context
}

// ─── Fetch Helpers (private) ─────────────────────────────────────────

async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('fitness_goals, activity_level, body_metrics, preferences')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null

  return {
    fitness_goals: Array.isArray(data.fitness_goals) ? data.fitness_goals : [],
    activity_level: data.activity_level ?? 'moderately_active',
    body_metrics: (data.body_metrics as Record<string, unknown>) ?? {},
    preferences: (data.preferences as Record<string, unknown>) ?? {}
  }
}

async function fetchDailyTargets(
  supabase: SupabaseClient,
  userId: string
): Promise<{ targets: MacroTargets; confirmed: boolean }> {
  const { data, error } = await supabase
    .from('daily_targets')
    .select('target_protein, target_carbs, target_fat, target_calories, tolerance_pct')
    .eq('user_id', userId)
    .single()

  const values = (['target_protein', 'target_carbs', 'target_fat', 'target_calories'] as const).map(key =>
    data?.[key] !== null && data?.[key] !== undefined && data?.[key] !== '' ? Number(data[key]) : NaN)
  if (error || !data || values.some(value => !Number.isFinite(value) || value < 0)) {
    return { targets: { ...UNKNOWN_TARGETS }, confirmed: false }
  }
  return { targets: { protein: values[0], carbs: values[1], fat: values[2], calories: values[3],
    tolerance_pct: Number.isFinite(Number(data.tolerance_pct)) && Number(data.tolerance_pct) >= 0 ? Number(data.tolerance_pct) : 0 }, confirmed: true }
}

async function fetchTodaysMeals(
  supabase: SupabaseClient,
  userId: string,
  tzOffset = 0
): Promise<MealSummary[]> {
  // tzOffset here uses the agent convention: negative for west of UTC (e.g., -360 for CST).
  // Calculate today's date in user's local timezone: localTime = UTC + tzOffset
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset * 60_000)
  const todayStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  // localDateToUTCStart expects raw getTimezoneOffset() convention (positive for west of UTC).
  // Agent convention is negated, so negate back: apiOffset = -tzOffset
  const apiOffset = -tzOffset
  const startUTC = localDateToUTCStart(todayStr, apiOffset)
  const endUTC = localDateToUTCEnd(todayStr, apiOffset)

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', startUTC)
    .lt('meal_timestamp', endUTC)
    .order('meal_timestamp', { ascending: true })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    timestamp: row.meal_timestamp,
    timing: row.meal_timing ?? null,
    items: Array.isArray(row.items) ? row.items : [],
    totals: {
      protein: parseFloat(row.total_protein) || 0,
      carbs: parseFloat(row.total_carbs) || 0,
      fat: parseFloat(row.total_fat) || 0,
      calories: parseFloat(row.total_calories) || 0
    }
  }))
}

async function fetchTodaysWorkouts(
  supabase: SupabaseClient,
  userId: string,
  tzOffset = 0
): Promise<{ id: string }[]> {
  // tzOffset uses agent convention: negative for west of UTC. localTime = UTC + tzOffset
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset * 60_000)
  const todayStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('workout_date', todayStr)

  if (error || !data) return []
  return data
}

/** Current context requires a connected, completely synced, fresh source. Dates are retained. */
async function fetchCurrentWhoop(supabase: SupabaseClient, userId: string, currentDate: string, asOf: number) {
  const [connection, sync, recovery, strain] = await Promise.all([
    supabase.from('whoop_tokens').select('id').eq('user_id', userId).single(),
    supabase.from('whoop_sync_status').select('status,last_sync_at,error_message').eq('user_id', userId).single(),
    supabase.from('whoop_recovery').select('recovery_score,date').eq('user_id', userId).order('date', { ascending: false }).limit(1).single(),
    supabase.from('whoop_cycles').select('strain,date').eq('user_id', userId).order('date', { ascending: false }).limit(1).single(),
  ])
  const connected = !connection.error && Boolean(connection.data?.id)
  const syncAfter = await supabase.from('whoop_sync_status').select('status,last_sync_at,error_message').eq('user_id', userId).single()
  const complete = !sync.error && !syncAfter.error && sync.data?.last_sync_at === syncAfter.data?.last_sync_at
    && isWhoopSyncEligible(connected, sync.data, asOf) && isWhoopSyncEligible(connected, syncAfter.data, asOf)
  const recoveryDate = typeof recovery.data?.date === 'string' ? recovery.data.date : null
  const strainDate = typeof strain.data?.date === 'string' ? strain.data.date : null
  const recoveryValue = complete && !recovery.error && recoveryDate === currentDate && typeof recovery.data?.recovery_score === 'number'
    && Number.isFinite(recovery.data.recovery_score) ? recovery.data.recovery_score : null
  const strainValue = complete && !strain.error && strainDate === currentDate && typeof strain.data?.strain === 'number'
    && Number.isFinite(strain.data.strain) ? strain.data.strain : null
  return { connected, recovery: recoveryValue, strain: strainValue, context: {
    syncEligible: complete,
    status: recoveryValue !== null || strainValue !== null ? 'current' as const : 'unavailable' as const,
    recoveryDate, strainDate, lastSyncAt: typeof sync.data?.last_sync_at === 'string' ? sync.data.last_sync_at : null,
  } }
}

async function fetchPendingInsightsForContext(
  supabase: SupabaseClient,
  userId: string
): Promise<RecentInsight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select('id, pattern_id, priority, confidence, content, created_at')
    .eq('user_id', userId)
    .is('surfaced_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !data) return []
  return (data as RecentInsight[]).filter(canSurfaceLegacyInsight)
}

async function fetchWeekToDateSummaries(
  supabase: SupabaseClient,
  userId: string,
  tzOffset = 0
): Promise<MacroTotals[]> {
  // Calculate week start in user's local timezone
  // tzOffset uses agent convention: negative for west of UTC. localTime = UTC + tzOffset
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset * 60_000)
  // Construct a Date using local year/month/date so getDay()/getDate() reflect user's local day
  const localDate = new Date(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
  const weekStartDate = getWeekStart(localDate)
  const weekStartStr = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('daily_summaries')
    .select('total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('date', weekStartStr)
    .order('date', { ascending: true })

  if (error || !data) return []

  return data.map(row => ({
    protein: parseFloat(row.total_protein) || 0,
    carbs: parseFloat(row.total_carbs) || 0,
    fat: parseFloat(row.total_fat) || 0,
    calories: parseFloat(row.total_calories) || 0
  }))
}

// ─── Domain-Specific Builders ────────────────────────────────────────

export async function buildTrainerContext(userId: string, tzOffset = 0): Promise<TrainerContext> {
  const supabase = await createServerClient()

  // Derive local date from tzOffset for program lookup
  // Agent convention: localTime = UTC + tzOffset (e.g., tzOffset=-360 for CST)
  const localNow = new Date(Date.now() + tzOffset * 60_000)
  const localDate = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  const [passive, recentWorkouts, benchmarkPrs, todaysProgram] = await Promise.all([
    buildPassiveContext(userId, tzOffset),
    fetchRecentWorkouts(supabase, userId, 7),
    fetchBenchmarkPRs(supabase, userId),
    fetchTodaysProgram(userId, localDate)
  ])

  return {
    ...passive,
    recent_workouts: recentWorkouts,
    benchmark_prs: benchmarkPrs,
    todays_program: todaysProgram,
    movement_aliases: MOVEMENT_ALIASES
  }
}

// ─── Nutritionist Context Builder ────────────────────────────────────

export async function buildNutritionistContext(userId: string, tzOffset = 0): Promise<NutritionistContext> {
  const supabase = await createServerClient()

  const [passive, todaysMeals, portionHistory] = await Promise.all([
    buildPassiveContext(userId, tzOffset),
    fetchTodaysMealDetails(supabase, userId, tzOffset),
    fetchUserPortionHistory(supabase, userId)
  ])

  return {
    ...passive,
    todays_meals: todaysMeals,
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: portionHistory
  }
}

// ─── Socius Context Builder ──────────────────────────────────────────

export async function buildSociusContext(
  userId: string,
  tzOffset = 0,
  programmingDays = 30,
  includeCoachContext = false
): Promise<SociusContext> {
  const supabase = await createServerClient()

  const [
    passive,
    thirtyDaySummary,
    recentInsights,
    dataAvailability,
    programmingContext,
    coachContext,
    coachEvidenceContext
  ] = await Promise.all([
    buildPassiveContext(userId, tzOffset),
    fetchThirtyDaySummary(supabase, userId),
    fetchRecentInsightsDetailed(supabase, userId),
    fetchDataAvailability(supabase, userId),
    fetchProgrammingReadinessContext(supabase, userId, programmingDays),
    includeCoachContext
      ? fetchCoachRuntimeContext(supabase, userId)
      : Promise.resolve(undefined),
    includeCoachContext
      ? fetchCoachEvidenceContext(supabase, userId, {
        purpose: 'general_coaching',
        asOf: new Date().toISOString()
      }).catch(() => undefined)
      : Promise.resolve(undefined)
  ])

  // History retrieval may outlast the passive source read. Require the same completed
  // generation after all aggregate queries before combining them into model context.
  const finalSync = await supabase.from('whoop_sync_status').select('status,last_sync_at,error_message').eq('user_id', userId).single()
  const aggregateWhoopEligible = passive.whoop_context?.syncEligible === true && !finalSync.error
    && passive.whoop_context.lastSyncAt === finalSync.data?.last_sync_at
    && isWhoopSyncEligible(passive.has_whoop, finalSync.data, Date.now())
  return {
    ...passive,
    ...(!aggregateWhoopEligible ? {
      today: { ...passive.today, latest_whoop_recovery: null, latest_whoop_strain: null },
      whoop_context: passive.whoop_context ? { ...passive.whoop_context, status: 'unavailable' as const, syncEligible: false } : undefined,
    } : {}),
    thirty_day_summary: aggregateWhoopEligible ? thirtyDaySummary
      : { ...thirtyDaySummary, whoop_avg_recovery: null, whoop_avg_sleep_score: null },
    recent_insights: recentInsights,
    data_availability: dataAvailability,
    programming_context: programmingContext,
    ...(coachContext ? { coach_context: coachContext } : {}),
    ...(coachEvidenceContext ? { coach_evidence_context: coachEvidenceContext } : {})
  }
}

// ─── Socius Fetch Helpers (private) ──────────────────────────────────

async function fetchThirtyDaySummary(
  supabase: SupabaseClient,
  userId: string
): Promise<ThirtyDaySummary> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`

  const [workoutsResult, mealsResult, prsResult, recoveryResult, sleepResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('blocks, rpe')
      .eq('user_id', userId)
      .gte('workout_date', cutoffDate),
    supabase
      .from('meals')
      .select('total_protein, total_calories, meal_timestamp')
      .eq('user_id', userId)
      .gte('meal_timestamp', thirtyDaysAgo.toISOString()),
    supabase
      .from('benchmark_prs')
      .select('id')
      .eq('user_id', userId)
      .eq('is_pr', true)
      .gte('date', cutoffDate),
    supabase
      .from('whoop_recovery')
      .select('recovery_score')
      .eq('user_id', userId)
      .gte('date', cutoffDate),
    supabase
      .from('whoop_sleep')
      .select('sleep_score')
      .eq('user_id', userId)
      .gte('date', cutoffDate)
  ])

  const workouts = workoutsResult.data ?? []
  const meals = mealsResult.data ?? []
  const prs = prsResult.data ?? []
  const recoveries = recoveryResult.data ?? []
  const sleeps = sleepResult.data ?? []

  // Aggregate workout types from blocks JSONB
  const allBlocks: WorkoutBlock[] = []
  for (const w of workouts) {
    const blocks = Array.isArray(w.blocks) ? w.blocks : []
    for (const block of blocks) {
      allBlocks.push(block as WorkoutBlock)
    }
  }
  const aggregated = aggregateWorkoutTypes(allBlocks)
  const workoutTypes = { metcon: aggregated.metcon, strength: aggregated.strength, cardio: aggregated.cardio, emom: aggregated.emom }

  // Calculate avg RPE
  const rpeValues = workouts
    .map(w => w.rpe != null ? parseFloat(w.rpe) : null)
    .filter((v): v is number => v !== null && !isNaN(v))
  const avgRpe = rpeValues.length > 0
    ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
    : null

  // Calculate avg daily protein and calories
  const mealDays = new Set(
    meals.map(m => {
      const d = new Date(m.meal_timestamp)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
  )
  const mealDayCount = mealDays.size || 1
  const totalProtein = meals.reduce((sum, m) => sum + (parseFloat(m.total_protein) || 0), 0)
  const totalCalories = meals.reduce((sum, m) => sum + (parseFloat(m.total_calories) || 0), 0)

  // WHOOP averages
  const recoveryScores = recoveries
    .map(r => parseFloat(r.recovery_score))
    .filter(v => !isNaN(v))
  const whoopAvgRecovery = recoveryScores.length > 0
    ? Math.round((recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length) * 10) / 10
    : null

  const sleepScores = sleeps
    .map(s => parseFloat(s.sleep_score))
    .filter(v => !isNaN(v))
  const whoopAvgSleepScore = sleepScores.length > 0
    ? Math.round((sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length) * 10) / 10
    : null

  return {
    workout_count: workouts.length,
    workout_types: workoutTypes,
    avg_rpe: avgRpe,
    total_meals: meals.length,
    avg_daily_protein: Math.round(totalProtein / mealDayCount),
    avg_daily_calories: Math.round(totalCalories / mealDayCount),
    pr_count: prs.length,
    whoop_avg_recovery: whoopAvgRecovery,
    whoop_avg_sleep_score: whoopAvgSleepScore
  }
}

async function fetchRecentInsightsDetailed(
  supabase: SupabaseClient,
  userId: string
): Promise<RecentInsight[]> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('insights')
    .select('id, pattern_id, priority, confidence, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data) return []
  return (data as RecentInsight[]).filter(canSurfaceLegacyInsight)
}

async function fetchDataAvailability(
  supabase: SupabaseClient,
  userId: string
): Promise<DataAvailability> {
  const [workoutsResult, mealsResult, whoopResult, targetsResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('workout_date')
      .eq('user_id', userId),
    supabase
      .from('meals')
      .select('meal_timestamp')
      .eq('user_id', userId),
    supabase
      .from('whoop_recovery')
      .select('id')
      .eq('user_id', userId)
      .limit(1),
    supabase
      .from('daily_targets')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
  ])

  const workouts = workoutsResult.data ?? []
  const meals = mealsResult.data ?? []
  const whoopData = whoopResult.data ?? []
  const targetsData = targetsResult.data ?? []

  const workoutDays = new Set(workouts.map(w => w.workout_date)).size
  const mealDays = new Set(
    meals.map(m => {
      const d = new Date(m.meal_timestamp)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
  ).size

  return {
    has_workouts: workouts.length > 0,
    has_meals: meals.length > 0,
    has_whoop: whoopData.length > 0,
    has_targets: targetsData.length > 0,
    workout_days: workoutDays,
    meal_days: mealDays
  }
}

// ─── Nutritionist Fetch Helpers (private) ────────────────────────────

async function fetchTodaysMealDetails(
  supabase: SupabaseClient,
  userId: string,
  tzOffset = 0
): Promise<MealSummary[]> {
  // Agent convention: localTime = UTC + tzOffset
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset * 60_000)
  const todayStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  // localDateToUTCStart expects raw getTimezoneOffset() convention, so negate
  const apiOffset = -tzOffset
  const startUTC = localDateToUTCStart(todayStr, apiOffset)
  const endUTC = localDateToUTCEnd(todayStr, apiOffset)

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', startUTC)
    .lt('meal_timestamp', endUTC)
    .order('meal_timestamp', { ascending: true })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    timestamp: row.meal_timestamp,
    timing: row.meal_timing ?? null,
    items: parseMealItems(row.items),
    totals: {
      protein: parseFloat(row.total_protein) || 0,
      carbs: parseFloat(row.total_carbs) || 0,
      fat: parseFloat(row.total_fat) || 0,
      calories: parseFloat(row.total_calories) || 0
    }
  }))
}

function parseMealItems(items: unknown): MealItem[] {
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    food: item.food ?? item.name ?? '',
    portion: item.portion ?? item.quantity ?? '',
    protein: parseFloat(item.protein) || 0,
    carbs: parseFloat(item.carbs) || 0,
    fat: parseFloat(item.fat) || 0,
    calories: parseFloat(item.calories) || 0
  }))
}

async function fetchUserPortionHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, string> | null> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('meals')
    .select('items')
    .eq('user_id', userId)
    .gte('meal_timestamp', thirtyDaysAgo.toISOString())
    .order('meal_timestamp', { ascending: false })
    .limit(50)

  if (error || !data || data.length === 0) return null

  const portionMap: Record<string, string> = {}
  for (const row of data) {
    const items = parseMealItems(row.items)
    for (const item of items) {
      if (item.food && item.portion && !portionMap[item.food.toLowerCase()]) {
        portionMap[item.food.toLowerCase()] = item.portion
      }
    }
  }

  return Object.keys(portionMap).length > 0 ? portionMap : null
}

// ─── Trainer Fetch Helpers (private) ─────────────────────────────────

/**
 * Normalize a raw JSONB block from the database into a valid WorkoutBlock.
 * Blocks written by older routes (e.g. parse-workout) may have null/missing
 * inner arrays. This prevents "is not iterable" errors in any downstream caller.
 */
export function normalizeBlockFromDB(block: unknown): WorkoutBlock {
  const b = (block && typeof block === 'object' ? block : {}) as Record<string, unknown>

  const validTypes = ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'] as const
  const blockType = validTypes.includes(b.block_type as typeof validTypes[number])
    ? (b.block_type as WorkoutBlock['block_type'])
    : 'FOR_TIME'

  const movements = Array.isArray(b.movements)
    ? b.movements.map((m: unknown) => {
        const mv = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
        return {
          name: typeof mv.name === 'string' ? mv.name : 'Unknown',
          reps: typeof mv.reps === 'number' ? mv.reps : undefined,
          weight: typeof mv.weight === 'string' ? mv.weight : undefined,
          distance: typeof mv.distance === 'string' ? mv.distance : undefined
        }
      })
    : []

  const rawScore = b.score && typeof b.score === 'object'
    ? (b.score as Record<string, unknown>)
    : undefined
  const score = rawScore
    ? {
        rounds: typeof rawScore.rounds === 'number' ? rawScore.rounds : undefined,
        extra_reps: typeof rawScore.extra_reps === 'number' ? rawScore.extra_reps : undefined,
        time_s: typeof rawScore.time_s === 'number' ? rawScore.time_s : undefined
      }
    : undefined

  return {
    block_type: blockType,
    duration_min: typeof b.duration_min === 'number' ? b.duration_min : undefined,
    movements,
    score,
    rx_status: b.rx_status === 'RX' || b.rx_status === 'SCALED' ? b.rx_status : undefined
  }
}

async function fetchRecentWorkouts(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<RecentWorkout[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('workouts')
    .select('id, workout_date, input_text, blocks, primary_score, rpe, tags')
    .eq('user_id', userId)
    .gte('workout_date', cutoffDate)
    .order('workout_date', { ascending: false })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    date: row.workout_date,
    input_text: row.input_text || '',
    blocks: Array.isArray(row.blocks) ? row.blocks.map(normalizeBlockFromDB) : [],
    primary_score: row.primary_score ?? null,
    rpe: row.rpe != null ? parseFloat(row.rpe) : null,
    tags: Array.isArray(row.tags) ? row.tags : []
  }))
}

async function fetchBenchmarkPRs(
  supabase: SupabaseClient,
  userId: string
): Promise<BenchmarkPR[]> {
  const { data, error } = await supabase
    .from('benchmark_prs')
    .select('benchmark_name, score_value, score_display, date, rx_status')
    .eq('user_id', userId)
    .eq('is_pr', true)
    .order('date', { ascending: false })

  if (error || !data) return []

  return data.map(row => ({
    benchmark_name: row.benchmark_name,
    score_value: parseFloat(row.score_value) || 0,
    score_display: row.score_display || '',
    date: row.date,
    rx_status: row.rx_status || 'RX'
  }))
}

async function fetchTodaysProgram(userId: string, localDate: string): Promise<string | null> {
  const supabase = await createServerClient()
  const context = await fetchCoachRuntimeContext(supabase, userId)
  return projectTodaysProgram(context, localDate, true)
}

// ─── Utility Functions (exported for testing) ────────────────────────

export function aggregateWorkoutTypes(
  blocks: WorkoutBlock[]
): { metcon: number; strength: number; cardio: number; emom: number; total: number } {
  const counts = { metcon: 0, strength: 0, cardio: 0, emom: 0 }
  for (const block of blocks) {
    const blockType = block.block_type
    if (blockType === 'AMRAP' || blockType === 'FOR_TIME') {
      counts.metcon++
    } else if (blockType === 'STRENGTH') {
      counts.strength++
    } else if (blockType === 'CARDIO') {
      counts.cardio++
    } else if (blockType === 'EMOM') {
      counts.emom++
    }
  }
  return { ...counts, total: counts.metcon + counts.strength + counts.cardio + counts.emom }
}

export function aggregateMacros(meals: MealSummary[]): MacroTotals {
  return meals.reduce(
    (acc, m) => ({
      protein: acc.protein + m.totals.protein,
      carbs: acc.carbs + m.totals.carbs,
      fat: acc.fat + m.totals.fat,
      calories: acc.calories + m.totals.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}

export function calculateRemaining(consumed: MacroTotals, targets: MacroTargets): MacroTotals {
  return {
    protein: targets.protein - consumed.protein,
    carbs: targets.carbs - consumed.carbs,
    fat: targets.fat - consumed.fat,
    calories: targets.calories - consumed.calories
  }
}

export function calculateWeekAdherence(
  weekSummaries: MacroTotals[],
  targets: MacroTargets
): UserWeeklyState {
  const daysElapsed = weekSummaries.length || 1
  const actual = weekSummaries.reduce(
    (acc, d) => ({
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
      calories: acc.calories + d.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
  const prorated = {
    protein: targets.protein * daysElapsed,
    carbs: targets.carbs * daysElapsed,
    fat: targets.fat * daysElapsed,
    calories: targets.calories * daysElapsed
  }
  const pct = {
    protein: prorated.protein > 0 ? (actual.protein / prorated.protein) * 100 : 0,
    carbs: prorated.carbs > 0 ? (actual.carbs / prorated.carbs) * 100 : 0,
    fat: prorated.fat > 0 ? (actual.fat / prorated.fat) * 100 : 0,
    calories: prorated.calories > 0 ? (actual.calories / prorated.calories) * 100 : 0
  }
  const avgPct = (pct.protein + pct.carbs + pct.fat + pct.calories) / 4
  const tol = targets.tolerance_pct
  const overall_status: UserWeeklyState['overall_status'] =
    avgPct >= (100 - tol) && avgPct <= (100 + tol)
      ? 'on-track'
      : avgPct > (100 + tol)
        ? 'ahead'
        : 'behind'

  return { days_elapsed: daysElapsed, actual, prorated_target: prorated, adherence_pct: pct, overall_status }
}

export function calculateRecoveryTrend(recoveryScores: number[]): 'improving' | 'declining' | 'stable' {
  if (recoveryScores.length < 3) return 'stable'
  const recent = recoveryScores.slice(-3)
  const earlier = recoveryScores.slice(0, 3)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
  if (recentAvg - earlierAvg > 5) return 'improving'
  if (earlierAvg - recentAvg > 5) return 'declining'
  return 'stable'
}

export function getWeekStart(date = new Date()): Date {
  const now = new Date(date)
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const weekStart = new Date(now)
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}
