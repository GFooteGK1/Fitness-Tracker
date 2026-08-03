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

export async function POST(request: NextRequest) {
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
        fallbackAction: 'manual_entry',
      }, { status: 503 })
    }
    
    // Timestamp is expected to be in ISO 8601 UTC format from the client
    // Client should convert local time to UTC before sending
    // Database stores as TIMESTAMPTZ (UTC)
    const mealTimestamp = timestamp

    const { data: meal, error: dbError } = await supabase
      .from('meals')
      .insert({
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
      })
      .select()
      .single()

    if (dbError) {
      console.error('[MealPhotoUpload]', {
        requestId,
        stage: 'database_insert_failed',
        errorCode: dbError.code,
      })
      return apiError('Database error', 500)
    }

    console.info('[MealPhotoUpload]', {
      requestId,
      stage: 'complete',
      itemCount: result.items.length,
      needsReview: result.confidence < 0.7,
    })

    return NextResponse.json({
      mealId: meal.id,
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
