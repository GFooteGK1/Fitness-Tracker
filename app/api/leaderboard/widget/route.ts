import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import {
  filterWorkoutsByExercise,
  applyPrivacyFilter,
  extractBestScores,
  extractBestPRScores,
  rankUsers
} from '@/app/lib/leaderboard-rankings'

// GET /api/leaderboard/widget — dashboard widget data (user's rank in primary group)
export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Get user's first group (oldest membership = primary)
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ widget: null })
    }

    const groupId = memberships[0].group_id

    // Get group info
    const { data: group } = await supabase
      .from('leaderboard_groups')
      .select('id, name')
      .eq('id', groupId)
      .single()

    if (!group) {
      return NextResponse.json({ widget: null })
    }

    // Get member count
    const { data: members } = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', groupId)

    const totalMembers = members?.length || 0

    // Find a featured exercise — try common CrossFit benchmarks first
    const featuredExercises = ['Back Squat', 'Deadlift', 'Clean and Jerk', 'Fran', 'Grace', 'Murph']
    let widgetData = null

    for (const exercise of featuredExercises) {
      // Try PRs first
      const { data: prs } = await supabase.rpc('get_group_member_prs', {
        p_group_id: groupId,
        p_benchmark_name: exercise,
        p_period: 'all',
        p_requesting_user: user.id
      })

      if (prs && prs.length > 0) {
        const bestScores = extractBestPRScores(prs, 'weight')
        const rankings = rankUsers(bestScores, 'weight', user.id)
        const userEntry = rankings.find(r => r.is_current_user)

        if (userEntry) {
          widgetData = {
            group_id: group.id,
            group_name: group.name,
            exercise,
            rank: userEntry.rank,
            total_members: totalMembers,
            value_display: userEntry.value_display
          }
          break
        }
      }

      // Try workout data
      const { data: workouts } = await supabase.rpc('get_group_member_workouts', {
        p_group_id: groupId,
        p_period: 'all',
        p_requesting_user: user.id
      })

      if (workouts && workouts.length > 0) {
        let filtered = filterWorkoutsByExercise(workouts, exercise)
        filtered = applyPrivacyFilter(filtered, exercise)
        const bestScores = extractBestScores(filtered, exercise, 'weight')

        if (bestScores.length > 0) {
          const rankings = rankUsers(bestScores, 'weight', user.id)
          const userEntry = rankings.find(r => r.is_current_user)

          if (userEntry) {
            widgetData = {
              group_id: group.id,
              group_name: group.name,
              exercise,
              rank: userEntry.rank,
              total_members: totalMembers,
              value_display: userEntry.value_display
            }
            break
          }
        }
      }
    }

    return NextResponse.json({ widget: widgetData })
  } catch (error) {
    console.error('Leaderboard widget error:', error)
    return apiError('Failed to fetch widget data', 500)
  }
}
