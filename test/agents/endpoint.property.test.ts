/**
 * Property-Based Tests for Agent Endpoint
 *
 * Feature: agent-system, Property 22: Authentication enforcement
 * Feature: agent-system, Property 23: Error response structure
 *
 * **Validates: Requirements 7.2, 7.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock supabase-server before importing the route
vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

// Mock the classifier to avoid real LLM calls
vi.mock('@/app/lib/agents/classifier', () => ({
  classifyInput: vi.fn(),
}))

import { POST } from '@/app/api/agent/process/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { classifyInput } from '@/app/lib/agents/classifier'
import { validateRequest } from '@/app/lib/agents/preprocessor'
import type { AgentRequest, InputMode } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

const VALID_INPUT_MODES: InputMode[] = ['text', 'voice', 'photo', 'file']

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/agent/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Property 22: Authentication enforcement', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property 22a: Unauthenticated requests always return 401
   */
  test.prop(
    [
      fc.record({
        content: fc.string({ minLength: 1, maxLength: 100 }),
        input_mode: fc.constantFrom<InputMode>(...VALID_INPUT_MODES)
      })
    ],
    propertyConfig
  )('Property 22: unauthenticated requests return 401', async (body) => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        }),
      },
      from: vi.fn(),
    }
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as never)

    const request = createMockRequest(body)
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  /**
   * Property 22b: Unauthenticated requests never invoke the classifier
   */
  test.prop(
    [
      fc.record({
        content: fc.string({ minLength: 1, maxLength: 100 }),
        input_mode: fc.constantFrom<InputMode>(...VALID_INPUT_MODES)
      })
    ],
    propertyConfig
  )('Property 22: unauthenticated requests do not invoke classifier', async (body) => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Auth error' },
        }),
      },
      from: vi.fn(),
    }
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as never)
    vi.mocked(classifyInput).mockClear()

    const request = createMockRequest(body)
    await POST(request)

    expect(classifyInput).not.toHaveBeenCalled()
  })
})

describe('Property 23: Error response structure', () => {

  /**
   * Property 23a: validateRequest rejects content over 5000 chars
   */
  test.prop(
    [fc.string({ minLength: 5001, maxLength: 6000 })],
    propertyConfig
  )('Property 23: content over 5000 chars returns error', (longContent) => {
    const req: AgentRequest = { content: longContent, input_mode: 'text' }
    const error = validateRequest(req)
    expect(error).not.toBeNull()
    expect(typeof error).toBe('string')
    expect(error!.length).toBeGreaterThan(0)
  })

  /**
   * Property 23b: validateRequest accepts content within limits
   */
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 5000 }),
      fc.constantFrom<InputMode>(...VALID_INPUT_MODES)
    ],
    propertyConfig
  )('Property 23: valid content within limits passes validation', (content, mode) => {
    const req: AgentRequest = { content, input_mode: mode }
    const error = validateRequest(req)
    expect(error).toBeNull()
  })

  /**
   * Property 23c: validateRequest rejects empty input (no content, no photo, no audio)
   */
  test.prop(
    [fc.constantFrom<InputMode>(...VALID_INPUT_MODES)],
    propertyConfig
  )('Property 23: empty input returns error', (mode) => {
    const req: AgentRequest = { content: '', input_mode: mode }
    const error = validateRequest(req)
    expect(error).not.toBeNull()
    expect(typeof error).toBe('string')
  })

  /**
   * Property 23d: Error responses from the endpoint always have error field
   */
  test.prop(
    [fc.string({ minLength: 5001, maxLength: 6000 })],
    propertyConfig
  )('Property 23: validation error responses contain error field', async (longContent) => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user' } },
          error: null,
        }),
      },
      from: vi.fn(),
    }
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as never)

    const request = createMockRequest({ content: longContent, input_mode: 'text' })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
    expect(typeof data.error).toBe('string')
    expect(data.error.length).toBeGreaterThan(0)
  })
})
