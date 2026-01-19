import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { FoodItem, PortionSpec } from '@/app/lib/types/food-tracking'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Convert portion spec to human-readable description for Claude
function portionToDescription(spec: PortionSpec): string {
  if (spec.type === 'relative' && spec.relative) {
    const descriptions: Record<string, string> = {
      'palm': 'palm-sized (approximately 3-4 oz or 85-115g)',
      'fist': 'fist-sized (approximately 1 cup or 240ml)',
      'cupped-hand': 'cupped hand (approximately ½ cup or 120ml)',
      'thumb': 'thumb-sized (approximately 1 tablespoon or 15ml)',
      'half-plate': 'half plate portion (large serving)',
      'quarter-plate': 'quarter plate portion (small serving)',
    }
    return descriptions[spec.relative] || spec.relative
  }
  
  if (spec.type === 'exact' && spec.exact) {
    const { amount, unit } = spec.exact
    const unitNames: Record<string, string> = {
      'g': 'grams',
      'oz': 'ounces',
      'cup': 'cups',
      'tbsp': 'tablespoons',
      'tsp': 'teaspoons',
    }
    return `${amount} ${unitNames[unit] || unit}`
  }
  
  return 'unspecified portion'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mealId, items } = body as { mealId: string; items: FoodItem[] }

    if (!mealId || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing mealId or items' }, { status: 400 })
    }

    // Check if any items have portion specs to refine
    const itemsWithPortions = items.filter(item => item.portionSpec)
    
    if (itemsWithPortions.length === 0) {
      // No refinement needed, just return original items
      return NextResponse.json({ items, refined: false })
    }

    // Build prompt for Claude to refine macros based on portion specs
    const itemDescriptions = items.map((item, i) => {
      const portionDesc = item.portionSpec 
        ? portionToDescription(item.portionSpec)
        : item.portion
      return `${i + 1}. ${item.food}: ${portionDesc}`
    }).join('\n')

    console.log('[Refine] Calling Claude for macro refinement...')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Recalculate the nutritional macros for these food items based on the specified portion sizes.

Food items with portions:
${itemDescriptions}

Return JSON only with this exact structure:
{
  "items": [
    {"food": "name", "portion": "portion description", "protein": 0, "carbs": 0, "fat": 0, "calories": 0}
  ],
  "total_protein": 0,
  "total_carbs": 0,
  "total_fat": 0,
  "total_calories": 0,
  "confidence": 0.85
}

Use accurate nutritional data. Round macros to 1 decimal place. Confidence should reflect how certain you are about the estimates (0.0-1.0).`
      }]
    })

    let result = { 
      items: items.map(i => ({ food: i.food, portion: i.portion, protein: i.protein, carbs: i.carbs, fat: i.fat, calories: i.calories })),
      total_protein: 0, 
      total_carbs: 0, 
      total_fat: 0, 
      total_calories: 0, 
      confidence: 0.5 
    }
    
    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        result = JSON.parse(match[0])
      }
    } catch (e) {
      console.error('[Refine] Parse error:', e)
    }

    // Update the meal in database with refined values
    const { error: updateError } = await supabase
      .from('meals')
      .update({
        items: result.items,
        total_protein: result.total_protein,
        total_carbs: result.total_carbs,
        total_fat: result.total_fat,
        total_calories: result.total_calories,
        ai_confidence: result.confidence,
        needs_review: result.confidence < 0.7
      })
      .eq('id', mealId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[Refine] DB update error:', updateError)
      return NextResponse.json({ error: 'Failed to update meal' }, { status: 500 })
    }

    console.log('[Refine] Meal updated successfully')

    return NextResponse.json({
      items: result.items,
      totals: {
        protein: result.total_protein,
        carbs: result.total_carbs,
        fat: result.total_fat,
        calories: result.total_calories
      },
      confidence: result.confidence,
      refined: true
    })

  } catch (error) {
    console.error('[Refine] Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
