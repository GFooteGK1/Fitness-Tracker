import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // This endpoint is not needed since we're using Web Speech API on the frontend
    // The original Google Apps Script implementation used browser-based speech recognition
    // which is more reliable and doesn't require server-side processing
    
    return NextResponse.json({
      success: false,
      error: 'Server-side audio transcription not implemented. Use browser speech recognition instead.',
      info: 'Voice recording uses Web Speech API directly in the browser for better performance and reliability.'
    }, { status: 501 })

  } catch (error) {
    console.error('Audio transcription error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process audio',
        success: false 
      },
      { status: 500 }
    )
  }
}