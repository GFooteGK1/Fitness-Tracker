import type { SupabaseClient } from '@supabase/supabase-js'
import { MEAL_PHOTO_ANALYSIS_PROMPT, analyzeMealPhotoWithEvidence } from './meal-photo-analysis'
import { screenMealPhotoWithUsage } from './photo-screening'
import { photoDraftOperation } from './photo-draft'
import { nutritionPhotoPilotEnabled, nutritionPhotoPilotOwner } from './photo-pilot-policy'
import { settlePhotoUsage } from './photo-pilot-settlement-server'
import { photoUsageEvidence } from './photo-pilot-usage'
import { PHOTO_ESTIMATION_MODEL, photoDispatchGuard } from './photo-pilot-budget'
import { photoHash, preparePilotPhoto } from './photo-pilot-image'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixedPhotoCanary, isPhotoCanaryId, nutritionPhotoCanaryEnabled, nutritionPhotoCanaryDispatchEnabled,
  PHOTO_CANARY_ID, PHOTO_CANARY_SOURCE_HASH, PHOTO_CANARY_NORMALIZED_HASH, PHOTO_CANARY_CREATED_AT, PHOTO_CANARY_CONTEXT, type PhotoCanaryTuple } from './photo-pilot-canary-policy'

export class PhotoPilotError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export interface PilotCapture {
  id: string; state: string; claimed?: boolean; dispatch_grant?: unknown; object_path: string; meal_id?: string | null
  captured_at: string; received_at: string; updated_at: string; receipt?: unknown
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)

export async function pilotIdentity(db: SupabaseClient, expectedOwner?: string) {
  return photoIdentity(db, expectedOwner)
}

async function photoIdentity(db: SupabaseClient, expectedOwner?: string, canary?: PhotoCanaryTuple) {
  if (canary ? !nutritionPhotoCanaryEnabled() || !fixedPhotoCanary(canary) : !nutritionPhotoPilotEnabled())
    throw new PhotoPilotError(409, 'Nutrition photo processing is paused.')
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
  if (isPhotoCanaryId(id)) throw new PhotoPilotError(409,'The reference canary cannot enter meal history.')
  return transition(db,id,'commit')
}

type PhotoInput = {
  expectedOwner: string; requestId: string; capturedAt: string; context: string; consent: string
  bytes: Uint8Array; mediaType: string
}
const canaryTuple: PhotoCanaryTuple = { captureId: PHOTO_CANARY_ID, sourceHash: PHOTO_CANARY_SOURCE_HASH, normalizedHash: PHOTO_CANARY_NORMALIZED_HASH }

/** No request-supplied photo, identity, context or provider selection. The private
 * source is frozen; normalization must reproduce the exact approved derivative. */
export async function captureFixedPhotoCanary(db: SupabaseClient) {
  const owner = await photoIdentity(db, undefined, canaryTuple)
  const bytes = await readFile(join(process.cwd(), 'app/lib/nutrition/fixtures/nutrition-canary-source.jpg'))
  if (photoHash(bytes) !== PHOTO_CANARY_SOURCE_HASH) throw new PhotoPilotError(409,'The approved reference fixture does not match.')
  return capturePhoto(db, { expectedOwner: owner, requestId: PHOTO_CANARY_ID, bytes, mediaType: 'image/jpeg',
    capturedAt: PHOTO_CANARY_CREATED_AT, context: PHOTO_CANARY_CONTEXT, consent: 'selected-photo-openai-autolog-v1' }, canaryTuple)
}

/** Owner authorization for the minimal read-only canary route; no app mounting. */
export const canaryIdentity = (db: SupabaseClient) => photoIdentity(db, undefined, canaryTuple)

/** No worker, loop or retry. Replays reconcile safe database completion only.
 * Provider-start states are durable before dispatch and are never reclaimed. */
export async function capturePilotPhoto(db: SupabaseClient, input: PhotoInput) {
  if (isPhotoCanaryId(input.requestId)) throw new PhotoPilotError(409,'Use only the dedicated fixed reference canary.')
  return capturePhoto(db,input)
}

async function capturePhoto(db: SupabaseClient, input: PhotoInput, canary?: PhotoCanaryTuple) {
  const identity = () => photoIdentity(db, input.expectedOwner, canary)
  const owner = await identity()
  if (!uuid(input.requestId) || input.consent !== 'selected-photo-openai-autolog-v1'
    || typeof input.context !== 'string' || input.context.length > 1000
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.capturedAt)
    || !Number.isFinite(Date.parse(input.capturedAt))) throw new PhotoPilotError(422, 'Invalid selected-photo metadata.')
  let photo
  try { photo = await preparePilotPhoto(input.bytes, input.mediaType) }
  catch { throw new PhotoPilotError(422, 'Choose a readable JPEG or PNG under 1 MB.') }
  if (canary && (!fixedPhotoCanary({ captureId: input.requestId, sourceHash: photo.sourceHash, normalizedHash: photo.normalizedHash })
    || input.context !== PHOTO_CANARY_CONTEXT || input.capturedAt !== PHOTO_CANARY_CREATED_AT))
    throw new PhotoPilotError(409,'The approved reference normalization does not match.')
  let capture = await transition(db, input.requestId, 'reserve', { sourceHash: photo.sourceHash, normalizedHash: photo.normalizedHash,
    capturedAt: input.capturedAt, context: input.context, consent: input.consent, normalization: photo.normalization })
  if (!capture.claimed && !(canary && capture.state === 'photo_stored' && nutritionPhotoCanaryDispatchEnabled()))
    return !canary && capture.state === 'estimated' ? transition(db, capture.id, 'commit') : capture
  try {
    await identity()
    if (canary && capture.object_path !== `meals/${owner}/nutrition-canary/${PHOTO_CANARY_ID}.jpg`) throw new Error('Reference path mismatch')
    if (capture.claimed) {
      const uploaded = await db.storage.from('meal-photos').upload(capture.object_path, photo.bytes, { contentType: 'image/jpeg', upsert: false })
      if (uploaded.error) throw new Error('Upload unconfirmed')
      capture = await transition(db, capture.id, 'photo_stored')
    }
    if (canary) {
      // Stage-only deployment makes the exact private object available for real
      // owner/anonymous/foreign boundary proof BEFORE any paid gate is opened.
      await identity()
      const downloaded = await db.storage.from('meal-photos').download(capture.object_path)
      if (downloaded.error || !downloaded.data || photoHash(new Uint8Array(await downloaded.data.arrayBuffer())) !== PHOTO_CANARY_NORMALIZED_HASH)
        throw new Error('Private reference readback unconfirmed')
      if (!nutritionPhotoCanaryDispatchEnabled()) return capture
    }
    await identity()
    const screenAdmissionStart = performance.now()
    capture = await transition(db, capture.id, 'screen_start')
    const screenGrant = photoDispatchGuard(capture.dispatch_grant, 'screen', capture.id, screenAdmissionStart)
    const screenDispatch = () => {
      if (canary && (!nutritionPhotoCanaryEnabled() || !nutritionPhotoCanaryDispatchEnabled())) throw new Error('Canary dispatch paused')
      screenGrant()
    }
    const image = { base64Image: photo.bytes.toString('base64'), mediaType: 'image/jpeg' as const }
    const screened = await screenMealPhotoWithUsage({ ...image, beforeDispatch: screenDispatch })
    const { screening } = screened
    capture = await transition(db, capture.id, 'screen_result', { screening })
    await identity()
    if (canary && !screened.billing) throw new Error('Canary screening usage missing')
    if (screened.billing) await settlePhotoUsage(owner, capture.id, 'screen', screened.billing, canary)
    if (screening.route !== 'food_candidate') return capture
    await identity()
    const estimateAdmissionStart = performance.now()
    capture = await transition(db, capture.id, 'estimate_start')
    const estimateGrant = photoDispatchGuard(capture.dispatch_grant, 'estimate', capture.id, estimateAdmissionStart)
    const estimateDispatch = () => {
      if (canary && (!nutritionPhotoCanaryEnabled() || !nutritionPhotoCanaryDispatchEnabled())) throw new Error('Canary dispatch paused')
      estimateGrant()
    }
    const estimate = await analyzeMealPhotoWithEvidence({ ...image, provider: 'openai', model: PHOTO_ESTIMATION_MODEL, beforeDispatch: estimateDispatch, timeoutMs: 45_000, maxRetries: 0, store: false, context: input.context })
    if (estimate.provider !== 'openai' || estimate.model !== PHOTO_ESTIMATION_MODEL) throw new Error('Unexpected provider')
    const operation = photoDraftOperation(estimate.analysis, input.capturedAt)
    operation.sourceItemId = 'nutrition-photo:' + capture.id
    for (const field of [operation.provenance.occurrence, ...Object.values(operation.provenance.fields)]) {
      field.origin = 'model_estimated'; field.reviewState = 'unreviewed'; field.sourceReferences = ['nutrition-photo:' + capture.id]
    }
    capture = await transition(db, capture.id, 'estimate_result', { estimate,
      promptHash: photoHash(MEAL_PHOTO_ANALYSIS_PROMPT), parserVersion: 'meal-photo-v1', operation })
    await identity()
    const usage = photoUsageEvidence('estimate', estimate.model, estimate.billing)
    if (canary && !usage) throw new Error('Canary estimate usage missing')
    if (usage) await settlePhotoUsage(owner, capture.id, 'estimate', usage, canary)
    return canary ? capture : await transition(db, capture.id, 'commit')
  } catch {
    // Any call may have completed remotely. Never invent no-write/no-cost proof.
    try { return await transition(db, capture.id, 'uncertain') }
    catch { throw new PhotoPilotError(503, 'Capture outcome is unconfirmed. Retrieve the original capture; do not request another estimate.') }
  }
}
