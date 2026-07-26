import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { isValidTimezoneOffset } from '@/app/lib/timezone-utils'
import { computeDashboardWorkoutAggregates } from '@/app/lib/aggregates/dashboard'

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

    // Parse timezone offset from query params
    const { searchParams } = new URL(request.url)
    const tzOffsetStr = searchParams.get('tzOffset')
    const tzOffset = tzOffsetStr === null ? 0 : Number(tzOffsetStr)
    if (
      tzOffsetStr !== null &&
      (!/^-?\d+$/.test(tzOffsetStr) || !Number.isInteger(tzOffset) || !isValidTimezoneOffset(tzOffset))
    ) {
      return NextResponse.json(
        { error: 'Invalid timezone offset', details: 'Offset must be between -720 and 840 minutes' },
        { status: 400 }
      )
    }

    // Single optimized query for all workout data including blocks for type categorization
    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('id, workout_date, created_at, blocks, input_text')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
    
    if (workoutsError) {
      throw new Error(`Failed to fetch workouts: ${workoutsError.message}`)
    }

    const stats = computeDashboardWorkoutAggregates(workouts ?? [], {
      timezoneOffsetMinutes: tzOffset,
    })

    // This response is user-specific and must never enter a shared cache.
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'private, no-store'
      }
    })

  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
