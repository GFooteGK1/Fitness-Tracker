import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { refreshAccessToken } from '@/app/lib/whoop/token-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    
    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Refresh WHOOP tokens
    await refreshAccessToken(user.id)
    
    return NextResponse.json({ 
      success: true,
      message: 'WHOOP tokens refreshed successfully'
    })
  } catch (error) {
    console.error('Error refreshing WHOOP tokens:', error)
    return NextResponse.json(
      { error: 'Failed to refresh WHOOP tokens' },
      { status: 500 }
    )
  }
}
