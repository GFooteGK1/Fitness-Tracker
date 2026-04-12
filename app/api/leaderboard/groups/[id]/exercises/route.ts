import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

// GET /api/leaderboard/groups/[id]/exercises — get available exercises for the group
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

    // Get unique benchmark names from member PRs
    const { data: prs } = await supabase.rpc('get_group_member_prs', {
      p_group_id: id,
      p_requesting_user: user.id
    })

    const exerciseMap = new Map<string, number>()

    // Count benchmark entries
    prs?.forEach((pr: { benchmark_name: string }) => {
      const name = pr.benchmark_name
      exerciseMap.set(name, (exerciseMap.get(name) || 0) + 1)
    })

    // Also get movements from workouts
    const { data: workouts } = await supabase.rpc('get_group_member_workouts', {
      p_group_id: id,
      p_requesting_user: user.id
    })

    workouts?.forEach((w: { blocks: any }) => {
      if (!Array.isArray(w.blocks)) return
      w.blocks.forEach((block: any) => {
        if (!Array.isArray(block.movements)) return
        block.movements.forEach((m: { name?: string; movement?: string }) => {
          const name = m.name || m.movement || ''
          if (name) {
            exerciseMap.set(name, (exerciseMap.get(name) || 0) + 1)
          }
        })
      })
    })

    // Sort by frequency
    const exercises = Array.from(exerciseMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ exercises })
  } catch (error) {
    console.error('Leaderboard exercises error:', error)
    return apiError('Failed to fetch exercises', 500)
  }
}
