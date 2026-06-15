import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { getAnthropicClient, getAnthropicModel } from '@/app/lib/anthropic-client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { text, timestamp } = await request.json()

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Meal text is required' },
        { status: 400 }
      )
    }

    if (!timestamp) {
      return NextResponse.json(
        { error: 'Timestamp is required' },
        { status: 400 }
      )
    }

    console.log('[Parse Text] Parsing meal:', { text: text.substring(0, 100), timestamp })

    // Parse meal with Claude
    const systemPrompt = buildMealParserSystemPrompt()
    const userPrompt = buildUserPrompt(text)

    const message = await getAnthropicClient().messages.create({
      model: getAnthropicModel('nutrition'),
      max_tokens: 2048,
      temperature: 0, // Deterministic parsing
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    })

    // Extract and parse JSON response
    let responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Clean markdown code blocks if present
    responseText = responseText.trim()
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const parsed = JSON.parse(responseText)

    console.log('[Parse Text] Parsed result:', {
      itemCount: parsed.items?.length,
      confidence: parsed.confidence,
      totals: parsed.totals
    })

    // Validate parsed structure
    if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return NextResponse.json(
        { error: 'Could not identify any food items. Please be more specific.' },
        { status: 400 }
      )
    }

    // Save to database
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .insert({
        user_id: user.id,
        // Timestamp is expected to be in ISO 8601 UTC format from the client
        // Client should convert local time to UTC before sending
        // Database stores as TIMESTAMPTZ (UTC)
        meal_timestamp: timestamp,
        input_text: text,
        photo_url: null, // No photo for text input
        items: parsed.items,
        total_protein: parsed.totals.protein,
        total_carbs: parsed.totals.carbs,
        total_fat: parsed.totals.fat,
        total_calories: parsed.totals.calories,
        ai_confidence: parsed.confidence || 0.8,
        needs_review: (parsed.confidence || 0.8) < 0.7
      })
      .select()
      .single()

    if (mealError) {
      console.error('[Parse Text] Database error:', mealError)
      return NextResponse.json(
        { error: 'Failed to save meal: ' + mealError.message },
        { status: 500 }
      )
    }

    console.log('[Parse Text] Meal saved:', meal.id)

    return NextResponse.json({
      success: true,
      mealId: meal.id,
      items: parsed.items,
      totals: parsed.totals,
      confidence: parsed.confidence || 0.8
    })

  } catch (error) {
    console.error('[Parse Text] Error:', error)
    return NextResponse.json(
      { error: getParseTextUserError(error) },
      { status: 500 }
    )
  }
}

function getParseTextUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/model|not_found|404/i.test(message)) {
    return 'AI nutrition analysis is temporarily unavailable. Please try again shortly.'
  }
  return message || 'Unknown error'
}

function buildMealParserSystemPrompt(): string {
  return `You are a nutrition analysis assistant specialized in parsing natural language meal descriptions into structured nutritional data.

# YOUR TASK

Parse meal descriptions into structured JSON with accurate macro and calorie estimates based on USDA nutritional data.

# CRITICAL RULES

1. **Identify all food items** mentioned in the text
2. **Extract or estimate portion sizes** - if not specified, use reasonable defaults
3. **Calculate macros** (protein, carbs, fat) for each item based on the portion
4. **Calculate calories** using the 4-4-9 rule (protein: 4 cal/g, carbs: 4 cal/g, fat: 9 cal/g)
5. **Sum totals** across all items
6. **Assign confidence score** (0.0-1.0) based on:
   - Portion specificity (higher if portions are specified)
   - Food clarity (higher if foods are clearly identified)
   - Cooking method clarity (higher if cooking method is specified)

# PORTION SIZE GUIDELINES

When portions are NOT specified, use these defaults:
- Meat/Protein: 4-6 oz (113-170g)
- Grains/Starches: 1 cup cooked (150-200g)
- Vegetables: 1 cup (150g)
- Fats/Oils: 1 tablespoon (15ml)
- Nuts: 1 oz (28g)
- Cheese: 1 oz (28g)

# COOKING METHOD ADJUSTMENTS

- Grilled/Baked: Minimal added fat
- Fried: Add 1-2 tbsp oil (14-28g fat)
- Sautéed: Add 1 tbsp oil (14g fat)
- Raw: No cooking adjustments

# REQUIRED JSON SCHEMA

{
  "items": [
    {
      "food": "Chicken breast",
      "portion": "6 oz",
      "protein": 42,
      "carbs": 0,
      "fat": 3,
      "calories": 195
    }
  ],
  "totals": {
    "protein": 42,
    "carbs": 0,
    "fat": 3,
    "calories": 195
  },
  "confidence": 0.85,
  "notes": "Optional notes about assumptions made"
}

# VALIDATION RULES

- All macro values must be non-negative numbers
- Protein: 0-200g per item
- Carbs: 0-300g per item
- Fat: 0-150g per item
- Calories: 0-2000 per item
- Totals must equal sum of items
- Confidence: 0.0-1.0

# EXAMPLES

Input: "Chicken breast 6oz, brown rice 1 cup, broccoli"
Output:
{
  "items": [
    {"food": "Chicken breast", "portion": "6 oz", "protein": 42, "carbs": 0, "fat": 3, "calories": 195},
    {"food": "Brown rice", "portion": "1 cup", "protein": 5, "carbs": 45, "fat": 2, "calories": 216},
    {"food": "Broccoli", "portion": "1 cup", "protein": 3, "carbs": 6, "fat": 0, "calories": 31}
  ],
  "totals": {"protein": 50, "carbs": 51, "fat": 5, "calories": 442},
  "confidence": 0.9
}

Input: "Grilled salmon with sweet potato and asparagus"
Output:
{
  "items": [
    {"food": "Grilled salmon", "portion": "5 oz", "protein": 29, "carbs": 0, "fat": 11, "calories": 233},
    {"food": "Sweet potato", "portion": "1 medium", "protein": 2, "carbs": 24, "fat": 0, "calories": 103},
    {"food": "Asparagus", "portion": "1 cup", "protein": 3, "carbs": 5, "fat": 0, "calories": 27}
  ],
  "totals": {"protein": 34, "carbs": 29, "fat": 11, "calories": 363},
  "confidence": 0.75,
  "notes": "Portions estimated as not specified"
}

Return ONLY valid JSON. No markdown, no explanations.`
}

function buildUserPrompt(text: string): string {
  return `# Meal to Parse

${text}

Parse this meal description and return structured JSON matching the schema.`
}
