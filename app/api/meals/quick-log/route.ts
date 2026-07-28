import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { rankCommonMeals, type MealHistoryRow } from '@/app/lib/nutrition/fast-log'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const sourceMealId = typeof input.sourceMealId === 'string' ? input.sourceMealId : ''
  const requestId = typeof input.requestId === 'string' ? input.requestId : ''
  const timestamp = typeof input.timestamp === 'string' ? input.timestamp : ''
  if (!UUID_PATTERN.test(sourceMealId) || !UUID_PATTERN.test(requestId) || !timestamp || !Number.isFinite(Date.parse(timestamp))) {
    return NextResponse.json({ error: 'Valid sourceMealId, requestId, and timestamp are required' }, { status: 400 })
  }

  const { data: sourceMeal, error: sourceError } = await supabase
    .from('meals')
    .select('id, items, total_protein, total_carbs, total_fat, total_calories, needs_review, manual_override, reviewed_at, ai_confidence')
    .eq('id', sourceMealId)
    .eq('user_id', user.id)
    .single()

  if (sourceError || !sourceMeal) {
    return NextResponse.json({ error: 'Source meal not found' }, { status: 404 })
  }

  const snapshot = rankCommonMeals([{
    ...sourceMeal,
    meal_timestamp: timestamp,
  } as MealHistoryRow], 1)[0]
  if (!snapshot) {
    return NextResponse.json({ error: 'Source meal is not safe to reuse' }, { status: 422 })
  }

  const { data: insertedMeal, error: insertError } = await supabase
    .from('meals')
    .insert({
      user_id: user.id,
      meal_timestamp: timestamp,
      photo_url: null,
      items: snapshot.items,
      total_protein: snapshot.totals.protein,
      total_carbs: snapshot.totals.carbs,
      total_fat: snapshot.totals.fat,
      total_calories: snapshot.totals.calories,
      needs_review: false,
      manual_override: Boolean(sourceMeal.manual_override),
      ai_confidence: sourceMeal.ai_confidence,
      reviewed_at: new Date().toISOString(),
      entry_method: 'quick_log',
      source_meal_id: sourceMealId,
      log_request_id: requestId,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: existing } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('log_request_id', requestId)
        .maybeSingle()
      if (existing) return NextResponse.json({ success: true, mealId: existing.id, reusedRequest: true })
    }
    console.error('Failed to quick-log meal:', insertError)
    return NextResponse.json({ error: 'Failed to log meal' }, { status: 500 })
  }

  return NextResponse.json({ success: true, mealId: insertedMeal.id })
}
