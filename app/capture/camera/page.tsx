import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { CameraPhotoSetup } from '@/app/components/capture/CameraPhotoSetup'
import { cameraBridgeEnabled } from '@/app/lib/capture/camera-device'
export default function CameraSetupPage() {
 return <ProtectedRoute>{cameraBridgeEnabled() ? <CameraPhotoSetup /> : <p className="p-4 text-base">Camera photo setup is paused.</p>}</ProtectedRoute>
}
