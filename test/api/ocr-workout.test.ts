/**
 * Tests for POST /api/ocr-workout (auth/cap hardening + LLM-seam migration).
 *
 * Auth + payload-cap regression (Fitness-Tracker-0tr.1): the route must reject
 * anonymous callers and oversized images BEFORE reaching the model. Mocks the
 * seam (`complete`) rather than the vendor SDK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }))

import { POST } from '../../app/api/ocr-workout/route'
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
    text, toolCalls: [], usage: { input: 100, output: 60 }, stopReason: 'stop', model: 'm', provider: 'anthropic',
  })
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
    const response = await POST(postRequest({ image: 'data:image/jpeg;base64,AAAA' }))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns 413 for an oversized image and never calls the model', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(14 * 1024 * 1024)
    const response = await POST(postRequest({ image: oversized }))
    const data = await response.json()

    expect(response.status).toBe(413)
    expect(data.success).toBe(false)
    expect(complete).not.toHaveBeenCalled()
  })

  it('extracts text via the seam for an authenticated request within the cap', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('AMRAP 20: 5 pull-ups, 10 push-ups, 15 squats')

    const response = await POST(postRequest({ image: 'data:image/jpeg;base64,AAAA' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.extractedText).toContain('AMRAP 20')
    expect(vi.mocked(complete).mock.calls[0][0].purpose).toBe('vision')
  })
})
