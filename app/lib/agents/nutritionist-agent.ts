import { saveActivity, loggingContext } from '@/app/lib/logging/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NutritionistContext,
  NutritionistResponse,
  MealItem,
  MacroTotals,
  MealTiming,
  SmartDefault
} from './types'
import { buildNutritionistPrompt } from './prompts/nutritionist'
import { PORTION_DEFAULTS } from './constants'
import { complete } from '@/app/lib/llm/client'
import { callAgentWithTools, type AgenticCallResult, type ToolCallRecord } from './tools/agentic-loop'
import { NUTRITIONIST_TOOLS } from './tools/definitions'
import { normalizeMealTiming } from './tools/executor'
import {
  buildUserFriendlyError,
  cleanResponseForParsing,
  hashUserInput,
  logParsingError
} from './error-handling'

/** Valid meal timing values */
const VALID_TIMINGS: MealTiming[] = [
  'PRE_WORKOUT', 'POST_WORKOUT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'
]

/** Extended response that includes tool call metadata */
export interface NutritionistResponseWithTools extends NutritionistResponse {
  _toolCalls?: ToolCallRecord[]
}

/**
 * Call the Nutritionist agent with context and user input.
 * Uses the agentic loop with tool_use for DB operations (log meal, query history).
 * Falls back to JSON parsing when no tools are used (pure questions).
 *
 * Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.8, 3.9
 */
export async function callNutritionistAgent(
  ctx: NutritionistContext,
  userInput: string,
  supabase?: SupabaseClient,
  userId?: string,
  tzOffset = 0
): Promise<NutritionistResponseWithTools> {
  const systemPrompt = buildNutritionistPrompt(ctx)

  // If supabase and userId are provided, use the agentic loop with tools
  if (supabase && userId) {
    const result = await callAgentWithTools({
      systemPrompt,
      userInput,
      tools: NUTRITIONIST_TOOLS,
      userId,
      supabase,
      tzOffset,
      maxRounds: 3
    })

    return buildNutritionistResponseFromToolResult(result, ctx)
  }

  // Fallback: single-shot call without tools (backward compatibility)
  const llmResult = await complete({
    purpose: 'agent',
    maxTokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
    timeoutMs: 30_000
  })

  const parsed = parseNutritionistResponse(llmResult.text)
  const withTiming = applyTimingInference(parsed, ctx)
  const withDefaults = applyPortionDefaults(withTiming, ctx)
  const validated = validateAndFlag(withDefaults)

  return validated
}

/**
 * Build a NutritionistResponse from the agentic loop result.
 * If tools were used (log_meal), extract data from tool calls.
 * If no tools were used, try JSON parsing on the text response.
 */
function buildNutritionistResponseFromToolResult(
  result: AgenticCallResult,
  ctx: NutritionistContext
): NutritionistResponseWithTools {
  const hasToolCalls = result.toolCalls.length > 0
  const mealCall = result.toolCalls.find(tc => tc.name === 'log_meal' && tc.result.success)

  // If tools were used, build response from tool data
  if (hasToolCalls && mealCall) {
    const items = (mealCall.input.items as MealItem[]) ?? []
    const totals = (mealCall.result.data?.totals as MacroTotals) ?? {
      protein: 0, carbs: 0, fat: 0, calories: 0
    }

    // Only adjust today's remaining budget if the meal was logged for today.
    // Backdated meals (e.g. "I ate pizza yesterday") shouldn't affect today's budget.
    const mealDate = mealCall.input.meal_date as string
    const isToday = mealDate === ctx.current_date

    return {
      message: result.text || 'Meal logged.',
      meal: {
        items,
        totals,
        timing: (mealCall.input.timing as MealTiming) ?? 'LUNCH'
      },
      remaining_budget: isToday
        ? {
            protein: Math.max(0, ctx.targets.protein - (ctx.today.macros_consumed.protein + totals.protein)),
            carbs: Math.max(0, ctx.targets.carbs - (ctx.today.macros_consumed.carbs + totals.carbs)),
            fat: Math.max(0, ctx.targets.fat - (ctx.today.macros_consumed.fat + totals.fat)),
            calories: Math.max(0, ctx.targets.calories - (ctx.today.macros_consumed.calories + totals.calories))
          }
        : {
            protein: Math.max(0, ctx.targets.protein - ctx.today.macros_consumed.protein),
            carbs: Math.max(0, ctx.targets.carbs - ctx.today.macros_consumed.carbs),
            fat: Math.max(0, ctx.targets.fat - ctx.today.macros_consumed.fat),
            calories: Math.max(0, ctx.targets.calories - ctx.today.macros_consumed.calories)
          },
      week_status: ctx.week,
      smart_defaults: [],
      confidence: 0.9,
      _toolCalls: result.toolCalls
    }
  }

  // No meal tools used — try JSON parsing (question response or fallback)
  const parsed = parseNutritionistResponse(result.text)
  const withTiming = applyTimingInference(parsed, ctx)
  const withDefaults = applyPortionDefaults(withTiming, ctx)
  const validated = validateAndFlag(withDefaults)
  return { ...validated, _toolCalls: result.toolCalls }
}

/**
 * Parse the raw LLM text into a NutritionistResponse.
 * Handles markdown code fences and malformed JSON gracefully.
 */
export function parseNutritionistResponse(raw: string, userInput = ''): NutritionistResponse {
  const cleaned = cleanResponseForParsing(raw)
  try {
    const parsed = JSON.parse(cleaned)
    return {
      message: typeof parsed.message === 'string' ? parsed.message : 'Meal received.',
      meal: parsed.meal ? normalizeMeal(parsed.meal) : undefined,
      remaining_budget: normalizeMacroTotals(parsed.remaining_budget),
      week_status: normalizeWeekStatus(parsed.week_status),
      smart_defaults: Array.isArray(parsed.smart_defaults) ? parsed.smart_defaults : [],
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5
    }
  } catch (error) {
    logParsingError('nutritionist', raw, hashUserInput(userInput), error)

    return {
      message: buildUserFriendlyError('nutritionist', error, raw),
      remaining_budget: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      week_status: {
        days_elapsed: 0,
        actual: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        prorated_target: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        adherence_pct: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        overall_status: 'on-track'
      },
      smart_defaults: [],
      confidence: 0.3
    }
  }
}

/**
 * Normalize a meal object from the LLM response to ensure type safety.
 */
function normalizeMeal(meal: Record<string, unknown>): NutritionistResponse['meal'] {
  const items = Array.isArray(meal.items)
    ? meal.items.map(normalizeMealItem)
    : []

  const totals = normalizeMacroTotals(meal.totals as Record<string, unknown> | undefined)

  const timing = typeof meal.timing === 'string' && VALID_TIMINGS.includes(meal.timing as MealTiming)
    ? (meal.timing as MealTiming)
    : 'SNACK' // fallback — will be overridden by timing inference

  return { items, totals, timing }
}

function normalizeMealItem(item: Record<string, unknown>): MealItem {
  return {
    food: typeof item.food === 'string' ? item.food : 'Unknown food',
    portion: typeof item.portion === 'string' ? item.portion : 'standard serving',
    protein: typeof item.protein === 'number' ? item.protein : 0,
    carbs: typeof item.carbs === 'number' ? item.carbs : 0,
    fat: typeof item.fat === 'number' ? item.fat : 0,
    calories: typeof item.calories === 'number' ? item.calories : 0
  }
}

function normalizeMacroTotals(totals: Record<string, unknown> | undefined): MacroTotals {
  if (!totals || typeof totals !== 'object') {
    return { protein: 0, carbs: 0, fat: 0, calories: 0 }
  }
  return {
    protein: typeof totals.protein === 'number' ? totals.protein : 0,
    carbs: typeof totals.carbs === 'number' ? totals.carbs : 0,
    fat: typeof totals.fat === 'number' ? totals.fat : 0,
    calories: typeof totals.calories === 'number' ? totals.calories : 0
  }
}

function normalizeWeekStatus(ws: Record<string, unknown> | undefined): NutritionistResponse['week_status'] {
  if (!ws || typeof ws !== 'object') {
    return {
      days_elapsed: 0,
      actual: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      prorated_target: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      adherence_pct: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      overall_status: 'on-track'
    }
  }

  const adherence = ws.adherence_pct as Record<string, unknown> | undefined
  const validStatuses = ['on-track', 'ahead', 'behind'] as const
  const status = typeof ws.overall_status === 'string' && validStatuses.includes(ws.overall_status as typeof validStatuses[number])
    ? (ws.overall_status as 'on-track' | 'ahead' | 'behind')
    : 'on-track'

  return {
    days_elapsed: typeof ws.days_elapsed === 'number' ? ws.days_elapsed : 0,
    actual: normalizeMacroTotals(ws.actual as Record<string, unknown> | undefined),
    prorated_target: normalizeMacroTotals(ws.prorated_target as Record<string, unknown> | undefined),
    adherence_pct: adherence && typeof adherence === 'object'
      ? {
          protein: typeof adherence.protein === 'number' ? adherence.protein : 0,
          carbs: typeof adherence.carbs === 'number' ? adherence.carbs : 0,
          fat: typeof adherence.fat === 'number' ? adherence.fat : 0,
          calories: typeof adherence.calories === 'number' ? adherence.calories : 0
        }
      : { protein: 0, carbs: 0, fat: 0, calories: 0 },
    overall_status: status
  }
}

/**
 * Infer meal_timing from time of day and workout proximity.
 *
 * Rules:
 * - Within 2 hours before a logged workout → PRE_WORKOUT
 * - Within 2 hours after a logged workout → POST_WORKOUT
 * - Before 10:00 AM → BREAKFAST
 * - 10:00 AM – 1:00 PM → LUNCH
 * - 1:00 PM – 4:00 PM → SNACK
 * - 4:00 PM – 8:00 PM → DINNER
 * - After 8:00 PM → SNACK
 *
 * Workout proximity overrides time-of-day rules.
 *
 * Validates: Requirement 3.9
 */
export function inferMealTiming(
  timestamp: string,
  workoutsToday: number
): MealTiming | null {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return null

  const hour = date.getUTCHours()

  // Workout proximity override: if workouts were logged today,
  // check time-based heuristic for pre/post workout
  if (workoutsToday > 0) {
    // Heuristic: morning workouts (5-9am) → meals 7-11am are POST_WORKOUT
    // Afternoon workouts (3-6pm) → meals 1-3pm are PRE_WORKOUT, 5-8pm are POST_WORKOUT
    // This is a simplified heuristic since we don't have exact workout times
    if (hour >= 5 && hour < 8) return 'PRE_WORKOUT'
    if (hour >= 8 && hour < 11 && workoutsToday > 0) return 'POST_WORKOUT'
    if (hour >= 15 && hour < 17) return 'PRE_WORKOUT'
    if (hour >= 17 && hour < 20) return 'POST_WORKOUT'
  }

  // Time-of-day rules
  if (hour < 10) return 'BREAKFAST'
  if (hour >= 10 && hour < 13) return 'LUNCH'
  if (hour >= 13 && hour < 16) return 'SNACK'
  if (hour >= 16 && hour < 20) return 'DINNER'
  return 'SNACK' // After 8 PM
}

/**
 * Apply timing inference to the response if the LLM didn't set a meaningful timing.
 */
function applyTimingInference(
  response: NutritionistResponse,
  ctx: NutritionistContext
): NutritionistResponse {
  if (!response.meal) return response

  // If the LLM already set a timing from user input, keep it
  // Only infer if timing is the fallback 'SNACK' or missing
  const currentTiming = response.meal.timing
  const inferred = inferMealTiming(ctx.current_time, ctx.today.workouts_logged)

  if (inferred && currentTiming === 'SNACK') {
    const defaults = [...(response.smart_defaults ?? [])]
    defaults.push({
      field: 'timing',
      assumed_value: inferred,
      source: 'inferred from time of day and workout proximity'
    })
    return {
      ...response,
      meal: { ...response.meal, timing: inferred },
      smart_defaults: defaults
    }
  }

  return response
}

/**
 * Apply portion defaults when items are missing specific portion sizes.
 * Uses PORTION_DEFAULTS from constants, preferring user portion history.
 *
 * Validates: Requirement 3.3
 */
export function applyPortionDefaults(
  response: NutritionistResponse,
  ctx: NutritionistContext
): NutritionistResponse {
  if (!response.meal || response.meal.items.length === 0) return response

  const defaults: SmartDefault[] = [...(response.smart_defaults ?? [])]
  const updatedItems = response.meal.items.map(item => {
    // Check if portion is vague/missing
    if (isVaguePortion(item.portion)) {
      const foodKey = item.food.toLowerCase()

      // Prefer user portion history over standard defaults
      const userPortion = ctx.user_portion_history?.[foodKey]
      const standardPortion = findPortionDefault(foodKey)

      if (userPortion) {
        defaults.push({
          field: 'portion',
          assumed_value: userPortion,
          source: `your usual portion for ${item.food}`
        })
        return { ...item, portion: userPortion }
      } else if (standardPortion) {
        defaults.push({
          field: 'portion',
          assumed_value: standardPortion,
          source: `standard portion default for ${item.food}`
        })
        return { ...item, portion: standardPortion }
      }
    }
    return item
  })

  return {
    ...response,
    meal: { ...response.meal, items: updatedItems },
    smart_defaults: defaults.length > 0 ? defaults : response.smart_defaults
  }
}

/**
 * Check if a portion description is vague or missing.
 */
function isVaguePortion(portion: string): boolean {
  const vague = ['standard serving', 'some', 'a bit', 'unknown', '']
  return vague.includes(portion.toLowerCase().trim())
}

/**
 * Find a portion default for a food item using fuzzy matching.
 */
function findPortionDefault(foodKey: string): string | null {
  // Direct match
  if (PORTION_DEFAULTS[foodKey]) return PORTION_DEFAULTS[foodKey]

  // Partial match: check if the food key contains a known default key
  for (const [key, value] of Object.entries(PORTION_DEFAULTS)) {
    if (foodKey.includes(key) || key.includes(foodKey)) {
      return value
    }
  }

  return null
}

/**
 * Validate macros using range checks and calorie consistency.
 * Flags issues in the response message rather than rejecting.
 *
 * Validates: Requirements 3.5, 3.6
 */
function validateAndFlag(response: NutritionistResponse): NutritionistResponse {
  if (!response.meal) return response

  const { totals, items } = response.meal
  const issues: string[] = []

  // Range checks per meal
  if (totals.protein < 0 || totals.protein > 200) {
    issues.push(`Protein (${totals.protein}g) is outside the expected range (0-200g)`)
  }
  if (totals.carbs < 0 || totals.carbs > 300) {
    issues.push(`Carbs (${totals.carbs}g) is outside the expected range (0-300g)`)
  }
  if (totals.fat < 0 || totals.fat > 150) {
    issues.push(`Fat (${totals.fat}g) is outside the expected range (0-150g)`)
  }
  if (totals.calories < 0 || totals.calories > 2000) {
    issues.push(`Calories (${totals.calories}) is outside the expected range (0-2000)`)
  }

  // Calorie consistency check (within 10%)
  const calculatedCals = (totals.protein * 4) + (totals.carbs * 4) + (totals.fat * 9)
  if (calculatedCals > 0) {
    const deviation = Math.abs(calculatedCals - totals.calories) / calculatedCals
    if (deviation > 0.1) {
      issues.push(
        `Calorie total (${totals.calories}) doesn't match macro calculation (${Math.round(calculatedCals)}). ` +
        `Consider adjusting.`
      )
    }
  }

  // Item-level validation
  for (const item of items) {
    if (item.protein < 0 || item.carbs < 0 || item.fat < 0 || item.calories < 0) {
      issues.push(`${item.food} has negative macro values`)
    }
  }

  if (issues.length > 0) {
    const flagMessage = `\n\n⚠️ Macro check: ${issues.join('. ')}`
    return {
      ...response,
      message: response.message + flagMessage
    }
  }

  return response
}

/**
 * Persist a parsed meal to the meals table.
 * Reuses the existing insert patterns from the meal upload route.
 *
 * Validates: Requirement 3.8
 */
export async function persistMeal(
  response: NutritionistResponse,
  userId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!response.meal || response.meal.items.length === 0) {
    return null
  }

  const { items, totals, timing } = response.meal
  const mealTimestamp = loggingContext.getStore()?.submittedAt ?? new Date().toISOString()

  // Normalize timing from agent format (BREAKFAST, LUNCH, etc.)
  // to DB constraint format (pre_workout, post_workout, general, recovery)
  const dbTiming = normalizeMealTiming(timing)

  return saveActivity(supabase, 'meal', {
      user_id: userId,
      meal_timestamp: mealTimestamp,
      photo_url: null,
      meal_timing: dbTiming,
      items,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fat: totals.fat,
      total_calories: totals.calories,
      needs_review: response.confidence < 0.7,
      ai_confidence: response.confidence
    })
}
