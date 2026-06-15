/**
 * Weekly Adherence Analysis API
 * Calculates weekly adherence scores and provides correction guidance
 * Requirements: 6.3, 6.4, 6.5, 9.1, 9.2, 9.3, 3.1, 3.2, 3.4, 3.5, 8.1, 8.2
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/auth/supabase-server'
import { 
  calculateWeeklyAdherence, 
  generateCorrectionGuidance,
  calculateDaysElapsed,
  calculateCumulativeAdherence,
  WeeklyAdherenceScore,
  CorrectionGuidance
} from '../../../lib/adherence-calculator'
import { DailyTargets, DailySummary, CumulativeAdherenceData } from '../../../lib/types/food-tracking'
import { 
  localDateToUTCStart, 
  localDateToUTCEnd, 
  isValidTimezoneOffset,
  getWeekStart,
  getLocalDate,
  formatUTCAsLocalDateWithOffset,
  parseDateString
} from '../../../lib/timezone-utils'

/**
 * GET /api/adherence/weekly - Get weekly adherence analysis
 */
export async function GET(request: NextRequest) {
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
    const weekStartStr = searchParams.get('weekStart')
    const tzOffsetStr = searchParams.get('tzOffset')

    if (!weekStartStr) {
      return NextResponse.json(
        { error: 'Week start date is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(weekStartStr)) {
      return NextResponse.json(
        { error: 'Invalid week start date format. Use YYYY-MM-DD' },
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

    // Calculate week end date (7 days total, so +6 from start)
    const [year, month, day] = weekStartStr.split('-').map(Number)
    const weekStartDate = new Date(year, month - 1, day)
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const weekEndStr = getLocalDate(weekEndDate)

    // Fetch user's daily targets
    const { data: targetsData, error: targetsError } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (targetsError) {
      console.error('Error fetching daily targets:', targetsError)
      return NextResponse.json(
        { error: 'Failed to fetch user targets. Please set your daily targets first.' },
        { status: 404 }
      )
    }

    // Convert targets to proper format
    const targets: DailyTargets = {
      userId: targetsData.user_id,
      targetProtein: parseFloat(targetsData.target_protein),
      targetCarbs: parseFloat(targetsData.target_carbs),
      targetFat: parseFloat(targetsData.target_fat),
      targetCalories: parseFloat(targetsData.target_calories),
      tolerancePct: parseFloat(targetsData.tolerance_pct),
      updatedAt: new Date(targetsData.updated_at)
    }

    // Fetch daily summaries for the week
    // Query meals directly with timezone-aware boundaries using centralized utilities
    const dailySummaries: DailySummary[] = []
    
    // Generate each day's data with proper timezone handling
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      // Calculate date string for this day
      const dayDate = new Date(weekStartDate)
      dayDate.setDate(weekStartDate.getDate() + dayOffset)
      const dateStr = getLocalDate(dayDate)
      
      // Calculate UTC boundaries for this local date using timezone utilities
      const startUTC = localDateToUTCStart(dateStr, tzOffset)
      const endUTC = localDateToUTCEnd(dateStr, tzOffset)
      
      const { data: dayMeals, error: dayError } = await supabase
        .from('meals')
        .select('total_protein, total_carbs, total_fat, total_calories')
        .eq('user_id', user.id)
        .gte('meal_timestamp', startUTC)
        .lt('meal_timestamp', endUTC)
      
      if (dayError) {
        console.error(`Error fetching meals for ${dateStr}:`, dayError)
        continue
      }
      
      // Only add to summaries if there's data for this day
      if (dayMeals && dayMeals.length > 0) {
        const totalProtein = dayMeals.reduce((sum, m) => sum + parseFloat(m.total_protein || '0'), 0)
        const totalCarbs = dayMeals.reduce((sum, m) => sum + parseFloat(m.total_carbs || '0'), 0)
        const totalFat = dayMeals.reduce((sum, m) => sum + parseFloat(m.total_fat || '0'), 0)
        const totalCalories = dayMeals.reduce((sum, m) => sum + parseFloat(m.total_calories || '0'), 0)
        
        dailySummaries.push({
          userId: user.id,
          date: dateStr as any, // Using string date for API response
          totalProtein,
          totalCarbs,
          totalFat,
          totalCalories,
          mealCount: dayMeals.length
        })
      }
    }

    // Calculate weekly adherence
    const weeklyAdherence: WeeklyAdherenceScore = calculateWeeklyAdherence(
      dailySummaries,
      targets,
      weekStartDate
    )

    // Generate correction guidance
    const correctionGuidance: CorrectionGuidance = generateCorrectionGuidance(
      weeklyAdherence,
      targets
    )

    // Calculate days elapsed from week start to today (Requirements: 6.2)
    // Use the caller's timezone so week-to-date progress does not drift when
    // the server's calendar date differs from the user's local calendar date.
    const todayStr = formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset)
    const today = parseDateString(todayStr)
    const daysElapsed: number = calculateDaysElapsed(weekStartDate, today)

    // Calculate cumulative adherence data (Requirements: 6.1, 6.3, 6.4, 6.5)
    const cumulativeData: CumulativeAdherenceData = calculateCumulativeAdherence(
      dailySummaries,
      targets,
      daysElapsed
    )

    // Prepare response with new cumulative tracking fields
    const response = {
      weeklyAdherence,
      correctionGuidance,
      targets,
      daysWithData: dailySummaries.length,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      // New fields for cumulative tracking (Requirements: 6.1, 6.2, 6.3, 6.4, 6.5)
      daysElapsed,
      cumulativeData
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Unexpected error in GET /api/adherence/weekly:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/adherence/weekly - Get weekly adherence for current week
 */
export async function POST(request: NextRequest) {
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

    // Get timezone offset from request body
    const body = await request.json().catch(() => ({}))
    const tzOffset = Number(body.tzOffset ?? 0)

    if (!Number.isFinite(tzOffset) || !isValidTimezoneOffset(tzOffset)) {
      return NextResponse.json(
        {
          error: 'Invalid timezone offset',
          details: 'Offset must be between -720 and 840 minutes'
        },
        { status: 400 }
      )
    }

    // Get Monday of the user's current week using the caller's timezone.
    const todayStr = formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset)
    const weekStartDate = getWeekStart(parseDateString(todayStr))
    const weekStartStr = getLocalDate(weekStartDate)

    // Redirect to GET with calculated week start
    const url = new URL(request.url)
    url.pathname = '/api/adherence/weekly'
    url.searchParams.set('weekStart', weekStartStr)
    url.searchParams.set('tzOffset', tzOffset.toString())

    // Make internal request to GET endpoint
    const getRequest = new NextRequest(url.toString(), {
      method: 'GET',
      headers: request.headers
    })

    return await GET(getRequest)
  } catch (error) {
    console.error('Unexpected error in POST /api/adherence/weekly:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
