import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
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
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - days)

    // Get daily fitness summaries
    const { data: dailySummaries, error: summaryError } = await supabase
      .from('daily_fitness_summary')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
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
      .gte('workout_date', startDate.toISOString().split('T')[0])
      .order('workout_date', { ascending: false })

    if (workoutError) {
      throw new Error(`Failed to fetch workouts: ${workoutError.message}`)
    }

    // Get recent meals with workout context
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
      .gte('meal_timestamp', startDate.toISOString())
      .order('meal_timestamp', { ascending: false })

    if (mealError) {
      throw new Error(`Failed to fetch meals: ${mealError.message}`)
    }

    // Get WHOOP data if available
    const { data: whoopRecovery } = await supabase
      .from('whoop_recovery')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: whoopSleep } = await supabase
      .from('whoop_sleep')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: whoopCycles } = await supabase
      .from('whoop_cycles')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    // Generate holistic insights with WHOOP data
    const insights = generateHolisticInsights(
      workouts || [],
      meals || [],
      dailySummaries || [],
      whoopRecovery || [],
      whoopSleep || [],
      whoopCycles || []
    )
    
    // Calculate summary metrics
    const summary = calculateOverallSummary(dailySummaries || [])

    // Generate recommendations with WHOOP context
    const recommendations = generateRecommendations(
      insights,
      workouts || [],
      meals || [],
      whoopRecovery || [],
      whoopSleep || []
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
  whoopCycles: WhoopCycle[]
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
    const todayWorkouts = workouts.filter(w => {
      const workoutDate = new Date(w.workout_date)
      const today = new Date()
      return workoutDate.toDateString() === today.toDateString()
    })

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

  // WHOOP Insight 4: Strain and Nutrition Correlation
  if (whoopCycles.length > 2 && meals.length > 0) {
    const avgStrain = whoopCycles.reduce((sum, c) => sum + (c.strain || 0), 0) / whoopCycles.length
    const avgCalories = summaries.reduce((sum, s) => sum + (s.total_calories || 0), 0) / summaries.length

    if (avgStrain > 15 && avgCalories < 2000) {
      insights.push({
        type: 'nutrition_strain',
        title: 'High Strain with Insufficient Caloric Intake',
        description: `Your average daily strain is ${avgStrain.toFixed(1)} (high), but you're only consuming ${avgCalories.toFixed(0)} calories per day. This caloric deficit may impair recovery.`,
        recommendations: [
          'Increase daily caloric intake to match training demands',
          'Focus on nutrient-dense whole foods',
          'Ensure adequate carbohydrate intake for energy',
          'Consider tracking macros to optimize fueling'
        ],
        confidence: 0.8,
        dataPoints: whoopCycles.length + summaries.length,
        timeframe: `${summaries.length} days`,
        relatedMeals: meals.slice(0, 5).map(m => m.id)
      })
    }
  }

  // Existing Insight 1: Workout-Nutrition Timing
  const preWorkoutMeals = meals.filter(m => m.meal_timing === 'pre_workout').length
  const postWorkoutMeals = meals.filter(m => m.meal_timing === 'post_workout').length
  const totalWorkouts = workouts.length

  if (totalWorkouts > 0) {
    const preWorkoutRatio = preWorkoutMeals / totalWorkouts
    const postWorkoutRatio = postWorkoutMeals / totalWorkouts

    if (preWorkoutRatio < 0.5) {
      insights.push({
        type: 'meal_timing',
        title: 'Pre-Workout Nutrition Opportunity',
        description: `You're only eating before ${Math.round(preWorkoutRatio * 100)}% of your workouts. Pre-workout nutrition can improve performance.`,
        recommendations: [
          'Try eating a small meal 1-2 hours before workouts',
          'Focus on easily digestible carbs and moderate protein',
          'Consider a banana or oatmeal 30-60 minutes before training'
        ],
        confidence: 0.8,
        dataPoints: totalWorkouts,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workouts.slice(0, 3).map(w => w.id)
      })
    }

    if (postWorkoutRatio < 0.7) {
      insights.push({
        type: 'recovery_nutrition',
        title: 'Post-Workout Recovery Nutrition',
        description: `You're only eating after ${Math.round(postWorkoutRatio * 100)}% of your workouts. Post-workout nutrition aids recovery.`,
        recommendations: [
          'Eat within 30-60 minutes after intense workouts',
          'Include both protein and carbs for optimal recovery',
          'Aim for 20-30g protein and 30-60g carbs post-workout'
        ],
        confidence: 0.85,
        dataPoints: totalWorkouts,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workouts.slice(0, 3).map(w => w.id)
      })
    }
  }

  // Existing Insight 2: Energy Level Patterns
  const workoutsWithEnergy = workouts.filter(w => w.energy_level !== null)
  if (workoutsWithEnergy.length > 2) {
    const avgEnergy = workoutsWithEnergy.reduce((sum, w) => sum + w.energy_level, 0) / workoutsWithEnergy.length

    if (avgEnergy < 3) {
      insights.push({
        type: 'energy_optimization',
        title: 'Low Energy Levels During Workouts',
        description: `Your average energy level during workouts is ${avgEnergy.toFixed(1)}/5. This might indicate nutrition or recovery issues.`,
        recommendations: [
          'Ensure adequate carbohydrate intake throughout the day',
          'Check your sleep quality and duration',
          'Consider timing your largest meals 2-3 hours before workouts',
          'Stay hydrated throughout the day'
        ],
        confidence: 0.7,
        dataPoints: workoutsWithEnergy.length,
        timeframe: `${summaries.length} days`,
        relatedWorkouts: workoutsWithEnergy.slice(0, 3).map(w => w.id)
      })
    }
  }

  // Existing Insight 3: Protein Intake Analysis
  const avgDailyProtein = summaries.reduce((sum, s) => sum + (s.total_protein || 0), 0) / summaries.length
  if (avgDailyProtein > 0 && avgDailyProtein < 1.2 * 70) { // Assuming 70kg average weight, 1.2g/kg minimum
    insights.push({
      type: 'nutrition_performance',
      title: 'Protein Intake Below Recommendations',
      description: `Your average daily protein intake is ${avgDailyProtein.toFixed(0)}g. For active individuals, higher protein supports recovery and performance.`,
      recommendations: [
        'Aim for 1.6-2.2g protein per kg of body weight',
        'Include protein in every meal',
        'Consider post-workout protein within 30 minutes',
        'Good sources: lean meats, fish, eggs, dairy, legumes'
      ],
      confidence: 0.75,
      dataPoints: summaries.length,
      timeframe: `${summaries.length} days`,
      relatedMeals: meals.slice(0, 5).map(m => m.id)
    })
  }

  return insights
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