import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { PhotoMealReview } from '@/app/components/capture/PhotoMealReview'

export default function PhotoReviewPage() {
  return <ProtectedRoute><PhotoMealReview /></ProtectedRoute>
}
