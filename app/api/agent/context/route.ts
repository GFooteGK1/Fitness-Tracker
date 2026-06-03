import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { fetchProgrammingReadinessContext } from '@/app/lib/agents/programming-context'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const daysParam = request.nextUrl.searchParams.get('days')
    const requestedDays = daysParam ? Number(daysParam) : 30
    const days = Number.isFinite(requestedDays) ? requestedDays : 30

    const programmingContext = await fetchProgrammingReadinessContext(supabase, user.id, days)

    return NextResponse.json({
      success: true,
      context: programmingContext
    })
  } catch (error) {
    console.error('Agent context verification error:', error)
    return apiError(
      'Unable to fetch agent context',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}
