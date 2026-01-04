import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

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

    const {
      body_metrics,
      fitness_goals,
      activity_level,
      preferences,
      initial_targets
    } = await request.json()

    // Validate required fields
    if (!body_metrics || !fitness_goals || !activity_level) {
      return NextResponse.json(
        { error: 'Body metrics, fitness goals, and activity level are required' },
        { status: 400 }
      )
    }

    // Validate body metrics
    const { height_cm, weight_kg, age, gender } = body_metrics
    
    if (!height_cm || !weight_kg || !age || !gender) {
      return NextResponse.json(
        { error: 'Height, weight, age, and gender are required' },
        { status: 400 }
      )
    }

    if (height_cm < 50 || height_cm > 300) {
      return NextResponse.json(
        { error: 'Height must be between 50 and 300 cm' },
        { status: 400 }
      )
    }

    if (weight_kg < 20 || weight_kg > 500) {
      return NextResponse.json(
        { error: 'Weight must be between 20 and 500 kg' },
        { status: 400 }
      )
    }

    if (age < 13 || age > 120) {
      return NextResponse.json(
        { error: 'Age must be between 13 and 120 years' },
        { status: 400 }
      )
    }

    if (!['male', 'female', 'other'].includes(gender)) {
      return NextResponse.json(
        { error: 'Gender must be male, female, or other' },
        { status: 400 }
      )
    }

    // Validate fitness goals
    if (!Array.isArray(fitness_goals) || fitness_goals.length === 0) {
      return NextResponse.json(
        { error: 'At least one fitness goal is required' },
        { status: 400 }
      )
    }

    const validGoals = ['weight_loss', 'muscle_gain', 'performance', 'general_health']
    const invalidGoals = fitness_goals.filter(goal => !validGoals.includes(goal))
    if (invalidGoals.length > 0) {
      return NextResponse.json(
        { error: `Invalid fitness goals: ${invalidGoals.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate activity level
    const validActivityLevels = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active']
    if (!validActivityLevels.includes(activity_level)) {
      return NextResponse.json(
        { error: 'Invalid activity level' },
        { status: 400 }
      )
    }

    // Update or create user profile with onboarding data
    const profileUpdates = {
      user_id: user.id, // Include user_id for upsert
      body_metrics,
      fitness_goals,
      activity_level,
      preferences: {
        units: 'metric',
        notifications: true,
        privacy_level: 'private',
        ...preferences
      }
    }

    const { data: updatedProfile, error: profileError } = await supabase
      .from('user_profiles')
      .upsert(profileUpdates, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()
      .single()

    if (profileError) {
      console.error('Profile upsert error:', profileError)
      return NextResponse.json(
        { error: 'Failed to update profile during onboarding' },
        { status: 500 }
      )
    }

    // If initial targets are provided, create them
    let targets = null
    if (initial_targets) {
      const { protein, carbs, fat, calories } = initial_targets
      
      // Validate targets
      if (protein < 0 || carbs < 0 || fat < 0 || calories < 0) {
        return NextResponse.json(
          { error: 'All target values must be positive' },
          { status: 400 }
        )
      }

      // Create or update daily targets
      const { data: targetsData, error: targetsError } = await supabase
        .from('daily_targets')
        .upsert({
          user_id: user.id,
          target_protein: protein,
          target_carbs: carbs,
          target_fat: fat,
          target_calories: calories,
          tolerance_pct: 5.0
        })
        .select()
        .single()

      if (targetsError) {
        console.error('Error creating initial targets:', targetsError)
        // Don't fail onboarding if targets creation fails
      } else {
        targets = targetsData
      }
    }

    return NextResponse.json({
      profile: updatedProfile,
      targets,
      message: 'Onboarding completed successfully'
    })

  } catch (error) {
    console.error('Onboarding error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during onboarding' },
      { status: 500 }
    )
  }
}