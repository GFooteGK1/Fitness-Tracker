/**
 * Tests for POST /api/ocr-workout
 *
 * Regression coverage for the auth + payload-cap hardening (Fitness-Tracker-0tr.1):
 * this route spends a paid Vision call, so it must reject anonymous callers and
 * oversized images BEFORE reaching the model.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/anthropic-client', () => ({
  getAnthropicClient: vi.fn(),
  getAnthropicModel: vi.fn(() => 'claude-test-model'),
}))

import { POST } from '../../app/api/ocr-workout/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { getAnthropicClient } from '../../app/lib/anthropic-client'

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

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/ocr-workout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/ocr-workout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for an unauthenticated request and never calls the model', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    const createSpy = vi.fn()
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: createSpy } } as any)

    const response = await POST(postRequest({ image: 'data:image/jpeg;base64,AAAA' }))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('returns 413 for an oversized image and never calls the model', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    const createSpy = vi.fn()
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: createSpy } } as any)

    // > 10 MB decoded => base64 length > ~13.98M chars
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(14 * 1024 * 1024)
    const response = await POST(postRequest({ image: oversized }))
    const data = await response.json()

    expect(response.status).toBe(413)
    expect(data.success).toBe(false)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('extracts text for an authenticated request within the size cap', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'AMRAP 20: 5 pull-ups, 10 push-ups, 15 squats' }],
    })
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: createSpy } } as any)

    const response = await POST(postRequest({ image: 'data:image/jpeg;base64,AAAA' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.extractedText).toContain('AMRAP 20')
    expect(createSpy).toHaveBeenCalledTimes(1)
  })
})
