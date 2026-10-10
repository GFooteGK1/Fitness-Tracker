import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { revokeCameraDevices } from '@/app/lib/capture/revoke-camera-devices'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: identityError } = await supabase.auth.getUser()
    if (identityError) return NextResponse.json({ error: 'Sign-out identity could not be confirmed' }, { status: 503 })
    if (user) {
      try { await revokeCameraDevices(supabase) }
      catch { return NextResponse.json({ error: 'Camera device disable was not confirmed. Try sign-out again while connected.' }, { status: 503 }) }
    }

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
