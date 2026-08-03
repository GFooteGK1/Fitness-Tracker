import OpenAI, { toFile } from 'openai'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Voice transcription is not configured. Use text entry instead.' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const audio = formData.get('audio')
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'Audio recording is required.' }, { status: 400 })
    }

    if (audio.size === 0) {
      return NextResponse.json({ error: 'The audio recording was empty. Try again.' }, { status: 400 })
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio recording is too large. Keep recordings under 10 MB.' }, { status: 413 })
    }

    const audioBytes = Buffer.from(await audio.arrayBuffer())
    const filename = `meal-voice.${extensionForMimeType(audio.type)}`
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const transcription = await client.audio.transcriptions.create({
      file: await toFile(audioBytes, filename, { type: audio.type || 'application/octet-stream' }),
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL,
    })
    const text = transcription.text.trim()

    if (!text) {
      return NextResponse.json({ error: 'No speech was detected. Try again.' }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      text,
    })
  } catch (error) {
    console.error('Audio transcription error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Voice transcription failed. Try again or use text entry.', success: false },
      { status: 500 }
    )
  }
}
