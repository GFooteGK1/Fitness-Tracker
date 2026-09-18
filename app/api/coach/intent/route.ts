import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { validatePlanningIntent } from '@/app/lib/coach/planning-intent'
import { fetchPlanningIntent, fetchIntentBaselineCandidates } from '@/app/lib/coach/planning-intent-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return apiError('Unauthorized', 401)
  try {
    // Compatibility reads remain available after new writers are disabled.
    const snapshot = await fetchPlanningIntent(supabase, user.id)
    let baselineCandidates: Awaited<ReturnType<typeof fetchIntentBaselineCandidates>> = []; let baselineCandidatesAvailable = true
    try { if (snapshot) baselineCandidates = await fetchIntentBaselineCandidates(supabase, user.id, snapshot) } catch { baselineCandidatesAvailable = false }
    return NextResponse.json({ enabled: personalizedCoachingCapabilities().trainingIntent, snapshot, baselineCandidates, baselineCandidatesAvailable }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return apiError('Training intent is unavailable', 503) }
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return apiError('Unauthorized', 401)
  if (!personalizedCoachingCapabilities().trainingIntent) return apiError('Training intent is not enabled', 409)
  let body
  try { body = await request.json() } catch { return apiError('Invalid request', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['expectedUserId', 'intent', 'confirmed', 'idempotencyKey', 'previousMemoryId'].includes(k))
    || body.confirmed !== true || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 120
    || !(body.previousMemoryId === undefined || body.previousMemoryId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.previousMemoryId))) return apiError('Explicit confirmation and a stable request identity are required', 400)
  if (body.expectedUserId !== user.id) return apiError('Account changed; reload before saving', 409)
  const validated = validatePlanningIntent(body.intent)
  if (!validated.ok) return NextResponse.json({ error: 'Invalid training intent', details: validated.errors }, { status: 422 })
  const { data, error: writeError } = await supabase.rpc('confirm_training_intent', {
    p_content: validated.value, p_idempotency_key: body.idempotencyKey, p_previous_memory_id: body.previousMemoryId ?? null,
  })
  if (writeError) return apiError(writeError.code === '40001' ? 'Training intent changed; reload before correcting it' : 'Unable to confirm training intent', ['22023', '40001'].includes(writeError.code ?? '') ? 409 : 503)
  const row = data?.[0]
  if (!row?.memory_id) return apiError('Training intent save is unconfirmed; retry the same request', 503)
  return NextResponse.json({ saved: true, memoryId: row.memory_id, memoryVersion: row.memory_version, activePlanChanged: false }, { headers: { 'Cache-Control': 'private, no-store' } })
}
