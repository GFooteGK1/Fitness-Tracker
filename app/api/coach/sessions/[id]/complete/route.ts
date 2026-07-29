import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { validateCoachSessionCheckinInput } from '@/app/lib/coach/execution-feedback'

interface SessionResultRequest {
  idempotencyKey?: unknown
  feedback?: unknown
}

interface SessionResultRpcRow {
  prescribed_session_id: string
  session_status: 'completed' | 'skipped'
  checkin_id: string
  occurred_at: string
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

    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const validation = validateCoachSessionCheckinInput(body.feedback)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'Invalid session check-in', details: validation.errors },
        { status: 400 }
      )
    }

    const { occurredAt, ...responses } = validation.value
    const sessionStatus = responses.outcome === 'skipped' ? 'skipped' : 'completed'
    const { data, error } = await supabase.rpc('record_coach_session_result', {
      p_session_id: id,
      p_status: sessionStatus,
      p_responses: { schemaVersion: 1, ...responses },
      p_occurred_at: occurredAt,
      p_idempotency_key: idempotencyKey
    })

    if (error) {
      console.error('Coach session result RPC failed:', { code: error.code })
      if (error.code === 'P0002') return apiError('Prescribed session not found', 404)
      if (error.code === '40001') return apiError('The active plan changed; refresh and try again', 409)
      if (error.code === '22023') return apiError('Session result conflicts with an existing request', 409)
      if (error.code === '55000') return apiError('This session can no longer be changed', 409)
      return apiError('Unable to save session result', 503)
    }

    const row = (data?.[0] ?? null) as SessionResultRpcRow | null
    if (!row?.prescribed_session_id || !row.checkin_id) {
      return apiError('Unable to save session result', 503)
    }

    const context = await fetchCoachRuntimeContext(supabase, user.id)
    return NextResponse.json({ result: row, context }, {
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
