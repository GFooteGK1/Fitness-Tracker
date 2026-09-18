import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaptureOperation, CaptureReceipt, CaptureReceiptBundle, CaptureRequestItem } from './contracts'

export class CaptureError extends Error {
  constructor(message: string, readonly code: string, readonly uncertain = false) { super(message); this.name = 'CaptureError' }
}

/** Freeze every authorized occurrence before the first canonical mutation. Never infer identity from equal food text. */
export async function freezeCapture(supabase: SupabaseClient, requestId: string, operations: CaptureOperation[]): Promise<CaptureRequestItem[]> {
  if (!operations.length || operations.length > 20 || new Set(operations.map(item => item.sourceItemId)).size !== operations.length) {
    throw new CaptureError('Each intended activity needs a distinct source identity.', '22023')
  }
  const { data, error } = await supabase.rpc('freeze_logging_request_items', { p_request_id: requestId, p_items: operations })
  if (error || !Array.isArray(data)) throw new CaptureError(error?.message ?? 'Capture preparation could not be confirmed.', error?.code ?? 'unavailable', true)
  return data as CaptureRequestItem[]
}

export async function commitCaptureItem(supabase: SupabaseClient, itemId: string): Promise<CaptureReceipt> {
  try {
    const { data, error } = await supabase.rpc('commit_logging_request_item', { p_item_id: itemId })
    if (error) throw new CaptureError('This activity could not be saved.', error.code ?? 'unavailable', !['22023','42501','40001','23514'].includes(error.code ?? ''))
    if (!data || data.schemaVersion !== 2 || !data.entityId || data.state !== 'saved') throw new CaptureError('The save receipt is unconfirmed.', 'unavailable', true)
    return data as CaptureReceipt
  } catch (error) {
    if (error instanceof CaptureError) throw error
    throw new CaptureError('The save may have completed. Reconcile the original request before editing.', 'transport', true)
  }
}

/** Per-child atomic success. A later failure cannot hide or replay an earlier saved activity. */
export async function commitCaptureBundle(supabase: SupabaseClient, requestId: string, items: CaptureRequestItem[]): Promise<CaptureReceiptBundle> {
  const receipts: CaptureReceipt[] = []
  const unresolved: CaptureReceiptBundle['unresolved'] = []
  for (const item of items) {
    if (item.status === 'canceled') continue
    if (item.receipt) { receipts.push(item.receipt); continue }
    try { receipts.push(await commitCaptureItem(supabase, item.id)) }
    catch { unresolved.push({ operationId: item.id, sourceItemId: item.source_item_id, state: 'save_unconfirmed' }) }
  }
  return { schemaVersion: 2, requestId, state: unresolved.length ? 'save_unconfirmed' : 'saved', receipts, unresolved }
}
