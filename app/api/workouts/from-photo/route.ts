/**
 * POST /api/workouts/from-photo
 *
 * Accepts a photo file (multipart/form-data field: "photo") containing a
 * workout whiteboard, handwritten log, or similar image. Uses Claude Vision
 * to extract the workout text and returns it for processing by the Trainer agent.
 *
 * Response:
 *   { workoutText: string, isWorkout: true }  — workout text extracted
 *   { workoutText: null,   isWorkout: false } — image not recognised as a workout
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { apiError } from '@/app/lib/api-response'

const MAX_FILE_SIZE = 10 * 1024 * 1024   // 10 MB

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Parse multipart form
    const formData = await request.formData()
    const photo = formData.get('photo') as File | null
    if (!photo) {
      return apiError('No photo provided', 400)
    }
    if (photo.size > MAX_FILE_SIZE) {
      return apiError(`Photo too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`, 400)
    }

    // Convert to base64 for the Vision API
    const buffer = Buffer.from(await photo.arrayBuffer())
    const base64 = buffer.toString('base64')
    const rawType = photo.type || 'image/jpeg'
    const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(rawType)
      ? rawType
      : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Ask the vision model to extract the workout
    const llmResult = await complete({
      purpose: 'vision',
      maxTokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType, base64 },
            {
              type: 'text',
              text: 'Extract all workout information from this image exactly as written. Include exercise names, rep schemes, sets, weights, time caps, scaling options, and any scores or results visible. Return the workout as plain text. If this image does not contain a workout (e.g. it is food, a person, a landscape, etc.), respond with exactly: NOT_WORKOUT'
            }
          ]
        }
      ]
    })

    const text = llmResult.text.trim()

    if (!text || text === 'NOT_WORKOUT') {
      return NextResponse.json({ workoutText: null, isWorkout: false })
    }

    return NextResponse.json({ workoutText: text, isWorkout: true })

  } catch (error) {
    console.error('Error in workouts/from-photo:', error)
    return apiError(
      error instanceof Error ? error.message : 'Failed to process workout photo',
      500
    )
  }
}
