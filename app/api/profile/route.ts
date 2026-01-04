import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

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

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        // Profile doesn't exist, create default one
        const defaultProfile = {
          user_id: user.id,
          fitness_goals: [],
          activity_level: 'moderately_active',
          body_metrics: {},
          preferences: {
            units: 'metric',
            notifications: true,
            privacy_level: 'private'
          },
          medical_conditions: []
        }

        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert(defaultProfile)
          .select()
          .single()

        if (createError) {
          return NextResponse.json(
            { error: 'Failed to create user profile' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          profile: newProfile,
          hasCompletedOnboarding: false
        })
      }

      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      )
    }

    // Check if onboarding is complete
    const hasCompletedOnboarding = (
      profile.body_metrics?.height_cm !== undefined &&
      profile.body_metrics?.weight_kg !== undefined &&
      profile.body_metrics?.age !== undefined &&
      profile.fitness_goals?.length > 0
    )

    return NextResponse.json({
      profile,
      hasCompletedOnboarding
    })

  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
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

    const updates = await request.json()

    // Validate updates
    const allowedFields = [
      'fitness_goals',
      'activity_level', 
      'body_metrics',
      'preferences',
      'medical_conditions'
    ]

    const filteredUpdates: any = {}
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Validate body metrics if provided
    if (filteredUpdates.body_metrics) {
      const { height_cm, weight_kg, age } = filteredUpdates.body_metrics
      
      if (height_cm !== undefined && (height_cm < 50 || height_cm > 300)) {
        return NextResponse.json(
          { error: 'Height must be between 50 and 300 cm' },
          { status: 400 }
        )
      }
      
      if (weight_kg !== undefined && (weight_kg < 20 || weight_kg > 500)) {
        return NextResponse.json(
          { error: 'Weight must be between 20 and 500 kg' },
          { status: 400 }
        )
      }
      
      if (age !== undefined && (age < 13 || age > 120)) {
        return NextResponse.json(
          { error: 'Age must be between 13 and 120 years' },
          { status: 400 }
        )
      }
    }

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update(filteredUpdates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      profile: updatedProfile,
      message: 'Profile updated successfully'
    })

  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}