import { cameraDevice, cameraResponse, cameraRpcError, cameraUUID } from '@/app/lib/capture/camera-device'
export const runtime = 'nodejs'
export async function GET(request: Request) {
 const authorized = await cameraDevice(request)
 if (authorized.response) return authorized.response
 const url = new URL(request.url), id = url.searchParams.get('requestId')
 if (!cameraUUID(id) || [...url.searchParams.keys()].some(k => k !== 'requestId')) return cameraResponse({ error: 'Invalid request identity.' }, 422)
 const { data, error } = await authorized.client!.rpc('camera_photo_request', { p_hash: authorized.hash, p_action: 'status', p_id: id })
 return error ? cameraRpcError(error.code) : cameraResponse(data)
}
