import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'

// POST /api/leaderboard/groups/[id]/join — join a group with invite code
export async function POST(
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

    const body = await request.json()
    const { invite_code, display_name } = body

    if (!invite_code || typeof invite_code !== 'string') {
      return apiError('Invite code is required', 400)
    }

    // Verify the group exists and invite code matches
    const { data: group, error: groupError } = await supabase
      .from('leaderboard_groups')
      .select('id, name, invite_code')
      .eq('id', id)
      .single()

    if (groupError || !group) {
      return apiError('Group not found', 404)
    }

    if (group.invite_code !== invite_code.trim().toUpperCase()) {
      return apiError('Invalid invite code', 403)
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('group_memberships')
      .select('id')
      .eq('group_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return apiError('Already a member of this group', 409)
    }

    const memberDisplayName = (display_name || '').trim() || user.email?.split('@')[0] || 'Anonymous'

    // Join the group
    const { data: membership, error: joinError } = await supabase
      .from('group_memberships')
      .insert({
        group_id: id,
        user_id: user.id,
        display_name: memberDisplayName
      })
      .select()
      .single()

    if (joinError) {
      return apiError('Failed to join group', 500, joinError.message)
    }

    return NextResponse.json({
      membership,
      group: { id: group.id, name: group.name }
    }, { status: 201 })
  } catch (error) {
    console.error('Leaderboard join error:', error)
    return apiError('Failed to join group', 500)
  }
}
