/**
 * Daily Meals API Endpoint
 * Retrieves daily meal summary with totals and adherence status
 * Requirements: 5.1, 5.3, 10.4, 2.2, 2.5, 2.7, 8.1, 8.2, 8.7
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { MealEntry, DailyMealsResponse, DailyTargets, DailyAdherenceResult, DailyMealsAvailabilityResponse } from '@/app/lib/types/food-tracking'
import { calculateAdherenceStatus, calculateDailyTotals, isPhotoUrlValid } from '@/app/lib/adherence-calculator'
import { calculateTargetCalories } from '@/app/lib/target-management'
import { localDateToUTCStart, localDateToUTCEnd, isValidTimezoneOffset } from '@/app/lib/timezone-utils'

const readResponse = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' }
})

function targetNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function comparisonTargets(value: unknown, owner: string): DailyTargets | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const protein = targetNumber(row.target_protein), carbs = targetNumber(row.target_carbs)
  const fat = targetNumber(row.target_fat), calories = targetNumber(row.target_calories)
  const tolerance = targetNumber(row.tolerance_pct)
  if (row.user_id !== owner || protein === null || protein <= 0 || carbs === null || carbs <= 0 ||
    fat === null || fat <= 0 || calories === null || calories <= 0 || tolerance === null || tolerance < 0 || tolerance > 100) return null
  return { userId: owner, targetProtein: protein, targetCarbs: carbs, targetFat: fat,
    targetCalories: calories, tolerancePct: tolerance, updatedAt: new Date(row.updated_at as string) }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return readResponse({ error: 'Unauthorized' }, 401)
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const tzOffsetStr = searchParams.get('tzOffset')

    // Validate date parameter
    if (!dateStr) {
      return readResponse({ error: 'date parameter is required (YYYY-MM-DD format)' }, 400)
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateStr)) {
      return readResponse({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400)
    }

    // Parse and validate timezone offset
    const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0
    if (!tzOffsetStr) {
      console.warn('No timezone offset provided, defaulting to UTC (offset = 0)')
    }
    
    if (!isValidTimezoneOffset(tzOffset)) {
      return readResponse(
        { 
          error: 'Invalid timezone offset',
          details: 'Offset must be between -720 and 840 minutes'
        },
        400
      )
    }

    // Calculate UTC boundaries for the local date using timezone utilities
    const startUTC = localDateToUTCStart(dateStr, tzOffset)
    const endUTC = localDateToUTCEnd(dateStr, tzOffset)
    
    const { data: mealsData, error: mealsError } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', user.id)
      .gte('meal_timestamp', startUTC)
      .lt('meal_timestamp', endUTC)
      .order('meal_timestamp', { ascending: true })

    if (mealsError) {
      console.error('Error fetching meals:', mealsError)
      return readResponse(
        { error: `Failed to fetch meals: ${mealsError.message}` },
        500
      )
    }

    // Convert database format to TypeScript interfaces and handle photo URL expiration
    const meals: MealEntry[] = mealsData.map(meal => ({
      id: meal.id,
      captureRevision: meal.capture_revision,
      captureProvenance: meal.capture_provenance,
      userId: meal.user_id,
      // Keep the timestamp as a string to preserve local time (no UTC conversion)
      mealTimestamp: meal.meal_timestamp,
      photoUrl: isPhotoUrlValid(meal.photo_expires_at ? new Date(meal.photo_expires_at) : undefined) 
        ? meal.photo_url 
        : undefined, // Don't return expired photo URLs
      photoExpiresAt: meal.photo_expires_at ? new Date(meal.photo_expires_at) : undefined,
      items: meal.items,
      totalProtein: parseFloat(meal.total_protein),
      totalCarbs: parseFloat(meal.total_carbs),
      totalFat: parseFloat(meal.total_fat),
      totalCalories: parseFloat(meal.total_calories),
      needsReview: meal.needs_review,
      manualOverride: meal.manual_override,
      aiConfidence: meal.ai_confidence ? parseFloat(meal.ai_confidence) : undefined,
      reviewedAt: meal.reviewed_at ? new Date(meal.reviewed_at) : undefined,
      createdAt: new Date(meal.created_at),
      updatedAt: new Date(meal.updated_at)
    }))

    // Calculate daily totals
    const dailyTotals = calculateDailyTotals(mealsData)

    // Fetch user's daily targets for adherence calculation
    let comparison: DailyAdherenceResult = { adherenceAvailability: 'unavailable', adherence: null }
    try {
      const { data: rows, error } = await supabase
        .from('daily_targets')
        .select('*')
        .eq('user_id', user.id)
        .limit(2)
      if (!error && Array.isArray(rows)) {
        if (rows.length === 0) comparison = { adherenceAvailability: 'not_configured', adherence: null }
        else if (rows.length === 1) {
          const targets = comparisonTargets(rows[0], user.id)
          if (targets) comparison = { adherenceAvailability: 'available', adherence: calculateAdherenceStatus(dailyTotals, targets) }
        }
      }
    } catch {
      // Target failures do not erase successfully read meal facts in opt-in mode.
    }

    const availability = searchParams.getAll('availability')
    if (availability.length === 1 && availability[0] === 'explicit') {
      const response: DailyMealsAvailabilityResponse = { meals, dailyTotals, ...comparison }
      return readResponse(response)
    }
    if (comparison.adherenceAvailability === 'unavailable') {
      return readResponse({ error: 'Unable to load your daily targets. Please try again.' }, 500)
    }

    const adherence = comparison.adherence ?? {
      proteinAdherence: 0,
      carbsAdherence: 0,
      fatAdherence: 0,
      caloriesAdherence: 0,
      overallScore: 0,
      withinTolerance: false
    }

    const response: DailyMealsResponse = {
      meals,
      dailyTotals,
      adherence
    }

    return readResponse(response)

  } catch (error) {
    console.error('Unexpected error in daily meals API:', error)
    return readResponse(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      500
    )
  }
}

/**
 * POST endpoint for updating daily targets
 * This allows users to set/update their nutritional targets
 */
export async function POST(request: Request) {
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

    const { targetProtein, targetCarbs, targetFat, tolerancePct } = await request.json()

    const requiredTargets = { targetProtein, targetCarbs, targetFat }
    for (const [key, value] of Object.entries(requiredTargets)) {
      if (typeof value !== 'number' || value <= 0) {
        return NextResponse.json(
          { error: `${key} must be a positive number` },
          { status: 400 }
        )
      }
    }

    // Validate tolerance percentage
    const tolerance = tolerancePct || 5.0
    if (typeof tolerance !== 'number' || tolerance < 0 || tolerance > 100) {
      return NextResponse.json(
        { error: 'tolerancePct must be a number between 0 and 100' },
        { status: 400 }
      )
    }

    const targetCalories = calculateTargetCalories(targetProtein, targetCarbs, targetFat)

    // Upsert daily targets (insert or update if exists)
    const { error: upsertError } = await supabase
      .from('daily_targets')
      .upsert({
        user_id: user.id,
        target_protein: targetProtein,
        target_carbs: targetCarbs,
        target_fat: targetFat,
        target_calories: targetCalories,
        tolerance_pct: tolerance,
        updated_at: new Date().toISOString()
      })

    if (upsertError) {
      console.error('Error upserting daily targets:', upsertError)
      return NextResponse.json(
        { error: `Failed to save targets: ${upsertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Daily targets updated successfully'
    })

  } catch (error) {
    console.error('Unexpected error updating daily targets:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}
