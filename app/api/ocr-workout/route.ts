import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { getAnthropicClient, getAnthropicModel } from '@/app/lib/anthropic-client'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB decoded

export async function POST(request: NextRequest) {
  try {
    // Auth check — this route spends a paid Vision call, so it must never be
    // reachable anonymously (otherwise it is an open cost-amplification vector).
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false, extractedText: '' },
        { status: 401 }
      )
    }

    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    console.log('OCR request received')

    // Extract base64 data (remove data:image/...;base64, prefix if present)
    const base64Data = image.includes(',') ? image.split(',')[1] : image

    // Reject oversized payloads before spending a Vision call.
    const approxBytes = Math.floor((base64Data.length * 3) / 4)
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `Image too large. Maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
          success: false,
          extractedText: '',
        },
        { status: 413 }
      )
    }
    
    // Determine media type from base64 prefix
    let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
    if (image.includes('image/png')) {
      mediaType = 'image/png'
    } else if (image.includes('image/webp')) {
      mediaType = 'image/webp'
    } else if (image.includes('image/gif')) {
      mediaType = 'image/gif'
    }
    
    console.log('Image size:', (base64Data.length / 1024).toFixed(2), 'KB')
    console.log('Media type:', mediaType)
    
    const startTime = Date.now()
    
    const message = await getAnthropicClient().messages.create({
      model: getAnthropicModel('vision'),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `Extract the workout details from this whiteboard photo. 

Please transcribe ALL workout information you see, including:
- Workout type (AMRAP, For Time, EMOM, etc.)
- All movements with reps/sets
- Weights/loads if shown
- Time domains
- Any scores or results written
- Scaling options (Rx/Scaled)

Format the output as clean, readable text that can be parsed into a workout log. Keep the structure clear with line breaks between sections.

IMPORTANT: Even if the handwriting is messy or partially unclear, do your best to transcribe what you can see. Make reasonable assumptions for unclear text and note any uncertainties. Only refuse if the image is completely unreadable or contains no workout information.`
            }
          ],
        },
      ],
    })

    const duration = Date.now() - startTime
    console.log('OCR API response received in', duration, 'ms')

    // Extract text from Claude's response
    let extractedText = ''
    if (message.content && message.content.length > 0) {
      for (const block of message.content) {
        if (block.type === 'text') {
          extractedText += block.text
        }
      }
    }

    console.log('Extracted text length:', extractedText.length)
    console.log('First 200 chars:', extractedText.substring(0, 200))

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No text extracted from image',
        extractedText: ''
      })
    }

    return NextResponse.json({
      success: true,
      extractedText: extractedText.trim(),
      duration_ms: duration,
      message: 'Workout text extracted successfully'
    })

  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process image',
        success: false,
        extractedText: ''
      },
      { status: 500 }
    )
  }
}
