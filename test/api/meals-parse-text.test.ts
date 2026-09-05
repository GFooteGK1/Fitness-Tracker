import { loggingRpc } from '../helpers/logging-rpc'
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
    rpc: loggingRpc(mealId),
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
    body: JSON.stringify({ requestId: 'request-123456', submittedAt: '2026-09-04T12:00:00Z', ...(body as object) }),
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

  it('marks an analysis outage as safe to retry before any save attempt', async () => {
    const supabase = authedSupabaseInserting()
    vi.mocked(createServerClient).mockResolvedValue(supabase as any)
    vi.mocked(complete).mockRejectedValueOnce(new Error('provider unavailable'))
    await POST(req({ text: 'eggs', timestamp: '2026-09-04T12:00:00Z' }))
    expect(supabase.rpc).not.toHaveBeenCalledWith('save_logged_activity', expect.anything())
    expect(supabase.rpc).toHaveBeenCalledWith('finish_logging_request', expect.objectContaining({
      p_response: expect.objectContaining({ retrySafe: true })
    }))
  })

  it('rejects account switching before a receipt is claimed', async () => {
    const supabase = authedSupabaseInserting()
    vi.mocked(createServerClient).mockResolvedValue(supabase as any)
    const response = await POST(req({ expectedUserId: 'another-athlete', text: 'eggs', timestamp: '2026-09-04T12:00:00Z' }))
    expect(response.status).toBe(403)
    expect(supabase.rpc).not.toHaveBeenCalled()
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
