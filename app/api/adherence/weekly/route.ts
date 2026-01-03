/**
 * Weekly Adherence Analysis API
 * Calculates weekly adherence scores and provides correction guidance
 * Requirements: 6.3, 6.4, 6.5, 9.1, 9.2, 9.3
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { 
  calculateWeeklyAdherence, 
  generateCorrectionGuidance,
  WeeklyAdherenceScore,
  CorrectionGuidance
} from '../../../lib/adherence-calculator'
import { DailyTargets, DailySummary } from '../../../lib/types/food-tracking'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/adherence/weekly - Get weekly adherence analysis
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const weekStartStr = searchParams.get('weekStart')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

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

    // Calculate week end date
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    // Fetch user's daily targets
    const { data: targetsData, error: targetsError } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', userId)
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

    // Fetch daily summaries for the week using the view
    const { data: summariesData, error: summariesError } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', weekStart.toISOString().split('T')[0])
      .lte('date', weekEnd.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (summariesError) {
      console.error('Error fetching daily summaries:', summariesError)
      return NextResponse.json(
        { error: 'Failed to fetch meal data for the specified week' },
        { status: 500 }
      )
    }

    // Convert to DailySummary format
    const dailySummaries: DailySummary[] = (summariesData || []).map(row => ({
      userId: row.user_id,
      date: new Date(row.date),
      totalProtein: parseFloat(row.total_protein || 0),
      totalCarbs: parseFloat(row.total_carbs || 0),
      totalFat: parseFloat(row.total_fat || 0),
      totalCalories: parseFloat(row.total_calories || 0),
      mealCount: parseInt(row.meal_count || 0)
    }))

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

    // Prepare response
    const response = {
      weeklyAdherence,
      correctionGuidance,
      targets,
      daysWithData: dailySummaries.length,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0]
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
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Get Monday of current week
    const today = new Date()
    const weekStart = getMondayOfWeek(today)

    // Redirect to GET with calculated week start
    const url = new URL(request.url)
    url.pathname = '/api/adherence/weekly'
    url.searchParams.set('userId', userId)
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