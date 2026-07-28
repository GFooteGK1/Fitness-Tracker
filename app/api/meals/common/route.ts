import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { rankCommonMeals, type MealHistoryRow } from '@/app/lib/nutrition/fast-log'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') || 6)
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(12, Math.floor(requestedLimit))) : 6

  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_timestamp, items, total_protein, total_carbs, total_fat, total_calories, needs_review, manual_override, reviewed_at')
    .eq('user_id', user.id)
    .order('meal_timestamp', { ascending: false })
    .limit(300)

  if (error) {
    console.error('Failed to load common meals:', error)
    return NextResponse.json({ error: 'Failed to load common meals' }, { status: 500, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json(
    { meals: rankCommonMeals((data || []) as MealHistoryRow[], limit) },
    { headers: NO_STORE_HEADERS }
  )
}
