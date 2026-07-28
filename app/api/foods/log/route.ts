import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { scaleNutrition, type FoodCatalogDraft } from '@/app/lib/nutrition/barcode'
import { lookupOpenFoodFactsProduct } from '@/app/lib/nutrition/open-food-facts'
import { buildFoodCorrections, parseReviewedFoodRequest } from '@/app/lib/nutrition/reviewed-food'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = parseReviewedFoodRequest(raw)
  if (!input) {
    return NextResponse.json({ error: 'Review the product, serving, and macro values before logging' }, { status: 400 })
  }

  const { data: existingRequest, error: existingError } = await supabase
    .from('meals')
    .select('id')
    .eq('user_id', user.id)
    .eq('log_request_id', input.requestId)
    .maybeSingle()
  if (existingError) {
    console.error('Fast-log idempotency check failed:', existingError)
    return NextResponse.json({ error: 'Failed to verify meal request' }, { status: 500 })
  }
  if (existingRequest) {
    return NextResponse.json({ success: true, mealId: existingRequest.id, reusedRequest: true })
  }

  let sourceDraft: FoodCatalogDraft = input.food
  if (input.food.source === 'open_food_facts') {
    try {
      const providerDraft = await lookupOpenFoodFactsProduct(input.food.barcode || '')
      if (!providerDraft) {
        return NextResponse.json({ error: 'The source product is no longer available. Enter the label manually.' }, { status: 409 })
      }
      sourceDraft = providerDraft
    } catch (error) {
      console.error('Unable to verify food source:', error)
      return NextResponse.json({ error: 'Could not verify the product source. Try manual label entry.' }, { status: 502 })
    }
  } else if (input.food.catalogEntryId) {
    // A saved manual label has no public provider to re-read. Preserve its
    // original nutrition snapshot while recording this review as corrections.
    sourceDraft = { ...input.food, nutrition: input.food.sourceNutrition }
  }

  const corrections = buildFoodCorrections(sourceDraft, input.food)
  const now = new Date().toISOString()
  const { data: catalogEntry, error: catalogError } = await supabase
    .from('food_catalog_entries')
    .upsert({
      user_id: user.id,
      name: input.food.name,
      brand: input.food.brand || null,
      barcode: input.food.barcode || null,
      barcode_lookup_key: input.food.barcodeLookupKey || null,
      source: sourceDraft.source,
      source_key: sourceDraft.sourceKey,
      source_ref: sourceDraft.sourceRef || null,
      serving_amount: input.food.servingAmount,
      serving_unit: input.food.servingUnit,
      serving_label: input.food.servingLabel,
      nutrition_basis: input.food.nutritionBasis,
      protein: input.food.nutrition.protein,
      carbs: input.food.nutrition.carbs,
      fat: input.food.nutrition.fat,
      calories: input.food.nutrition.calories,
      source_nutrition: sourceDraft.nutrition,
      corrections,
      source_payload: sourceDraft.sourcePayload,
      source_fetched_at: sourceDraft.source === 'open_food_facts' ? now : null,
      user_verified_at: now,
      last_used_at: now,
    }, { onConflict: 'user_id,source,source_key' })
    .select('id')
    .single()

  if (catalogError || !catalogEntry) {
    console.error('Failed to save food catalog entry:', catalogError)
    return NextResponse.json({ error: 'Failed to save reviewed food' }, { status: 500 })
  }

  const totals = scaleNutrition(input.food.nutrition, input.servings)
  const portion = input.servings === 1
    ? input.food.servingLabel
    : `${input.servings} × ${input.food.servingLabel}`
  const item = {
    food: input.food.brand ? `${input.food.brand} ${input.food.name}` : input.food.name,
    portion,
    ...totals,
    nutritionSource: {
      catalogEntryId: catalogEntry.id,
      source: sourceDraft.source,
      barcode: input.food.barcode,
      nutritionBasis: input.food.nutritionBasis,
      servingAmount: input.food.servingAmount,
      servingUnit: input.food.servingUnit,
      servings: input.servings,
    },
  }

  const { data: meal, error: mealError } = await supabase
    .from('meals')
    .insert({
      user_id: user.id,
      meal_timestamp: input.timestamp,
      photo_url: null,
      items: [item],
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fat: totals.fat,
      total_calories: totals.calories,
      needs_review: false,
      manual_override: sourceDraft.source === 'manual_label' || Object.keys(corrections).length > 0,
      reviewed_at: now,
      entry_method: sourceDraft.source === 'open_food_facts' ? 'barcode' : 'manual_label',
      log_request_id: input.requestId,
    })
    .select('id')
    .single()

  if (mealError) {
    if (mealError.code === '23505') {
      const { data: duplicate } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('log_request_id', input.requestId)
        .maybeSingle()
      if (duplicate) return NextResponse.json({ success: true, mealId: duplicate.id, reusedRequest: true })
    }
    console.error('Failed to log reviewed food:', mealError)
    return NextResponse.json({ error: 'The food was saved, but the meal could not be logged' }, { status: 500 })
  }

  return NextResponse.json({ success: true, mealId: meal.id, catalogEntryId: catalogEntry.id })
}
