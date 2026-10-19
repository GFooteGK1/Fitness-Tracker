/** Reviewed code gates only. Account evidence precedes any live schema/write;
 * owner/anonymous/foreign Storage proof precedes the separate dispatch gate. */
export const NUTRITION_PHOTO_CANARY_ACTIVE = false
export const NUTRITION_PHOTO_CANARY_DISPATCH_ACTIVE = false
export const nutritionPhotoCanaryEnabled = () => NUTRITION_PHOTO_CANARY_ACTIVE
export const nutritionPhotoCanaryDispatchEnabled = () => NUTRITION_PHOTO_CANARY_DISPATCH_ACTIVE
export const PHOTO_CANARY_ID = '853b894f-fa52-5fec-b503-91c11bdb0978'
export const PHOTO_CANARY_SOURCE_HASH = '1a1538d2fe45cde4d3d2e74492321041931c806b5dc2f4c73d6ef8f5e21b72ea'
export const PHOTO_CANARY_NORMALIZED_HASH = '6553ebd2ac41d5f32d2aefd2bc41c6424b6560fa0d9266b6bb93e0ef807b383a'
export const PHOTO_CANARY_CONSENT = 'fixed-synthetic-nutrition-canary-v1'
export const PHOTO_CANARY_CONTEXT = 'CANARY ONLY, NOT CONSUMED. Locally drawn chicken/rice/broccoli illustration, not a real meal or measured portion.'
// Illustration creation time, never a claimed consumption time. Stable on replay.
export const PHOTO_CANARY_CREATED_AT = '2026-10-19T21:35:48.411Z'
export interface PhotoCanaryTuple { captureId: string; sourceHash: string; normalizedHash: string }
export function fixedPhotoCanary(tuple: PhotoCanaryTuple) {
  return tuple.captureId === PHOTO_CANARY_ID && tuple.sourceHash === PHOTO_CANARY_SOURCE_HASH
    && tuple.normalizedHash === PHOTO_CANARY_NORMALIZED_HASH
}
export const isPhotoCanaryId = (id: string) => typeof id === 'string' && id.toLowerCase() === PHOTO_CANARY_ID
