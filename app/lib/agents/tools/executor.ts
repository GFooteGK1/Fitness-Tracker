import { createHash } from 'crypto'

/**
 * Tool executor — server-side execution of Claude tool calls.
 * Maps tool names to Supabase DB operations. All writes enforce RLS via user_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidatePassiveCache, normalizeBlockFromDB } from '../context-builder'
import { fetchProgrammingReadinessContext } from '../programming-context'
import type { WorkoutBlock } from '../types'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { getCoachReference } from '@/app/lib/coach/reference'
import { deriveStrengthAssessment } from '@/app/lib/coach/policy'
import type { LoadUnit, SupportedRepMax } from '@/app/lib/coach/types'
import { localDateTimeToUTC } from '@/app/lib/timezone-utils'

// ─── Types ─────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

export interface ToolExecutionContext {
  /** Agent convention: local time = UTC + tzOffset. */
  tzOffset?: number
}

// ─── Main Dispatcher ───────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_programming_readiness':
        return await executeGetProgrammingReadiness(toolInput, userId, supabase)
      case 'get_coach_state':
        return await executeGetCoachState(userId, supabase)
      case 'get_coach_reference':
        return executeGetCoachReference(toolInput)
      case 'record_strength_assessment':
        return await executeRecordStrengthAssessment(toolInput, userId, supabase)
      case 'confirm_coach_memory':
        return await executeConfirmCoachMemory(toolInput, supabase)
      case 'log_workout':
        return await executeLogWorkout(toolInput, userId, supabase)
      case 'log_pr':
        return await executeLogPR(toolInput, userId, supabase)
      case 'query_workouts':
        return await executeQueryWorkouts(toolInput, userId, supabase)
      case 'update_workout':
        return await executeUpdateWorkout(toolInput, userId, supabase)
      case 'log_meal':
        return await executeLogMeal(toolInput, userId, supabase, context?.tzOffset ?? 0)
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

// Socius Tools

async function executeGetProgrammingReadiness(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const rawDays = typeof input.days === 'number' ? input.days : 30
  const days = Math.min(Math.max(Math.floor(rawDays), 1), 90)
  const context = await fetchProgrammingReadinessContext(supabase, userId, days)

  return {
    success: true,
    data: { context }
  }
}

// ─── Workout Tools ─────────────────────────────────────────────────────

async function executeGetCoachState(
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const context = await fetchCoachRuntimeContext(supabase, userId)

  return {
    success: context.storageAvailable,
    data: { context },
    error: context.storageAvailable ? undefined : 'Coach storage is not available'
  }
}

function executeGetCoachReference(input: Record<string, unknown>): ToolResult {
  const domains = Array.isArray(input.domains) ? input.domains : []

  return {
    success: true,
    data: { reference: getCoachReference(domains) }
  }
}

async function executeRecordStrengthAssessment(
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (
    typeof input.movement !== 'string'
    || typeof input.load !== 'number'
    || typeof input.unit !== 'string'
    || typeof input.reps !== 'number'
    || typeof input.assessed_on !== 'string'
    || typeof input.is_true_rep_max !== 'boolean'
    || typeof input.athlete_confidence !== 'number'
    || typeof input.idempotency_key !== 'string'
    || input.idempotency_key.length < 8
    || input.idempotency_key.length > 200
  ) {
    return { success: false, error: 'A complete user-confirmed 1RM, 3RM, or 5RM assessment is required' }
  }

  const assessment = deriveStrengthAssessment({
    movement: input.movement,
    variation: typeof input.variation === 'string' ? input.variation : undefined,
    load: input.load,
    unit: input.unit as LoadUnit,
    reps: input.reps as SupportedRepMax,
    assessedOn: input.assessed_on,
    isTrueRepMax: input.is_true_rep_max,
    rir: typeof input.rir === 'number' ? input.rir : undefined,
    rpe: typeof input.rpe === 'number' ? input.rpe : undefined,
    athleteConfidence: input.athlete_confidence
  })

  const inputFingerprint = createHash('sha256')
    .update(JSON.stringify(assessment))
    .digest('hex')

  const { data, error } = await supabase
    .from('coach_strength_assessments')
    .insert({
      user_id: userId,
      idempotency_key: input.idempotency_key,
      input_fingerprint: inputFingerprint,
      movement: assessment.movement,
      variation: assessment.variation,
      load: assessment.sourceLoad,
      unit: assessment.unit,
      reps: assessment.sourceReps,
      assessed_on: assessment.sourceDate,
      is_true_rep_max: assessment.isTrueRepMax,
      rir: assessment.rir,
      rpe: assessment.rpe,
      athlete_confidence: assessment.athleteConfidence,
      estimated_1rm: assessment.estimatedOneRepMax,
      estimate_kind: assessment.estimateKind,
      calculator_version: assessment.calculatorVersion,
      provenance: {
        source: 'agent_tool',
        captured_at: new Date().toISOString()
      }
    })
    .select('id')
    .single()

  if (error?.code === '23505') {
    const existingResult = await supabase
      .from('coach_strength_assessments')
      .select('id, input_fingerprint')
      .eq('user_id', userId)
      .eq('idempotency_key', input.idempotency_key)
      .limit(1)

    const existing = existingResult.data?.[0] as {
      id?: string
      input_fingerprint?: string
    } | undefined

    if (existingResult.error || !existing?.id || existing.input_fingerprint !== inputFingerprint) {
      return { success: false, error: 'Assessment idempotency key was already used for different data' }
    }

    return {
      success: true,
      data: {
        assessment_id: existing.id,
        assessment,
        deduplicated: true
      }
    }
  }

  if (error || !data) {
    return { success: false, error: `Failed to store strength assessment: ${error?.message ?? 'unknown error'}` }
  }

  return {
    success: true,
    data: {
      assessment_id: data.id,
      assessment
    }
  }
}

async function executeConfirmCoachMemory(
  input: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const validKinds = new Set([
    'goal',
    'schedule',
    'equipment',
    'preference',
    'constraint',
    'limitation',
    'baseline'
  ])

  if (
    typeof input.memory_key !== 'string'
    || !/^[a-z][a-z0-9_]{0,119}$/.test(input.memory_key)
    || typeof input.kind !== 'string'
    || !validKinds.has(input.kind)
    || !isPlainRecord(input.content)
    || typeof input.confidence !== 'number'
    || input.confidence < 0
    || input.confidence > 1
    || typeof input.idempotency_key !== 'string'
    || input.idempotency_key.length < 8
    || input.idempotency_key.length > 200
  ) {
    return { success: false, error: 'A valid explicitly confirmed coach memory is required' }
  }

  const { data, error } = await supabase.rpc('confirm_coach_memory', {
    p_memory_key: input.memory_key,
    p_kind: input.kind,
    p_content: input.content,
    p_provenance: {
      source: 'agent_tool',
      captured_at: new Date().toISOString()
    },
    p_confidence: input.confidence,
    p_idempotency_key: input.idempotency_key
  })

  if (error) {
    return { success: false, error: `Failed to confirm coach memory: ${error.message}` }
  }

  const row = Array.isArray(data) ? data[0] : data
  const normalized = isPlainRecord(row) ? row : {}

  return {
    success: true,
    data: {
      memory_id: normalized.memory_id,
      memory_version: normalized.memory_version
    }
  }
}

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
  const limit = Math.min((input.limit as number) ?? 10, 200)
  const countOnly = (input.count_only as boolean) ?? false

  if (!startDate || !endDate) {
    return { success: false, error: 'start_date and end_date are required' }
  }

  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return { success: false, error: `Invalid date format. Expected YYYY-MM-DD, got start="${startDate}", end="${endDate}"` }
  }

  // Always run a count query to get the true total matching workouts
  const countQuery = supabase
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('workout_date', startDate)
    .lte('workout_date', endDate)

  // For count_only mode, skip fetching full workout data
  if (countOnly) {
    const { count, error } = await countQuery

    if (error) {
      return { success: false, error: `Failed to count workouts: ${error.message}` }
    }

    return { success: true, data: { workouts: [], total_count: count ?? 0, returned_count: 0 } }
  }

  // Run count and data queries in parallel
  const dataQuery = supabase
    .from('workouts')
    .select('id, workout_date, input_text, blocks, primary_score, rpe, tags')
    .eq('user_id', userId)
    .gte('workout_date', startDate)
    .lte('workout_date', endDate)
    .order('workout_date', { ascending: false })
    .limit(limit)

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

  if (dataResult.error) {
    return { success: false, error: `Failed to query workouts: ${dataResult.error.message}` }
  }

  const totalCount = countResult.count ?? 0

  // Normalize blocks to prevent "is not iterable" errors
  const workouts = (dataResult.data ?? []).map(w => ({
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

  return {
    success: true,
    data: {
      workouts: filtered,
      returned_count: filtered.length,
      total_count: totalCount
    }
  }
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
  supabase: SupabaseClient,
  tzOffset: number
): Promise<ToolResult> {
  const mealDate = input.meal_date as string
  const items = input.items as Array<{
    food: string; portion: string
    protein: number; carbs: number; fat: number; calories: number
  }>

  if (!mealDate || !items || items.length === 0) {
    return { success: false, error: 'meal_date and items are required' }
  }

  // Construct the stored UTC timestamp from the user's local date and time.
  const rawTime = (input.meal_time as string) ?? '12:00'
  let mealTimestamp: string
  try {
    mealTimestamp = localDateTimeToUTC(mealDate, rawTime, tzOffset)
  } catch {
    return { success: false, error: 'Invalid meal date or time' }
  }

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
  const limit = Math.min((input.limit as number) ?? 20, 200)
  const countOnly = (input.count_only as boolean) ?? false

  if (!startDate || !endDate) {
    return { success: false, error: 'start_date and end_date are required' }
  }

  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return { success: false, error: `Invalid date format. Expected YYYY-MM-DD, got start="${startDate}", end="${endDate}"` }
  }

  // Query meals within the date range (end_date + 1 day to include the full end date)
  const endDatePlusOne = new Date(endDate + 'T00:00:00Z')
  endDatePlusOne.setUTCDate(endDatePlusOne.getUTCDate() + 1)
  const endStr = `${endDatePlusOne.getUTCFullYear()}-${String(endDatePlusOne.getUTCMonth() + 1).padStart(2, '0')}-${String(endDatePlusOne.getUTCDate()).padStart(2, '0')}`

  // Always run a count query to get the true total
  const countQuery = supabase
    .from('meals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('meal_timestamp', `${startDate}T00:00:00`)
    .lt('meal_timestamp', `${endStr}T00:00:00`)

  if (countOnly) {
    const { count, error } = await countQuery

    if (error) {
      return { success: false, error: `Failed to count meals: ${error.message}` }
    }

    return { success: true, data: { meals: [], total_count: count ?? 0, returned_count: 0 } }
  }

  // Run count and data queries in parallel
  const dataQuery = supabase
    .from('meals')
    .select('id, meal_timestamp, meal_timing, items, total_protein, total_carbs, total_fat, total_calories')
    .eq('user_id', userId)
    .gte('meal_timestamp', `${startDate}T00:00:00`)
    .lt('meal_timestamp', `${endStr}T00:00:00`)
    .order('meal_timestamp', { ascending: false })
    .limit(limit)

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

  if (dataResult.error) {
    return { success: false, error: `Failed to query meals: ${dataResult.error.message}` }
  }

  return {
    success: true,
    data: {
      meals: dataResult.data ?? [],
      returned_count: (dataResult.data ?? []).length,
      total_count: countResult.count ?? 0
    }
  }
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
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
