/**
 * Weekly Adherence Analysis API
 * Calculates weekly adherence scores and provides correction guidance
 * Requirements: 6.3, 6.4, 6.5, 9.1, 9.2, 9.3
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
    const tzOffset = searchParams.get('tzOffset')

    if (!weekStartStr) {
      return NextResponse.json(
        { error: 'Week start date is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }

    const weekStart = new Date(weekStartStr)
    if (isNaN(weekStart.getTime())) {
      return NextResponse.json(
        { error: 'Invalid week start date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Calculate week end date (7 days total, so +6 from start)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    // Get timezone offset in minutes (e.g., 360 for CST which is UTC-6)
    const offsetMinutes = tzOffset ? parseInt(tzOffset, 10) : 0

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
    // Instead of using the daily_summaries view (which uses server timezone),
    // we query meals directly with timezone-aware boundaries to match the daily API
    const dailySummaries: DailySummary[] = []
    
    // Generate each day's data with proper timezone handling
    // Use string-based date arithmetic to avoid timezone issues with Date objects
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      // Parse the weekStart string and add days using string manipulation
      // This avoids timezone issues that occur when using Date.setDate()
      const [year, month, day] = weekStartStr.split('-').map(Number)
      const tempDate = new Date(Date.UTC(year, month - 1, day + dayOffset))
      const dateStr = tempDate.toISOString().split('T')[0]
      
      // Calculate UTC boundaries for this local date
      // If user is in CST (UTC-6), offset is 360 minutes
      // Local midnight = UTC midnight + offset
      // e.g., Jan 20 00:00 CST = Jan 20 06:00 UTC
      const startLocal = new Date(`${dateStr}T00:00:00`)
      const endLocal = new Date(`${dateStr}T23:59:59.999`)
      
      // Add offset to convert local time to UTC
      const startUTC = new Date(startLocal.getTime() + offsetMinutes * 60000)
      const endUTC = new Date(endLocal.getTime() + offsetMinutes * 60000)
      
      const { data: dayMeals, error: dayError } = await supabase
        .from('meals')
        .select('total_protein, total_carbs, total_fat, total_calories')
        .eq('user_id', user.id)
        .gte('meal_timestamp', startUTC.toISOString())
        .lt('meal_timestamp', endUTC.toISOString())
      
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
      weekStart
    )

    // Generate correction guidance
    const correctionGuidance: CorrectionGuidance = generateCorrectionGuidance(
      weeklyAdherence,
      targets
    )

    // Calculate days elapsed from week start to today (Requirements: 6.2)
    const today = new Date()
    const daysElapsed: number = calculateDaysElapsed(weekStart, today)

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
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
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
 * Helper function to get Monday of the week for a given date
 */
function getMondayOfWeek(date: Date): Date {
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
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

    // Get Monday of current week
    const today = new Date()
    const weekStart = getMondayOfWeek(today)

    // Redirect to GET with calculated week start
    const url = new URL(request.url)
    url.pathname = '/api/adherence/weekly'
    url.searchParams.set('weekStart', weekStart.toISOString().split('T')[0])

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