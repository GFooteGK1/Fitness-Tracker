import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SociusContext,
  SociusResponse,
  RecentInsight,
  InsightPriority,
  PatternId
} from './types'
import { buildSociusPrompt } from './prompts/socius'
import { complete } from '@/app/lib/llm/client'
import { callAgentWithTools, type ToolCallRecord } from './tools/agentic-loop'
import { SOCIUS_TOOLS } from './tools/definitions'
import {
  buildUserFriendlyError,
  cleanResponseForParsing,
  hashUserInput,
  logParsingError
} from './error-handling'

/** Extended response that includes tool call metadata */
export interface SociusResponseWithTools extends SociusResponse {
  _toolCalls?: ToolCallRecord[]
}

/** All valid pattern IDs */
const VALID_PATTERN_IDS: PatternId[] = [
  'CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC',
  'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG'
]

/** All valid insight priorities */
const VALID_PRIORITIES: InsightPriority[] = ['urgent', 'notable', 'informational']

/**
 * Call the Socius agent with context and user input.
 * Returns a parsed SociusResponse — no DB writes happen here.
 *
 * Validates: Requirements 4.1, 4.7, 4.8, 4.9
 */
export async function callSociusAgent(
  ctx: SociusContext,
  userInput: string,
  supabase?: SupabaseClient,
  userId?: string
): Promise<SociusResponseWithTools> {
  const systemPrompt = buildSociusPrompt(ctx)

  if (supabase && userId) {
    const result = await callAgentWithTools({
      systemPrompt,
      userInput,
      tools: SOCIUS_TOOLS,
      userId,
      supabase,
      maxRounds: 3
    })

    return {
      ...parseSociusResponse(result.text),
      _toolCalls: result.toolCalls
    }
  }

  const llmResult = await complete({
    purpose: 'agent',
    maxTokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
    timeoutMs: 30_000
  })

  return parseSociusResponse(llmResult.text)
}

/**
 * Parse the raw LLM text into a SociusResponse.
 * Handles markdown code fences and malformed JSON gracefully.
 */
export function parseSociusResponse(raw: string, userInput = ''): SociusResponse {
  const cleaned = cleanResponseForParsing(raw)
  try {
    const parsed = JSON.parse(cleaned)
    return {
      message: typeof parsed.message === 'string' ? parsed.message : 'Here is my analysis.',
      insights: Array.isArray(parsed.insights)
        ? parsed.insights.map(normalizeInsight).filter(Boolean) as RecentInsight[]
        : [],
      data_points: normalizeDataPoints(parsed.data_points),
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5
    }
  } catch (error) {
    logParsingError('socius', raw, hashUserInput(userInput), error)

    return {
      message: buildUserFriendlyError('socius', error, raw),
      insights: [],
      data_points: {},
      confidence: 0.3
    }
  }
}

/**
 * Normalize a single insight from the LLM response.
 * Validates pattern_id, priority, and confidence. Returns null for invalid insights.
 */
function normalizeInsight(insight: Record<string, unknown>): RecentInsight | null {
  if (!insight || typeof insight !== 'object') return null

  const patternId = typeof insight.pattern_id === 'string'
    ? insight.pattern_id as PatternId
    : null

  if (!patternId || !VALID_PATTERN_IDS.includes(patternId)) return null

  const priority = typeof insight.priority === 'string' && VALID_PRIORITIES.includes(insight.priority as InsightPriority)
    ? (insight.priority as InsightPriority)
    : 'informational'

  const confidence = typeof insight.confidence === 'number'
    ? Math.max(0, Math.min(1, insight.confidence))
    : 0.5

  const content = typeof insight.content === 'string' && insight.content.trim().length > 0
    ? insight.content.trim()
    : null

  if (!content) return null

  return {
    id: typeof insight.id === 'string' ? insight.id : crypto.randomUUID(),
    pattern_id: patternId,
    priority,
    confidence,
    content,
    created_at: typeof insight.created_at === 'string' ? insight.created_at : new Date().toISOString()
  }
}

/**
 * Normalize data_points to ensure it's a Record<string, unknown>.
 */
function normalizeDataPoints(dataPoints: unknown): Record<string, unknown> {
  if (!dataPoints || typeof dataPoints !== 'object' || Array.isArray(dataPoints)) {
    return {}
  }
  return dataPoints as Record<string, unknown>
}

/**
 * Persist new insights to the insights table.
 * Only persists insights with confidence > 0.6 (the detection threshold).
 *
 * Validates: Requirement 4.6
 */
export async function persistInsights(
  insights: RecentInsight[],
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Filter to insights above the confidence threshold
  const validInsights = insights.filter(i => i.confidence > 0.6)
  if (validInsights.length === 0) return

  const rows = validInsights.map(insight => ({
    user_id: userId,
    pattern_id: insight.pattern_id,
    priority: insight.priority,
    confidence: insight.confidence,
    content: insight.content,
    data_context: {}
  }))

  const { error } = await supabase.from('insights').insert(rows)
  if (error) {
    console.error('Failed to persist insights:', error)
  }
}
