import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

export const cameraBridgeEnabled = () => process.env.CAMERA_PHOTO_BRIDGE_ENABLED === 'true' && personalizedCoachingCapabilities().captureReceiptsV2
export const cameraResponse = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export const deviceHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const cameraUUID = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
export async function cameraDevice(request: Request, revoking = false) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9-]{36}\.[a-f0-9]{64})$/)?.[1]
  if (!token || !cameraUUID(token.split('.')[0])) return { response: cameraResponse({ error: 'Unauthorized device.' }, 401) }
  if (!revoking && !cameraBridgeEnabled()) return { response: cameraResponse({ error: 'Camera photo logging is paused.' }, 409) }
  try {
    const client = createServiceRoleClient(), hash = deviceHash(token)
    const { data, error } = await client.rpc('camera_photo_request', { p_hash: hash, p_action: 'check' })
    if (error || !data || data.deviceId !== token.split('.')[0]) return { response: cameraResponse({ error: 'Unauthorized device.' }, error?.code === '42501' ? 401 : 503) }
    return { client, hash, identity: data }
  } catch { return { response: cameraResponse({ error: 'Camera photo logging is unavailable.' }, 503) } }
}
export const cameraRpcError = (code?: string) => cameraResponse({ error: code === '42501' ? 'Unauthorized device.' : code === '22023' ? 'This photo request conflicts with its original input or admission time.' : code === '54000' ? 'Camera photo limit reached.' : 'Camera photo logging is unavailable.' }, code === '42501' ? 401 : code === '22023' ? 409 : code === '54000' ? 429 : 503)
