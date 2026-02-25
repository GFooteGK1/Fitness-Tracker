import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SociusContext,
  SociusResponse,
  RecentInsight,
  InsightPriority,
  PatternId
} from './types'
import { buildSociusPrompt } from './prompts/socius'

const SOCIUS_MODEL = 'claude-sonnet-4-20250514'

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
  userInput: string
): Promise<SociusResponse> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const systemPrompt = buildSociusPrompt(ctx)

  const message = await anthropic.messages.create(
    {
      model: SOCIUS_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userInput }]
    },
    { signal: AbortSignal.timeout(30_000) }
  )

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseSociusResponse(text)
}

/**
 * Parse the raw LLM text into a SociusResponse.
 * Handles markdown code fences and malformed JSON gracefully.
 */
export function parseSociusResponse(raw: string): SociusResponse {
  let cleaned = raw.trim()

  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

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
  } catch {
    // If JSON parsing fails, treat the whole response as a conversational message
    return {
      message: raw.trim() || 'I had trouble analyzing that. Could you try again?',
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
    is_surfaced: false
  }))

  const { error } = await supabase.from('insights').insert(rows)
  if (error) {
    console.error('Failed to persist insights:', error)
  }
}
