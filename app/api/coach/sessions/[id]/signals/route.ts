import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { SESSION_CAPTURE_POLICY_VERSION, validateSessionSignal } from '@/app/lib/coach/session-signals'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'private, no-store' }
type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!UUID.test(id)) return apiError('Invalid session id', 400)
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)
    const { data, error } = await supabase.from('coach_session_signals')
      .select('id, prescribed_session_id, signal, created_at, policy_version')
      .eq('user_id', user.id).eq('prescribed_session_id', id).order('created_at', { ascending: true }).limit(101)
    if (error) return apiError('Unable to read exercise feedback', 503)
    if ((data?.length ?? 0) > 100) return apiError('Exercise feedback is incomplete; review before finishing', 409)
    const signals = []
    for (const row of data ?? []) {
      const validated = validateSessionSignal(row.signal)
      if (!validated.ok || row.policy_version !== SESSION_CAPTURE_POLICY_VERSION) return apiError('Stored feedback has an unsupported format', 409)
      signals.push({ id: row.id, prescribedSessionId: row.prescribed_session_id, signal: validated.value,
        createdAt: row.created_at, policyVersion: row.policy_version })
    }
    return NextResponse.json({ signals, userId: user.id }, { headers })
  } catch { return apiError('Unable to read exercise feedback', 500) }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!UUID.test(id)) return apiError('Invalid session id', 400)
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)
    if (!personalizedCoachingCapabilities().captureReceiptsV2) return apiError('Exercise feedback is not enabled', 409)
    const body = await request.json().catch(() => null)
    if (body?.expectedUserId !== user.id) return apiError('The signed-in account changed. Restore the original account before retrying.', 409)
    if (!body || typeof body.requestId !== 'string' || body.requestId.length < 8 || body.requestId.length > 200) return apiError('A request id is required', 400)
    const validation = validateSessionSignal(body.signal)
    if (!validation.ok) return apiError(validation.error, 400)
    const { data, error } = await supabase.rpc('record_coach_session_signal', {
      p_session_id: id, p_request_id: body.requestId, p_signal: validation.value
    })
    if (error) {
      if (error.code === 'P0002') return apiError('Session not found', 404)
      if (['22023', '40001', '55000', '23505'].includes(error.code ?? '')) return apiError('The session or request changed. Refresh before saving again.', 409)
      return apiError('Unable to save exercise feedback', 503)
    }
    const row = data?.[0]
    if (!row?.id) return apiError('Unable to save exercise feedback', 503)
    return NextResponse.json({ id: row.id, prescribedSessionId: id, signal: validation.value,
      createdAt: row.created_at, policyVersion: SESSION_CAPTURE_POLICY_VERSION, replayed: row.replayed }, { headers })
  } catch { return apiError('Unable to save exercise feedback', 500) }
}
