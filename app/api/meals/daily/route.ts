/**
 * Daily Meals API Endpoint
 * Retrieves daily meal summary with totals and adherence status
 * Requirements: 5.1, 5.3, 10.4, 2.2, 2.5, 2.7, 8.1, 8.2, 8.7
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { MealEntry, DailyMealsResponse, DailyTargets } from '@/app/lib/types/food-tracking'
import { calculateAdherenceStatus, calculateDailyTotals, isPhotoUrlValid } from '@/app/lib/adherence-calculator'
import { localDateToUTCStart, localDateToUTCEnd, isValidTimezoneOffset } from '@/app/lib/timezone-utils'

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const tzOffsetStr = searchParams.get('tzOffset')

    // Validate date parameter
    if (!dateStr) {
      return NextResponse.json(
        { error: 'date parameter is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateStr)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Parse and validate timezone offset
    const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0
    if (!tzOffsetStr) {
      console.warn('No timezone offset provided, defaulting to UTC (offset = 0)')
    }
    
    if (!isValidTimezoneOffset(tzOffset)) {
      return NextResponse.json(
        { 
          error: 'Invalid timezone offset',
          details: 'Offset must be between -720 and 840 minutes'
        },
        { status: 400 }
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
      return NextResponse.json(
        { error: `Failed to fetch meals: ${mealsError.message}` },
        { status: 500 }
      )
    }

    // Convert database format to TypeScript interfaces and handle photo URL expiration
    const meals: MealEntry[] = mealsData.map(meal => ({
      id: meal.id,
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
    const { data: targetsData, error: targetsError } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', user.id)
      .single()

    let adherence = {
      proteinAdherence: 0,
      carbsAdherence: 0,
      fatAdherence: 0,
      caloriesAdherence: 0,
      overallScore: 0,
      withinTolerance: false
    }

    // Calculate adherence if targets exist
    if (!targetsError && targetsData) {
      const targets: DailyTargets = {
        userId: targetsData.user_id,
        targetProtein: parseFloat(targetsData.target_protein),
        targetCarbs: parseFloat(targetsData.target_carbs),
        targetFat: parseFloat(targetsData.target_fat),
        targetCalories: parseFloat(targetsData.target_calories),
        tolerancePct: parseFloat(targetsData.tolerance_pct),
        updatedAt: new Date(targetsData.updated_at)
      }

      adherence = calculateAdherenceStatus(dailyTotals, targets)
    } else if (targetsError && targetsError.code !== 'PGRST116') {
      // Log error if it's not a "no rows returned" error
      console.warn('Error fetching daily targets:', targetsError)
    }

    const response: DailyMealsResponse = {
      meals,
      dailyTotals,
      adherence
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Unexpected error in daily meals API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
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

    const { targetProtein, targetCarbs, targetFat, targetCalories, tolerancePct } = await request.json()

    const requiredTargets = { targetProtein, targetCarbs, targetFat, targetCalories }
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