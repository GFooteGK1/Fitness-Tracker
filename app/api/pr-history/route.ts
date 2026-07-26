import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

const PR_TYPES = new Set(['weight', 'reps', 'time', 'volume'])
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_OFFSET = 10_000

function parseIntegerParam(value: string | null, fallback: number, min: number, max?: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    return null
  }

  return parsed
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const exercise = searchParams.get('exercise')?.trim() || null
    const prType = searchParams.get('prType')
    const limit = parseIntegerParam(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const offset = parseIntegerParam(searchParams.get('offset'), 0, 0, MAX_OFFSET)

    if (limit === null) {
      return apiError(`limit must be an integer between 1 and ${MAX_LIMIT}`, 400)
    }
    if (offset === null) {
      return apiError(`offset must be an integer between 0 and ${MAX_OFFSET}`, 400)
    }
    if (prType && !PR_TYPES.has(prType)) {
      return apiError('prType must be one of: weight, reps, time, volume', 400)
    }
    if (exercise && exercise.length > 100) {
      return apiError('exercise must be 100 characters or fewer', 400)
    }

    // Build query
    let query = supabase
      .from('personal_records')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('achieved_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (exercise) {
      query = query.ilike('exercise', `%${exercise}%`)
    }
    if (prType) {
      query = query.eq('pr_type', prType)
    }

    const { data: records, error: fetchError, count } = await query

    if (fetchError) {
      console.error('Error fetching PR history:', fetchError)
      return apiError('Failed to fetch PR history', 500)
    }

    // Compute summary stats
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)

    // Get all records for summary (unfiltered by exercise/type)
    const { data: allRecords, error: allError } = await supabase
      .from('personal_records')
      .select('achieved_at')
      .eq('user_id', user.id)

    if (allError) {
      console.error('Error fetching PR summary:', allError)
      return apiError('Failed to fetch PR summary', 500)
    }

    let weekCount = 0
    let monthCount = 0
    let yearCount = 0
    let totalCount = 0

    if (allRecords) {
      totalCount = allRecords.length
      for (const rec of allRecords) {
        const d = new Date(rec.achieved_at)
        if (d >= startOfYear) yearCount++
        if (d >= startOfMonth) monthCount++
        if (d >= startOfWeek) weekCount++
      }
    }

    return NextResponse.json({
      records: records || [],
      total: count || 0,
      summary: {
        thisWeek: weekCount,
        thisMonth: monthCount,
        thisYear: yearCount,
        allTime: totalCount,
      },
    })
  } catch (error) {
    console.error('PR history error:', error)
    return apiError('Failed to fetch PR history', 500, error instanceof Error ? error.message : 'Unknown error')
  }
}
