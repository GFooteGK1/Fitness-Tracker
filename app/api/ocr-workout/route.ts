import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(request: Request) {
  try {
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
    
    // Determine media type from base64 prefix
    let mediaType = 'image/jpeg'
    if (image.includes('image/png')) {
      mediaType = 'image/png'
    } else if (image.includes('image/webp')) {
      mediaType = 'image/webp'
    }
    
    console.log('Image size:', (base64Data.length / 1024).toFixed(2), 'KB')
    console.log('Media type:', mediaType)
    
    const startTime = Date.now()
    
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
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

If you can see text but it's unclear, transcribe what you can and note what's unclear. Only say you can't read it if the image is truly unreadable.`
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