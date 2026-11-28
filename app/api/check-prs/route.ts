import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { REP_MAX_TYPES, type RepMaxType } from '@/app/lib/pr-detection'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const payload = await request.json().catch(() => null)
    const workoutId = payload?.workoutId
    if (typeof workoutId !== 'string' || !workoutId.trim()) {
      return apiError('workoutId is required', 400)
    }

    const { data: workout, error } = await supabase.from('workouts')
      .select('id, capture_revision')
      .eq('id', workoutId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error || !workout) return apiError('Workout unavailable', 404)

    // The canonical save or amendment owns the PR projection.
    const { data: records, error: recordsError } = await supabase.from('personal_records')
      .select('exercise,pr_type,value,previous_value')
      .eq('user_id', user.id)
      .eq('workout_id', workoutId)
      .in('pr_type', REP_MAX_TYPES)
    if (recordsError) return apiError('Record projections unavailable', 503)

    const rows = records ?? []
    const prs = rows.filter(record => record.previous_value !== null).map(record => ({
      exercise: record.exercise,
      prType: record.pr_type as RepMaxType,
      newRecord: Number(record.value),
      previousBest: Number(record.previous_value),
      isPR: true,
    }))

    return NextResponse.json({
      prs,
      baselinesRecorded: rows.length - prs.length,
      captureRevision: workout.capture_revision,
      projectionsStatus: 'supported_reported_quantities_only',
    })
  } catch (error) {
    console.error('PR check error:', error)
    return apiError('Failed to check PRs', 500)
  }
}
