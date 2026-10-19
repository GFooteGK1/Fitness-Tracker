import type { SupabaseClient } from '@supabase/supabase-js'
import { MEAL_PHOTO_ANALYSIS_PROMPT, analyzeMealPhotoWithEvidence } from './meal-photo-analysis'
import { screenMealPhotoWithUsage } from './photo-screening'
import { photoDraftOperation } from './photo-draft'
import { nutritionPhotoPilotEnabled, nutritionPhotoPilotOwner } from './photo-pilot-policy'
import { settlePhotoUsage } from './photo-pilot-settlement-server'
import { photoUsageEvidence } from './photo-pilot-usage'
import { PHOTO_ESTIMATION_MODEL, photoDispatchGuard } from './photo-pilot-budget'
import { photoHash, preparePilotPhoto } from './photo-pilot-image'

export class PhotoPilotError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export interface PilotCapture {
  id: string; state: string; claimed?: boolean; dispatch_grant?: unknown; object_path: string; meal_id?: string | null
  captured_at: string; received_at: string; updated_at: string; receipt?: unknown
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)

export async function pilotIdentity(db: SupabaseClient, expectedOwner?: string) {
  if (!nutritionPhotoPilotEnabled()) throw new PhotoPilotError(409, 'Nutrition photo pilot is awaiting activation approval.')
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) throw new PhotoPilotError(401, 'Sign in to Socius.')
  if (!nutritionPhotoPilotOwner(user.id) || (expectedOwner !== undefined && expectedOwner !== user.id)) throw new PhotoPilotError(403, 'This account cannot use the pilot.')
  return user.id
}

async function transition(db: SupabaseClient, id: string, action: string, payload: object = {}): Promise<PilotCapture> {
  const { data, error } = await db.rpc('nutrition_photo_pilot', { p_id: id, p_action: action, p_payload: payload })
  if (error || !data?.id) throw new PhotoPilotError(error?.code === '22023' ? 409 : error?.code === '42501' ? 403 : 503,
    'Capture state could not be confirmed. Keep the same request ID; do not resubmit for another estimate.')
  return data as PilotCapture
}

/** Recovery is a database-only idempotent commit, never a provider retry. */
export async function resumePilotCapture(db: SupabaseClient, id: string, expectedOwner: string) {
  await pilotIdentity(db,expectedOwner)
  if (!uuid(id)) throw new PhotoPilotError(422,'A stable capture UUID is required.')
  return transition(db,id,'commit')
}

/** No worker, loop or retry. Replays reconcile safe database completion only.
 * Provider-start states are durable before dispatch and are never reclaimed. */
export async function capturePilotPhoto(db: SupabaseClient, input: {
  expectedOwner: string; requestId: string; capturedAt: string; context: string; consent: string
  bytes: Uint8Array; mediaType: string
}) {
  const owner = await pilotIdentity(db, input.expectedOwner)
  if (!uuid(input.requestId) || input.consent !== 'selected-photo-openai-autolog-v1'
    || typeof input.context !== 'string' || input.context.length > 1000
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.capturedAt)
    || !Number.isFinite(Date.parse(input.capturedAt))) throw new PhotoPilotError(422, 'Invalid selected-photo metadata.')
  let photo
  try { photo = await preparePilotPhoto(input.bytes, input.mediaType) }
  catch { throw new PhotoPilotError(422, 'Choose a readable JPEG or PNG under 1 MB.') }
  let capture = await transition(db, input.requestId, 'reserve', { sourceHash: photo.sourceHash, normalizedHash: photo.normalizedHash,
    capturedAt: input.capturedAt, context: input.context, consent: input.consent, normalization: photo.normalization })
  if (!capture.claimed) return capture.state === 'estimated' ? transition(db, capture.id, 'commit') : capture
  try {
    await pilotIdentity(db, owner)
    const uploaded = await db.storage.from('meal-photos').upload(capture.object_path, photo.bytes, { contentType: 'image/jpeg', upsert: false })
    if (uploaded.error) throw new Error('Upload unconfirmed')
    capture = await transition(db, capture.id, 'photo_stored')
    await pilotIdentity(db, owner)
    const screenAdmissionStart = performance.now()
    capture = await transition(db, capture.id, 'screen_start')
    const screenDispatch = photoDispatchGuard(capture.dispatch_grant, 'screen', capture.id, screenAdmissionStart)
    const image = { base64Image: photo.bytes.toString('base64'), mediaType: 'image/jpeg' as const }
    const screened = await screenMealPhotoWithUsage({ ...image, beforeDispatch: screenDispatch })
    const { screening } = screened
    capture = await transition(db, capture.id, 'screen_result', { screening })
    await pilotIdentity(db, owner)
    if (screened.billing) await settlePhotoUsage(owner, capture.id, 'screen', screened.billing)
    if (screening.route !== 'food_candidate') return capture
    await pilotIdentity(db, owner)
    const estimateAdmissionStart = performance.now()
    capture = await transition(db, capture.id, 'estimate_start')
    const estimateDispatch = photoDispatchGuard(capture.dispatch_grant, 'estimate', capture.id, estimateAdmissionStart)
    const estimate = await analyzeMealPhotoWithEvidence({ ...image, provider: 'openai', model: PHOTO_ESTIMATION_MODEL, beforeDispatch: estimateDispatch, timeoutMs: 45_000, maxRetries: 0, store: false, context: input.context })
    if (estimate.provider !== 'openai' || estimate.model !== PHOTO_ESTIMATION_MODEL) throw new Error('Unexpected provider')
    const operation = photoDraftOperation(estimate.analysis, input.capturedAt)
    operation.sourceItemId = 'nutrition-photo:' + capture.id
    for (const field of [operation.provenance.occurrence, ...Object.values(operation.provenance.fields)]) {
      field.origin = 'model_estimated'; field.reviewState = 'unreviewed'; field.sourceReferences = ['nutrition-photo:' + capture.id]
    }
    capture = await transition(db, capture.id, 'estimate_result', { estimate,
      promptHash: photoHash(MEAL_PHOTO_ANALYSIS_PROMPT), parserVersion: 'meal-photo-v1', operation })
    await pilotIdentity(db, owner)
    const usage = photoUsageEvidence('estimate', estimate.model, estimate.billing)
    if (usage) await settlePhotoUsage(owner, capture.id, 'estimate', usage)
    return await transition(db, capture.id, 'commit')
  } catch {
    // Any call may have completed remotely. Never invent no-write/no-cost proof.
    try { return await transition(db, capture.id, 'uncertain') }
    catch { throw new PhotoPilotError(503, 'Capture outcome is unconfirmed. Retrieve the original capture; do not request another estimate.') }
  }
}
