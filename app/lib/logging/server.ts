import { createServerClient } from '@/app/lib/auth/supabase-server'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { captureProvenance, type CaptureInputMethod, type CaptureProvenance, type CaptureReceipt, type CaptureOperation } from '@/app/lib/capture/contracts'
import { freezeCapture, commitCaptureItem, commitCaptureBundle, CaptureError } from '@/app/lib/capture/service'
import { readCaptureRequest, recoveredCaptureResponse, recoverFailedWorkoutRequest } from '@/app/lib/capture/reconciliation'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { resolveAuthorizedSource } from '@/app/lib/capture/intent'
import { amendActivity, validCorrection, type CorrectionIdentity } from '@/app/lib/capture/corrections'

export interface LoggingContext {
  id: string; submittedAt?: string; tzOffset?: number; writeAttempted?: boolean
  inputMethod?: CaptureInputMethod; receipts?: CaptureReceipt[]
  partialResult?: Record<string, unknown>
  drafts?: Record<string, unknown>[]
  canonicalNoWriteConfirmed?: boolean
  recommendationId?: string | null
  userId?: string; correction?: CorrectionIdentity
  correctionKind?: 'meal' | 'workout'; correctionAuthorized?: boolean
  /** Coach mutations are collected, then all authorized occurrences freeze before any commit. */
  captureCollector?: { operations: CaptureOperation[]; authorizedSources: Map<string, 'meal' | 'workout'>; sourceItemId?: string }
}
export const loggingContext = new AsyncLocalStorage<LoggingContext>()
export function markCaptureCorrectionFailure(error: unknown) {
  const context = loggingContext.getStore()
  // SQL performs exact mutation replay before the expected-revision guard. A 40001 means this key made no amendment.
  if (context && !context.receipts?.length && error instanceof CaptureError && error.code === '40001') context.canonicalNoWriteConfirmed = true
}
export const validRecommendationId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{8,120}$/.test(value)

export async function beginRequest(supabase: SupabaseClient, key: string, input: string) {
  const { data, error } = await supabase.rpc('begin_logging_request', {
    p_key: key, p_fingerprint: createHash('sha256').update(input).digest('hex')
  })
  if (error || !data) return { response: NextResponse.json({
    error: error?.code === '22023' ? 'This request ID belongs to different input.' : 'Logging is unavailable. Your request was not started.'
  }, { status: error?.code === '22023' ? 409 : 503 }) }
  if (data.status === 'complete') {
    const recovered = await recoverFailedWorkoutRequest(supabase, { ...data, request_key: key })
    return { response: NextResponse.json(recovered ?? data.response, { status: data.http_status }) }
  }
  if (!data.claimed) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const saved = await readCaptureRequest(supabase, user.id, key)
      if (saved?.items.length && personalizedCoachingCapabilities().captureReceiptsV2) {
        const bundle = await commitCaptureBundle(supabase, saved.request.id, saved.items)
        const response = NextResponse.json({ ...recoveredCaptureResponse(bundle.receipts, saved.items.length === 1 ? saved.items[0].payload.response : undefined), receiptBundle: bundle },
          { status: bundle.unresolved.length ? 207 : 200 })
        return { response: bundle.unresolved.length ? response : await finishRequest(supabase, saved.request.id, response) }
      }
      if (saved?.items.some(item => item.status === 'pending')) return { response: NextResponse.json({
        error: 'Capture recovery is paused. Saved items remain available.', state: 'save_unconfirmed', receipts: saved.receipts,
        pendingItems: saved.items.filter(item => item.status === 'pending').map(item => item.id), retryAllowed: false
      }, { status: 409 }) }
      if (saved?.receipts.length) return { response: await finishRequest(supabase, saved.request.id, NextResponse.json(recoveredCaptureResponse(saved.receipts))) }
      if (saved?.draftOutcome) return { response: await finishRequest(supabase, saved.request.id, NextResponse.json({ success: true, reconciled: true, canonicalChanged: false, draft: saved.draftOutcome })) }
      if (saved?.previewDrafts.length) return { response: await finishRequest(supabase, saved.request.id, NextResponse.json({ success: true, reconciled: true, canonicalChanged: false, drafts: saved.previewDrafts, messages: [{ role: 'socius', content: 'Preview saved for review. No activity was logged.' }] })) }
    }
  }
  if (!data.claimed) return { response: NextResponse.json({
    error: 'This request is still processing or needs reconciliation. Check your history before starting a new log.',
    requestStatus: 'pending', savedEntities: data.entities
  }, { status: 409, headers: { 'Retry-After': '5' } }) }
  return { id: data.id as string }
}

export async function finishRequest(supabase: SupabaseClient, id: string, response: Response) {
  const body = await response.clone().json()
  const receipts = loggingContext.getStore()?.receipts
  if (body.receiptBundle?.unresolved?.length) return response
  const { data, error } = await supabase.rpc('finish_logging_request', {
    p_id: id, p_response: receipts ? { ...body, receipts, receiptBundle: body.receiptBundle ?? { schemaVersion: 2, requestId: id, state: response.ok ? 'saved' : 'save_unconfirmed', receipts, unresolved: [] } } : body, p_status: response.status
  })
  if (error) {
    const existing = await supabase.from('logging_requests').select('status,response,http_status').eq('id', id).maybeSingle()
    if (!existing.error && existing.data?.status === 'complete' && existing.data.response) return NextResponse.json(existing.data.response, { status: existing.data.http_status })
    throw new Error('Unable to confirm the request receipt. Check history before logging again.')
  }
  return NextResponse.json(data ?? await response.clone().json(), { status: response.status })
}

export class ActivitySaveError extends Error {}

export async function saveActivity(supabase: SupabaseClient, kind: 'meal' | 'workout',
  record: Record<string, unknown>, blocks: Record<string, unknown>[] = [], response?: Record<string, unknown>,
  options?: { provenance?: CaptureProvenance; inputMethod?: CaptureInputMethod; sourceItemId?: string }) {
  const context = loggingContext.getStore()
  try {
  if (personalizedCoachingCapabilities().captureReceiptsV2) {
    if (!context) throw new ActivitySaveError('A stable logging request is required before saving.')
    if (context.correction && context.userId) {
      context.writeAttempted = true
      const inferred = !options || !['template','catalog','manual'].includes(options.inputMethod ?? '')
      const receipt = await amendActivity(supabase, context.userId, kind, { ...context.correction, requestId: context.id }, record, false, inferred)
      context.receipts = [receipt]
      return receipt.entityId
    }
    const normalized = normalizeActivity(kind, record)
    const sourceItemId = options?.sourceItemId ?? (context.captureCollector
      ? resolveAuthorizedSource(context.captureCollector.authorizedSources, kind,
        context.captureCollector.authorizedSources.get(context.captureCollector.sourceItemId ?? '') === kind ? context.captureCollector.sourceItemId : undefined)
      : 'activity:0')
    if (!sourceItemId) throw new ActivitySaveError('Choose the distinct activity to save.')
    const operation: CaptureOperation = { sourceItemId, kind, ...normalized,
      recommendationId: context.recommendationId ?? null,
      inputMethod: options?.inputMethod ?? context.inputMethod ?? 'text',
      provenance: options?.provenance ?? captureProvenance(kind),
      eventAt: String(kind === 'meal' ? record.meal_timestamp : record.workout_date), ...(response ? { response } : {}) }
    if (context.captureCollector) {
      if (context.captureCollector.authorizedSources.get(sourceItemId) !== kind) throw new ActivitySaveError('This activity was not authorized by the logging request.')
      const previous = context.captureCollector.operations.find(item => item.sourceItemId === sourceItemId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(operation)) throw new ActivitySaveError('Conflicting versions of the same activity need review.')
      if (!previous) context.captureCollector.operations.push(operation)
      // This marker is internal to the collection phase; never return it as a persisted ID.
      return `draft:${sourceItemId}`
    }
    context.writeAttempted = true
    const items = await freezeCapture(supabase, context.id, [operation])
    const receipt = await commitCaptureItem(supabase, items[0].id)
    context.receipts = [...(context.receipts ?? []), receipt]
    return receipt.entityId
  }
  if (context) context.writeAttempted = true
  const { data, error } = await supabase.rpc('save_logged_activity', {
    p_kind: kind, p_record: record, p_blocks: blocks,
    p_request_id: loggingContext.getStore()?.id ?? null, p_response: response ?? null
  })
  if (error || typeof data !== 'string') {
    // SQL data/constraint errors abort this atomic RPC. Transport failures remain uncertain.
    const code = error?.code ?? ''
    if (context && /^2[23][0-9A-Z]{3}$/.test(code)) context.canonicalNoWriteConfirmed = true
    console.error('Activity save failed:', { kind, requestId: context?.id, code: code || 'unavailable' })
    throw new ActivitySaveError(context?.canonicalNoWriteConfirmed
      ? 'This activity was not saved. Review the entry and submit again.'
      : 'Unable to save the complete activity. Check history before retrying.')
  }
  return data
  } catch (error) {
    markCaptureCorrectionFailure(error)
    if (error instanceof ActivitySaveError) throw error
    // A transport failure may happen after commit. Abort the agent tool loop too.
    throw new ActivitySaveError('The save could not be confirmed. Retry the same request or check history before logging again.')
  }
}

export async function replayJsonRequest<T extends Request>(request: T, kind: string, process: (request: T) => Promise<Response>) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body
  try { body = await request.clone().json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || !validRequestId(body.requestId)) return NextResponse.json({ error: 'A requestId is required. Refresh the app.' }, { status: 400 })
  if (body.expectedUserId && body.expectedUserId !== user.id) return NextResponse.json({ error: 'The signed-in account changed. Sign back in to the original account to retry.' }, { status: 403 })
  if (body.recommendationId != null && !validRecommendationId(body.recommendationId)) return NextResponse.json({ error: 'Invalid recommendation origin.' }, { status: 422 })
  if (body.correction && !validCorrection(body.correction)) return NextResponse.json({ error: 'A valid saved activity revision is required.' }, { status: 422 })
  const claim = await beginRequest(supabase, `${kind}:${body.requestId}`, JSON.stringify(body))
  if (claim.response) return claim.response
  try {
    const context: LoggingContext = { id: claim.id!, submittedAt: body.submittedAt, inputMethod: 'text', userId: user.id, recommendationId: body.recommendationId ?? null, correction: body.correction }
    return await loggingContext.run(context, async () => {
      let response: Response
      try { response = await process(request) }
      catch {
        response = NextResponse.json({ ...context.partialResult, error: context.writeAttempted
          ? 'The save could not be confirmed. Reconcile this request before editing.'
          : 'The activity was not saved. Review the input before retrying.', state: context.writeAttempted ? 'save_unconfirmed' : 'draft' }, { status: 503 })
        if (context.writeAttempted && !context.canonicalNoWriteConfirmed) return response
      }
      // These two text routes write only through saveActivity. Analysis failures
      // before that boundary are confirmed no-write failures and can restart.
      if (!response.ok && (!context.writeAttempted || context.canonicalNoWriteConfirmed)) {
        response = NextResponse.json({ ...context.partialResult, ...await response.json(), retrySafe: true,
          ...(context.correction ? { correctionRequired: true, correction: context.correction } : {}) }, { status: response.status })
      }
      return finishRequest(supabase, claim.id!, response)
    })
  } catch {
    return NextResponse.json({ error: 'The save could not be confirmed. Retry the same request or check history before logging again.' }, { status: 503 })
  }
}
