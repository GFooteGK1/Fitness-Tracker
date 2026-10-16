import { cameraDevice, cameraResponse, cameraRpcError } from '@/app/lib/capture/camera-device'
export const runtime = 'nodejs'
export async function GET(request: Request) {
 const authorized = await cameraDevice(request)
 return authorized.response ?? cameraResponse(authorized.identity!)
}
export async function DELETE(request: Request) {
 const authorized = await cameraDevice(request, true)
 if (authorized.response) return authorized.response
 const result = await authorized.client!.rpc('camera_photo_request', { p_hash: authorized.hash, p_action: 'revoke' })
 return result.error ? cameraRpcError(result.error.code) : cameraResponse(result.data)
}
