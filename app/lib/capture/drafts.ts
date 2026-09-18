import type { SupabaseClient } from '@supabase/supabase-js'
import { captureProvenance, type ActivityKind } from './contracts'
import { normalizeActivity } from './normalize'
import { CaptureError } from './service'

/** A preview has no confirmed occurrence and cannot enter canonical totals before explicit commit. */
export async function stageCaptureDraft(supabase: SupabaseClient, requestKey: string, kind: ActivityKind, record: Record<string, unknown>, recommendationId?: string | null) {
  const normalized = normalizeActivity(kind, record)
  const provenance = captureProvenance(kind)
  provenance.occurrence = { origin: 'model_estimated', reviewState: 'unreviewed', sourceReferences: [] }
  const operation = { sourceItemId: `preview:${kind}`, kind, ...normalized, inputMethod: 'coach', provenance, recommendationId: recommendationId ?? null,
    eventAt: String(kind === 'meal' ? record.meal_timestamp : record.workout_date) }
  const { data, error } = await supabase.rpc('save_activity_draft', { p_request_id: requestKey, p_draft_id: null, p_expected_revision: null, p_operation: operation, p_discard: false })
  if (error || !data?.id) throw new CaptureError('The preview draft could not be confirmed.', error?.code ?? 'unavailable', true)
  return data as Record<string, unknown>
}
