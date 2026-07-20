import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { extractJson } from '@/app/lib/llm/json'
import { NutritionalAnalysis, FoodItem, MacroTotals } from '@/app/lib/types/food-tracking'
import { validateMealData, calculateTotalMacros } from '@/app/lib/macro-validation'
import { 
  categorizeError, 
  retryWithBackoff, 
  logError, 
  DEFAULT_RETRY_CONFIG,
  ErrorContext 
} from '@/app/lib/error-handling'

// AI analysis timeout: 15 seconds as per requirements
const AI_TIMEOUT_MS = 15000

// Structured prompt for Claude API
const NUTRITION_ANALYSIS_PROMPT = `Analyze this meal photo and extract nutritional information. Return JSON with:
{
  "meal_items": [
    {
      "food": "specific food name",
      "portion": "estimated portion with units",
      "protein": number,
      "carbs": number,
      "fat": number,
      "calories": number
    }
  ],
  "total_macros": {
    "protein": total_protein,
    "carbs": total_carbs,
    "fat": total_fat,
    "calories": total_calories
  },
  "confidence": 0.0-1.0
}

Guidelines:
- Identify all visible food items
- Estimate portions in standard units (oz, cups, grams)
- Use USDA nutritional data for calculations
- Flag unusual combinations or unclear items
- Return confidence score based on image clarity
- Ensure all numbers are valid decimals
- Include only foods that are clearly visible`

export async function POST(request: NextRequest) {
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

    const { photoUrl, mealId } = await request.json()

    // Validate required fields
    if (!photoUrl || !mealId) {
      const error = new Error('Missing required fields: photoUrl, mealId')
      logError(error, { ...context, mealId })
      return NextResponse.json(
        { error: 'Missing required fields: photoUrl, mealId' },
        { status: 400 }
      )
    }

    context.mealId = mealId
    context.photoUrl = photoUrl
    context.userId = user.id

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

    // Use the canonical photo URL stored on the meal row, NOT the client-supplied
    // photoUrl — the server must never fetch an arbitrary caller-provided URL (SSRF).
    const analysisUrl: string | null = mealData.photo_url ?? null
    if (!analysisUrl) {
      return NextResponse.json(
        { error: 'Meal has no photo to analyze' },
        { status: 400 }
      )
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
          const analysisPromise = analyzePhotoWithClaude(analysisUrl)

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

    // Validate and process the AI response
    const validationResult = validateNutritionalData(nutritionalData)
    if (!validationResult.isValid) {
      const error = new Error(`Invalid AI response: ${validationResult.errors.join(', ')}`)
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
          error: 'AI analysis returned invalid data format. Your meal has been flagged for review.',
          details: validationResult.errors,
          mealId,
          analysisStatus: 'failed',
          shouldRetry: true,
          retryAfter: 30,
          fallbackAction: 'flag_for_manual_review'
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

async function analyzePhotoWithClaude(photoUrl: string): Promise<NutritionalAnalysis> {
  // Fetch the image data
  const imageResponse = await fetch(photoUrl)
  if (!imageResponse.ok) {
    throw new Error('Failed to fetch image from URL')
  }

  const imageBuffer = await imageResponse.arrayBuffer()
  const imageBase64 = Buffer.from(imageBuffer).toString('base64')
  
  // Determine image type from URL or default to jpeg
  const imageType = photoUrl.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'

  const llmResult = await complete({
    purpose: 'vision',
    maxTokens: 1000,
    temperature: 0,
    reasoningEffort: 'low',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', mediaType: imageType, base64: imageBase64 },
          { type: 'text', text: NUTRITION_ANALYSIS_PROMPT },
        ],
      },
    ],
  })

  // Parse JSON response
  const nutritionalData = extractJson<NutritionalAnalysis>(llmResult.text)
  if (!nutritionalData) {
    console.error('Failed to parse AI response:', llmResult.text)
    throw new Error('Invalid JSON in Claude response')
  }
  return nutritionalData
}

function validateNutritionalData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check top-level structure
  if (!data || typeof data !== 'object') {
    errors.push('Response is not an object')
    return { isValid: false, errors }
  }

  // Check meal_items array
  if (!Array.isArray(data.meal_items)) {
    errors.push('meal_items is not an array')
  } else {
    data.meal_items.forEach((item: any, index: number) => {
      if (!item.food || typeof item.food !== 'string') {
        errors.push(`Item ${index}: missing or invalid food name`)
      }
      if (!item.portion || typeof item.portion !== 'string') {
        errors.push(`Item ${index}: missing or invalid portion`)
      }
      
      const numericFields = ['protein', 'carbs', 'fat', 'calories']
      numericFields.forEach(field => {
        if (typeof item[field] !== 'number' || isNaN(item[field]) || item[field] < 0) {
          errors.push(`Item ${index}: invalid ${field} value`)
        }
      })
    })
  }

  // Check total_macros object
  if (!data.total_macros || typeof data.total_macros !== 'object') {
    errors.push('total_macros is not an object')
  } else {
    const macroFields = ['protein', 'carbs', 'fat', 'calories']
    macroFields.forEach(field => {
      if (typeof data.total_macros[field] !== 'number' || isNaN(data.total_macros[field]) || data.total_macros[field] < 0) {
        errors.push(`total_macros: invalid ${field} value`)
      }
    })
  }

  // Check confidence score
  if (typeof data.confidence !== 'number' || isNaN(data.confidence) || data.confidence < 0 || data.confidence > 1) {
    errors.push('Invalid confidence score (must be 0.0-1.0)')
  }

  return { isValid: errors.length === 0, errors }
}
