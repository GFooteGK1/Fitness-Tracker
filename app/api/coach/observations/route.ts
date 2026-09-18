import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

/** Narrow manual baseline adapter; the RPC resolves all metric/protocol/owner metadata from confirmed intent. */
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return apiError('Unauthorized', 401)
  if (!personalizedCoachingCapabilities().trainingIntent) return apiError('Baseline capture is not enabled', 409)
  let body
  try { body = await request.json() } catch { return apiError('Invalid baseline request', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(k => !['expectedUserId','intentMemoryId','goalId','value','observedAt','idempotencyKey','confirmed'].includes(k))
    || body.confirmed !== true || typeof body.intentMemoryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.intentMemoryId)
    || typeof body.goalId !== 'string' || body.goalId.length > 160
    || typeof body.value !== 'number' || !Number.isFinite(body.value) || body.value < 0
    || typeof body.observedAt !== 'string' || !Number.isFinite(Date.parse(body.observedAt))
    || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 120) return apiError('A confirmed measurement, protocol outcome and stable request identity are required', 422)
  if (body.expectedUserId !== user.id) return apiError('Account changed; reload before saving', 409)
  const { data, error: writeError } = await supabase.rpc('record_training_baseline', {
    p_memory_id: body.intentMemoryId, p_goal_id: body.goalId, p_value: body.value,
    p_observed_at: body.observedAt, p_idempotency_key: body.idempotencyKey,
  })
  if (writeError) return apiError('Unable to record baseline for this confirmed protocol', ['22023','40001'].includes(writeError.code ?? '') ? 409 : writeError.code === '42501' ? 403 : 503)
  const row = data?.[0]
  if (!row?.observation_id) return apiError('Baseline save is unconfirmed; retry the same request', 503)
  return NextResponse.json({ saved: true, observationId: row.observation_id, activePlanChanged: false }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
}
