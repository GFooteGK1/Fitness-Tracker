import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { PrivacyLevel } from '@/app/lib/types/leaderboard'

const VALID_LEVELS: PrivacyLevel[] = ['all', 'benchmarks', 'manual']

// PUT /api/leaderboard/groups/[id]/privacy — update privacy setting for a group
export async function PUT(
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
    const { privacy_level, display_name } = body

    if (privacy_level && !VALID_LEVELS.includes(privacy_level)) {
      return apiError(`Invalid privacy level. Must be one of: ${VALID_LEVELS.join(', ')}`, 400)
    }

    // Build update payload
    const updates: Record<string, string> = {}
    if (privacy_level) updates.privacy_level = privacy_level
    if (display_name && typeof display_name === 'string' && display_name.trim()) {
      updates.display_name = display_name.trim()
    }

    if (Object.keys(updates).length === 0) {
      return apiError('No valid fields to update', 400)
    }

    const { data: membership, error: updateError } = await supabase
      .from('group_memberships')
      .update(updates)
      .eq('group_id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      return apiError('Failed to update settings', 500, updateError.message)
    }

    if (!membership) {
      return apiError('Not a member of this group', 404)
    }

    return NextResponse.json({ membership })
  } catch (error) {
    console.error('Leaderboard privacy update error:', error)
    return apiError('Failed to update privacy', 500)
  }
}
