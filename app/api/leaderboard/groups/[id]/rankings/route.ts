import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import {
  filterWorkoutsByExercise,
  applyPrivacyFilter,
  extractBestScores,
  extractBestPRScores,
  rankUsers,
} from '@/app/lib/leaderboard-rankings'
import { RankingMetric, RankingPeriod } from '@/app/lib/types/leaderboard'

const VALID_METRICS: RankingMetric[] = ['weight', 'reps', 'volume', 'time']
const VALID_PERIODS: RankingPeriod[] = ['week', 'month', 'all']

// GET /api/leaderboard/groups/[id]/rankings?exercise=X&period=week|month|all&metric=weight|reps|volume|time
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const exercise = searchParams.get('exercise')
    const period = (searchParams.get('period') || 'all') as RankingPeriod
    const metric = (searchParams.get('metric') || 'weight') as RankingMetric

    if (!exercise) {
      return apiError('Exercise parameter is required', 400)
    }

    if (!VALID_METRICS.includes(metric)) {
      return apiError(`Invalid metric. Must be one of: ${VALID_METRICS.join(', ')}`, 400)
    }

    if (!VALID_PERIODS.includes(period)) {
      return apiError(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`, 400)
    }

    // Verify user is a member
    const { data: membership } = await supabase
      .from('group_memberships')
      .select('id')
      .eq('group_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return apiError('Not a member of this group', 403)
    }

    // Get member count
    const { data: members } = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', id)

    const totalMembers = members?.length || 0

    // Try benchmark PRs first (for named WODs and lifts)
    const { data: prs, error: prError } = await supabase.rpc('get_group_member_prs', {
      p_group_id: id,
      p_benchmark_name: exercise,
      p_period: period,
      p_requesting_user: user.id
    })

    let rankings

    if (!prError && prs && prs.length > 0) {
      // Use benchmark PR data
      const bestScores = extractBestPRScores(prs, metric)
      rankings = rankUsers(bestScores, metric, user.id)
    } else {
      // Fall back to workout block data
      const { data: workouts, error: workoutError } = await supabase.rpc('get_group_member_workouts', {
        p_group_id: id,
        p_exercise: exercise,
        p_period: period,
        p_requesting_user: user.id
      })

      if (workoutError) {
        return apiError('Failed to fetch workout data', 500, workoutError.message)
      }

      // Filter by exercise, apply privacy, extract best scores, rank
      let filtered = filterWorkoutsByExercise(workouts || [], exercise)
      filtered = applyPrivacyFilter(filtered, exercise)
      const bestScores = extractBestScores(filtered, exercise, metric)
      rankings = rankUsers(bestScores, metric, user.id)
    }

    const currentUserRank = rankings.find(r => r.is_current_user)?.rank

    return NextResponse.json({
      exercise,
      period,
      metric,
      rankings,
      total_members: totalMembers,
      current_user_rank: currentUserRank || null
    })
  } catch (error) {
    console.error('Leaderboard rankings error:', error)
    return apiError('Failed to fetch rankings', 500)
  }
}
