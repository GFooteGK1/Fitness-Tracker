import type { SupabaseClient } from '@supabase/supabase-js'

// Available even when upload is paused. Missing RPC/cache and transport errors
// are unconfirmed revocations, never evidence that no credentials exist.
export async function revokeCameraDevices(client: Pick<SupabaseClient, 'rpc'>, deviceId: string | null = null) {
  const result = await client.rpc('camera_photo_device_control', {
    p_action: deviceId ? 'revoke' : 'revoke_all', p_id: deviceId,
  })
  if (result.error || result.data?.revoked !== true) {
    throw new Error('Camera device disable was not confirmed. Try again while connected.')
  }
}
