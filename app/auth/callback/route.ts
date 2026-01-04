import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createServerClient()
    
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Auth callback error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/auth/signin?error=callback_error`)
    }

    if (data.user) {
      // Check if user profile exists, create if not
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .single()

      if (profileError && profileError.code === 'PGRST116') {
        // Create default profile for new user
        const { error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: data.user.id,
            fitness_goals: [],
            activity_level: 'moderately_active',
            body_metrics: {},
            preferences: {
              units: 'metric',
              notifications: true,
              privacy_level: 'private'
            },
            medical_conditions: []
          })

        if (createError) {
          console.error('Error creating profile after email confirmation:', createError)
        }
      }

      // Redirect to onboarding if profile is incomplete, otherwise to dashboard
      const hasCompletedOnboarding = profile && (
        profile.body_metrics?.height_cm !== undefined &&
        profile.body_metrics?.weight_kg !== undefined &&
        profile.body_metrics?.age !== undefined &&
        profile.fitness_goals?.length > 0
      )

      if (hasCompletedOnboarding) {
        return NextResponse.redirect(`${requestUrl.origin}/dashboard`)
      } else {
        return NextResponse.redirect(`${requestUrl.origin}/onboarding`)
      }
    }
  }

  // If no code or error, redirect to sign in
  return NextResponse.redirect(`${requestUrl.origin}/auth/signin`)
}