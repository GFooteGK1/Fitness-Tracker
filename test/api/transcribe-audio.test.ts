import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transcriptionMocks = vi.hoisted(() => ({
  create: vi.fn(),
  toFile: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    audio = { transcriptions: { create: transcriptionMocks.create } }
  },
  toFile: transcriptionMocks.toFile,
}))

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { POST } from '@/app/api/transcribe-audio/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'

function authedSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  }
}

function anonSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } }),
    },
  }
}

function requestWithAudio(): Request {
  const formData = new FormData()
  formData.append('audio', new File(['audio bytes'], 'meal-voice.mp4', { type: 'audio/mp4' }))
  return new Request('http://localhost:3000/api/transcribe-audio', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/transcribe-audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    transcriptionMocks.toFile.mockResolvedValue({ name: 'meal-voice.mp4' })
    transcriptionMocks.create.mockResolvedValue({ text: 'granola with yogurt' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires an authenticated user', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as never)

    const response = await POST(requestWithAudio())

    expect(response.status).toBe(401)
    expect(transcriptionMocks.create).not.toHaveBeenCalled()
  })

  it('transcribes an authenticated recording without logging audio contents', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as never)

    const response = await POST(requestWithAudio())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true, text: 'granola with yogurt' })
    expect(transcriptionMocks.toFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'meal-voice.mp4',
      { type: 'audio/mp4' },
    )
    expect(transcriptionMocks.create).toHaveBeenCalledWith({
      file: { name: 'meal-voice.mp4' },
      model: 'gpt-4o-mini-transcribe',
    })
  })

  it('reports when transcription is not configured', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as never)
    vi.stubEnv('OPENAI_API_KEY', '')

    const response = await POST(requestWithAudio())
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.error).toContain('not configured')
    expect(transcriptionMocks.create).not.toHaveBeenCalled()
  })
})
