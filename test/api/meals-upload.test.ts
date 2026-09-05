import { loggingRpc } from '../helpers/logging-rpc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('@/app/lib/llm/client', () => ({
  complete: vi.fn(),
}))

import { POST } from '@/app/api/meals/upload/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'

function uploadRequest() {
  const formData = new FormData()
  formData.append('requestId','photo-123456')
  formData.append(
    'photo',
    new File([new Uint8Array(2048)], 'meal.jpg', { type: 'image/jpeg' })
  )
  formData.append('timestamp', '2026-08-02T12:00:00.000Z')

  return new NextRequest('http://localhost:3000/api/meals/upload', {
    method: 'POST',
    body: formData,
  })
}

function authenticatedSupabase() {
  const insertSpy = vi.fn()
  const fromSpy = vi.fn(() => ({
    insert: insertSpy.mockImplementation((record: unknown) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 'meal-1', ...(record as object) },
          error: null,
        }),
      })),
    })),
  }))

  return {
    client: {
      rpc: loggingRpc('meal-1', record => { insertSpy(record) }),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromSpy,
    },
    fromSpy,
    insertSpy,
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

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        food: 'Chicken breast',
        portion: '6 oz',
        protein: 42,
        carbs: 0,
        fat: 3,
        calories: 195,
      },
      {
        food: 'Brown rice',
        portion: '1 cup',
        protein: 5,
        carbs: 45,
        fat: 2,
        calories: 216,
      },
    ],
    total_protein: 100,
    total_carbs: 100,
    total_fat: 100,
    total_calories: 1000,
    confidence: 0.85,
    notes: '',
    ...overrides,
  }
}

describe('POST /api/meals/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists only validated items with totals recomputed from those items', async () => {
    const { client, insertSpy } = authenticatedSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    mockModelText(JSON.stringify(validPayload()))

    const response = await POST(uploadRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.analysis).toMatchObject({
      total_protein: 47,
      total_carbs: 45,
      total_fat: 5,
      total_calories: 411,
    })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      total_protein: 47,
      total_carbs: 45,
      total_fat: 5,
      total_calories: 411,
      needs_review: false,
    }))
  })

  it('marks a valid low-confidence analysis for review', async () => {
    const { client, insertSpy } = authenticatedSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    mockModelText(JSON.stringify(validPayload({ confidence: 0.45 })))

    const response = await POST(uploadRequest())

    expect(response.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      ai_confidence: 0.45,
      needs_review: true,
    }))
  })

  it.each([
    ['unparseable output', 'not json'],
    ['empty items', JSON.stringify(validPayload({ items: [] }))],
    ['non-finite macros', JSON.stringify(validPayload()).replace('"protein":42', '"protein":1e400')],
    ['negative macros', JSON.stringify(validPayload({
      items: [{
        food: 'Chicken',
        portion: '6 oz',
        protein: -1,
        carbs: 0,
        fat: 3,
        calories: 195,
      }],
    }))],
    ['out-of-range macros', JSON.stringify(validPayload({
      items: [{
        food: 'Chicken',
        portion: '6 oz',
        protein: 201,
        carbs: 0,
        fat: 3,
        calories: 195,
      }],
    }))],
    ['out-of-range confidence', JSON.stringify(validPayload({ confidence: 2 }))],
  ])('rejects %s before opening the meals table', async (_label, modelText) => {
    const { client, fromSpy, insertSpy } = authenticatedSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    mockModelText(modelText)

    const response = await POST(uploadRequest())
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.analysisStatus).toBe('failed')
    expect(fromSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('does not write or log the raw model response when analysis is unusable', async () => {
    const { client, fromSpy } = authenticatedSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    const privateMarker = 'PRIVATE_MEAL_CONTENT_DO_NOT_LOG'
    mockModelText(privateMarker)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(uploadRequest())
    const renderedLogs = JSON.stringify([
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ])

    expect(response.status).toBe(422)
    expect(fromSpy).not.toHaveBeenCalled()
    expect(renderedLogs).not.toContain(privateMarker)
  })

  it('does not write when the provider call fails', async () => {
    const { client, fromSpy } = authenticatedSupabase()
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    vi.mocked(complete).mockRejectedValue(new Error('provider unavailable'))

    const response = await POST(uploadRequest())
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.analysisStatus).toBe('failed')
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
