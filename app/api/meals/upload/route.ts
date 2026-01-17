import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('photo') as File
    const timestamp = formData.get('timestamp') as string

    if (!file || !timestamp) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    console.log('[Upload] Calling Claude...')
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Analyze food. Return JSON: {"items":[{"food":"name","portion":"size","protein":0,"carbs":0,"fat":0,"calories":0}],"total_protein":0,"total_carbs":0,"total_fat":0,"total_calories":0,"confidence":0.8}' }
        ]
      }]
    })

    let result = { items: [], total_protein: 0, total_carbs: 0, total_fat: 0, total_calories: 0, confidence: 0 }
    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) result = JSON.parse(match[0])
    } catch (e) { console.error('[Upload] Parse error:', e) }

    const { data: meal, error: dbError } = await supabase.from('meals').insert({
      user_id: user.id,
      meal_timestamp: new Date(timestamp).toISOString(),
      photo_url: null,
      items: result.items,
      total_protein: result.total_protein,
      total_carbs: result.total_carbs,
      total_fat: result.total_fat,
      total_calories: result.total_calories,
      needs_review: result.confidence < 0.7,
      ai_confidence: result.confidence
    }).select().single()

    if (dbError) return NextResponse.json({ error: 'DB error' }, { status: 500 })
    return NextResponse.json({ mealId: meal.id, analysis: result })
  } catch (error) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
