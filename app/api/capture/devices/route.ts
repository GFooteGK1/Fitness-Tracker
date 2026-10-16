import { randomBytes, randomUUID } from 'node:crypto'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { cameraBridgeEnabled, cameraResponse as respond, cameraUUID, deviceHash } from '@/app/lib/capture/camera-device'
import { revokeCameraDevices } from '@/app/lib/capture/revoke-camera-devices'

export const runtime = 'nodejs'
export async function GET() {
 const client = await createServerClient(), { data: { user }, error } = await client.auth.getUser()
 if (error || !user) return respond({ error: 'Unauthorized' }, 401)
 if (!cameraBridgeEnabled()) return respond({ error: 'Camera setup is paused.' }, 409)
 const result = await client.rpc('camera_photo_device_control', { p_action: 'list' })
 return result.error ? respond({ error: 'Camera setup is unavailable.' }, 503) : respond({ devices: result.data, userId: user.id })
}
export async function POST(request: Request) {
 const client = await createServerClient(), { data: { user }, error } = await client.auth.getUser()
 if (error || !user) return respond({ error: 'Unauthorized' }, 401)
 if (!cameraBridgeEnabled()) return respond({ error: 'Camera setup is paused.' }, 409)
 const body = await request.json().catch(() => null)
 if (!body || body.expectedUserId !== user.id) return respond({ error: 'The signed-in account changed.' }, 403)
 if (Object.keys(body).some(k => !['expectedUserId','consentPolicy'].includes(k)) || body.consentPolicy !== 'camera-cloud-v1') return respond({ error: 'Approve cloud photo screening first.' }, 422)
 const id = randomUUID(), token = `${id}.${randomBytes(32).toString('hex')}`
 const result = await client.rpc('camera_photo_device_control', { p_action: 'create', p_id: id, p_hash: deviceHash(token), p_policy: body.consentPolicy })
 if (result.error) return respond({ error: 'Pairing was not confirmed. Disable all camera devices before trying a new pairing.' }, result.error.code === '54000' ? 429 : 503)
 return respond({ ...result.data, token, userId: user.id })
}
export async function DELETE(request: Request) {
 const client = await createServerClient(), { data: { user }, error } = await client.auth.getUser()
 if (error || !user) return respond({ error: 'Unauthorized' }, 401)
 const body = await request.json().catch(() => null)
 if (!body || body.expectedUserId !== user.id) return respond({ error: 'The signed-in account changed.' }, 403)
 if (Object.keys(body).some(k => !['expectedUserId','deviceId'].includes(k)) || body.deviceId != null && !cameraUUID(body.deviceId)) return respond({ error: 'Invalid device.' }, 422)
 try { await revokeCameraDevices(client, body.deviceId ?? null) }
 catch { return respond({ error: 'Disable was not confirmed. Camera devices may still be active.' }, 503) }
 return respond({ revoked: true, userId: user.id })
}
