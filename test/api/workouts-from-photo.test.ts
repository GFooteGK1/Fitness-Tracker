/**
 * Tests for POST /api/workouts/from-photo (migrated onto the LLM seam).
 *
 * Mocks the seam (`complete`). Verifies auth, the vision extraction happy path,
 * and the NOT_WORKOUT sentinel handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }))

import { POST } from '../../app/api/workouts/from-photo/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { complete } from '../../app/lib/llm/client'

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

function mockLlmText(text: string) {
  vi.mocked(complete).mockResolvedValue({
    text, toolCalls: [], usage: { input: 80, output: 40 }, stopReason: 'stop', model: 'm', provider: 'anthropic',
  })
}

function photoRequest(type = 'image/jpeg', size = 2000): NextRequest {
  const form = new FormData()
  form.set('photo', new Blob([new Uint8Array(size)], { type }), 'photo')
  return new NextRequest('http://localhost:3000/api/workouts/from-photo', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/workouts/from-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for an unauthenticated request', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    const response = await POST(photoRequest())
    expect(response.status).toBe(401)
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns the extracted workout text via the seam', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('For Time: 21-15-9 thrusters and pull-ups')

    const response = await POST(photoRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.isWorkout).toBe(true)
    expect(data.workoutText).toContain('21-15-9')
    expect(vi.mocked(complete).mock.calls[0][0].purpose).toBe('vision')
    expect(vi.mocked(complete).mock.calls[0][0].timeoutMs).toBe(35_000)
  })

  it('treats the NOT_WORKOUT sentinel as no workout', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('NOT_WORKOUT')

    const response = await POST(photoRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.isWorkout).toBe(false)
    expect(data.workoutText).toBeNull()
  })

  it('rejects unsupported image bytes instead of relabeling them as JPEG', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)

    const response = await POST(photoRequest('image/heic'))
    const data = await response.json()

    expect(response.status).toBe(415)
    expect(data.error).toMatch(/unsupported photo type/i)
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns 413 before model work for an oversized image', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)

    const response = await POST(photoRequest('image/jpeg', 10 * 1024 * 1024 + 1))

    expect(response.status).toBe(413)
    expect(complete).not.toHaveBeenCalled()
})
})
