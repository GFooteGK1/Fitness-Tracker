import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { beginRequest, finishRequest, validRequestId, validRecommendationId } from '@/app/lib/logging/server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { correctedProvenance } from '@/app/lib/capture/contracts'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { reviewedPhotoItems } from '@/app/lib/nutrition/photo-draft'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: object, status = 200) => NextResponse.json(body, { status, headers })
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return respond({ error: 'Unauthorized' }, 401)
  if (!personalizedCoachingCapabilities().captureReceiptsV2) return respond({ error: 'Photo review is paused.' }, 409)
  const { id } = await context.params
  const input = await request.json().catch(() => null)
  if (!input || input.expectedUserId !== user.id) return respond({ error: 'The signed-in account changed.' }, 403)
  if (!validRecommendationId(id) || !validRequestId(input.requestId) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
    || Object.keys(input).some(key => !['items','expectedRevision','expectedUserId','requestId'].includes(key))) return respond({ error: 'Valid draft values and revision are required.' }, 422)
  let items
  try { items = reviewedPhotoItems(input.items) } catch { return respond({ error: 'Review each food, portion and macro amount.' }, 422) }
  const claim = await beginRequest(supabase, `photo-draft-edit:${input.requestId}`, JSON.stringify([id, input.expectedRevision, items]))
  if (claim.response) return claim.response
  const { data: draft, error: readError } = await supabase.from('activity_drafts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (readError) return respond({ error: 'Draft status is unavailable. Retry the same correction.', state: 'save_unconfirmed' }, 503)
  // Complete only proven pre-write rejections; exact replay happens before this read.
  if (!draft || draft.kind !== 'meal' || draft.input_method !== 'photo' || draft.status !== 'draft'
    || Date.parse(draft.expires_at) <= Date.now() || draft.revision !== input.expectedRevision) {
    return finishRequest(supabase, claim.id!, respond({ error: 'This draft changed, expired or is unavailable. Refresh drafts before editing.', retrySafe: true }, 409))
  }
  try {
    const operation = { ...draft.normalized,
      ...normalizeActivity('meal', { ...draft.normalized.record, items }),
      provenance: correctedProvenance(draft.provenance, ['items','quantities','macros'], `photo-draft-edit:${claim.id}`),
    }
    const { data: saved, error: saveError } = await supabase.rpc('save_activity_draft', {
      p_request_id: claim.id, p_draft_id: id, p_expected_revision: input.expectedRevision, p_operation: operation, p_discard: false,
    })
    if (saveError && ['22023','40001','42501','55000'].includes(saveError.code ?? '')) return await finishRequest(supabase, claim.id!, respond({
      error: 'The draft changed. Refresh drafts before making another correction.', retrySafe: true,
    }, 409))
    if (saveError || !saved?.id) throw new Error('Correction unconfirmed')
    return await finishRequest(supabase, claim.id!, respond({ draft: saved, canonicalChanged: false }))
  } catch { return respond({ error: 'The correction is unconfirmed. Retry its unchanged values.', state: 'save_unconfirmed' }, 503) }
}
