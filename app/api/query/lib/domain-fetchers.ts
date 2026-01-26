/**
 * Domain Fetchers for Holistic Query System
 * Fetches workout, nutrition, WHOOP, and cross-domain data based on query intent
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.6, 6.6
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { WorkoutData, NutritionData, CrossDomainData, TimeWindow } from './types'
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from '@/app/lib/types/whoop'

/**
 * WHOOP data structure for query context
 */
export interface WhoopData {
  recovery: WhoopRecovery[]
  sleep: WhoopSleep[]
  cycles: WhoopCycle[]
  hasData: boolean
}

/**
 * Fetches WHOOP data for a user within a time window
 * Requirements: 6.6
 * 
 * @param supabase - Supabase client instance
 * @param userId - Authenticated user's ID
 * @param timeWindow - Start and end dates for data retrieval
 * @returns WhoopData containing recovery, sleep, and cycle data
 */
export async function fetchWhoopData(
  supabase: SupabaseClient,
  userId: string,
  timeWindow: TimeWindow
): Promise<WhoopData> {
  const startDate = timeWindow.start.toISOString().split('T')[0]
  const endDate = timeWindow.end.toISOString().split('T')[0]

  // Fetch all WHOOP data in parallel
  const [recoveryResult, sleepResult, cyclesResult] = await Promise.all([
    supabase
      .from('whoop_recovery')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false }),
    
    supabase
      .from('whoop_sleep')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false }),
    
    supabase
      .from('whoop_cycles')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
  ])

  const recovery = recoveryResult.data || []
  const sleep = sleepResult.data || []
  const cycles = cyclesResult.data || []

  return {
    recovery,
    sleep,
    cycles,
    hasData: recovery.length > 0 || sleep.length > 0 || cycles.length > 0
  }
}

/**
 * Fetches workout data for a user within a time window
 * Requirements: 2.1, 2.4, 2.5, 2.6
 * 
 * @param supabase - Supabase client instance
 * @param userId - Authenticated user's ID
 * @param timeWindow - Start and end dates for data retrieval
 * @returns WorkoutData containing workouts and benchmark PRs
 */
export async function fetchWorkoutData(
  supabase: SupabaseClient,
  userId: string,
  timeWindow: TimeWindow
): Promise<WorkoutData> {
  // Query workouts table for required fields
  const { data: workoutsData, error: workoutsError } = await supabase
    .from('workouts')
    .select('workout_date, input_text, primary_score, blocks, rpe, tags')
    .eq('user_id', userId)
    .gte('workout_date', timeWindow.start.toISOString().split('T')[0])
    .lte('workout_date', timeWindow.end.toISOString().split('T')[0])
    .order('workout_date', { ascending: false })

  if (workoutsError) {
    throw new Error(`Failed to fetch workouts: ${workoutsError.message}`)
  }

  // Query benchmark_prs table for PR data
  const { data: prsData, error: prsError } = await supabase
    .from('benchmark_prs')
    .select('benchmark_name, date, score_value, score_display, rx_status')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  if (prsError) {
    throw new Error(`Failed to fetch benchmark PRs: ${prsError.message}`)
  }

  return {
    workouts: (workoutsData || []).map(w => ({
      workout_date: w.workout_date,
      input_text: w.input_text || '',
      primary_score: w.primary_score,
      blocks: w.blocks,
      rpe: w.rpe,
      tags: w.tags || []
    })),
    benchmarkPrs: (prsData || []).map(pr => ({
      benchmark_name: pr.benchmark_name,
      date: pr.date,
      score_value: pr.score_value,
      score_display: pr.score_display,
      rx_status: pr.rx_status
    }))
  }
}


/**
 * Fetches nutrition data for a user within a time window
 * Requirements: 2.2, 2.4, 2.5, 2.7
 * 
 * @param supabase - Supabase client instance
 * @param userId - Authenticated user's ID
 * @param timeWindow - Start and end dates for data retrieval
 * @param tzOffset - Client timezone offset in minutes (optional)
 * @returns NutritionData containing meals, daily targets, and daily summaries
 */
export async function fetchNutritionData(
  supabase: SupabaseClient,
  userId: string,
  timeWindow: TimeWindow,
  tzOffset: number = 0
): Promise<NutritionData> {
  // Query meals table for required fields including meal_timing
  // Note: meal_name doesn't exist in schema, we'll derive it from items or use a default
  const { data: mealsData, error: mealsError } = await supabase
    .from('meals')
    .select('meal_timestamp, items, total_protein, total_carbs, total_fat, total_calories, meal_timing')
    .eq('user_id', userId)
    .gte('meal_timestamp', timeWindow.start.toISOString())
    .lte('meal_timestamp', timeWindow.end.toISOString())
    .order('meal_timestamp', { ascending: false })

  if (mealsError) {
    throw new Error(`Failed to fetch meals: ${mealsError.message}`)
  }

  // Query daily_targets for current targets (most recent)
  const { data: targetsData, error: targetsError } = await supabase
    .from('daily_targets')
    .select('target_protein, target_carbs, target_fat, target_calories')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  // Handle case where no targets exist (not an error)
  let dailyTargets = null
  if (!targetsError && targetsData) {
    dailyTargets = {
      target_protein: parseFloat(targetsData.target_protein),
      target_carbs: parseFloat(targetsData.target_carbs),
      target_fat: parseFloat(targetsData.target_fat),
      target_calories: parseFloat(targetsData.target_calories)
    }
  }

  // Calculate daily summaries from meals data using timezone offset
  const dailySummaries = calculateDailySummaries(mealsData || [], tzOffset)

  return {
    meals: (mealsData || []).map(m => {
      // Derive meal_name from items if available, otherwise use timestamp-based name
      let mealName = 'Meal';
      if (m.items && Array.isArray(m.items) && m.items.length > 0) {
        // Use first item name or combine first few items
        const itemNames = m.items.slice(0, 3).map((item: any) => item.name || item.food_name || 'Unknown').filter(Boolean);
        mealName = itemNames.length > 0 ? itemNames.join(', ') : 'Meal';
      } else {
        // Derive from timestamp (e.g., "Breakfast", "Lunch", "Dinner")
        const hour = new Date(m.meal_timestamp).getHours();
        if (hour >= 5 && hour < 11) mealName = 'Breakfast';
        else if (hour >= 11 && hour < 15) mealName = 'Lunch';
        else if (hour >= 15 && hour < 18) mealName = 'Snack';
        else if (hour >= 18 && hour < 22) mealName = 'Dinner';
        else mealName = 'Late Night Snack';
      }
      
      return {
        meal_timestamp: m.meal_timestamp,
        meal_name: mealName,
        total_protein: parseFloat(m.total_protein) || 0,
        total_carbs: parseFloat(m.total_carbs) || 0,
        total_fat: parseFloat(m.total_fat) || 0,
        total_calories: parseFloat(m.total_calories) || 0,
        meal_timing: m.meal_timing
      };
    }),
    dailyTargets,
    dailySummaries
  }
}

/**
 * Calculates daily summaries from meal data
 * Groups meals by LOCAL date using the provided timezone offset
 * @param meals - Array of meal records
 * @param tzOffset - Client timezone offset in minutes (e.g., 360 for CST/UTC-6)
 */
function calculateDailySummaries(meals: any[], tzOffset: number = 0): NutritionData['dailySummaries'] {
  const summaryMap = new Map<string, {
    total_protein: number
    total_carbs: number
    total_fat: number
    total_calories: number
    meal_count: number
  }>()

  for (const meal of meals) {
    // Parse the UTC timestamp and adjust for user's timezone
    const utcTimestamp = new Date(meal.meal_timestamp)
    // Subtract offset to convert UTC to local time
    // (offset is positive for timezones behind UTC, e.g., 360 for CST)
    const localTimestamp = new Date(utcTimestamp.getTime() - tzOffset * 60000)
    
    // Format as YYYY-MM-DD
    const year = localTimestamp.getUTCFullYear()
    const month = String(localTimestamp.getUTCMonth() + 1).padStart(2, '0')
    const day = String(localTimestamp.getUTCDate()).padStart(2, '0')
    const date = `${year}-${month}-${day}`
    
    const existing = summaryMap.get(date) || {
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      total_calories: 0,
      meal_count: 0
    }

    summaryMap.set(date, {
      total_protein: existing.total_protein + (parseFloat(meal.total_protein) || 0),
      total_carbs: existing.total_carbs + (parseFloat(meal.total_carbs) || 0),
      total_fat: existing.total_fat + (parseFloat(meal.total_fat) || 0),
      total_calories: existing.total_calories + (parseFloat(meal.total_calories) || 0),
      meal_count: existing.meal_count + 1
    })
  }

  return Array.from(summaryMap.entries())
    .map(([date, summary]) => ({
      date,
      ...summary
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}


/**
 * Fetches cross-domain data combining workout, nutrition, and WHOOP data
 * Requirements: 2.3, 5.6, 6.6
 * 
 * @param supabase - Supabase client instance
 * @param userId - Authenticated user's ID
 * @param timeWindow - Start and end dates for data retrieval
 * @param tzOffset - Client timezone offset in minutes (optional)
 * @returns CrossDomainData containing workout, nutrition, and WHOOP data
 */
export async function fetchCrossDomainData(
  supabase: SupabaseClient,
  userId: string,
  timeWindow: TimeWindow,
  tzOffset: number = 0
): Promise<CrossDomainData & { whoop?: WhoopData }> {
  // Fetch all domains in parallel for efficiency
  const [workoutData, nutritionData, whoopData] = await Promise.all([
    fetchWorkoutData(supabase, userId, timeWindow),
    fetchNutritionData(supabase, userId, timeWindow, tzOffset),
    fetchWhoopData(supabase, userId, timeWindow)
  ])

  return {
    workout: workoutData,
    nutrition: nutritionData,
    whoop: whoopData.hasData ? whoopData : undefined
  }
}

/**
 * Creates a default time window (6 months from now)
 * @param days - Number of days to look back (default: 180)
 * @returns TimeWindow with start and end dates
 */
export function createDefaultTimeWindow(days: number = 180): TimeWindow {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start, end }
}
