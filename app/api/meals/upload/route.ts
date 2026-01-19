import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MIN_FILE_SIZE = 1000

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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
      return NextResponse.json({ error: 'Missing photo or timestamp' }, { status: 400 })
    }

    console.log('[Upload] File received:', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    if (file.size < MIN_FILE_SIZE) {
      return NextResponse.json({ error: 'File too small or corrupted' }, { status: 400 })
    }

    // Normalize media type
    let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
    if (file.type === 'image/png') mediaType = 'image/png'
    else if (file.type === 'image/webp') mediaType = 'image/webp'
    else if (file.type === 'image/gif') mediaType = 'image/gif'
    else if (file.type === 'image/jpeg' || file.type === 'image/jpg') mediaType = 'image/jpeg'

    const fileBuffer = await file.arrayBuffer()
    const base64Image = Buffer.from(fileBuffer).toString('base64')

    console.log('[Upload] Calling Claude Vision...', { mediaType, base64Length: base64Image.length })

    let result = {
      items: [] as Array<{food: string, portion: string, protein: number, carbs: number, fat: number, calories: number}>,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      total_calories: 0,
      confidence: 0,
      notes: ''
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
            { type: 'text', text: 'Analyze this food photo. Return JSON only: {"items":[{"food":"name","portion":"estimated size","protein":0,"carbs":0,"fat":0,"calories":0}],"total_protein":0,"total_carbs":0,"total_fat":0,"total_calories":0,"confidence":0.8,"notes":""}' }
          ]
        }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      console.log('[Upload] Claude response:', text.substring(0, 200))

      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        result = {
          items: parsed.items || [],
          total_protein: parsed.total_protein || 0,
          total_carbs: parsed.total_carbs || 0,
          total_fat: parsed.total_fat || 0,
          total_calories: parsed.total_calories || 0,
          confidence: parsed.confidence || 0.5,
          notes: parsed.notes || ''
        }
      }
    } catch (claudeError: any) {
      console.error('[Upload] Claude API error:', claudeError.message || claudeError)
      result.notes = 'AI analysis failed - please enter manually'
    }

    console.log('[Upload] Saving meal with', result.items.length, 'items')

    const { data: meal, error: dbError } = await supabase
      .from('meals')
      .insert({
        user_id: user.id,
        meal_timestamp: new Date(timestamp).toISOString(),
        photo_url: null,
        items: result.items,
        total_protein: result.total_protein,
        total_carbs: result.total_carbs,
        total_fat: result.total_fat,
        total_calories: result.total_calories,
        needs_review: result.confidence < 0.7 || result.items.length === 0,
        ai_confidence: result.confidence
      })
      .select()
      .single()

    if (dbError) {
      console.error('[Upload] DB error:', dbError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({
      mealId: meal.id,
      analysisStatus: result.items.length > 0 ? 'complete' : 'failed',
      analysis: result
    })

  } catch (error) {
    console.error('[Upload] Unexpected error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
