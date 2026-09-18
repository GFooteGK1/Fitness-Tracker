import { validRecommendationId } from '@/app/lib/logging/server'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { validateCoachSessionCheckinInput } from '@/app/lib/coach/execution-feedback'
import { validateAtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import type { CaptureReceipt } from '@/app/lib/capture/contracts'

interface SessionResultRequest {
  recommendationId?: unknown
  expectedUserId?: unknown
  contractVersion?: unknown
  idempotencyKey?: unknown
  feedback?: unknown
  performedWork?: unknown
  observations?: unknown
}

interface SessionResultRpcRow {
  prescribed_session_id: string
  session_status: 'completed' | 'skipped'
  checkin_id: string
  workout_id?: string | null
  observation_group_ids?: string[]
  occurred_at: string
  replayed?: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return apiError('Invalid prescribed session id', 400)

    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    if (body.expectedUserId !== undefined && body.expectedUserId !== user.id) {
      return apiError('The signed-in account changed. Restore the original account before retrying.', 409)
    }

    if(body.recommendationId != null && !validRecommendationId(body.recommendationId)) return apiError('Invalid recommendation origin',422)
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const atomicRequested = body.contractVersion !== undefined
      || body.performedWork !== undefined
      || body.observations !== undefined
    let rpcName = 'record_coach_session_result'
    let rpcArgs: Record<string, unknown>

    if (atomicRequested) {
      const validation = validateAtomicSessionCompletionInput(body)
      if (!validation.ok) {
        return NextResponse.json(
          { error: 'Invalid atomic session result', details: validation.errors },
          { status: 400 }
        )
      }
      const { occurredAt, ...responses } = validation.value.feedback
      if (responses.feedbackVersion === 2 && !personalizedCoachingCapabilities().captureReceiptsV2) {
        return apiError('Optional session feedback is not enabled', 409)
      }
      rpcName = responses.feedbackVersion === 2 ? 'record_coach_session_capture' : 'record_coach_session_result_v2'
      rpcArgs = {
        p_session_id: id,
        p_status: validation.value.status,
        p_feedback: { schemaVersion: responses.feedbackVersion === 2 ? 2 : 1, ...responses },
        p_occurred_at: occurredAt,
        p_idempotency_key: idempotencyKey,
        p_performed_work: validation.value.performedWork,
        p_observations: validation.value.observations
      }
    } else {
      if (body.feedback && typeof body.feedback === 'object'
        && 'feedbackVersion' in body.feedback && body.feedback.feedbackVersion === 2) {
        return apiError('Optional feedback requires an atomic session completion', 400)
      }
      const validation = validateCoachSessionCheckinInput(body.feedback)
      if (!validation.ok) {
        return NextResponse.json(
          { error: 'Invalid session check-in', details: validation.errors },
          { status: 400 }
        )
      }
      const { occurredAt, ...responses } = validation.value
      rpcArgs = {
        p_session_id: id,
        p_status: responses.outcome === 'skipped' ? 'skipped' : 'completed',
        p_responses: { schemaVersion: 1, ...responses },
        p_occurred_at: occurredAt,
        p_idempotency_key: idempotencyKey
      }
    }

    if(body.recommendationId){
      if(rpcName!=='record_coach_session_capture')return apiError('Recommendation origin requires the current capture contract',422)
      rpcArgs.p_recommendation_id=body.recommendationId
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs)

    if (error) {
      console.error('Coach session result RPC failed:', { code: error.code })
      if (error.code === 'P0002') return apiError('Prescribed session not found', 404)
      if (error.code === '40001') return apiError('The active plan changed; refresh and try again', 409)
      if (error.code === '22023') return apiError('Session result conflicts with an existing request', 409)
      if (error.code === '55000') return apiError('This session can no longer be changed', 409)
      if (error.code === '23505') return apiError('Session result conflicts with an existing request', 409)
      return apiError('Unable to save session result', 503)
    }

    const row = (rpcName === 'record_coach_session_capture' ? data?.result : data?.[0] ?? null) as SessionResultRpcRow | null
    const receipt = rpcName === 'record_coach_session_capture' ? data?.receipt as CaptureReceipt | null : null
    if (!row?.prescribed_session_id || !row.checkin_id) {
      return apiError('Unable to save session result', 503)
    }

    // A confirmed atomic completion remains successful if a subsequent context read fails.
    let context: Awaited<ReturnType<typeof fetchCoachRuntimeContext>> | null = null
    try { context = await fetchCoachRuntimeContext(supabase, user.id) } catch { /* Next entry can refresh context. */ }
    return NextResponse.json({ result: row, context, ...(receipt ? { receipt, receipts: [receipt] } : {}), ...(context ? {} : { contextUnavailable: true }) }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach session result POST error:', error)
    return apiError('Unable to save session result', 500)
  }
}

async function readJson(request: Request): Promise<SessionResultRequest | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as SessionResultRequest
      : null
  } catch {
    return null
  }
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}
