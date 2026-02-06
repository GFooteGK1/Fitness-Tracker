import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { initializeConnection } from '@/app/lib/whoop/token-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    
    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Initialize WHOOP connection
    const initialized = await initializeConnection(user.id)
    
    return NextResponse.json({ 
      success: true,
      initialized 
    })
  } catch (error) {
    console.error('Error initializing WHOOP connection:', error)
    return NextResponse.json(
      { error: 'Failed to initialize WHOOP connection' },
      { status: 500 }
    )
  }
}
