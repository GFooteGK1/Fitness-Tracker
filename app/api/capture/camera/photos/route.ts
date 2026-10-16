import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { normalizedCameraJPEG } from '@/app/lib/capture/camera-jpeg'
import { cameraBridgeEnabled, cameraDevice, cameraResponse as respond, cameraRpcError, cameraUUID } from '@/app/lib/capture/camera-device'
import { screenMealPhoto } from '@/app/lib/nutrition/photo-screening'
import { analyzeMealPhoto } from '@/app/lib/nutrition/meal-photo-analysis'
import { photoDraftOperation } from '@/app/lib/nutrition/photo-draft'

export const runtime = 'nodejs'
export const maxDuration = 120
const maximumBody = 1024 * 1024 + 8192
export async function POST(request: Request) {
 const authorized = await cameraDevice(request)
 if (authorized.response) return authorized.response
 // Bound the stream before multipart parsing, including chunked requests.
 const reader = request.body?.getReader()
 if (!reader) return respond({ error: 'Photo required.' }, 422)
 const parts: Uint8Array[] = []; let length = 0
 const timer = setTimeout(() => { void reader.cancel().catch(() => {}) }, 15_000)
 let interrupted = false
 try {
  while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length
   if (length > maximumBody) { await reader.cancel(); return respond({ error: 'Photo is too large.' }, 413) }; parts.push(part.value) }
 } catch { interrupted = true }
 finally { clearTimeout(timer) }
 if (interrupted) return respond({ error: 'Photo upload was interrupted.' }, 400)
 const form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body: Buffer.concat(parts) }).formData().catch(() => null)
 if (!form || [...form.keys()].some(k => !['photo','timestamp','requestId','contentHash'].includes(k)) || [...form.keys()].length !== 4) return respond({ error: 'Unsupported photo metadata.' }, 422)
 const photo = form.get('photo'), timestamp = form.get('timestamp'), id = form.get('requestId'), hash = form.get('contentHash')
 if (!(photo instanceof File) || photo.name !== 'photo.jpg' || photo.type !== 'image/jpeg' || photo.size < 1000 || photo.size > 1024 * 1024 || !cameraUUID(id)
  || typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) return respond({ error: 'Invalid normalized photo.' }, 422)
 const bytes = Buffer.from(await photo.arrayBuffer())
 if (!normalizedCameraJPEG(bytes)) return respond({ error: 'Use a normalized JPEG without private image metadata.' }, 422)
 if (hash !== createHash('sha256').update(bytes).digest('hex')) return respond({ error: 'Photo content changed.' }, 409)
 let normalized: Buffer
 try {
  // Reject damaged entropy data and impose a decoded-pixel bound. Re-encoding
  // strips container metadata before either provider sees the image.
  normalized = await sharp(bytes, { failOn: 'warning', limitInputPixels: 1200 * 1200 })
    .toColourspace('srgb').jpeg({ quality: 80 }).toBuffer()
 } catch { return respond({ error: 'Photo pixels could not be validated.' }, 422) }
 const rpc = (action: string, extras: object = {}) => authorized.client!.rpc('camera_photo_request', { p_hash: authorized.hash, p_action: action, p_id: id, ...extras })
 const claim = await rpc('begin', { p_content_hash: hash, p_captured_at: timestamp })
 if (claim.error) return cameraRpcError(claim.error.code)
 if (!claim.data?.claimed) return respond(claim.data)
 const finish = async (outcome: string, operation?: object) => {
  try {
  const result = await rpc('finish', { p_outcome: outcome, p_operation: operation ?? null })
  return result.error ? respond({ requestId: id, state: 'unconfirmed', error: 'Check the original request status. Do not resend the photo.' }, 503) : respond(result.data)
  } catch { return respond({ requestId: id, state: 'unconfirmed', error: 'Check the original request status. Do not resend the photo.' }, 503) }
 }
 try {
  if (!cameraBridgeEnabled()) return await finish('failed')
  const permitted = await rpc('check'); if (permitted.error) return cameraRpcError(permitted.error.code)
  const input = { base64Image: normalized.toString('base64'), mediaType: 'image/jpeg' as const }
  const screening = await screenMealPhoto(input)
  if (screening.route !== 'food_candidate') return await finish(screening.route === 'non_food_candidate' ? 'non_food' : 'review_required')
  // Recheck after screening's suspension, before the next provider dispatch.
  if (!cameraBridgeEnabled()) return await finish('failed')
  const current = await rpc('check'); if (current.error) return cameraRpcError(current.error.code)
  const analysis = await analyzeMealPhoto({ ...input, timeoutMs: 45_000, maxRetries: 0 })
  const operation = photoDraftOperation(analysis, timestamp)
  operation.response = { ...operation.response, screening }
  return await finish('draft', operation)
 } catch { return await finish('failed') }
}
