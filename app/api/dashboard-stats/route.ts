import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function GET() {
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

    // Get current date info
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    
    // Single optimized query for all workout data including blocks for type categorization
    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('id, workout_date, created_at, blocks, input_text')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
    
    if (workoutsError) {
      throw new Error(`Failed to fetch workouts: ${workoutsError.message}`)
    }

    // Calculate stats from the single query result
    const totalWorkouts = workouts?.length || 0
    const monthWorkouts = workouts?.filter(w => w.workout_date >= monthStart) || []
    const monthToDate = monthWorkouts.length

    // Categorize workouts by type from the blocks JSONB data
    let strengthSessions = 0
    let metcons = 0
    let cardio = 0

    workouts?.forEach(workout => {
      const types = categorizeWorkout(workout.blocks, workout.input_text)
      if (types.has('strength')) strengthSessions++
      if (types.has('metcon')) metcons++
      if (types.has('cardio')) cardio++
    })

    const stats = {
      totalWorkouts,
      monthToDate,
      strengthSessions,
      metcons,
      cardio,
      currentMonth: monthName
    }

    // Add cache headers for better performance
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
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

function categorizeWorkout(blocks: any, inputText: string): Set<string> {
  const types = new Set<string>()
  const text = (inputText || '').toLowerCase()
  
  // Check blocks array for block_type
  if (Array.isArray(blocks)) {
    blocks.forEach((block: any) => {
      const blockType = (block.block_type || block.type || '').toLowerCase()
      
      if (blockType.includes('strength') || blockType.includes('lifting') || 
          blockType.includes('build') || blockType.includes('heavy')) {
        types.add('strength')
      }
      
      if (blockType.includes('cardio') || blockType.includes('monostructural') || 
          blockType.includes('running') || blockType.includes('rowing') || 
          blockType.includes('cycling') || blockType.includes('swimming') ||
          blockType.includes('bike') || blockType.includes('run')) {
        types.add('cardio')
      }
      
      if (blockType.includes('amrap') || blockType.includes('for_time') || 
          blockType.includes('for time') || blockType.includes('emom') || 
          blockType.includes('tabata') || blockType.includes('metcon') ||
          blockType.includes('wod') || blockType.includes('chipper') ||
          blockType.includes('rounds')) {
        types.add('metcon')
      }
    })
  }
  
  // Also check input text for keywords if no types found from blocks
  if (types.size === 0) {
    // Strength indicators
    if (text.includes('squat') || text.includes('deadlift') || text.includes('press') ||
        text.includes('bench') || text.includes('clean') || text.includes('snatch') ||
        text.includes('jerk') || text.match(/\d+\s*x\s*\d+/) || text.includes('1rm') ||
        text.includes('5x5') || text.includes('3x3') || text.includes('heavy')) {
      types.add('strength')
    }
    
    // Cardio indicators
    if (text.includes('run') || text.includes('row') || text.includes('bike') ||
        text.includes('swim') || text.includes('ski erg') || text.includes('assault')) {
      types.add('cardio')
    }
    
    // Metcon indicators
    if (text.includes('amrap') || text.includes('for time') || text.includes('emom') ||
        text.includes('rounds') || text.includes('reps') || text.includes('wod') ||
        text.includes('fran') || text.includes('grace') || text.includes('helen') ||
        text.includes('diane') || text.includes('cindy') || text.includes('murph')) {
      types.add('metcon')
    }
  }
  
  // Default to metcon if still nothing found (most CrossFit workouts are metcons)
  if (types.size === 0) {
    types.add('metcon')
  }
  
  return types
}