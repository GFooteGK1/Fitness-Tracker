import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { parseBarcode, type FoodCatalogDraft } from '@/app/lib/nutrition/barcode'
import { lookupOpenFoodFactsProduct } from '@/app/lib/nutrition/open-food-facts'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function catalogDraft(row: Record<string, unknown>): FoodCatalogDraft {
  const nutrition = {
    protein: numberValue(row.protein),
    carbs: numberValue(row.carbs),
    fat: numberValue(row.fat),
    calories: numberValue(row.calories),
  }
  const sourceNutrition = row.source_nutrition && typeof row.source_nutrition === 'object'
    ? row.source_nutrition as typeof nutrition
    : nutrition
  return {
    catalogEntryId: String(row.id),
    name: String(row.name),
    brand: row.brand ? String(row.brand) : '',
    barcode: row.barcode ? String(row.barcode) : undefined,
    barcodeLookupKey: row.barcode_lookup_key ? String(row.barcode_lookup_key) : undefined,
    source: row.source as FoodCatalogDraft['source'],
    sourceKey: String(row.source_key),
    sourceRef: row.source_ref ? String(row.source_ref) : undefined,
    servingAmount: numberValue(row.serving_amount),
    servingUnit: String(row.serving_unit),
    servingLabel: String(row.serving_label),
    nutritionBasis: row.nutrition_basis as FoodCatalogDraft['nutritionBasis'],
    nutrition,
    sourceNutrition,
    sourcePayload: row.source_payload && typeof row.source_payload === 'object'
      ? row.source_payload as Record<string, unknown>
      : {},
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const code = new URL(request.url).searchParams.get('code') || ''
  const parsed = parseBarcode(code)
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a valid UPC or EAN barcode' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const { data: saved, error: catalogError } = await supabase
    .from('food_catalog_entries')
    .select('id, name, brand, barcode, barcode_lookup_key, source, source_key, source_ref, serving_amount, serving_unit, serving_label, nutrition_basis, protein, carbs, fat, calories, source_nutrition, source_payload')
    .eq('user_id', user.id)
    .eq('barcode_lookup_key', parsed.lookupKey)
    .order('last_used_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (catalogError) {
    console.error('Food catalog lookup failed:', catalogError)
    return NextResponse.json({ error: 'Food catalog is temporarily unavailable' }, { status: 500, headers: NO_STORE_HEADERS })
  }
  if (saved) {
    return NextResponse.json({ food: catalogDraft(saved), origin: 'catalog' }, { headers: NO_STORE_HEADERS })
  }

  try {
    const food = await lookupOpenFoodFactsProduct(parsed.value)
    if (!food) {
      return NextResponse.json({
        error: 'Product not found. You can enter the nutrition label manually.',
        barcode: parsed.value,
      }, { status: 404, headers: NO_STORE_HEADERS })
    }
    return NextResponse.json({ food, origin: 'open_food_facts' }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Open Food Facts lookup failed:', error)
    return NextResponse.json({
      error: 'Barcode lookup is temporarily unavailable. You can enter the label manually.',
      barcode: parsed.value,
    }, { status: 502, headers: NO_STORE_HEADERS })
  }
}
