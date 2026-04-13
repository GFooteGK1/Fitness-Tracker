import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const exercise = searchParams.get('exercise')
    const prType = searchParams.get('prType')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

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

    let weekCount = 0
    let monthCount = 0
    let yearCount = 0
    let totalCount = 0

    if (!allError && allRecords) {
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
