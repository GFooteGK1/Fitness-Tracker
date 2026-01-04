import { NextResponse } from 'next/server'

export async function GET() {
  // Server-side environment check
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    nodeEnv: process.env.NODE_ENV,
    supabaseUrlPreview: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
    timestamp: new Date().toISOString()
  }

  return NextResponse.json({
    message: 'Server-side environment check',
    environment: envCheck,
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('SUPABASE') || key.includes('ANTHROPIC') || key.includes('NEXT')
    )
  })
}