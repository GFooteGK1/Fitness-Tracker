import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Per-user in-memory limit: 20 requests per 60-second window.
// Note: serverless instances are not shared, so this is per-instance.
// For strict global limiting, replace with Upstash Redis / Vercel KV.

interface RateLimitEntry { count: number; windowStart: number }
const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false

  entry.count++
  return true
}
import type {
  AgentRequest,
  AgentResponse,
  AgentMessage,
  AgentDomain,
  ClassificationResult,
  RecentInsight
} from '@/app/lib/agents/types'
import { classifyInput } from '@/app/lib/agents/classifier'
import { preprocessInput, validateRequest } from '@/app/lib/agents/preprocessor'
import { determineRoute, executeRoute } from '@/app/lib/agents/router'
import type { AgentCaller } from '@/app/lib/agents/router'
import { buildTrainerContext, buildNutritionistContext, buildSociusContext, invalidatePassiveCache } from '@/app/lib/agents/context-builder'
import { callTrainerAgent, persistWorkout, persistNewPRs } from '@/app/lib/agents/trainer-agent'
import { callNutritionistAgent, persistMeal } from '@/app/lib/agents/nutritionist-agent'
import { callSociusAgent, persistInsights } from '@/app/lib/agents/socius-agent'
import { triggerSociusBackground } from '@/app/lib/agents/socius-background'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createServerClient()

    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // 2. Parse & validate request (before rate limit — validation is free)
    let body: AgentRequest
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body', 400)
    }

    const validationError = validateRequest(body)
    if (validationError) {
      return apiError(validationError, 400)
    }

    // 3. Rate limit check (only count valid requests against the limit)
    if (!checkRateLimit(user.id)) {
      return apiError('Too many requests. Please wait before sending another message.', 429)
    }

    // 4. Preprocess input (handle voice/photo/file)
    const processedContent = await preprocessInput(body)

    // 5. Classify
    const classification = await classifyInput(processedContent, body.input_mode)

    // 6. Check for urgent pending insights
    const urgentInsights = await fetchPendingUrgentInsights(supabase, user.id)

    // 7. Route decision
    const routeDecision = determineRoute(classification)

    // 8. Build agent callers
    const agentCallers: Record<AgentDomain, AgentCaller> = {
      trainer: createTrainerCaller(supabase),
      nutritionist: createNutritionistCaller(supabase),
      socius: createSociusCaller(supabase)
    }

    // 9. Execute route
    const agentMessages = await executeRoute(
      routeDecision,
      user.id,
      processedContent,
      body,
      agentCallers
    )

    // 10. Prepend urgent insight messages
    const messages: AgentMessage[] = []
    for (const insight of urgentInsights) {
      messages.push({
        role: 'socius',
        content: `⚠️ ${insight.content}`,
        domain: 'socius',
        related_entity_id: insight.id,
        related_entity_type: 'insight'
      })
      // Mark insight as surfaced
      await supabase
        .from('insights')
        .update({ surfaced_at: new Date().toISOString() })
        .eq('id', insight.id)
    }
    messages.push(...agentMessages)

    // 11. Persist messages to chat_messages
    await persistChatMessages(supabase, user.id, body, messages, classification)

    // 12. Trigger background pattern detection (fire-and-forget)
    // Only trigger after workout or meal logs
    if (classification.input_type === 'workout_log' || classification.input_type === 'meal_log') {
      triggerSociusBackground(user.id).catch(err => {
        console.error('Background pattern detection failed:', err)
        // Don't fail the request if background analysis fails
      })
    }

    // 13. Return response
    const elapsed = Date.now() - startTime
    const response: AgentResponse = {
      messages,
      classification,
      processing_time_ms: elapsed
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Agent process error:', error)
    return apiError(
      'Internal server error',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/**
 * Real Trainer agent caller — builds context, calls the agent, persists results.
 */
function createTrainerCaller(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): AgentCaller {
  return async (userId, content, _request, _previousMessages) => {
    try {
      const ctx = await buildTrainerContext(userId)
      const response = await callTrainerAgent(ctx, content)

      // Persist workout if one was parsed
      let workoutId: string | null = null
      if (response.workout && response.workout.blocks.length > 0) {
        workoutId = await persistWorkout(response, userId, content, supabase)

        // Persist new PRs if workout was saved
        if (workoutId && response.new_prs && response.new_prs.length > 0) {
          await persistNewPRs(response.new_prs, userId, workoutId, supabase)
        }

        // Invalidate passive context cache so the next call sees the new workout
        if (workoutId) invalidatePassiveCache(userId)
      }

      const message: AgentMessage = {
        role: 'trainer',
        content: response.message,
        domain: 'trainer',
        confidence: response.confidence,
        smart_defaults: response.smart_defaults,
        ...(workoutId ? { related_entity_id: workoutId, related_entity_type: 'workout' as const } : {})
      }

      return [message]
    } catch (error) {
      console.error('Trainer agent error:', error)
      return [{
        role: 'trainer',
        content: 'I had trouble processing that workout. Could you try rephrasing it?',
        domain: 'trainer',
        confidence: 0
      }]
    }
  }
}

/**
 * Real Nutritionist agent caller — builds context, calls the agent, persists results.
 */
function createNutritionistCaller(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): AgentCaller {
  return async (userId, content, _request, _previousMessages) => {
    try {
      const ctx = await buildNutritionistContext(userId)
      const response = await callNutritionistAgent(ctx, content)

      // Persist meal if one was parsed
      let mealId: string | null = null
      if (response.meal && response.meal.items.length > 0) {
        mealId = await persistMeal(response, userId, supabase)

        // Invalidate passive context cache so the next call sees the new meal
        if (mealId) invalidatePassiveCache(userId)
      }

      const message: AgentMessage = {
        role: 'nutritionist',
        content: response.message,
        domain: 'nutritionist',
        confidence: response.confidence,
        smart_defaults: response.smart_defaults,
        ...(mealId ? { related_entity_id: mealId, related_entity_type: 'meal' as const } : {})
      }

      return [message]
    } catch (error) {
      console.error('Nutritionist agent error:', error)
      return [{
        role: 'nutritionist',
        content: 'I had trouble processing that meal. Could you try describing it again?',
        domain: 'nutritionist',
        confidence: 0
      }]
    }
  }
}


/**
 * Real Socius agent caller — builds context, calls the agent, persists insights.
 */
function createSociusCaller(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): AgentCaller {
  return async (userId, content, _request, _previousMessages) => {
    try {
      const ctx = await buildSociusContext(userId)
      const response = await callSociusAgent(ctx, content)

      // Persist any new insights above the confidence threshold
      if (response.insights && response.insights.length > 0) {
        await persistInsights(response.insights, userId, supabase)
      }

      const message: AgentMessage = {
        role: 'socius',
        content: response.message,
        domain: 'socius',
        confidence: response.confidence
      }

      return [message]
    } catch (error) {
      console.error('Socius agent error:', error)
      return [{
        role: 'socius',
        content: 'I had trouble analyzing that. Could you try rephrasing your question?',
        domain: 'socius',
        confidence: 0
      }]
    }
  }
}

/**
 * Fetch unsurfaced urgent insights for prepending to the response.
 */
async function fetchPendingUrgentInsights(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string
): Promise<RecentInsight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select('id, pattern_id, priority, confidence, content, created_at')
    .eq('user_id', userId)
    .eq('priority', 'urgent')
    .is('surfaced_at', null)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    pattern_id: row.pattern_id as RecentInsight['pattern_id'],
    priority: row.priority as RecentInsight['priority'],
    confidence: Number(row.confidence),
    content: row.content as string,
    created_at: row.created_at as string
  }))
}

/**
 * Persist user message + agent responses to chat_messages table.
 * Stores both input_mode and input_type on the user message.
 */
async function persistChatMessages(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  userInput: AgentRequest,
  agentMessages: AgentMessage[],
  classification: ClassificationResult
): Promise<void> {
  const rows = [
    // User message
    {
      user_id: userId,
      role: 'user',
      content: userInput.content,
      input_mode: userInput.input_mode,
      input_type: classification.input_type,
      domain: null,
      confidence: classification.confidence,
      related_entity_id: null,
      related_entity_type: null,
      is_compacted: false
    },
    // Agent messages
    ...agentMessages.map(msg => ({
      user_id: userId,
      role: msg.role,
      content: msg.content,
      input_mode: null,
      input_type: null,
      domain: msg.domain ?? null,
      confidence: msg.confidence ?? null,
      related_entity_id: msg.related_entity_id ?? null,
      related_entity_type: msg.related_entity_type ?? null,
      is_compacted: false
    }))
  ]

  const { error } = await supabase.from('chat_messages').insert(rows)
  if (error) {
    console.error('Failed to persist chat messages:', error)
  }
}
