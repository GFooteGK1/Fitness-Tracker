import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Basic health check
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'checking...',
        auth: 'checking...'
      }
    }

    // Check if environment variables are loaded
    const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasSupabaseKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    health.services.auth = hasSupabaseUrl && hasSupabaseKey ? 'configured' : 'missing_config'

    // Try to check database connection (basic check)
    try {
      const { createServerClient } = await import('@/app/lib/auth/supabase-server')
      const supabase = await createServerClient()
      
      // Simple query to test connection
      const { error } = await supabase.from('user_profiles').select('count').limit(1)
      health.services.database = error ? `error: ${error.message}` : 'connected'
    } catch (dbError) {
      health.services.database = `error: ${dbError instanceof Error ? dbError.message : 'unknown'}`
    }

    return NextResponse.json(health)
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}