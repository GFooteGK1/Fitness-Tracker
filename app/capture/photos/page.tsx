import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { PhotoMealReview } from '@/app/components/capture/PhotoMealReview'
import Link from 'next/link'
import { cameraBridgeEnabled } from '@/app/lib/capture/camera-device'

export default function PhotoReviewPage() {
  return <ProtectedRoute>
    {cameraBridgeEnabled() && <Link className="inline-flex min-h-[44px] items-center px-4 text-base text-blue-600" href="/capture/camera">Set up automatic camera photos</Link>}
    <PhotoMealReview />
  </ProtectedRoute>
}
