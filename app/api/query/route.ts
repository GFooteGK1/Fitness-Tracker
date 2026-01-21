/**
 * Holistic Query API Route
 * Unified cross-domain fitness intelligence endpoint
 * Requirements: 1.1, 2.1, 2.2, 2.3, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { classifyIntent } from './lib/intent-classifier'
import {
  fetchWorkoutData,
  fetchNutritionData,
  fetchCrossDomainData,
  createDefaultTimeWindow,
} from './lib/domain-fetchers'
import { generateResponse, ResponseGeneratorError } from './lib/response-generator'
import { QueryResponse, QueryErrorResponse, QueryIntent } from './lib/types'

// Maximum question length (Requirement 7.2)
const MAX_QUESTION_LENGTH = 2000

/**
 * Validates the question input
 * Requirements: 7.1, 7.2
 */
function validateQuestion(question: unknown): { valid: true; question: string } | { valid: false; error: string } {
  // Check if question is present (Requirement 7.1)
  if (!question || typeof question !== 'string') {
    return { valid: false, error: 'Question is required' }
  }

  const trimmedQuestion = question.trim()

  // Check if question is empty (Requirement 7.1)
  if (!trimmedQuestion) {
    return { valid: false, error: 'Question is required' }
  }

  // Check question length (Requirement 7.2)
  if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
    return { valid: false, error: 'Question too long' }
  }

  return { valid: true, question: trimmedQuestion }
}

/**
 * Counts the data fetched for metadata
 */
function countFetchedData(
  intent: QueryIntent,
  data: Awaited<ReturnType<typeof fetchWorkoutData>> | Awaited<ReturnType<typeof fetchNutritionData>> | Awaited<ReturnType<typeof fetchCrossDomainData>>
): { workouts?: number; meals?: number; prs?: number } {
  if (intent === 'WORKOUT_ONLY') {
    const workoutData = data as Awaited<ReturnType<typeof fetchWorkoutData>>
    return {
      workouts: workoutData.workouts.length,
      prs: workoutData.benchmarkPrs.length,
    }
  }

  if (intent === 'NUTRITION_ONLY') {
    const nutritionData = data as Awaited<ReturnType<typeof fetchNutritionData>>
    return {
      meals: nutritionData.meals.length,
    }
  }

  // CROSS_DOMAIN
  const crossDomainData = data as Awaited<ReturnType<typeof fetchCrossDomainData>>
  return {
    workouts: crossDomainData.workout.workouts.length,
    meals: crossDomainData.nutrition.meals.length,
    prs: crossDomainData.workout.benchmarkPrs.length,
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const supabase = await createServerClient()

    // Authentication check at start of handler (Requirement 7.4)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' } as QueryErrorResponse,
        { status: 401 }
      )
    }

    // Parse request body
    let body: { question?: unknown; timeWindowDays?: number; tzOffset?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' } as QueryErrorResponse,
        { status: 400 }
      )
    }

    // Validate question input (Requirements 7.1, 7.2)
    const validation = validateQuestion(body.question)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error } as QueryErrorResponse,
        { status: 400 }
      )
    }

    const question = validation.question
    const timeWindowDays = body.timeWindowDays || 180
    const tzOffset = body.tzOffset || 0 // Client timezone offset in minutes

    // Classify intent from user question (Requirement 1.1)
    const classification = await classifyIntent(question)
    const { intent, confidence } = classification

    // Create time window for data fetching
    const timeWindow = createDefaultTimeWindow(timeWindowDays)

    // Fetch data based on classified intent (Requirements 2.1, 2.2, 2.3)
    let data: Awaited<ReturnType<typeof fetchWorkoutData>> | Awaited<ReturnType<typeof fetchNutritionData>> | Awaited<ReturnType<typeof fetchCrossDomainData>>

    switch (intent) {
      case 'WORKOUT_ONLY':
        data = await fetchWorkoutData(supabase, user.id, timeWindow)
        break
      case 'NUTRITION_ONLY':
        data = await fetchNutritionData(supabase, user.id, timeWindow, tzOffset)
        break
      case 'CROSS_DOMAIN':
        data = await fetchCrossDomainData(supabase, user.id, timeWindow, tzOffset)
        break
      default:
        // TypeScript exhaustiveness check
        const _exhaustiveCheck: never = intent
        throw new Error(`Unknown intent: ${_exhaustiveCheck}`)
    }

    // Generate response using appropriate prompt (Requirements 3.1, 4.1)
    const answer = await generateResponse({
      question,
      intent,
      data,
    })

    const processingTimeMs = Date.now() - startTime

    // Return response with optional metadata
    const response: QueryResponse = {
      success: true,
      answer,
      metadata: {
        intent,
        confidence,
        dataFetched: countFetchedData(intent, data),
        processingTimeMs,
      },
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Query error:', error)

    // Handle AI provider errors with appropriate status codes (Requirement 7.3)
    if (error instanceof ResponseGeneratorError) {
      switch (error.code) {
        case 'API_TIMEOUT':
          return NextResponse.json(
            { error: 'Request timed out. Please try again.' } as QueryErrorResponse,
            { status: 504 }
          )
        case 'API_RATE_LIMIT':
          return NextResponse.json(
            { error: 'Service busy. Please try again in a moment.' } as QueryErrorResponse,
            { status: 429 }
          )
        case 'API_ERROR':
        case 'INVALID_RESPONSE':
          return NextResponse.json(
            { error: 'Unable to process question. Please try again.' } as QueryErrorResponse,
            { status: 502 }
          )
      }
    }

    // Handle database errors
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return NextResponse.json(
        { error: 'Unable to retrieve your data. Please try again.' } as QueryErrorResponse,
        { status: 500 }
      )
    }

    // Generic error response
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' } as QueryErrorResponse,
      { status: 500 }
    )
  }
}
