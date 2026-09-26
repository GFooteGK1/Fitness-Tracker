import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaptureReceipt, CaptureRequestItem } from './contracts'
import { CaptureError } from './service'

/** A terminal legacy workout request is releasable only after the database proves no write. */
export async function recoverFailedWorkoutRequest(supabase: SupabaseClient, request: {
  id: string; request_key: string; status: string; http_status?: number; response?: Record<string, unknown>
}): Promise<Record<string, unknown> | null> {
  if (!request.request_key.startsWith('workout-text:') || request.status !== 'complete'
    || !request.http_status || request.http_status < 400 || request.response?.retryAllowed === true) return null
  try {
    const { data, error } = await supabase.rpc('confirm_failed_workout_request', { p_id: request.id })
    if (error || data?.retryAllowed !== true) return null // Missing migration or unavailable proof stays closed.
    return { ...request.response, error: 'This workout was not saved. Submit your entry again.',
      details: 'The previous attempt is confirmed unsaved. A new submission can now be saved safely.',
      state: 'draft', requestStatus: 'complete', retryAllowed: true, savedEntities: [] }
  } catch { return null }
}

export async function readCaptureRequest(supabase: SupabaseClient, userId: string, key: string) {
  const { data: request, error } = await supabase.from('logging_requests').select('*').eq('user_id', userId).eq('request_key', key).maybeSingle()
  if (error) throw new CaptureError('Request status is unavailable.', 'unavailable', true)
  if (!request) return null // Not found does not prove an in-flight request cannot commit later.
  const { data: rows, error: itemError } = await supabase.from('logging_request_items').select('*').eq('user_id', userId).eq('request_id', request.id).order('ordinal')
  if (itemError && itemError.code !== '42P01' && itemError.code !== 'PGRST205') throw new CaptureError('Activity receipts are unavailable.', 'unavailable', true)
  const items = (rows ?? []) as Array<CaptureRequestItem & { payload: { response?: Record<string, unknown> } }>
  const receipts = items.flatMap(item => item.receipt ? [item.receipt] : [])
  let draftOutcome: Record<string, unknown> | null = null
  let previewDrafts: Record<string, unknown>[] = []
  if (!items.length) {
    const { data: mutation, error: mutationError } = await supabase.from('activity_mutations').select('receipt').eq('user_id', userId).eq('request_key', request.id).maybeSingle()
    if (mutationError && !['42P01','PGRST205'].includes(mutationError.code ?? '')) throw new CaptureError('Correction receipt is unavailable.', 'unavailable', true)
    if (mutation?.receipt?.entityId) receipts.push(mutation.receipt as CaptureReceipt)
    else if (mutation?.receipt?.id && ['draft','discarded','committed'].includes(mutation.receipt.status)) draftOutcome = mutation.receipt
    if (!mutationError && !mutation && !receipts.length) {
      const previews = await supabase.from('activity_mutations').select('receipt').eq('user_id', userId).in('request_key', [`${request.id}:preview:meal`, `${request.id}:preview:workout`])
      if (previews.error) throw new CaptureError('Preview receipts are unavailable.', 'unavailable', true)
      previewDrafts = (previews.data ?? []).flatMap(row => row.receipt?.id ? [row.receipt] : [])
    }
  }
  return { request, items, receipts, draftOutcome, previewDrafts, retryAllowed: request.status === 'complete' && request.response?.retryAllowed === true && receipts.length === 0 }
}

export function recoveredCaptureResponse(receipts: CaptureReceipt[], original: Record<string, unknown> = {}) {
  const first = receipts.length === 1 ? receipts[0] : null
  return { ...original, success: true, reconciled: true, receipts,
    ...(first ? { [first.entityKind === 'meal' ? 'mealId' : 'workoutId']: first.entityId } : {}),
    messages: receipts.map(receipt => ({ role: 'socius', content: `${receipt.entityKind === 'meal' ? 'Meal' : 'Workout'} save confirmed.`,
      related_entity_id: receipt.entityId, related_entity_type: receipt.entityKind })) }
}
