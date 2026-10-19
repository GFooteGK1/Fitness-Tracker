import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { CoachingContextError } from '@/app/lib/coach/coaching-context'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

export async function GET(request: Request) {
  try {
    const db = await createServerClient()
    const context = await readCoachingContext(db, new URL(request.url).searchParams)
    return NextResponse.json({ context }, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof CoachingContextError ? error.message : 'Coaching context is unavailable' }, {
      status: error instanceof CoachingContextError ? error.status : 503, headers,
    })
  }
}
