/**
 * Tests for POST /api/meals/parse-text (first call-site migrated onto the LLM seam).
 *
 * Mocks the seam (`complete`) rather than the vendor SDK, proving the route
 * works through the neutral contract. Locks the behavior-preserving migration:
 * happy path writes and returns totals; empty items -> 400; unparseable model
 * output -> 500.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/llm/client', () => ({
  complete: vi.fn(),
}))

import { POST } from '../../app/api/meals/parse-text/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { complete } from '../../app/lib/llm/client'

function authedSupabaseInserting(mealId = 'meal-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: mealId }, error: null }),
        })),
      })),
    })),
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
    text,
    toolCalls: [],
    usage: { input: 100, output: 50 },
    stopReason: 'stop',
    model: 'test-model',
    provider: 'anthropic',
  })
}

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/meals/parse-text', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const validPayload = JSON.stringify({
  items: [{ food: 'eggs', portion: '2', protein: 12, carbs: 1, fat: 10, calories: 140 }],
  totals: { protein: 12, carbs: 1, fat: 10, calories: 140 },
  confidence: 0.9,
})

describe('POST /api/meals/parse-text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for an unauthenticated request', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    const response = await POST(req({ text: '2 eggs', timestamp: '2026-07-19T12:00:00Z' }))
    expect(response.status).toBe(401)
    expect(complete).not.toHaveBeenCalled()
  })

  it('parses via the seam and saves the meal', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabaseInserting('meal-1') as any)
    mockLlmText(validPayload)

    const response = await POST(req({ text: '2 eggs', timestamp: '2026-07-19T12:00:00Z' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.mealId).toBe('meal-1')
    expect(data.totals.calories).toBe(140)
    // Called with the nutrition purpose and deterministic settings.
    const arg = vi.mocked(complete).mock.calls[0][0]
    expect(arg.purpose).toBe('nutrition')
    expect(arg.temperature).toBe(0)
  })

  it('returns 400 when the model finds no food items', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabaseInserting() as any)
    mockLlmText(JSON.stringify({ items: [], totals: { protein: 0, carbs: 0, fat: 0, calories: 0 } }))

    const response = await POST(req({ text: 'xyz', timestamp: '2026-07-19T12:00:00Z' }))
    expect(response.status).toBe(400)
  })

  it('returns 500 on unparseable model output', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabaseInserting() as any)
    mockLlmText('sorry, I cannot do that')

    const response = await POST(req({ text: '2 eggs', timestamp: '2026-07-19T12:00:00Z' }))
    expect(response.status).toBe(500)
  })
})
