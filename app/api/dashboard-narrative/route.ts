import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { isValidTimezoneOffset } from '@/app/lib/timezone-utils'
import { getDashboardNarrative } from '@/app/lib/dashboard-narrative-service'
import { createDashboardNarrativeStore } from '@/app/lib/dashboard-narrative-store'

function localDateForOffset(now: Date, timezoneOffset: number): string {
  return new Date(now.getTime() - timezoneOffset * 60_000).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const rawOffset = new URL(request.url).searchParams.get('tzOffset')
    if (rawOffset === null || !/^-?\d+$/.test(rawOffset)) {
      return apiError('tzOffset must be an integer', 400)
    }
    const timezoneOffset = Number(rawOffset)
    if (!isValidTimezoneOffset(timezoneOffset)) {
      return apiError('Invalid timezone offset', 400)
    }

    const result = await getDashboardNarrative({
      userId: user.id,
      localDate: localDateForOffset(new Date(), timezoneOffset),
      store: createDashboardNarrativeStore(supabase),
      complete,
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Dashboard narrative error:', error)
    return apiError('Dashboard narrative unavailable', 503)
  }
}
