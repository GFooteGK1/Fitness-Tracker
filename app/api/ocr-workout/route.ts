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

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/[a-z]+;base64,/, '')
    
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Please extract the workout text from this image. This could be from a whiteboard, screen, or written workout. 

Extract the workout details exactly as written, including:
- Workout name/title (if any)
- Exercise movements and reps/sets
- Time domains (AMRAP, For Time, etc.)
- Weights or scaling options
- Any notes or instructions

Format the output as clean, readable workout text that can be logged. If you can't read the text clearly, let me know what parts are unclear.`
            }
          ],
        },
      ],
    })

    const extractedText = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({
      success: true,
      extractedText: extractedText,
      message: 'Workout text extracted successfully'
    })

  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process image',
        success: false 
      },
      { status: 500 }
    )
  }
}