/**
 * Tool executor — server-side execution of Claude tool calls.
 * Maps tool names to Supabase DB operations. All writes enforce RLS via user_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidatePassiveCache, normalizeBlockFromDB } from '../context-builder'
import type { WorkoutBlock } from '../types'

// ─── Types ─────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

// ─── Main Dispatcher ───────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'log_workout':
        return await executeLogWorkout(toolInput, userId, supabase)
      case 'log_pr':
        return await executeLogPR(toolInput, userId, supabase)
      case 'query_workouts':
        return await executeQueryWorkouts(toolInput, userId, supabase)
      case 'update_workout':
        return await executeUpdateWorkout(toolInput, userId, supabase)
      case 'log_meal':
        return await executeLogMeal(toolInput, userId, supabase)
      case 'query_meals':
        return await executeQueryMeals(toolInput, userId, supabase)
      case 'update_meal':
        return await executeUpdateMeal(toolInput, userId, supabase)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    console.error(`[tool-executor] ${toolName} failed:`, err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Workout Tools ─────────────────────────────────────────────────────

async function executeLogWorkout(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const workoutDate = input.workout_date as string
  const blocks = input.blocks as WorkoutBlock[]
  const inputText = (input.input_text as string) ?? ''

  if (!workoutDate || !blocks || blocks.length === 0) {
    return { success: false, error: 'workout_date and blocks are required' }
  }

  // Insert workout
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      workout_date: workoutDate,
      input_text: inputText,
      blocks,
      primary_score: (input.primary_score as string) ?? null,
      tags: (input.tags as string[]) ?? [],
      rpe: (input.rpe as number) ?? null,
      parse_confidence: 0.9
    })
    .select('id')
    .single()

  if (workoutError || !workout) {
    return { success: false, error: `Failed to insert workout: ${workoutError?.message}` }
  }

  // Insert block scores
  const blockScores = blocks.map(block => ({
    workout_id: workout.id,
    user_id: userId,
    block_type: block.block_type,
    block_title: null,
    rounds_completed: block.score?.rounds ?? null,
    extra_reps: block.score?.extra_reps ?? null,
    time_s: block.score?.time_s ?? null,
    total_reps: calculateTotalReps(block),
    tonnage_lb: calculateTonnage(block),
    rx_status: block.rx_status ?? null,
    is_pr: false
  }))

  const { error: blockError } = await supabase.from('block_scores').insert(blockScores)
  if (blockError) {
    console.error('[tool-executor] Failed to insert block_scores:', blockError)
  }

  invalidatePassiveCache(userId)
  return { success: true, data: { workout_id: workout.id } }
}

async function executeLogPR(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const benchmarkName = input.benchmark_name as string
  const scoreValue = input.score_value as number
  const scoreDisplay = input.score_display as string
  const date = input.date as string

  if (!benchmarkName || scoreValue == null || !scoreDisplay || !date) {
    return { success: false, error: 'benchmark_name, score_value, score_display, and date are required' }
  }

  const { data: pr, error } = await supabase
    .from('benchmark_prs')
    .insert({
      user_id: userId,
      benchmark_name: benchmarkName,
      date,
      score_value: scoreValue,
      score_display: scoreDisplay,
      rx_status: (input.rx_status as string) ?? 'RX',
      is_pr: true,
      workout_id: null
    })
    .select('id')
    .single()

  if (error || !pr) {
    return { success: false, error: `Failed to insert PR: ${error?.message}` }
  }

  invalidatePassiveCache(userId)
  return { success: true, data: { pr_id: pr.id } }
}

async function executeQueryWorkouts(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const startDate = input.start_date as string
  const endDate = input.end_date as string
  const limit = Math.min((input.limit as number) ?? 10, 50)

  if (!startDate || !endDate) {
    return { success: false, error: 'start_date and end_date are required' }
  }

  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return { success: false, error: `Invalid date format. Expected YYYY-MM-DD, got start="${startDate}", end="${endDate}"` }
  }

  let query = supabase
    .from('workouts')
    .select('id, workout_date, input_text, blocks, primary_score, rpe, tags')
    .eq('user_id', userId)
    .gte('workout_date', startDate)
    .lte('workout_date', endDate)
    .order('workout_date', { ascending: false })
    .limit(limit)

  const { data, error } = await query

  if (error) {
    return { success: false, error: `Failed to query workouts: ${error.message}` }
  }

  // Normalize blocks to prevent "is not iterable" errors
  const workouts = (data ?? []).map(w => ({
    ...w,
    blocks: Array.isArray(w.blocks)
      ? (w.blocks as unknown[]).map(normalizeBlockFromDB)
      : []
  }))

  // Apply optional movement filter client-side (JSONB containment is complex)
  const movement = input.movement as string | undefined
  const blockType = input.block_type as string | undefined
  let filtered = workouts

  if (movement) {
    const needle = movement.toLowerCase()
    filtered = filtered.filter(w =>
      w.blocks.some((b: WorkoutBlock) =>
        b.movements.some(m => m.name.toLowerCase().includes(needle))
      )
    )
  }

  if (blockType) {
    filtered = filtered.filter(w =>
      w.blocks.some((b: WorkoutBlock) => b.block_type === blockType)
    )
  }

  return { success: true, data: { workouts: filtered, count: filtered.length } }
}

async function executeUpdateWorkout(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const workoutId = input.workout_id as string
  if (!workoutId) {
    return { success: false, error: 'workout_id is required' }
  }

  const updateData: Record<string, unknown> = {}
  if (input.primary_score !== undefined) updateData.primary_score = input.primary_score
  if (input.rpe !== undefined) updateData.rpe = input.rpe
  if (input.tags !== undefined) updateData.tags = input.tags
  if (input.notes !== undefined) updateData.notes = input.notes

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'No fields provided to update' }
  }

  const { error } = await supabase
    .from('workouts')
    .update(updateData)
    .eq('id', workoutId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: `Failed to update workout: ${error.message}` }
  }

  invalidatePassiveCache(userId)
  return { success: true, data: { workout_id: workoutId } }
}

// ─── Meal Tools ────────────────────────────────────────────────────────

/**
 * Normalize meal timing from agent format to DB constraint format.
 * DB constraint: 'pre_workout' | 'post_workout' | 'general' | 'recovery'
 * Agent sends: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'PRE_WORKOUT' | 'POST_WORKOUT'
 */
export function normalizeMealTiming(timing: string | undefined): string {
  if (!timing) return 'general'
  const upper = timing.toUpperCase()
  switch (upper) {
    case 'PRE_WORKOUT': return 'pre_workout'
    case 'POST_WORKOUT': return 'post_workout'
    case 'RECOVERY': return 'recovery'
    default: return 'general' // BREAKFAST, LUNCH, DINNER, SNACK → general
  }
}

async function executeLogMeal(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const mealDate = input.meal_date as string
  const items = input.items as Array<{
    food: string; portion: string
    protein: number; carbs: number; fat: number; calories: number
  }>

  if (!mealDate || !items || items.length === 0) {
    return { success: false, error: 'meal_date and items are required' }
  }

  // Construct timestamp from date + optional time.
  // Validate and normalize meal_time to HH:MM format, then append UTC suffix.
  const rawTime = (input.meal_time as string) ?? '12:00'
  const timeParts = rawTime.match(/^(\d{1,2}):(\d{2})/)
  const mealTime = timeParts
    ? `${timeParts[1].padStart(2, '0')}:${timeParts[2]}`
    : '12:00'
  const mealTimestamp = `${mealDate}T${mealTime}:00Z`

  // Calculate totals from items
  const totals = items.reduce(
    (acc, item) => ({
      protein: acc.protein + (item.protein ?? 0),
      carbs: acc.carbs + (item.carbs ?? 0),
      fat: acc.fat + (item.fat ?? 0),
      calories: acc.calories + (item.calories ?? 0)
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )

  const timing = normalizeMealTiming(input.timing as string)

  const { data: meal, error } = await supabase
    .from('meals')
    .insert({
      user_id: userId,
      meal_timestamp: mealTimestamp,
      meal_timing: timing,
      items,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fat: totals.fat,
      total_calories: totals.calories,
      input_text: (input.input_text as string) ?? null,
      needs_review: false,
      ai_confidence: 0.9
    })
    .select('id')
    .single()

  if (error || !meal) {
    return { success: false, error: `Failed to insert meal: ${error?.message}` }
  }

  invalidatePassiveCache(userId)
  return { success: true, data: { meal_id: meal.id, totals } }
}

async function executeQueryMeals(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const startDate = input.start_date as string
  const endDate = input.end_date as string
  const limit = Math.min((input.limit as number) ?? 20, 50)

  if (!startDate || !endDate) {
    return { success: false, error: 'start_date and end_date are required' }
  }

  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return { success: false, error: `Invalid date format. Expected YYYY-MM-DD, got start="${startDate}", end="${endDate}"` }
  }

  // Query meals within the date range (end_date + 1 day to include the full end date)
  const endDatePlusOne = new Date(endDate)
  endDatePlusOne.setDate(endDatePlusOne.getDate() + 1)
  const endStr = endDatePlusOne.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', `${startDate}T00:00:00`)
    .lt('meal_timestamp', `${endStr}T00:00:00`)
    .order('meal_timestamp', { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false, error: `Failed to query meals: ${error.message}` }
  }

  return { success: true, data: { meals: data ?? [], count: (data ?? []).length } }
}

async function executeUpdateMeal(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const mealId = input.meal_id as string
  if (!mealId) {
    return { success: false, error: 'meal_id is required' }
  }

  const updateData: Record<string, unknown> = {}

  if (input.timing !== undefined) {
    updateData.meal_timing = normalizeMealTiming(input.timing as string)
  }

  if (input.items !== undefined) {
    const items = input.items as Array<{
      food: string; portion: string
      protein: number; carbs: number; fat: number; calories: number
    }>
    updateData.items = items

    // Recalculate totals
    const totals = items.reduce(
      (acc, item) => ({
        protein: acc.protein + (item.protein ?? 0),
        carbs: acc.carbs + (item.carbs ?? 0),
        fat: acc.fat + (item.fat ?? 0),
        calories: acc.calories + (item.calories ?? 0)
      }),
      { protein: 0, carbs: 0, fat: 0, calories: 0 }
    )
    updateData.total_protein = totals.protein
    updateData.total_carbs = totals.carbs
    updateData.total_fat = totals.fat
    updateData.total_calories = totals.calories
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'No fields provided to update' }
  }

  updateData.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('meals')
    .update(updateData)
    .eq('id', mealId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: `Failed to update meal: ${error.message}` }
  }

  invalidatePassiveCache(userId)
  return { success: true, data: { meal_id: mealId } }
}

// ─── Date Validation ────────────────────────────────────────────────────

/** Validate YYYY-MM-DD date string. Returns true if valid. */
function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00Z')
  return !isNaN(d.getTime())
}

// ─── Helpers (reused from trainer-agent.ts patterns) ───────────────────

function calculateTotalReps(block: WorkoutBlock): number | null {
  if (block.score?.rounds != null) {
    const repsPerRound = (Array.isArray(block.movements) ? block.movements : [])
      .reduce((sum, m) => sum + (m.reps ?? 0), 0)
    return (block.score.rounds * repsPerRound) + (block.score.extra_reps ?? 0)
  }
  const totalFromMovements = (Array.isArray(block.movements) ? block.movements : [])
    .reduce((sum, m) => sum + (m.reps ?? 0), 0)
  return totalFromMovements > 0 ? totalFromMovements : null
}

function calculateTonnage(block: WorkoutBlock): number | null {
  let tonnage = 0
  for (const movement of (Array.isArray(block.movements) ? block.movements : [])) {
    if (movement.weight && movement.reps) {
      const weightNum = parseWeight(movement.weight)
      if (weightNum > 0) {
        tonnage += weightNum * movement.reps
      }
    }
  }
  return tonnage > 0 ? tonnage : null
}

function parseWeight(weight: string): number {
  const match = weight.match(/(\d+(?:\.\d+)?)\s*(lb|kg|#)?/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] ?? 'lb').toLowerCase()
  if (unit === 'kg') return value * 2.205
  return value
}
