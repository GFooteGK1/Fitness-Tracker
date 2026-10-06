import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { beginRequest, finishRequest, validRequestId } from '@/app/lib/logging/server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { analyzeMealPhoto, MealPhotoAnalysisError, type MealPhotoMediaType } from '@/app/lib/nutrition/meal-photo-analysis'
import { photoDraftOperation } from '@/app/lib/nutrition/photo-draft'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: object, status = 200) => NextResponse.json(body, { status, headers })
const formats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return respond({ error: 'Unauthorized' }, 401)
  if (!personalizedCoachingCapabilities().captureReceiptsV2) return respond({ error: 'Photo review is paused.' }, 409)
  const form = await request.formData().catch(() => null)
  if (!form) return respond({ error: 'Invalid photo upload.' }, 400)
  if (form.get('expectedUserId') !== user.id) return respond({ error: 'The signed-in account changed.' }, 403)
  if ([...form.keys()].some(key => !['photo','timestamp','requestId','expectedUserId','approved'].includes(key))) return respond({ error: 'Unsupported photo metadata.' }, 422)
  if (form.get('approved') !== 'true') return respond({ error: 'Approve sending this photo for analysis first.' }, 422)
  const photo = form.get('photo'), timestamp = form.get('timestamp'), requestId = form.get('requestId')
  if (!(photo instanceof File) || photo.size < 1000 || photo.size > 1024 * 1024 || !formats.includes(photo.type)) return respond({ error: 'Choose a JPEG, PNG, WebP or GIF under 1 MB.' }, 422)
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) return respond({ error: 'Choose a valid photo time.' }, 422)
  if (!validRequestId(requestId)) return respond({ error: 'A stable request ID is required.' }, 422)
  const bytes = Buffer.from(await photo.arrayBuffer())
  const hash = createHash('sha256').update(bytes).digest('hex')
  const claim = await beginRequest(supabase, `photo-draft:${requestId}`, JSON.stringify([hash, photo.type, timestamp]))
  if (claim.response) return claim.response
  let analysis
  try {
    analysis = await analyzeMealPhoto({ base64Image: bytes.toString('base64'), mediaType: photo.type as MealPhotoMediaType })
  } catch (caught) {
    // No database mutation was attempted. A new analysis requires another explicit submission.
    try {
      return await finishRequest(supabase, claim.id!, respond({ error: caught instanceof MealPhotoAnalysisError
        ? 'Could not identify food reliably. Try a clearer photo or enter it manually.' : 'Analysis is unavailable. Try again when connected.',
        state: 'draft', canonicalChanged: false, retrySafe: true }, caught instanceof MealPhotoAnalysisError ? 422 : 503))
    } catch { return respond({ error: 'The analysis result is unconfirmed. Check this request before submitting another photo.', state: 'save_unconfirmed' }, 503) }
  }
  try {
    const { data: draft, error: saveError } = await supabase.rpc('save_activity_draft', {
      p_request_id: claim.id, p_draft_id: null, p_expected_revision: null,
      p_operation: photoDraftOperation(analysis, timestamp), p_discard: false,
    })
    if (saveError || !draft?.id) throw new Error('Draft unconfirmed')
    return await finishRequest(supabase, claim.id!, respond({ draft, state: 'draft', canonicalChanged: false }))
  } catch {
    // The RPC may have committed. Never finish this as a safe-to-restart failure.
    return respond({ error: 'The draft save is unconfirmed. Check pending saves or retry the original photo.', state: 'save_unconfirmed' }, 503)
  }
}
