import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

// GET /api/leaderboard/groups/[id] — group detail with members
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

    // Fetch group
    const { data: group, error: groupError } = await supabase
      .from('leaderboard_groups')
      .select('id, name, invite_code, created_by, created_at')
      .eq('id', id)
      .single()

    if (groupError || !group) {
      return apiError('Group not found', 404)
    }

    // Fetch members
    const { data: members, error: membersError } = await supabase
      .from('group_memberships')
      .select('user_id, display_name, joined_at')
      .eq('group_id', id)
      .order('joined_at', { ascending: true })

    if (membersError) {
      return apiError('Failed to fetch members', 500, membersError.message)
    }

    return NextResponse.json({
      ...group,
      member_count: members?.length || 0,
      members: members?.map(m => ({
        ...m,
        is_creator: m.user_id === group.created_by
      })) || []
    })
  } catch (error) {
    console.error('Leaderboard group detail error:', error)
    return apiError('Failed to fetch group', 500)
  }
}
