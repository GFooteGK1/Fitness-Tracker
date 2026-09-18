import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { resolveAnalysisUrl } from '@/app/lib/photo-url'
import { NutritionalAnalysis } from '@/app/lib/types/food-tracking'
import { validateMealData } from '@/app/lib/macro-validation'
import { replayJsonRequest, loggingContext, markCaptureCorrectionFailure } from '@/app/lib/logging/server'
import { auditedCaptureInstalled } from '@/app/lib/capture/compatibility'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { amendActivity, validCorrection } from '@/app/lib/capture/corrections'
import {
  analyzeMealPhoto,
  type MealPhotoMediaType,
} from '@/app/lib/nutrition/meal-photo-analysis'
import { 
  categorizeError, 
  retryWithBackoff, 
  logError, 
  DEFAULT_RETRY_CONFIG,
  ErrorContext 
} from '@/app/lib/error-handling'

// AI analysis timeout: 15 seconds as per requirements
const AI_TIMEOUT_MS = 15000

async function processAnalysis(request: NextRequest) {
  const context: ErrorContext = {
    operation: 'ai_analysis',
    userAgent: request.headers.get('user-agent') || undefined,
    networkStatus: 'online' // Assume online if request reached server
  }

  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { photoUrl, mealId } = body

    // Validate required fields
    if (!photoUrl || !mealId) {
      const error = new Error('Missing required fields: photoUrl, mealId')
      logError(error, { ...context, mealId })
      return NextResponse.json(
        { error: 'Missing required fields: photoUrl, mealId' },
        { status: 400 }
      )
    }

    // Verify meal exists and belongs to authenticated user
    const { data: mealData, error: mealError } = await supabase
      .from('meals')
      .select('*')
      .eq('id', mealId)
      .eq('user_id', user.id)
      .single()

    if (mealError || !mealData) {
      const error = new Error('Meal not found or access denied')
      logError(error, context)
      return NextResponse.json(
        { error: 'Meal not found or access denied' },
        { status: 404 }
      )
    }

    // SSRF guard: prefer the server-stored photo_url; otherwise accept the
    // client-supplied photoUrl only if it points at our own Supabase host —
    // never fetch an arbitrary caller-provided URL. (photo_url is currently
    // unpopulated by the app, so in practice the allowlisted client URL is the
    // usable source.)
    const analysisUrl = resolveAnalysisUrl(mealData.photo_url, photoUrl)
    if (!analysisUrl) {
      return NextResponse.json(
        { error: 'No usable photo URL to analyze' },
        { status: 400 }
      )
    }

    if (await auditedCaptureInstalled(supabase)) {
      const identity = { entityId: mealId, expectedRevision: body.expectedRevision, requestId: loggingContext.getStore()?.id ?? body.requestId }
      if (body.expectedUserId !== user.id || !validCorrection(identity)) return NextResponse.json({ error: 'Reload this meal before reviewing another estimate.' }, { status: 422 })
      const analysis = await analyzePhoto(analysisUrl)
      const normalized = normalizeActivity('meal', { ...mealData, items: analysis.meal_items, needs_review: true, ai_confidence: analysis.confidence })
      if (body.confirmed === true) {
        const pendingContext = loggingContext.getStore()
        if (pendingContext) pendingContext.writeAttempted = true
        const receipt = await amendActivity(supabase, user.id, 'meal', identity, normalized.record, false, true)
        const capture = loggingContext.getStore()
        if (capture) capture.receipts = [receipt]
        return NextResponse.json({ mealId, nutritionalData: analysis, analysisStatus: 'complete', receipts: [receipt] })
      }
      const operation = { sourceItemId: 'analysis:0', kind: 'meal', ...normalized, inputMethod: 'photo', eventAt: mealData.meal_timestamp,
        provenance: captureProvenance('meal'), response: { correction: { entityId: mealId, expectedRevision: identity.expectedRevision } } }
      const { data: draft, error } = await supabase.rpc('save_activity_draft', { p_request_id: identity.requestId, p_draft_id: null, p_expected_revision: null, p_operation: operation, p_discard: false })
      if (error) return NextResponse.json({ error: 'The estimate draft could not be confirmed.' }, { status: 503 })
      return NextResponse.json({ mealId, nutritionalData: analysis, analysisStatus: 'draft', draft, canonicalChanged: false })
    }

    let nutritionalData: NutritionalAnalysis

    try {
      // Use retry logic for AI analysis with exponential backoff
      nutritionalData = await retryWithBackoff(
        async () => {
          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI analysis timeout')), AI_TIMEOUT_MS)
          })

          // Create AI analysis promise (uses the DB-stored URL, never the client's)
          const analysisPromise = analyzePhoto(analysisUrl)

          // Race between analysis and timeout
          return await Promise.race([analysisPromise, timeoutPromise])
        },
        {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: 2 // Limit AI retries to avoid long delays
        },
        context
      )

    } catch (error) {
    markCaptureCorrectionFailure(error)
      logError(error, context)
      const errorResult = categorizeError(error, context)
      
      // Flag meal for manual review
      await supabase
        .from('meals')
        .update({ 
          needs_review: true,
          ai_confidence: null
        })
        .eq('id', mealId)
        .eq('user_id', user.id)

      return NextResponse.json(
        { 
          error: errorResult.userMessage,
          details: errorResult.technicalMessage,
          mealId,
          analysisStatus: 'failed',
          shouldRetry: errorResult.shouldRetry,
          retryAfter: errorResult.retryAfter,
          fallbackAction: errorResult.fallbackAction
        },
        { status: 500 }
      )
    }

    // Validate meal data using comprehensive validation
    const mealValidation = validateMealData(
      nutritionalData.meal_items,
      nutritionalData.total_macros,
      nutritionalData.confidence
    )

    if (!mealValidation.isValid) {
      const error = new Error(`Meal validation failed: ${mealValidation.errors.join(', ')}`)
      logError(error, context)
      
      // Flag meal for manual review
      await supabase
        .from('meals')
        .update({ 
          needs_review: true,
          ai_confidence: nutritionalData.confidence || null
        })
        .eq('id', mealId)
        .eq('user_id', user.id)

      return NextResponse.json(
        { 
          error: 'Meal data validation failed. Your meal has been flagged for review.',
          details: mealValidation.errors,
          warnings: mealValidation.warnings,
          mealId,
          analysisStatus: 'failed',
          shouldRetry: false,
          fallbackAction: 'flag_for_manual_review'
        },
        { status: 400 }
      )
    }

    // Use calculated totals to ensure consistency (Requirements 2.3, 5.3)
    const finalData: NutritionalAnalysis = {
      ...nutritionalData,
      total_macros: mealValidation.calculatedTotals
    }

    // Log warnings if any
    if (mealValidation.warnings.length > 0) {
      console.warn('Meal validation warnings:', mealValidation.warnings)
    }

    // Update meal with AI analysis results using retry logic for database operations
    try {
      await retryWithBackoff(
        async () => {
          const { error: updateError } = await supabase
            .from('meals')
            .update({
              items: finalData.meal_items,
              total_protein: finalData.total_macros.protein,
              total_carbs: finalData.total_macros.carbs,
              total_fat: finalData.total_macros.fat,
              total_calories: finalData.total_macros.calories,
              ai_confidence: finalData.confidence,
              needs_review: mealValidation.needsReview // Use validation result
            })
            .eq('id', mealId)
            .eq('user_id', user.id)

          if (updateError) {
            throw updateError
          }
        },
        DEFAULT_RETRY_CONFIG,
        { ...context, operation: 'database' }
      )
    } catch (error) {
    markCaptureCorrectionFailure(error)
      logError(error, { ...context, operation: 'database' })
      return NextResponse.json(
        { error: 'Failed to save analysis results. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      nutritionalData: finalData,
      confidence: finalData.confidence,
      mealId,
      analysisStatus: 'complete',
      warnings: mealValidation.warnings.length > 0 ? mealValidation.warnings : undefined,
      needsReview: mealValidation.needsReview
    })

  } catch (error) {
    markCaptureCorrectionFailure(error)
    logError(error, context)
    const errorResult = categorizeError(error, context)
    
    return NextResponse.json(
      { 
        error: errorResult.userMessage,
        details: errorResult.technicalMessage,
        shouldRetry: errorResult.shouldRetry,
        retryAfter: errorResult.retryAfter
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return await auditedCaptureInstalled(supabase) ? await replayJsonRequest(request, 'meal-analysis', processAnalysis) : await processAnalysis(request) }
  catch { return NextResponse.json({ error: 'Capture compatibility is unavailable; retry this request.' }, { status: 503 }) }
}

async function analyzePhoto(photoUrl: string): Promise<NutritionalAnalysis> {
  // Fetch the image data
  const imageResponse = await fetch(photoUrl)
  if (!imageResponse.ok) {
    throw new Error('Failed to fetch image from URL')
  }

  const imageBuffer = await imageResponse.arrayBuffer()
  const imageBase64 = Buffer.from(imageBuffer).toString('base64')
  
  // Determine image type from URL or default to jpeg
  const imageType: MealPhotoMediaType =
    photoUrl.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
  const analysis = await analyzeMealPhoto({
    base64Image: imageBase64,
    mediaType: imageType,
  })

  return {
    meal_items: analysis.items,
    total_macros: {
      protein: analysis.total_protein,
      carbs: analysis.total_carbs,
      fat: analysis.total_fat,
      calories: analysis.total_calories,
    },
    confidence: analysis.confidence,
  }
}
