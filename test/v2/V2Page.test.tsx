/**
 * V2 Page Tests
 *
 * Tests the current chat-first V2 page: dashboard bootstrap data, chat history,
 * fixed input controls, and agent submission behavior.
 *
 * **Validates: Requirements 8.1, 6.3**
 * - 8.1: Single-page chat layout at /v2 with scrollable message area and fixed input bar
 * - 6.3: Retrieve most recent conversation messages for display on load
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock useAuth
const mockUser = { id: 'user-123', email: 'test@example.com' }
vi.mock('@/app/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, loading: false, hasCompletedOnboarding: true })),
}))

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })),
}))

function buildChain(data: unknown[] | null = []) {
  const chain: Record<string, unknown> = {}
  for (const method of ['eq', 'is', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.select = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve({ data, error: null }))
  return chain
}

let chatChain: ReturnType<typeof buildChain>

vi.mock('@/app/lib/auth/supabase-client', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'chat_messages') return chatChain
      return buildChain()
    },
  })),
}))

// Mock compressImage for photo code paths imported by the page.
vi.mock('@/app/lib/imageUtils', () => ({
  compressImage: vi.fn().mockResolvedValue({
    compressedDataUrl: 'data:image/jpeg;base64,compressed',
    originalSizeMB: 2,
    compressedSizeMB: 0.5,
    compressionRatio: 4,
    finalQuality: 0.8,
  }),
}))

import V2Page from '@/app/v2/page'

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface PageFetchOptions {
  agent?: FetchHandler
  whoop?: unknown
  meals?: unknown
  targets?: unknown
  program?: unknown
}

function makeResponse(data: unknown, ok = true): Promise<Response> {
  return Promise.resolve({
    ok,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response)
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function stubPageFetch(options: PageFetchOptions = {}) {
  const defaultAgentResponse = {
    messages: [],
    classification: {
      input_type: 'question',
      domains: ['socius'],
      confidence: 0.8,
      context: { has_portions: false, has_score: false, is_benchmark: false },
    },
    processing_time_ms: 100,
  }

  const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input)

    if (url === '/api/agent/process') {
      return options.agent?.(input, init) ?? makeResponse(defaultAgentResponse)
    }

    if (url.startsWith('/api/whoop/data')) {
      return makeResponse(options.whoop ?? { recovery: { recovery_score: 72 } })
    }

    if (url.startsWith('/api/meals/daily')) {
      return makeResponse(options.meals ?? {
        dailyTotals: { protein: 25, carbs: 50, fat: 10, calories: 390 },
      })
    }

    if (url.startsWith('/api/targets')) {
      return makeResponse(options.targets ?? {
        targetProtein: 180,
        targetCarbs: 250,
        targetFat: 70,
        targetCalories: 2350,
      })
    }

    if (url.startsWith('/api/workouts')) {
      return makeResponse(options.program ?? { found: false })
    }

    return makeResponse({})
  })

  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

function findAgentCall(mockFetch: ReturnType<typeof stubPageFetch>) {
  return mockFetch.mock.calls.find(([input]) => requestUrl(input) === '/api/agent/process')
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  chatChain = buildChain([])
  stubPageFetch()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('V2Page', () => {
  describe('layout', () => {
    it('renders the SociusFit header', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      expect(screen.getByText('SociusFit')).toBeInTheDocument()
    })

    it('renders the accessible chat area with empty state', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument()
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
    })

    it('renders the fixed input controls', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      expect(screen.getByLabelText('Message input')).toBeInTheDocument()
      expect(screen.getByLabelText('Voice input')).toBeInTheDocument()
      expect(screen.getByLabelText('Photo input')).toBeInTheDocument()
    })

    it('renders macro summary from dashboard bootstrap data', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument()
        expect(screen.getByText('/180g')).toBeInTheDocument()
      })
    })
  })

  describe('initial data loading', () => {
    it('fetches chat history from chat_messages table on mount', async () => {
      const now = new Date().toISOString()
      chatChain = buildChain([
        { id: 'msg-1', role: 'user', content: 'Hello', domain: null, created_at: now },
        { id: 'msg-2', role: 'assistant', content: 'Hey there!', domain: 'trainer', created_at: now },
      ])

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('Hey there!')).toBeInTheDocument()
      })
    })

    it('loads today program when the workouts API returns one', async () => {
      stubPageFetch({
        program: { found: true, workout: 'Back Squat 5x5\nFran 21-15-9' },
      })

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText("Today's Program")).toBeInTheDocument()
        expect(screen.getByText('Back Squat 5x5')).toBeInTheDocument()
        expect(screen.getByText('Fran 21-15-9')).toBeInTheDocument()
      })
    })

    it('calls dashboard bootstrap endpoints on mount', async () => {
      const mockFetch = stubPageFetch()

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        const urls = mockFetch.mock.calls.map(([input]) => requestUrl(input))
        expect(urls).toContain('/api/whoop/data')
        expect(urls.some(url => url.startsWith('/api/meals/daily'))).toBe(true)
        expect(urls.some(url => url.startsWith('/api/targets'))).toBe(true)
        expect(urls.some(url => url.startsWith('/api/workouts'))).toBe(true)
      })
    })
  })

  describe('input submission', () => {
    it('adds user message optimistically and calls the agent API', async () => {
      const mockFetch = stubPageFetch({
        agent: () => makeResponse({
          messages: [{ role: 'trainer', content: 'Workout logged!', domain: 'trainer' }],
          classification: {
            input_type: 'workout_log',
            domains: ['trainer'],
            confidence: 0.9,
            context: { has_portions: false, has_score: true, is_benchmark: false },
          },
          processing_time_ms: 150,
        }),
      })

      await act(async () => {
        render(<V2Page />)
      })

      const input = screen.getByLabelText('Message input')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Did Fran in 4:32' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      expect(screen.getByText('Did Fran in 4:32')).toBeInTheDocument()

      const agentCall = findAgentCall(mockFetch)
      expect(agentCall?.[1]).toEqual(expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }))

      await waitFor(() => {
        expect(screen.getByText('Workout logged!')).toBeInTheDocument()
      })
    })

    it('shows server-provided error messages on API failure', async () => {
      stubPageFetch({
        agent: () => makeResponse({ error: 'Server error' }, false),
      })

      await act(async () => {
        render(<V2Page />)
      })

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Message input'), { target: { value: 'test' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })

    it('shows network error messages on fetch failure', async () => {
      stubPageFetch({
        agent: () => Promise.reject(new Error('Network error')),
      })

      await act(async () => {
        render(<V2Page />)
      })

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Message input'), { target: { value: 'test' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('sends AgentRequest with text input mode and timezone offset', async () => {
      const mockFetch = stubPageFetch()

      await act(async () => {
        render(<V2Page />)
      })

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Message input'), { target: { value: 'How am I doing?' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      const agentCall = findAgentCall(mockFetch)
      const body = JSON.parse((agentCall?.[1] as RequestInit).body as string)
      expect(body).toEqual(expect.objectContaining({
        content: 'How am I doing?',
        input_mode: 'text',
      }))
      expect(typeof body.tz_offset).toBe('number')
    })
  })

  describe('conversation controls', () => {
    it('clears visible messages when New Chat is clicked', async () => {
      const now = new Date().toISOString()
      chatChain = buildChain([
        { id: 'msg-1', role: 'user', content: 'Hello', domain: null, created_at: now },
      ])

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('New Chat'))
      })

      expect(screen.queryByText('Hello')).not.toBeInTheDocument()
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
    })
  })
})
