import sharp from 'sharp'
import { createHash } from 'node:crypto'

export const PHOTO_PILOT_NORMALIZATION = 'decoded-jpeg-v1'
export const photoHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

/** Original input remains transient. Only a decoded, metadata-free derivative is
 * retained privately; MIME and filename alone never establish a valid image. */
export async function preparePilotPhoto(bytes: Uint8Array, mediaType: string) {
  if (bytes.length < 100 || bytes.length > 1024 * 1024 || !['image/jpeg','image/png'].includes(mediaType)) throw new Error('Invalid photo')
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 12_000_000, animated: false })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1
    || metadata.format !== (mediaType === 'image/jpeg' ? 'jpeg' : 'png')) throw new Error('Invalid photo')
  const normalized = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  if (normalized.length > 1024 * 1024) throw new Error('Photo is too large')
  return { bytes: normalized, sourceHash: photoHash(bytes), normalizedHash: photoHash(normalized), normalization: PHOTO_PILOT_NORMALIZATION }
}
