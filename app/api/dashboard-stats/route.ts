import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    // Get current date info
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    
    // Get total workouts count
    const { data: totalWorkouts, error: totalError } = await supabase
      .from('workouts')
      .select('id', { count: 'exact' })
    
    if (totalError) {
      throw new Error(`Failed to fetch total workouts: ${totalError.message}`)
    }

    // Get month-to-date workouts
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    const { data: monthWorkouts, error: monthError } = await supabase
      .from('workouts')
      .select('id', { count: 'exact' })
      .gte('workout_date', monthStart)
    
    if (monthError) {
      throw new Error(`Failed to fetch month workouts: ${monthError.message}`)
    }

    // Get block scores to categorize workout types
    const { data: blockScores, error: blockError } = await supabase
      .from('block_scores')
      .select('block_type, workout_id')
      .gte('created_at', monthStart)
    
    if (blockError) {
      throw new Error(`Failed to fetch block scores: ${blockError.message}`)
    }

    // Categorize workouts by type
    const workoutTypes = new Map<string, Set<string>>()
    
    blockScores?.forEach(block => {
      const type = categorizeBlockType(block.block_type)
      if (!workoutTypes.has(type)) {
        workoutTypes.set(type, new Set())
      }
      workoutTypes.get(type)!.add(block.workout_id)
    })

    const stats = {
      totalWorkouts: totalWorkouts?.length || 0,
      monthToDate: monthWorkouts?.length || 0,
      strengthSessions: workoutTypes.get('strength')?.size || 0,
      metcons: workoutTypes.get('metcon')?.size || 0,
      cardio: workoutTypes.get('cardio')?.size || 0,
      currentMonth: monthName
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}

function categorizeBlockType(blockType: string): string {
  const type = blockType.toLowerCase()
  
  if (type.includes('strength') || type.includes('lifting')) {
    return 'strength'
  }
  
  if (type.includes('cardio') || type.includes('monostructural')) {
    return 'cardio'
  }
  
  // AMRAP, FOR_TIME, EMOM, etc. are metcons
  if (type.includes('amrap') || type.includes('for_time') || type.includes('emom') || 
      type.includes('tabata') || type.includes('metcon')) {
    return 'metcon'
  }
  
  // Default to metcon for most CrossFit-style workouts
  return 'metcon'
}