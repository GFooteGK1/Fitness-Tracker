import { saveActivity, loggingContext } from '@/app/lib/logging/server'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TrainerContext,
  TrainerResponse,
  BenchmarkPR,
  WorkoutBlock,
  SmartDefault
} from './types'
import { buildTrainerPrompt } from './prompts/trainer'
import { complete } from '@/app/lib/llm/client'
import { callAgentWithTools, type AgenticCallResult, type ToolCallRecord } from './tools/agentic-loop'
import { TRAINER_TOOLS } from './tools/definitions'
import {
  buildUserFriendlyError,
  cleanResponseForParsing,
  hashUserInput,
  logParsingError
} from './error-handling'

/** Extended response that includes tool call metadata */
export interface TrainerResponseWithTools extends TrainerResponse {
  _toolCalls?: ToolCallRecord[]
}

/**
 * Call the Trainer agent with context and user input.
 * Uses the agentic loop with tool_use for DB operations (log workout, log PR, query history).
 * Falls back to JSON parsing when no tools are used (pure questions).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8
 */
export async function callTrainerAgent(
  ctx: TrainerContext,
  userInput: string,
  supabase?: SupabaseClient,
  userId?: string
): Promise<TrainerResponseWithTools> {
  const systemPrompt = buildTrainerPrompt(ctx)

  // If supabase and userId are provided, use the agentic loop with tools
  if (supabase && userId) {
    const result = await callAgentWithTools({
      systemPrompt,
      userInput,
      tools: TRAINER_TOOLS,
      userId,
      supabase,
      maxRounds: 3
    })

    return buildResponseFromToolResult(result, ctx)
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

  const parsed = parseTrainerResponse(llmResult.text)
  const withPRs = detectNewPRs(parsed, ctx.benchmark_prs)
  const withDefaults = applySmartDefaults(withPRs, ctx)

  return withDefaults
}

/**
 * Build a TrainerResponse from the agentic loop result.
 * If tools were used (log_workout, log_pr), extract data from tool calls.
 * If no tools were used, try JSON parsing on the text response.
 */
function buildResponseFromToolResult(
  result: AgenticCallResult,
  ctx: TrainerContext
): TrainerResponseWithTools {
  const hasToolCalls = result.toolCalls.length > 0
  const workoutCall = result.toolCalls.find(tc => tc.name === 'log_workout' && tc.result.success)
  const prCalls = result.toolCalls.filter(tc => tc.name === 'log_pr' && tc.result.success)

  // If tools were used, build response from tool data
  if (hasToolCalls) {
    const workout = workoutCall ? {
      blocks: workoutCall.input.blocks as WorkoutBlock[],
      primary_score: (workoutCall.input.primary_score as string) ?? null,
      rpe: (workoutCall.input.rpe as number) ?? null,
      tags: (workoutCall.input.tags as string[]) ?? []
    } : undefined

    const new_prs = prCalls.map(tc => ({
      benchmark_name: tc.input.benchmark_name as string,
      score_value: tc.input.score_value as number,
      score_display: tc.input.score_display as string,
      date: tc.input.date as string,
      rx_status: (tc.input.rx_status as string) ?? 'RX'
    }))

    return {
      message: result.text || 'Workout logged.',
      workout,
      new_prs,
      smart_defaults: [],
      confidence: 0.9,
      _toolCalls: result.toolCalls
    }
  }

  // No tools used — try JSON parsing (question response or fallback)
  const parsed = parseTrainerResponse(result.text)
  const withPRs = detectNewPRs(parsed, ctx.benchmark_prs)
  const withDefaults = applySmartDefaults(withPRs, ctx)
  return { ...withDefaults, _toolCalls: [] }
}

/**
 * Parse the raw LLM text into a TrainerResponse.
 * Handles markdown code fences and malformed JSON gracefully.
 */
export function parseTrainerResponse(raw: string, userInput = ''): TrainerResponse {
  const cleaned = cleanResponseForParsing(raw)
  try {
    const parsed = JSON.parse(cleaned)
    return {
      message: typeof parsed.message === 'string' ? parsed.message : 'Workout received.',
      workout: parsed.workout ? normalizeWorkout(parsed.workout) : undefined,
      new_prs: Array.isArray(parsed.new_prs) ? parsed.new_prs : [],
      smart_defaults: Array.isArray(parsed.smart_defaults) ? parsed.smart_defaults : [],
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5
    }
  } catch (error) {
    logParsingError('trainer', raw, hashUserInput(userInput), error)

    return {
      message: buildUserFriendlyError('trainer', error, raw),
      new_prs: [],
      smart_defaults: [],
      confidence: 0.3
    }
  }
}

/**
 * Normalize workout blocks from the LLM response to ensure type safety.
 */
function normalizeWorkout(workout: Record<string, unknown>): TrainerResponse['workout'] {
  const blocks = Array.isArray(workout.blocks)
    ? workout.blocks.map(normalizeBlock)
    : []

  return {
    blocks,
    primary_score: typeof workout.primary_score === 'string' ? workout.primary_score : null,
    rpe: typeof workout.rpe === 'number' ? workout.rpe : null,
    tags: Array.isArray(workout.tags) ? workout.tags.filter((t): t is string => typeof t === 'string') : []
  }
}

function normalizeBlock(block: Record<string, unknown>): WorkoutBlock {
  const validTypes = ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'] as const
  const blockType = validTypes.includes(block.block_type as typeof validTypes[number])
    ? (block.block_type as WorkoutBlock['block_type'])
    : 'FOR_TIME'

  const movements = Array.isArray(block.movements)
    ? block.movements.map((m: Record<string, unknown>) => ({
        name: typeof m.name === 'string' ? m.name : 'Unknown',
        reps: typeof m.reps === 'number' ? m.reps : undefined,
        weight: typeof m.weight === 'string' ? m.weight : undefined,
        distance: typeof m.distance === 'string' ? m.distance : undefined
      }))
    : []

  const score = block.score && typeof block.score === 'object'
    ? {
        rounds: typeof (block.score as Record<string, unknown>).rounds === 'number'
          ? (block.score as Record<string, unknown>).rounds as number
          : undefined,
        extra_reps: typeof (block.score as Record<string, unknown>).extra_reps === 'number'
          ? (block.score as Record<string, unknown>).extra_reps as number
          : undefined,
        time_s: typeof (block.score as Record<string, unknown>).time_s === 'number'
          ? (block.score as Record<string, unknown>).time_s as number
          : undefined
      }
    : undefined

  return {
    block_type: blockType,
    duration_min: typeof block.duration_min === 'number' ? block.duration_min : undefined,
    movements,
    score,
    rx_status: block.rx_status === 'RX' || block.rx_status === 'SCALED'
      ? block.rx_status
      : undefined
  }
}

/**
 * Detect new PRs by comparing parsed workout against existing benchmark PRs.
 *
 * PR rules:
 * - FOR_TIME: lower time = better (new PR if time_s < existing score_value)
 * - AMRAP: higher rounds+reps = better
 * - STRENGTH: higher weight = better
 * - First logged score for a benchmark is automatically a PR
 *
 * Validates: Requirements 2.3, 2.4
 */
export function detectNewPRs(
  response: TrainerResponse,
  existingPRs: BenchmarkPR[]
): TrainerResponse {
  if (!response.workout || response.workout.blocks.length === 0) {
    return response
  }

  // The LLM may already have detected PRs — we verify and augment
  const detectedPRs: BenchmarkPR[] = []
  const request = loggingContext.getStore()
  const today = formatUTCAsLocalDateWithOffset(request?.submittedAt ?? new Date().toISOString(), -(request?.tzOffset ?? 0))

  for (const block of response.workout.blocks) {
    if (!block.score) continue

    // Check if any LLM-detected PR matches a known benchmark
    const existingForBlock = findMatchingPR(block, existingPRs)

    if (existingForBlock) {
      const isNewPR = comparePRScore(block, existingForBlock)
      if (isNewPR) {
        detectedPRs.push({
          benchmark_name: existingForBlock.benchmark_name,
          score_value: extractScoreValue(block),
          score_display: buildScoreDisplay(block),
          date: today,
          rx_status: block.rx_status ?? 'RX'
        })
      }
    }
  }

  // Also keep any PRs the LLM detected that we didn't already find
  const llmPRs = (response.new_prs ?? []).filter(
    pr => !detectedPRs.some(d => d.benchmark_name.toLowerCase() === pr.benchmark_name.toLowerCase())
  )

  const allPRs = [...detectedPRs, ...llmPRs]

  // If the LLM flagged PRs and we found none through our logic, trust the LLM
  if (allPRs.length === 0 && (response.new_prs?.length ?? 0) > 0) {
    return response
  }

  return {
    ...response,
    new_prs: allPRs.length > 0 ? allPRs : response.new_prs
  }
}

/**
 * Find an existing PR record that matches a workout block.
 * Matches by checking if any tag or the block itself references a known benchmark.
 */
function findMatchingPR(
  block: WorkoutBlock,
  existingPRs: BenchmarkPR[]
): BenchmarkPR | undefined {
  // Check movement names for known benchmarks
  const movementNames = block.movements.map(m => m.name.toLowerCase())

  for (const pr of existingPRs) {
    const benchName = pr.benchmark_name.toLowerCase()
    // Direct match on movement name or block contains the benchmark name
    if (movementNames.some(name => name.includes(benchName) || benchName.includes(name))) {
      return pr
    }
  }

  return undefined
}

/**
 * Compare a new score against an existing PR to determine if it's better.
 */
function comparePRScore(block: WorkoutBlock, existingPR: BenchmarkPR): boolean {
  if (!block.score) return false

  const newValue = extractScoreValue(block)
  if (newValue === 0) return false

  // FOR_TIME: lower is better
  if (block.block_type === 'FOR_TIME' && block.score.time_s != null) {
    return newValue < existingPR.score_value
  }

  // AMRAP: higher is better (total = rounds * movements_per_round + extra_reps)
  if (block.block_type === 'AMRAP') {
    return newValue > existingPR.score_value
  }

  // STRENGTH: higher is better
  if (block.block_type === 'STRENGTH') {
    return newValue > existingPR.score_value
  }

  return false
}

/**
 * Extract a numeric score value from a block for PR comparison.
 */
export function extractScoreValue(block: WorkoutBlock): number {
  if (!block.score) return 0

  if (block.score.time_s != null) return block.score.time_s

  if (block.score.rounds != null) {
    // Encode as rounds * 1000 + extra_reps for comparison
    return (block.score.rounds * 1000) + (block.score.extra_reps ?? 0)
  }

  return 0
}

/**
 * Build a human-readable score display string.
 */
export function buildScoreDisplay(block: WorkoutBlock): string {
  if (!block.score) return 'No score'

  if (block.score.time_s != null) {
    const mins = Math.floor(block.score.time_s / 60)
    const secs = block.score.time_s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (block.score.rounds != null) {
    return `${block.score.rounds}+${block.score.extra_reps ?? 0}`
  }

  return 'Logged'
}

/**
 * Apply smart defaults for missing RPE and weight.
 *
 * - Missing RPE: estimate from workout intensity
 * - Missing weight: lookup from recent_workouts for the same movement
 *
 * Validates: Requirements 2.5, 2.6, 2.7
 */
export function applySmartDefaults(
  response: TrainerResponse,
  ctx: TrainerContext
): TrainerResponse {
  if (!response.workout) return response

  const defaults: SmartDefault[] = [...(response.smart_defaults ?? [])]

  // Smart default: RPE estimation
  if (response.workout.rpe == null) {
    const estimatedRPE = estimateRPE(response.workout.blocks)
    if (estimatedRPE != null) {
      response = {
        ...response,
        workout: { ...response.workout, rpe: estimatedRPE }
      }
      defaults.push({
        field: 'rpe',
        assumed_value: String(estimatedRPE),
        source: 'estimated from workout intensity'
      })
    }
  }

  // Smart default: fill missing weights from recent workouts
  const workout = response.workout!
  const updatedBlocks = workout.blocks.map(block => ({
    ...block,
    movements: block.movements.map(movement => {
      if (movement.weight || !movement.reps) return movement

      const lastWeight = lookupLastWeight(movement.name, ctx.recent_workouts)
      if (lastWeight) {
        defaults.push({
          field: 'weight',
          assumed_value: lastWeight,
          source: `last session for ${movement.name}`
        })
        return { ...movement, weight: lastWeight }
      }
      return movement
    })
  }))

  return {
    ...response,
    workout: {
      blocks: updatedBlocks,
      primary_score: workout.primary_score ?? null,
      rpe: response.workout!.rpe ?? null,
      tags: workout.tags ?? []
    },
    smart_defaults: defaults.length > 0 ? defaults : response.smart_defaults
  }
}

/**
 * Estimate RPE from workout block types and structure.
 * AMRAP/FOR_TIME with many movements → higher RPE.
 * STRENGTH → moderate RPE.
 * CARDIO → lower RPE.
 */
export function estimateRPE(blocks: WorkoutBlock[]): number | null {
  if (blocks.length === 0) return null

  let totalIntensity = 0
  for (const block of blocks) {
    switch (block.block_type) {
      case 'AMRAP':
      case 'FOR_TIME':
        totalIntensity += 8
        break
      case 'EMOM':
        totalIntensity += 7
        break
      case 'STRENGTH':
        totalIntensity += 6
        break
      case 'CARDIO':
        totalIntensity += 5
        break
    }
  }

  const avgIntensity = Math.round(totalIntensity / blocks.length)
  return Math.max(1, Math.min(10, avgIntensity))
}

/**
 * Look up the last used weight for a movement from recent workouts.
 */
export function lookupLastWeight(
  movementName: string,
  recentWorkouts: TrainerContext['recent_workouts']
): string | null {
  const normalizedName = movementName.toLowerCase()

  for (const workout of recentWorkouts) {
    for (const block of workout.blocks) {
      for (const movement of (Array.isArray(block.movements) ? block.movements : [])) {
        if (movement.name.toLowerCase() === normalizedName && movement.weight) {
          return movement.weight
        }
      }
    }
  }

  return null
}

/**
 * Persist a parsed workout to the workouts + block_scores tables.
 * Reuses the existing insert patterns from parse-workout route.
 *
 * Validates: Requirement 2.9
 */
export async function persistWorkout(
  response: TrainerResponse,
  userId: string,
  inputText: string,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!response.workout || response.workout.blocks.length === 0) {
    return null
  }

  const request = loggingContext.getStore()
  const today = formatUTCAsLocalDateWithOffset(request?.submittedAt ?? new Date().toISOString(), -(request?.tzOffset ?? 0))

  // Insert block scores
  const blockScores = response.workout.blocks.map(block => ({
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

  return saveActivity(supabase, 'workout', {
      user_id: userId,
      workout_date: today,
      input_text: inputText,
      blocks: response.workout.blocks,
      primary_score: response.workout.primary_score,
      tags: response.workout.tags,
      rpe: response.workout.rpe,
      parse_confidence: response.confidence
    }, blockScores)
}

/**
 * Persist new PRs to the benchmark_prs table.
 *
 * Validates: Requirement 2.4
 */
export async function persistNewPRs(
  prs: BenchmarkPR[],
  userId: string,
  workoutId: string,
  supabase: SupabaseClient
): Promise<void> {
  if (prs.length === 0) return

  const rows = prs.map(pr => ({
    user_id: userId,
    benchmark_name: pr.benchmark_name,
    date: pr.date,
    score_value: pr.score_value,
    score_display: pr.score_display,
    rx_status: pr.rx_status,
    is_pr: true,
    workout_id: workoutId
  }))

  const { error } = await supabase.from('benchmark_prs').insert(rows)
  if (error) {
    console.error('Failed to persist PRs:', error)
  }
}

/**
 * Calculate total reps for a block (for block_scores table).
 */
function calculateTotalReps(block: WorkoutBlock): number | null {
  if (block.score?.rounds != null) {
    const repsPerRound = block.movements.reduce((sum, m) => sum + (m.reps ?? 0), 0)
    return (block.score.rounds * repsPerRound) + (block.score.extra_reps ?? 0)
  }

  const totalFromMovements = block.movements.reduce((sum, m) => sum + (m.reps ?? 0), 0)
  return totalFromMovements > 0 ? totalFromMovements : null
}

/**
 * Calculate tonnage (total weight × reps) for a block.
 */
function calculateTonnage(block: WorkoutBlock): number | null {
  let tonnage = 0
  for (const movement of block.movements) {
    if (movement.weight && movement.reps) {
      const weightNum = parseWeight(movement.weight)
      if (weightNum > 0) {
        tonnage += weightNum * movement.reps
      }
    }
  }
  return tonnage > 0 ? tonnage : null
}

/**
 * Parse a weight string like "225 lb" or "100 kg" into a number in pounds.
 */
function parseWeight(weight: string): number {
  const match = weight.match(/(\d+(?:\.\d+)?)\s*(lb|kg|#)?/i)
  if (!match) return 0

  const value = parseFloat(match[1])
  const unit = (match[2] ?? 'lb').toLowerCase()

  if (unit === 'kg') return value * 2.205
  return value // lb or # both mean pounds
}
