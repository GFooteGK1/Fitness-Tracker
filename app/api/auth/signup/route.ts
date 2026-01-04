import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Create user account
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback`
      }
    })

    if (error) {
      // Handle specific Supabase errors
      if (error.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    // If user is created and confirmed, create profile
    if (data.user && !data.user.email_confirmed_at) {
      // User needs to confirm email
      return NextResponse.json({
        message: 'Please check your email to confirm your account',
        user: data.user,
        needsEmailConfirmation: true
      })
    }

    if (data.user) {
      // Create default user profile
      const { error: profileError } = await supabase
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

      if (profileError) {
        console.error('Error creating user profile:', profileError)
        // Don't fail the signup if profile creation fails
      }
    }

    return NextResponse.json({
      message: 'Account created successfully',
      user: data.user,
      session: data.session
    })

  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during signup' },
      { status: 500 }
    )
  }
}