import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { generateInviteCode } from '@/app/lib/leaderboard-rankings'

// GET /api/leaderboard/groups — list user's groups
export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Get groups the user is a member of
    const { data: memberships, error: memberError } = await supabase
      .from('group_memberships')
      .select('group_id, display_name, joined_at')
      .eq('user_id', user.id)

    if (memberError) {
      return apiError('Failed to fetch memberships', 500, memberError.message)
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ groups: [] })
    }

    const groupIds = memberships.map(m => m.group_id)

    // Fetch group details
    const { data: groups, error: groupError } = await supabase
      .from('leaderboard_groups')
      .select('id, name, invite_code, created_by, created_at')
      .in('id', groupIds)

    if (groupError) {
      return apiError('Failed to fetch groups', 500, groupError.message)
    }

    // Get member counts for each group
    const { data: counts, error: countError } = await supabase
      .from('group_memberships')
      .select('group_id')
      .in('group_id', groupIds)

    if (countError) {
      return apiError('Failed to count members', 500, countError.message)
    }

    const countMap = new Map<string, number>()
    counts?.forEach(c => {
      countMap.set(c.group_id, (countMap.get(c.group_id) || 0) + 1)
    })

    const enrichedGroups = groups?.map(g => ({
      ...g,
      member_count: countMap.get(g.id) || 0
    })) || []

    return NextResponse.json({ groups: enrichedGroups })
  } catch (error) {
    console.error('Leaderboard groups list error:', error)
    return apiError('Failed to fetch groups', 500)
  }
}

// POST /api/leaderboard/groups — create a group
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json()
    const { name, display_name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('Group name is required', 400)
    }

    if (name.trim().length > 100) {
      return apiError('Group name must be 100 characters or less', 400)
    }

    const memberDisplayName = (display_name || '').trim() || user.email?.split('@')[0] || 'Anonymous'

    // Generate unique invite code with retries
    let inviteCode = ''
    let attempts = 0
    while (attempts < 5) {
      inviteCode = generateInviteCode()
      const { data: existing } = await supabase
        .from('leaderboard_groups')
        .select('id')
        .eq('invite_code', inviteCode)
        .maybeSingle()

      if (!existing) break
      attempts++
    }

    if (attempts >= 5) {
      return apiError('Failed to generate unique invite code', 500)
    }

    // Create the group
    const { data: group, error: createError } = await supabase
      .from('leaderboard_groups')
      .insert({
        name: name.trim(),
        invite_code: inviteCode,
        created_by: user.id
      })
      .select()
      .single()

    if (createError) {
      return apiError('Failed to create group', 500, createError.message)
    }

    // Auto-join the creator as a member
    const { error: joinError } = await supabase
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: user.id,
        display_name: memberDisplayName
      })

    if (joinError) {
      // Rollback the group creation
      await supabase.from('leaderboard_groups').delete().eq('id', group.id)
      return apiError('Failed to join group', 500, joinError.message)
    }

    return NextResponse.json({
      group: { ...group, member_count: 1 }
    }, { status: 201 })
  } catch (error) {
    console.error('Leaderboard group create error:', error)
    return apiError('Failed to create group', 500)
  }
}
