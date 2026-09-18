import { isWhoopSyncEligible } from '@/app/lib/agents/whoop-context-eligibility'
import { canSurfaceLegacyInsight } from '@/app/lib/agents/legacy-insight-guard'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { isValidTimezoneOffset, localDateToUTCStart } from '@/app/lib/timezone-utils'
import type { CrossDomainAnalysisResponse, HolisticInsight, DailyFitnessSummary } from '@/app/lib/types/cross-domain'
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from '@/app/lib/types/whoop'

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
    const days = parseInt(searchParams.get('days') || '7')
    const tzOffsetStr = searchParams.get('tzOffset')
    const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0

    if (!isValidTimezoneOffset(tzOffset)) return NextResponse.json({ error: 'Invalid timezone offset' }, { status: 400 })

    // Calculate date range in user's local timezone
    // tzOffset uses getTimezoneOffset() convention: positive for west of UTC
    // localTime = UTC - tzOffset
    const now = new Date()
    const localNow = new Date(now.getTime() - tzOffset * 60000)
    const localStart = new Date(localNow)
    localStart.setUTCDate(localStart.getUTCDate() - days)

    const endDateStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`
    const startDateStr = `${localStart.getUTCFullYear()}-${String(localStart.getUTCMonth() + 1).padStart(2, '0')}-${String(localStart.getUTCDate()).padStart(2, '0')}`

    // For timestamp-based queries (meals), calculate UTC boundary using localDateToUTCStart
    // which expects the same getTimezoneOffset() convention
    const startUTCBoundary = localDateToUTCStart(startDateStr, tzOffset)

    // Get daily fitness summaries
    const { data: dailySummaries, error: summaryError } = await supabase
      .from('daily_fitness_summary')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: false })

    if (summaryError) {
      throw new Error(`Failed to fetch daily summaries: ${summaryError.message}`)
    }

    // Get recent workouts with nutrition context
    const { data: workouts, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        workout_date,
        primary_score,
        rpe,
        energy_level,
        hydration_level,
        nutrition_quality_score,
        tags
      `)
      .eq('user_id', user.id)
      .gte('workout_date', startDateStr)
      .order('workout_date', { ascending: false })

    if (workoutError) {
      throw new Error(`Failed to fetch workouts: ${workoutError.message}`)
    }

    // Get recent meals with workout context using UTC boundary
    const { data: meals, error: mealError } = await supabase
      .from('meals')
      .select(`
        id,
        meal_timestamp,
        total_protein,
        total_carbs,
        total_fat,
        total_calories,
        meal_timing,
        workout_id
      `)
      .eq('user_id', user.id)
      .gte('meal_timestamp', startUTCBoundary)
      .order('meal_timestamp', { ascending: false })

    if (mealError) {
      throw new Error(`Failed to fetch meals: ${mealError.message}`)
    }

    const [connection, syncBefore] = await Promise.all([
      supabase.from('whoop_tokens').select('id').eq('user_id', user.id).single(),
      supabase.from('whoop_sync_status').select('status,last_sync_at,error_message').eq('user_id', user.id).single(),
    ])
    // Get WHOOP data if available (DATE type columns, no timezone conversion needed)
    const { data: whoopRecovery } = await supabase
      .from('whoop_recovery')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .order('date', { ascending: false })

    const { data: whoopSleep } = await supabase
      .from('whoop_sleep')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .order('date', { ascending: false })

    const { data: whoopCycles } = await supabase
      .from('whoop_cycles')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .order('date', { ascending: false })

    const sync = await supabase.from('whoop_sync_status').select('status,last_sync_at,error_message').eq('user_id', user.id).single()
    const whoopEligible = !connection.error && !sync.error && !syncBefore.error
      && isWhoopSyncEligible(Boolean(connection.data?.id), syncBefore.data, now.getTime())
      && syncBefore.data?.last_sync_at === sync.data?.last_sync_at && isWhoopSyncEligible(Boolean(connection.data?.id), sync.data, now.getTime())
    // Advice may use only current dated readings; stored raw history is unchanged.
    const currentRecovery = whoopEligible ? (whoopRecovery ?? []).filter(row => row.date === endDateStr) : []
    const currentSleep = whoopEligible ? (whoopSleep ?? []).filter(row => row.date === endDateStr) : []
    const currentCycles = whoopEligible ? (whoopCycles ?? []).filter(row => row.date === endDateStr) : []

    // Generate holistic insights with WHOOP data
    const insights = generateHolisticInsights(
      workouts || [],
      meals || [],
      dailySummaries || [],
      currentRecovery,
      currentSleep,
      currentCycles,
      endDateStr
    )
    
    // Calculate summary metrics
    const summary = calculateOverallSummary(dailySummaries || [])

    // Generate recommendations with WHOOP context
    const recommendations = generateRecommendations(
      insights,
      workouts || [],
      meals || [],
      currentRecovery,
      currentSleep
    )

    const response: CrossDomainAnalysisResponse = {
      insights,
      correlations: [], // Will be populated when correlation engine is built
      summary,
      recommendations
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Fitness insights error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate insights' },
      { status: 500 }
    )
  }
}

function generateHolisticInsights(
  workouts: any[],
  meals: any[],
  summaries: any[],
  whoopRecovery: WhoopRecovery[],
  whoopSleep: WhoopSleep[],
  whoopCycles: WhoopCycle[],
  currentDate: string
): HolisticInsight[] {
  const insights: HolisticInsight[] = []

  // WHOOP Insight 1: Low Recovery with High Training Load
  if (whoopRecovery.length > 0 && workouts.length > 0) {
    const avgRecovery = whoopRecovery.reduce((sum, r) => sum + (r.recovery_score || 0), 0) / whoopRecovery.length
    const highIntensityWorkouts = workouts.filter(w => w.rpe && w.rpe >= 8).length

    if (avgRecovery < 34 && highIntensityWorkouts > 2) {
      insights.push({
        type: 'recovery_optimization',
        title: 'Low Recovery with High Training Intensity',
        description: `Your average recovery score is ${avgRecovery.toFixed(0)}% (red zone) while maintaining ${highIntensityWorkouts} high-intensity workouts. This indicates potential overtraining.`,
        recommendations: [
          'Consider reducing workout intensity or volume',
          'Prioritize sleep quality and duration',
          'Increase rest days between intense sessions',
          'Focus on recovery nutrition and hydration'
        ],
        confidence: 0.9,
        dataPoints: whoopRecovery.length + workouts.length,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workouts.filter(w => w.rpe >= 8).slice(0, 3).map(w => w.id)
      })
    }
  }

  // WHOOP Insight 2: Sleep Performance Impact
  if (whoopSleep.length > 2) {
    const avgSleepPerformance = whoopSleep.reduce((sum, s) => sum + (s.sleep_performance_percentage || 0), 0) / whoopSleep.length
    const workoutsWithLowEnergy = workouts.filter(w => w.energy_level && w.energy_level < 3).length

    if (avgSleepPerformance < 70 && workoutsWithLowEnergy > 0) {
      insights.push({
        type: 'sleep_performance',
        title: 'Poor Sleep Affecting Workout Performance',
        description: `Your average sleep performance is ${avgSleepPerformance.toFixed(0)}%, and you've reported low energy in ${workoutsWithLowEnergy} workouts. Sleep quality directly impacts training performance.`,
        recommendations: [
          'Aim for consistent sleep schedule (same bedtime/wake time)',
          'Target 7-9 hours of sleep per night',
          'Avoid caffeine 6+ hours before bed',
          'Create a cool, dark sleep environment',
          'Consider reducing evening screen time'
        ],
        confidence: 0.85,
        dataPoints: whoopSleep.length + workoutsWithLowEnergy,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workouts.filter(w => w.energy_level < 3).slice(0, 3).map(w => w.id)
      })
    }
  }

  // WHOOP Insight 3: Recovery-Based Training Recommendations
  if (whoopRecovery.length > 0) {
    const recentRecovery = whoopRecovery[0]?.recovery_score || 0
    const todayStr = currentDate
    const todayWorkouts = workouts.filter(w => w.workout_date === todayStr)

    if (recentRecovery < 34 && todayWorkouts.length > 0 && todayWorkouts[0].rpe >= 7) {
      insights.push({
        type: 'recovery_training',
        title: 'Training Hard Despite Low Recovery',
        description: `Today's recovery score is ${recentRecovery}% (red zone), but you completed a high-intensity workout (RPE ${todayWorkouts[0].rpe}). Training hard on low recovery increases injury risk.`,
        recommendations: [
          'On red recovery days, focus on active recovery or rest',
          'Consider yoga, stretching, or light cardio instead',
          'Save high-intensity work for green recovery days (67%+)',
          'Listen to your body and adjust training accordingly'
        ],
        confidence: 0.95,
        dataPoints: 2,
        timeframe: 'Today',
        relatedWorkouts: [todayWorkouts[0].id]
      })
    }
  }

  // Partial meal logs do not establish a strain-related calorie deficit.

  // Factual linked-log coverage is not evidence of what the athlete ate.
  const workoutIds = new Set(workouts.map(workout => workout.id))
  const preWorkoutIds = new Set(meals.filter(meal => typeof meal.meal_timing === 'string'
    && meal.meal_timing.toUpperCase() === 'PRE_WORKOUT' && workoutIds.has(meal.workout_id)).map(meal => meal.workout_id))
  if (workoutIds.size > 0) {
    insights.push({
      type: 'meal_timing',
      title: 'Logged Meal Timing',
      description: `${preWorkoutIds.size} of ${workoutIds.size} logged workouts have a linked pre-workout meal record. Logging coverage is unknown; this does not establish what or when you ate.`,
      recommendations: ['Review linked meal and workout records if you want to clarify the logged timing.'],
      confidence: 1,
      dataPoints: workoutIds.size,
      timeframe: `${summaries.length} days`,
      relatedWorkouts: [...workoutIds].slice(0, 3)
    })
  }

  // Existing Insight 2: Energy Level Patterns
  const workoutsWithEnergy = workouts.filter(w => w.energy_level !== null)
  if (workoutsWithEnergy.length > 2) {
    const avgEnergy = workoutsWithEnergy.reduce((sum, w) => sum + w.energy_level, 0) / workoutsWithEnergy.length

    if (avgEnergy < 3) {
      insights.push({
        type: 'energy_optimization',
        title: 'Low Energy Levels During Workouts',
        description: `Your average energy level during workouts is ${avgEnergy.toFixed(1)}/5. The cause is not established by these stored ratings.`,
        recommendations: [
          'Review workout and energy records for accuracy before drawing conclusions.'
        ],
        confidence: 0.7,
        dataPoints: workoutsWithEnergy.length,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workoutsWithEnergy.slice(0, 3).map(w => w.id)
      })
    }
  }

  // No inferred body mass or protein prescription from incomplete meal records.

  return insights.filter(canSurfaceLegacyInsight)
}

function calculateOverallSummary(summaries: any[]): DailyFitnessSummary {
  if (summaries.length === 0) {
    return {
      userId: '',
      date: new Date(),
      workoutCount: 0,
      mealCount: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalCalories: 0,
      preWorkoutMeals: 0,
      postWorkoutMeals: 0
    }
  }

  const totals = summaries.reduce((acc, summary) => ({
    workoutCount: acc.workoutCount + (summary.workout_count || 0),
    mealCount: acc.mealCount + (summary.meal_count || 0),
    totalProtein: acc.totalProtein + (summary.total_protein || 0),
    totalCarbs: acc.totalCarbs + (summary.total_carbs || 0),
    totalFat: acc.totalFat + (summary.total_fat || 0),
    totalCalories: acc.totalCalories + (summary.total_calories || 0),
    preWorkoutMeals: acc.preWorkoutMeals + (summary.pre_workout_meals || 0),
    postWorkoutMeals: acc.postWorkoutMeals + (summary.post_workout_meals || 0),
    avgRpe: acc.avgRpe + (summary.avg_rpe || 0),
    avgEnergyLevel: acc.avgEnergyLevel + (summary.avg_energy_level || 0),
    avgHydrationLevel: acc.avgHydrationLevel + (summary.avg_hydration_level || 0)
  }), {
    workoutCount: 0,
    mealCount: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    totalCalories: 0,
    preWorkoutMeals: 0,
    postWorkoutMeals: 0,
    avgRpe: 0,
    avgEnergyLevel: 0,
    avgHydrationLevel: 0
  })

  return {
    userId: summaries[0]?.user_id || '',
    date: new Date(),
    workoutCount: totals.workoutCount,
    avgRpe: totals.avgRpe / summaries.length,
    avgEnergyLevel: totals.avgEnergyLevel / summaries.length,
    avgHydrationLevel: totals.avgHydrationLevel / summaries.length,
    mealCount: totals.mealCount,
    totalProtein: totals.totalProtein,
    totalCarbs: totals.totalCarbs,
    totalFat: totals.totalFat,
    totalCalories: totals.totalCalories,
    preWorkoutMeals: totals.preWorkoutMeals,
    postWorkoutMeals: totals.postWorkoutMeals
  }
}

function generateRecommendations(
  insights: HolisticInsight[],
  workouts: any[],
  meals: any[],
  whoopRecovery: WhoopRecovery[],
  whoopSleep: WhoopSleep[]
) {
  const recommendations = {
    nutrition: [] as string[],
    workout: [] as string[],
    timing: [] as string[],
    recovery: [] as string[]
  }

  // Extract recommendations from insights
  insights.forEach(insight => {
    insight.recommendations.forEach(rec => {
      if (insight.type === 'nutrition_performance' || insight.type === 'nutrition_strain') {
        recommendations.nutrition.push(rec)
      } else if (insight.type === 'meal_timing' || insight.type === 'recovery_nutrition') {
        recommendations.timing.push(rec)
      } else if (insight.type === 'energy_optimization' || insight.type === 'recovery_training') {
        recommendations.workout.push(rec)
      } else if (insight.type === 'recovery_optimization' || insight.type === 'sleep_performance') {
        recommendations.recovery.push(rec)
      }
    })
  })

  // Add WHOOP-based recommendations if data available
  if (whoopRecovery.length > 0) {
    const avgRecovery = whoopRecovery.reduce((sum, r) => sum + (r.recovery_score || 0), 0) / whoopRecovery.length
    
    if (avgRecovery < 34 && recommendations.recovery.length === 0) {
      recommendations.recovery.push('Your recovery is in the red zone - prioritize rest and recovery')
    } else if (avgRecovery >= 67 && recommendations.workout.length === 0) {
      recommendations.workout.push('Your recovery is strong - good time for high-intensity training')
    }
  }

  if (whoopSleep.length > 0) {
    const avgSleep = whoopSleep.reduce((sum, s) => sum + (s.sleep_performance_percentage || 0), 0) / whoopSleep.length
    
    if (avgSleep < 70 && recommendations.recovery.length === 0) {
      recommendations.recovery.push('Focus on improving sleep quality and consistency')
    }
  }

  // Add general recommendations if no specific insights
  if (recommendations.nutrition.length === 0) {
    recommendations.nutrition.push('Maintain consistent daily protein intake')
  }
  
  if (recommendations.timing.length === 0) {
    recommendations.timing.push('Consider meal timing around workouts for optimal performance')
  }
  
  if (recommendations.workout.length === 0) {
    recommendations.workout.push('Track energy and hydration levels to optimize performance')
  }

  if (recommendations.recovery.length === 0 && whoopRecovery.length > 0) {
    recommendations.recovery.push('Monitor recovery scores to optimize training intensity')
  }

  return recommendations
}