/**
 * Tests for POST /api/parse-workout (migrated onto the LLM seam).
 *
 * Mocks the seam (`complete`) rather than the vendor SDK. Locks the
 * behavior-preserving migration: happy path saves the workout and returns it;
 * unparseable model output -> 500; unauthenticated -> 401.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/llm/client', () => ({
  complete: vi.fn(),
}))

import { POST } from '../../app/api/parse-workout/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { complete } from '../../app/lib/llm/client'

function authedSupabase(workoutId = 'w1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'workouts') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: workoutId }, error: null }),
            })),
          })),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) } // block_scores
    }),
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
    usage: { input: 100, output: 80 },
    stopReason: 'stop',
    model: 'test-model',
    provider: 'anthropic',
  })
}

function req(body: unknown): Request {
  return new Request('http://localhost:3000/api/parse-workout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const validWorkout = JSON.stringify({
  blocks: [{ block_type: 'amrap', title: 'A', block_score: { rounds_completed: 5 } }],
  tags: ['conditioning'],
  notes: '',
  rpe: 7,
})

describe('POST /api/parse-workout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for an unauthenticated request', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    const response = await POST(req({ text: 'AMRAP 20', date: '2026-07-19' }))
    expect(response.status).toBe(401)
    expect(complete).not.toHaveBeenCalled()
  })

  it('parses via the seam (workout purpose, temperature 0) and saves', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase('w1') as any)
    mockLlmText(validWorkout)

    const response = await POST(req({ text: 'AMRAP 20: 5 pullups', date: '2026-07-19' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workoutId).toBe('w1')
    const arg = vi.mocked(complete).mock.calls[0][0]
    expect(arg.purpose).toBe('workout')
    expect(arg.temperature).toBe(0)
  })

  it('returns 500 on unparseable model output', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('could not read that')

    const response = await POST(req({ text: 'AMRAP 20', date: '2026-07-19' }))
    expect(response.status).toBe(500)
  })
})
