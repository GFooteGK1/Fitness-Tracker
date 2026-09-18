import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { amendActivity, validCorrection } from '@/app/lib/capture/corrections'
import { CaptureError } from '@/app/lib/capture/service'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  if (params.get('expectedUserId') !== user.id) return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403 })
  const kind = params.get('kind'), id = params.get('entityId')
  if (!['meal','workout'].includes(kind ?? '') || !id) return NextResponse.json({ error: 'Select a saved activity.' }, { status: 422 })
  const { data, error: readError } = await supabase.from(kind === 'meal' ? 'meals' : 'workouts').select('*').eq('user_id', user.id).eq('id', id).maybeSingle()
  if (readError || !data) return NextResponse.json({ error: 'Activity unavailable.' }, { status: 404 })
  return NextResponse.json({ userId: user.id, kind, entityId: id, record: data, revision: data.capture_revision, provenance: data.capture_provenance, execution: data.execution_source === 'program_runner' }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let input
  try { input = await request.json() } catch { return NextResponse.json({ error: 'Invalid correction' }, { status: 400 }) }
  if (input.expectedUserId !== user.id) return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403 })
  const identity: unknown = { entityId: input.entityId, expectedRevision: input.expectedRevision, requestId: input.requestId }
  if (!['meal','workout'].includes(input.kind) || !validCorrection(identity) || !input.record || typeof input.record !== 'object' || Array.isArray(input.record)) return NextResponse.json({ error: 'A saved activity and expected revision are required.' }, { status: 422 })
  try {
    const receipt = await amendActivity(supabase, user.id, input.kind, identity, input.record, input.execution === true)
    return NextResponse.json({ success: true, receipt, receipts: [receipt], activePlanChanged: false })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'Correction unavailable', state: 'correction_pending', retryAllowed: caught instanceof CaptureError && caught.code === '40001' },
      { status: caught instanceof CaptureError && ['22023','40001','42501','55000'].includes(caught.code) ? 409 : 503 })
  }
}
