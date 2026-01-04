import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    // Sign out user
    const { error } = await supabase.auth.signOut()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: 'Signed out successfully',
      success: true
    })

  } catch (error) {
    console.error('Signout error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during signout' },
      { status: 500 }
    )
  }
}