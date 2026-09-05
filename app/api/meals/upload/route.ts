import { beginRequest, finishRequest, loggingContext, saveActivity, validRequestId } from '@/app/lib/logging/server'
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import {
  analyzeMealPhoto,
  MealPhotoAnalysisError,
  type MealPhotoMediaType,
} from '@/app/lib/nutrition/meal-photo-analysis'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MIN_FILE_SIZE = 1000

async function processUpload(request: NextRequest) {
  const requestId = randomUUID()

  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.warn('[MealPhotoUpload]', {
        requestId,
        stage: 'authentication_rejected',
        errorCode: authError?.code,
      })
      return apiError('Unauthorized', 401)
    }

    const formData = await request.formData()
    const file = formData.get('photo')
    const timestamp = formData.get('timestamp')

    if (!(file instanceof File) || typeof timestamp !== 'string' || !timestamp) {
      return apiError('Missing photo or timestamp', 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError('File too large (max 10MB)', 400)
    }

    if (file.size < MIN_FILE_SIZE) {
      return apiError('File too small or corrupted', 400)
    }

    // Normalize media type
    let mediaType: MealPhotoMediaType = 'image/jpeg'
    if (file.type === 'image/png') mediaType = 'image/png'
    else if (file.type === 'image/webp') mediaType = 'image/webp'
    else if (file.type === 'image/gif') mediaType = 'image/gif'
    else if (file.type === 'image/jpeg' || file.type === 'image/jpg') mediaType = 'image/jpeg'

    const fileBuffer = await file.arrayBuffer()
    const base64Image = Buffer.from(fileBuffer).toString('base64')

    let result
    try {
      result = await analyzeMealPhoto({ base64Image, mediaType })
    } catch (error) {
      if (error instanceof MealPhotoAnalysisError) {
        console.warn('[MealPhotoUpload]', {
          requestId,
          stage: 'analysis_rejected',
          errorCode: error.code,
        })
        return NextResponse.json({
          requestId,
          analysisStatus: 'failed',
          error: 'Could not reliably identify the meal. Try a clearer photo or enter it manually.',
          shouldRetry: true,
          retrySafe: true,
          fallbackAction: 'manual_entry',
        }, { status: 422 })
      }

      console.error('[MealPhotoUpload]', {
        requestId,
        stage: 'analysis_unavailable',
        errorType: error instanceof Error ? error.name : 'unknown',
      })
      return NextResponse.json({
        requestId,
        analysisStatus: 'failed',
        error: 'Meal photo analysis is temporarily unavailable. Please try again or enter the meal manually.',
        shouldRetry: true,
          retrySafe: true,
        fallbackAction: 'manual_entry',
      }, { status: 503 })
    }
    
    // Timestamp is expected to be in ISO 8601 UTC format from the client
    // Client should convert local time to UTC before sending
    // Database stores as TIMESTAMPTZ (UTC)
    const mealTimestamp = timestamp

    const mealId = await saveActivity(supabase, 'meal', {
        user_id: user.id,
        meal_timestamp: mealTimestamp,
        photo_url: null,
        items: result.items,
        total_protein: result.total_protein,
        total_carbs: result.total_carbs,
        total_fat: result.total_fat,
        total_calories: result.total_calories,
        needs_review: result.confidence < 0.7 || result.items.length === 0,
        ai_confidence: result.confidence
      }, [], { analysisStatus: 'complete', analysis: result })

    console.info('[MealPhotoUpload]', {
      requestId,
      stage: 'complete',
      itemCount: result.items.length,
      needsReview: result.confidence < 0.7,
    })

    return NextResponse.json({
      mealId,
      analysisStatus: 'complete',
      analysis: result
    })

  } catch (error) {
    console.error('[MealPhotoUpload]', {
      requestId,
      stage: 'unexpected_error',
      errorType: error instanceof Error ? error.name : 'unknown',
    })
    return apiError('Server error', 500)
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return apiError('Unauthorized', 401)
  let form: FormData
  try { form = await request.clone().formData() } catch { return apiError('Invalid photo upload', 400) }
  const expectedUserId = form.get('expectedUserId')
  if (expectedUserId && expectedUserId !== user.id) return apiError('The signed-in account changed. Sign back in to the original account to retry.', 403)
  const file = form.get('photo')
  const timestamp = form.get('timestamp')
  if (!(file instanceof File) || file.size < MIN_FILE_SIZE || file.size > MAX_FILE_SIZE) return apiError('Invalid photo size', 400)
  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return apiError('Unsupported photo format', 400)
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return apiError('Invalid timestamp', 400)
  const requestId = form.get('requestId')
  if (!validRequestId(requestId)) return apiError('A requestId is required. Refresh the app and try again.', 400)
  const hash = createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
  const claim = await beginRequest(supabase, `photo:${requestId}`, JSON.stringify([hash, file.type, timestamp]))
  if (claim.response) return claim.response
  try {
    return await loggingContext.run({ id: claim.id! }, async () => {
      const response = await processUpload(request)
      // Successful photo responses are committed atomically with the meal.
      return response.ok ? response : await finishRequest(supabase, claim.id!, response)
    })
  } catch {
    return apiError('The upload result is uncertain. Retry the same photo or check meal history before logging again.', 503)
  }
}
