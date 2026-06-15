import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { getAnthropicClient } from '@/app/lib/anthropic-client'
import { apiError } from '@/app/lib/api-response'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MIN_FILE_SIZE = 1000

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('[Upload] Auth check:', { 
      hasUser: !!user, 
      userId: user?.id,
      authError: authError?.message 
    })

    if (authError || !user) {
      console.error('[Upload] Authentication failed:', authError)
      return apiError('Unauthorized', 401, authError?.message || 'No user session found')
    }

    // Verify API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[Upload] ANTHROPIC_API_KEY not configured')
      return apiError('AI service not configured. Please contact support.', 500)
    }

    const formData = await request.formData()
    const file = formData.get('photo') as File
    const timestamp = formData.get('timestamp') as string

    if (!file || !timestamp) {
      return apiError('Missing photo or timestamp', 400)
    }

    console.log('[Upload] File received:', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    if (file.size > MAX_FILE_SIZE) {
      return apiError('File too large (max 10MB)', 400)
    }

    if (file.size < MIN_FILE_SIZE) {
      return apiError('File too small or corrupted', 400)
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
      const response = await getAnthropicClient().messages.create({
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
        console.log('[Upload] Parsed result:', { itemCount: result.items.length, confidence: result.confidence })
      } else {
        console.error('[Upload] No JSON found in Claude response:', text)
        result.notes = 'AI could not parse the image'
      }
    } catch (claudeError: any) {
      console.error('[Upload] Claude API error:', {
        message: claudeError.message,
        type: claudeError.type,
        status: claudeError.status
      })
      result.notes = 'AI analysis failed - please enter manually'
    }

    console.log('[Upload] Saving meal with', result.items.length, 'items')
    
    // Timestamp is expected to be in ISO 8601 UTC format from the client
    // Client should convert local time to UTC before sending
    // Database stores as TIMESTAMPTZ (UTC)
    const mealTimestamp = timestamp

    const { data: meal, error: dbError } = await supabase
      .from('meals')
      .insert({
        user_id: user.id,
        meal_timestamp: mealTimestamp,
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
      return apiError('Database error', 500, dbError.message)
    }

    // Check if analysis actually succeeded
    if (result.items.length === 0) {
      console.warn('[Upload] No items detected in photo')
      return NextResponse.json({
        mealId: meal.id,
        analysisStatus: 'failed',
        error: 'Could not identify food items in the photo. Please try again with a clearer image or enter manually.',
        analysis: result
      }, { status: 200 }) // 200 because meal was saved, just analysis failed
    }

    return NextResponse.json({
      mealId: meal.id,
      analysisStatus: 'complete',
      analysis: result
    })

  } catch (error) {
    console.error('[Upload] Unexpected error:', error)
    return apiError('Server error', 500, error instanceof Error ? error.message : undefined)
  }
}
