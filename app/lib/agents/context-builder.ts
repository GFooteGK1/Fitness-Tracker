import { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  PassiveContext, TrainerContext, NutritionistContext, SociusContext,
  MacroTotals, MacroTargets, WorkoutBlock,
  UserWeeklyState, MealSummary, MealItem, ChatMessage, RecentInsight,
  RecentWorkout, BenchmarkPR, ThirtyDaySummary, DataAvailability
} from './types'
import { MOVEMENT_ALIASES, PORTION_DEFAULTS } from './constants'
import { fetchRecentChat, fetchPendingUrgentInsights } from './chat-persistence'

// ─── Default Targets ─────────────────────────────────────────────────

const DEFAULT_TARGETS: MacroTargets = {
  protein: 150,
  carbs: 200,
  fat: 65,
  calories: 2000,
  tolerance_pct: 10
}

// ─── Base Context Builder ────────────────────────────────────────────

export async function buildPassiveContext(userId: string): Promise<PassiveContext> {
  const supabase = await createServerClient()

  const [targets, todaysMeals, todaysWorkouts, whoopRecovery, whoopStrain,
         recentChat, pendingInsights, weekSummaries] = await Promise.all([
    fetchDailyTargets(supabase, userId),
    fetchTodaysMeals(supabase, userId),
    fetchTodaysWorkouts(supabase, userId),
    fetchLatestWhoopRecovery(supabase, userId),
    fetchLatestWhoopStrain(supabase, userId),
    fetchRecentChat(supabase, userId, 20),
    fetchPendingInsightsForContext(supabase, userId),
    fetchWeekToDateSummaries(supabase, userId)
  ])

  const consumed = aggregateMacros(todaysMeals)
  const remaining = calculateRemaining(consumed, targets)
  const week = calculateWeekAdherence(weekSummaries, targets)
  const now = new Date()

  return {
    user_id: userId,
    targets,
    today: {
      meals_logged: todaysMeals.length,
      macros_consumed: consumed,
      macros_remaining: remaining,
      workouts_logged: todaysWorkouts.length,
      latest_whoop_recovery: whoopRecovery?.score ?? null,
      latest_whoop_strain: whoopStrain?.score ?? null
    },
    week,
    recent_chat: recentChat,
    pending_insights: pendingInsights,
    current_time: now.toISOString(),
    day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
    has_whoop: whoopRecovery !== null || whoopStrain !== null
  }
}

// ─── Fetch Helpers (private) ─────────────────────────────────────────

async function fetchDailyTargets(
  supabase: SupabaseClient,
  userId: string
): Promise<MacroTargets> {
  const { data, error } = await supabase
    .from('daily_targets')
    .select('target_protein, target_carbs, target_fat, target_calories, tolerance_pct')
    .eq('user_id', userId)
    .single()

  if (error || !data) return { ...DEFAULT_TARGETS }

  return {
    protein: parseFloat(data.target_protein) || DEFAULT_TARGETS.protein,
    carbs: parseFloat(data.target_carbs) || DEFAULT_TARGETS.carbs,
    fat: parseFloat(data.target_fat) || DEFAULT_TARGETS.fat,
    calories: parseFloat(data.target_calories) || DEFAULT_TARGETS.calories,
    tolerance_pct: parseFloat(data.tolerance_pct) || DEFAULT_TARGETS.tolerance_pct
  }
}

async function fetchTodaysMeals(
  supabase: SupabaseClient,
  userId: string
): Promise<MealSummary[]> {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', startOfDay)
    .lt('meal_timestamp', endOfDay)
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
  userId: string
): Promise<{ id: string }[]> {
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('workout_date', today)

  if (error || !data) return []
  return data
}

async function fetchLatestWhoopRecovery(
  supabase: SupabaseClient,
  userId: string
): Promise<{ score: number } | null> {
  const { data, error } = await supabase
    .from('whoop_recovery')
    .select('recovery_score')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return { score: data.recovery_score }
}

async function fetchLatestWhoopStrain(
  supabase: SupabaseClient,
  userId: string
): Promise<{ score: number } | null> {
  const { data, error } = await supabase
    .from('whoop_cycles')
    .select('strain_score')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return { score: data.strain_score }
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
  return data as RecentInsight[]
}

async function fetchWeekToDateSummaries(
  supabase: SupabaseClient,
  userId: string
): Promise<MacroTotals[]> {
  const weekStart = getWeekStart()

  const { data, error } = await supabase
    .from('daily_summaries')
    .select('total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('date', weekStart.toISOString().split('T')[0])
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

export async function buildTrainerContext(userId: string): Promise<TrainerContext> {
  const supabase = await createServerClient()

  const [passive, recentWorkouts, benchmarkPrs, todaysProgram] = await Promise.all([
    buildPassiveContext(userId),
    fetchRecentWorkouts(supabase, userId, 7),
    fetchBenchmarkPRs(supabase, userId),
    fetchTodaysProgram(userId)
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

export async function buildNutritionistContext(userId: string): Promise<NutritionistContext> {
  const supabase = await createServerClient()

  const [passive, todaysMeals, portionHistory] = await Promise.all([
    buildPassiveContext(userId),
    fetchTodaysMealDetails(supabase, userId),
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

export async function buildSociusContext(userId: string): Promise<SociusContext> {
  const supabase = await createServerClient()

  const [passive, thirtyDaySummary, recentInsights, dataAvailability] = await Promise.all([
    buildPassiveContext(userId),
    fetchThirtyDaySummary(supabase, userId),
    fetchRecentInsightsDetailed(supabase, userId),
    fetchDataAvailability(supabase, userId)
  ])

  return {
    ...passive,
    thirty_day_summary: thirtyDaySummary,
    recent_insights: recentInsights,
    data_availability: dataAvailability
  }
}

// ─── Socius Fetch Helpers (private) ──────────────────────────────────

async function fetchThirtyDaySummary(
  supabase: SupabaseClient,
  userId: string
): Promise<ThirtyDaySummary> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffDate = thirtyDaysAgo.toLocaleDateString('en-CA') // YYYY-MM-DD

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
    meals.map(m => new Date(m.meal_timestamp).toLocaleDateString('en-CA'))
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
  return data as RecentInsight[]
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
    meals.map(m => new Date(m.meal_timestamp).toLocaleDateString('en-CA'))
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
  userId: string
): Promise<MealSummary[]> {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', startOfDay)
    .lt('meal_timestamp', endOfDay)
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

async function fetchRecentWorkouts(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<RecentWorkout[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffDate = cutoff.toLocaleDateString('en-CA') // YYYY-MM-DD

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
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
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

async function fetchTodaysProgram(userId: string): Promise<string | null> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL
  if (!csvUrl) return null

  try {
    const response = await fetch(csvUrl, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null

    const text = await response.text()
    if (!text.trim()) return null

    return text
  } catch {
    return null
  }
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

export function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const weekStart = new Date(now)
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}
