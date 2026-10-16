import type { CaptureOperation } from '@/app/lib/capture/contracts'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { parseMealPhotoAnalysis, type MealPhotoAnalysis } from './meal-photo-analysis'
import type { FoodItem } from '@/app/lib/types/food-tracking'

export interface PhotoMealDraft {
  id: string
  user_id: string
  revision: number
  status: string
  expires_at: string
  kind: 'meal'
  input_method: 'photo'
  normalized: CaptureOperation & { record: { items: FoodItem[]; meal_timestamp: string; ai_confidence: number; total_calories: number } }
}

/** Selection authorizes analysis, not a claim that the pictured food was eaten. */
export function photoDraftOperation(analysis: MealPhotoAnalysis, timestamp: string): CaptureOperation {
  const provenance = captureProvenance('meal')
  provenance.occurrence = { origin: 'model_estimated', reviewState: 'unreviewed', sourceReferences: [] }
  return { sourceItemId: 'photo-review', kind: 'meal', inputMethod: 'photo', eventAt: timestamp,
    ...normalizeActivity('meal', { meal_timestamp: timestamp, items: analysis.items, ai_confidence: analysis.confidence, needs_review: true }),
    provenance, response: { analysisNotes: analysis.notes } }
}

/** Apply the analyzer's bounded item contract to corrections too. Ignore client totals. */
export function reviewedPhotoItems(items: unknown): FoodItem[] {
  return parseMealPhotoAnalysis(JSON.stringify({ items, total_protein: 0, total_carbs: 0,
    total_fat: 0, total_calories: 0, confidence: 0, notes: '' })).items
}
