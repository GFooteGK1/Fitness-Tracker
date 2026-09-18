import type { SupabaseClient } from '@supabase/supabase-js'
import { captureProvenance, correctedProvenance, type ActivityKind, type CaptureReceipt } from './contracts'
import { CaptureError } from './service'
import { normalizeActivity } from './normalize'

export interface CorrectionIdentity { entityId: string; expectedRevision: number; requestId: string }
export function validCorrection(value: unknown): value is CorrectionIdentity {
  if (!value || typeof value !== 'object') return false
  const input = value as CorrectionIdentity
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.entityId) && Number.isInteger(input.expectedRevision) && input.expectedRevision > 0
    && typeof input.requestId === 'string' && /^[\w:-]{8,120}$/.test(input.requestId)
}

/** Full editor snapshots do not imply that unchanged fields were reviewed. */
export function changedCaptureFields(kind: ActivityKind, before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  const fields: string[] = []
  if (kind === 'meal') {
    const select = (value: unknown, keys: string[]) => Array.isArray(value) ? value.map(item => keys.map(key => item?.[key] ?? null)) : value
    if (differs(select(before.items, ['food']), select(after.items, ['food']))) fields.push('items')
    if (differs(select(before.items, ['portion', 'portionSpec']), select(after.items, ['portion', 'portionSpec']))) fields.push('quantities')
    if (differs(select(before.items, ['protein', 'carbs', 'fat', 'calories']), select(after.items, ['protein', 'carbs', 'fat', 'calories']))) fields.push('macros')
  } else {
    if (differs(before.blocks, after.blocks)) fields.push('blocks')
    const quantityKeys = new Set(['reps','sets','weight','load','externalLoad','duration','duration_min','duration_s','time_s','distance','rest','rest_s','rounds','rounds_completed','extra_reps','total_reps','tonnage_lb','dose','performed','target_reps','unit','min','max'])
    const quantities = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(quantities)
      if (!value || typeof value !== 'object') return null
      return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
        if (quantityKeys.has(key)) return [[key, child]]
        if (child && typeof child === 'object') return [[key, quantities(child)]]
        return []
      }))
    }
    if (differs(quantities(before.blocks), quantities(after.blocks))) fields.push('quantities')
    if (differs(before.rpe ?? before.reported_rpe ?? null, after.reported_rpe ?? after.rpe ?? null)) fields.push('rpe')
  }
  return fields
}

export async function amendActivity(supabase: SupabaseClient, userId: string, kind: ActivityKind,
  identity: CorrectionIdentity, changes: Record<string, unknown>, execution = false, inferred = false): Promise<CaptureReceipt> {
  if (!validCorrection(identity)) throw new CaptureError('Reload the saved activity before correcting it.', '22023')
  const { data: revision, error: revisionError } = await supabase.from('activity_revisions').select('record,provenance')
    .eq('user_id', userId).eq('entity_kind', kind).eq('original_entity_id', identity.entityId).eq('revision', identity.expectedRevision).maybeSingle()
  if (revisionError) throw new CaptureError('The saved revision is unavailable.', 'unavailable', true)
  let base = revision?.record
  let sourceProvenance = revision?.provenance
  if (!base) {
    const { data: current, error } = await supabase.from(kind === 'meal' ? 'meals' : 'workouts').select('*').eq('id', identity.entityId).eq('user_id', userId).single()
    if (error || !current) throw new CaptureError('Activity is unavailable for this account.', '42501')
    if (current.capture_revision !== identity.expectedRevision) throw new CaptureError('This activity changed. Reload before correcting it.', '40001')
    base = current; sourceProvenance = current.capture_provenance
  }
  const normalized = normalizeActivity(kind, { ...base, ...changes })
  const changedFields = changedCaptureFields(kind, base, normalized.record)
  const provenance = correctedProvenance(sourceProvenance ?? captureProvenance(kind, 'legacy_unknown'), changedFields, `correction:${identity.requestId}`)
  if (inferred) for (const key of changedFields) { provenance.fields[key].origin = 'model_estimated'; provenance.fields[key].reviewState = 'unreviewed' }
  const { data, error: amendmentError } = await supabase.rpc(execution ? 'amend_program_execution' : 'amend_logged_activity', {
    ...(execution ? {} : { p_kind: kind }), p_entity_id: identity.entityId, p_expected_revision: identity.expectedRevision,
    p_request_id: identity.requestId, p_record: normalized.record, p_blocks: normalized.blocks, p_provenance: provenance,
  })
  if (amendmentError || !data?.entityId) throw new CaptureError(amendmentError?.code === '40001' ? 'This activity changed. Reload before correcting it.' : 'The correction could not be confirmed.', amendmentError?.code ?? 'unavailable', !amendmentError)
  return data as CaptureReceipt
}
