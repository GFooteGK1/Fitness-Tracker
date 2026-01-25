import { NextResponse } from 'next/server'

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const vars = [
    { name: 'NODE_ENV', value: process.env.NODE_ENV, status: process.env.NODE_ENV ? 'set' : 'missing' },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL, status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing' },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: maskKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), status: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'missing' },
    { name: 'ANTHROPIC_API_KEY', value: maskKey(process.env.ANTHROPIC_API_KEY), status: process.env.ANTHROPIC_API_KEY ? 'set' : 'missing' },
    { name: 'CLEANUP_TOKEN', value: maskKey(process.env.CLEANUP_TOKEN), status: process.env.CLEANUP_TOKEN ? 'set' : 'missing' },
  ]

  return NextResponse.json({ vars })
}

function maskKey(key: string | undefined): string {
  if (!key) return ''
  if (key.length <= 12) return '***'
  return `${key.substring(0, 10)}...${key.substring(key.length - 4)} (${key.length} chars)`
}
