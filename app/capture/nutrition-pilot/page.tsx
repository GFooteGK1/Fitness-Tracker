import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { NutritionPhotoPilot } from '@/app/components/capture/NutritionPhotoPilot'
import { nutritionPhotoPilotEnabled } from '@/app/lib/nutrition/photo-pilot-policy'

export default function NutritionPilotPage() {
  return <ProtectedRoute>{nutritionPhotoPilotEnabled() ? <NutritionPhotoPilot/> : <p className="p-4 text-base">Nutrition photo pilot is awaiting activation approval.</p>}</ProtectedRoute>
}
