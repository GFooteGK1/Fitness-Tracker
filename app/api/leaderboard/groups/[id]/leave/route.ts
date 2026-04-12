import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { NextResponse } from 'next/server'

// DELETE /api/leaderboard/groups/[id]/leave — leave a group
export async function DELETE(
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

    // Check membership
    const { data: membership } = await supabase
      .from('group_memberships')
      .select('id')
      .eq('group_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return apiError('Not a member of this group', 404)
    }

    // Check if user is the creator
    const { data: group } = await supabase
      .from('leaderboard_groups')
      .select('created_by')
      .eq('id', id)
      .single()

    if (group?.created_by === user.id) {
      // Creator leaving: check if other members exist
      const { data: otherMembers } = await supabase
        .from('group_memberships')
        .select('id')
        .eq('group_id', id)
        .neq('user_id', user.id)
        .limit(1)

      if (!otherMembers || otherMembers.length === 0) {
        // Last member — delete the whole group (cascade deletes membership)
        const { error: deleteError } = await supabase
          .from('leaderboard_groups')
          .delete()
          .eq('id', id)

        if (deleteError) {
          return apiError('Failed to delete group', 500, deleteError.message)
        }

        return NextResponse.json({ message: 'Group deleted (you were the last member)' })
      }
    }

    // Remove membership
    const { error: leaveError } = await supabase
      .from('group_memberships')
      .delete()
      .eq('group_id', id)
      .eq('user_id', user.id)

    if (leaveError) {
      return apiError('Failed to leave group', 500, leaveError.message)
    }

    return NextResponse.json({ message: 'Left group successfully' })
  } catch (error) {
    console.error('Leaderboard leave error:', error)
    return apiError('Failed to leave group', 500)
  }
}
