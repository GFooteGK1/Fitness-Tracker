/**
 * Tests for POST /api/meals/refine
 *
 * Regression coverage for the parse-failure guard (Fitness-Tracker-0tr.3):
 * a malformed/empty model reply must NOT overwrite the meal. The old code
 * initialized totals to 0 and wrote unconditionally, silently zeroing a
 * user's existing macros on any parse miss.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }))

import { POST } from '../../app/api/meals/refine/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { complete } from '../../app/lib/llm/client'

// Builds a Supabase mock whose meals.update chain is a spy we can assert on.
function supabaseWithUpdateSpy(userId = 'user-1') {
  const updateSpy = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }))
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: vi.fn(() => ({ update: updateSpy })),
  }
  return { client, updateSpy }
}

function anonSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } }),
    },
    from: vi.fn(),
  }
}

function mockModelText(text: string) {
  vi.mocked(complete).mockResolvedValue({
    text,
    toolCalls: [],
    usage: { input: 0, output: 0 },
    stopReason: 'stop',
    model: 'test-model',
    provider: 'anthropic',
  })
}

const itemsWithPortion = [
  {
    food: 'chicken breast',
    portion: '1 palm',
    protein: 30,
    carbs: 0,
    fat: 3,
    calories: 150,
    portionSpec: { type: 'relative', relative: 'palm' },
  },
]

const correctedItemsWithoutPortion = [
  {
    food: 'roasted chicken breast',
    portion: '1 piece',
    protein: 30,
    carbs: 0,
    fat: 3,
    calories: 150,
  },
]

function refineRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/meals/refine', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/meals/refine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for an unauthenticated request', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    mockModelText('{}')

    const response = await POST(refineRequest({ mealId: 'm1', items: itemsWithPortion }))
    expect(response.status).toBe(401)
  })

  it('does NOT write to the DB when the model reply cannot be parsed', async () => {
    const { client, updateSpy } = supabaseWithUpdateSpy()
    vi.mocked(createServerClient).mockResolvedValue(client as any)
    mockModelText('Sorry, I could not compute macros for that.') // no JSON braces

    const response = await POST(refineRequest({ mealId: 'm1', items: itemsWithPortion }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.refined).toBe(false)
    expect(data.items).toEqual(itemsWithPortion)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('persists user corrections even when no portion recalculation is needed', async () => {
    const { client, updateSpy } = supabaseWithUpdateSpy()
    vi.mocked(createServerClient).mockResolvedValue(client as any)

    const response = await POST(refineRequest({
      mealId: 'm1',
      items: correctedItemsWithoutPortion,
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      items: correctedItemsWithoutPortion,
      refined: false,
      reviewed: true,
    })
    expect(complete).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      items: correctedItemsWithoutPortion,
      manual_override: true,
      needs_review: false,
      reviewed_at: expect.any(String),
    }))
  })

  it('does NOT write when the parsed JSON is missing numeric totals', async () => {
    const { client, updateSpy } = supabaseWithUpdateSpy()
    vi.mocked(createServerClient).mockResolvedValue(client as any)
    mockModelText('{"items": [], "confidence": 0.9}') // no total_* fields

    const response = await POST(refineRequest({ mealId: 'm1', items: itemsWithPortion }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.refined).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('writes refined macros when the model returns a valid payload', async () => {
    const { client, updateSpy } = supabaseWithUpdateSpy()
    vi.mocked(createServerClient).mockResolvedValue(client as any)
    mockModelText(
      JSON.stringify({
        items: [{ food: 'chicken breast', portion: '1 palm', protein: 31, carbs: 0, fat: 3.5, calories: 155 }],
        total_protein: 31,
        total_carbs: 0,
        total_fat: 3.5,
        total_calories: 155,
        confidence: 0.9,
      })
    )

    const response = await POST(refineRequest({ mealId: 'm1', items: itemsWithPortion }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.refined).toBe(true)
    expect(data.totals.calories).toBe(155)
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      total_calories: 155,
      manual_override: true,
      reviewed_at: expect.any(String),
    }))
  })

  it('clamps an out-of-range confidence instead of writing it raw', async () => {
    const { client, updateSpy } = supabaseWithUpdateSpy()
    vi.mocked(createServerClient).mockResolvedValue(client as any)
    mockModelText(
      JSON.stringify({
        items: [],
        total_protein: 10,
        total_carbs: 10,
        total_fat: 10,
        total_calories: 170,
        confidence: 5, // out of range
      })
    )

    const response = await POST(refineRequest({ mealId: 'm1', items: itemsWithPortion }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.confidence).toBe(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})
