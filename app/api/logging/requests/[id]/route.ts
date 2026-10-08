import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { readCaptureRequest, recoveredCaptureResponse, recoverFailedWorkoutRequest } from '@/app/lib/capture/reconciliation'
import { commitCaptureBundle } from '@/app/lib/capture/service'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

const headers = { 'Cache-Control': 'private, no-store' }
async function handle(request: Request, context: { params: Promise<{ id: string }> }, retry: boolean, cancel = false) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  const { id } = await context.params
  const expectedUserId = new URL(request.url).searchParams.get('expectedUserId')
  if (!expectedUserId || expectedUserId !== user.id) return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403, headers })
  if (id.length < 8 || id.length > 200) return NextResponse.json({ error: 'Invalid request identity' }, { status: 400, headers })
  try {
    let state = await readCaptureRequest(supabase, user.id, id)
    if (!state) return NextResponse.json({ state: 'save_unconfirmed', retryAllowed: false, receipts: [] }, { status: 404, headers })
    if (cancel) {
      const input = await request.json().catch(() => null)
      if (!input || !state.items.some(item => item.id === input.operationId)) return NextResponse.json({ error: 'Select an unresolved item from this request.' }, { status: 422, headers })
      const canceled = await supabase.rpc('cancel_logging_request_item', { p_item_id: input.operationId })
      if (canceled.error) return NextResponse.json({ error: 'Cancellation could not be confirmed. Reconcile this request.', retryAllowed: false }, { status: 409, headers })
      state = await readCaptureRequest(supabase, user.id, id)
      if (!state) throw new Error('Request disappeared')
      if (state.request.status !== 'complete' && state.items.every(item => item.status !== 'pending')) {
        const result = { ...recoveredCaptureResponse(state.receipts), canceledItems: state.items.filter(item => item.status === 'canceled').map(item => item.cancellation), retrySafe: state.receipts.length === 0 }
        const finish = await supabase.rpc('finish_logging_request', { p_id: state.request.id, p_response: result, p_status: state.receipts.length ? 200 : 409 })
        if (finish.error) throw new Error('Cancellation receipt unavailable')
        state = await readCaptureRequest(supabase, user.id, id)
        if (!state) throw new Error('Request disappeared')
      }
    }
    if (retry && state.items.length && state.request.status !== 'complete') {
      if (!personalizedCoachingCapabilities().captureReceiptsV2) return NextResponse.json({ error: 'Capture recovery is paused; saved receipts remain readable.' }, { status: 409, headers })
      const bundle = await commitCaptureBundle(supabase, state.request.id, state.items)
      const response = { ...recoveredCaptureResponse(bundle.receipts, state.items.length === 1 ? state.items[0].payload.response : undefined), receiptBundle: bundle }
      if (!bundle.unresolved.length) {
        const finished = await supabase.rpc('finish_logging_request', { p_id: state.request.id, p_response: response, p_status: 200 })
        if (finished.error) return NextResponse.json({ ...response, state: 'save_unconfirmed' }, { status: 503, headers })
      }
      return NextResponse.json({ ...response, state: bundle.state, retryAllowed: false }, { status: bundle.unresolved.length ? 207 : 200, headers })
    }
    if (!state.items.length && !state.receipts.length && !state.retryAllowed) {
      const recovered = await recoverFailedWorkoutRequest(supabase, state.request)
      if (recovered) return NextResponse.json({ ...recovered, response: recovered, receipts: [], pendingItems: [] }, { headers })
    }
    const legacySaved = !state.items.length && state.request.status === 'complete' && Array.isArray(state.request.entities) && state.request.entities.length > 0
    return NextResponse.json({ state: (state.receipts.length && state.items.every(item => item.status !== 'pending')) || legacySaved ? 'saved' : state.retryAllowed ? 'draft' : 'save_unconfirmed',
      requestStatus: state.request.status, retryAllowed: state.retryAllowed, receipts: state.receipts,
      response: state.request.response, savedEntities: state.request.entities, canceledItems: state.items.filter(item => item.status === 'canceled').map(item => item.cancellation), pendingItems: state.items.filter(item => item.status === 'pending').map(item => item.id) }, { headers })
  } catch { return NextResponse.json({ error: 'Request status is unavailable.', state: 'save_unconfirmed', retryAllowed: false }, { status: 503, headers }) }
}
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, false)
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, true)
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, false, true)
