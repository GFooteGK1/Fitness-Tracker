/**
 * V2 Page Tests
 *
 * Tests for the wired-up V2 page that connects ChatArea, InputBar, and BottomNav
 * with data fetching, API submission, and insight handling.
 *
 * **Validates: Requirements 8.1, 6.3**
 * - 8.1: Single-page chat layout at /v2 with scrollable message area and fixed input bar
 * - 6.3: Retrieve most recent conversation messages for display on load
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mocks ───────────────────────────────────────────────────────────

// Mock useAuth
const mockUser = { id: 'user-123', email: 'test@example.com' }
vi.mock('@/app/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, loading: false, hasCompletedOnboarding: true })),
}))

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })),
}))

// Mock supabase client
const mockSelect = vi.fn()
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}))

// Chain builder for supabase queries
function buildChain(data: unknown[] | null = []) {
  const chain: Record<string, unknown> = {}
  const methods = ['eq', 'is', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.select = vi.fn(() => chain)
  // The final call in the chain resolves with data
  // Override limit to return the promise-like result
  chain.limit = vi.fn(() => Promise.resolve({ data, error: null }))
  return chain
}

let chatChain: ReturnType<typeof buildChain>
let insightsChain: ReturnType<typeof buildChain>
let prsChain: ReturnType<typeof buildChain>

vi.mock('@/app/lib/auth/supabase-client', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'chat_messages') return chatChain
      if (table === 'insights') return insightsChain
      if (table === 'benchmark_prs') return prsChain
      return buildChain()
    },
  })),
}))

// Mock compressImage (needed by InputBar)
vi.mock('@/app/lib/imageUtils', () => ({
  compressImage: vi.fn().mockResolvedValue({
    compressedDataUrl: 'data:image/jpeg;base64,compressed',
    originalSizeMB: 2,
    compressedSizeMB: 0.5,
    compressionRatio: 4,
    finalQuality: 0.8,
  }),
}))

// Stub scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ─── Import after mocks ─────────────────────────────────────────────

import V2Page from '@/app/v2/page'

// ─── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  chatChain = buildChain([])
  insightsChain = buildChain([])
  prsChain = buildChain([])
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('V2Page', () => {
  describe('layout', () => {
    it('renders the SociusFit header', async () => {
      await act(async () => {
        render(<V2Page />)
      })
      expect(screen.getByText('SociusFit')).toBeInTheDocument()
    })

    it('renders the chat area with empty state', async () => {
      await act(async () => {
        render(<V2Page />)
      })
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
    })

    it('renders the input bar with text input', async () => {
      await act(async () => {
        render(<V2Page />)
      })
      expect(screen.getByLabelText('Message input')).toBeInTheDocument()
    })

    it('renders the bottom navigation with three tabs', async () => {
      await act(async () => {
        render(<V2Page />)
      })
      expect(screen.getByLabelText('Chat tab')).toBeInTheDocument()
      expect(screen.getByLabelText('Insights tab')).toBeInTheDocument()
      expect(screen.getByLabelText('PRs tab')).toBeInTheDocument()
    })
  })

  describe('initial data loading', () => {
    it('fetches chat history from chat_messages table on mount', async () => {
      const chatData = [
        { role: 'user', content: 'Hello', domain: null, confidence: null, related_entity_id: null, related_entity_type: null, created_at: '2026-02-01T10:00:00Z' },
        { role: 'trainer', content: 'Hey there!', domain: 'trainer', confidence: 0.9, related_entity_id: null, related_entity_type: null, created_at: '2026-02-01T10:00:01Z' },
      ]
      chatChain = buildChain(chatData)

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('Hey there!')).toBeInTheDocument()
      })
    })

    it('fetches insights on mount', async () => {
      const insightData = [
        { id: 'ins-1', pattern_id: 'CAL_DEF', priority: 'notable', confidence: 0.7, content: 'Watch your calories', created_at: '2026-02-01T12:00:00Z' },
      ]
      insightsChain = buildChain(insightData)

      await act(async () => {
        render(<V2Page />)
      })

      // Switch to insights tab to see the data
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Insights tab'))
      })

      await waitFor(() => {
        expect(screen.getByText('Watch your calories')).toBeInTheDocument()
      })
    })

    it('fetches benchmark PRs on mount', async () => {
      const prData = [
        { benchmark_name: 'Fran', score_value: 272, score_display: '4:32', date: '2026-01-15', rx_status: 'RX' },
      ]
      prsChain = buildChain(prData)

      await act(async () => {
        render(<V2Page />)
      })

      // Switch to PRs tab
      await act(async () => {
        fireEvent.click(screen.getByLabelText('PRs tab'))
      })

      await waitFor(() => {
        expect(screen.getByText('Fran')).toBeInTheDocument()
        expect(screen.getByText('4:32')).toBeInTheDocument()
      })
    })
  })

  describe('input submission', () => {
    it('adds user message optimistically and calls the API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{ role: 'trainer', content: 'Workout logged!', domain: 'trainer' }],
          classification: { input_type: 'workout_log', domains: ['trainer'], confidence: 0.9, context: { has_portions: false, has_score: true, is_benchmark: false } },
          processing_time_ms: 150,
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

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

      // User message appears optimistically
      expect(screen.getByText('Did Fran in 4:32')).toBeInTheDocument()

      // API was called
      expect(mockFetch).toHaveBeenCalledWith('/api/agent/process', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }))

      // Agent response appears
      await waitFor(() => {
        expect(screen.getByText('Workout logged!')).toBeInTheDocument()
      })
    })

    it('shows error message on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await act(async () => {
        render(<V2Page />)
      })

      const input = screen.getByLabelText('Message input')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'test' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })

    it('shows network error on fetch failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      vi.stubGlobal('fetch', mockFetch)

      await act(async () => {
        render(<V2Page />)
      })

      const input = screen.getByLabelText('Message input')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'test' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it('sends AgentRequest with correct input_mode', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [],
          classification: { input_type: 'question', domains: ['socius'], confidence: 0.8, context: { has_portions: false, has_score: false, is_benchmark: false } },
          processing_time_ms: 100,
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await act(async () => {
        render(<V2Page />)
      })

      const input = screen.getByLabelText('Message input')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'How am I doing?' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({ content: 'How am I doing?', input_mode: 'text' })
    })
  })

  describe('tab navigation', () => {
    it('hides ChatArea and InputBar when switching to Insights tab', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      // Chat area visible initially
      expect(screen.getByRole('log')).toBeInTheDocument()
      expect(screen.getByLabelText('Message input')).toBeInTheDocument()

      // Switch to insights
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Insights tab'))
      })

      expect(screen.queryByRole('log')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Message input')).not.toBeInTheDocument()
    })

    it('hides ChatArea and InputBar when switching to PRs tab', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('PRs tab'))
      })

      expect(screen.queryByRole('log')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Message input')).not.toBeInTheDocument()
    })

    it('shows ChatArea and InputBar when switching back to Chat tab', async () => {
      await act(async () => {
        render(<V2Page />)
      })

      // Go to insights
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Insights tab'))
      })

      // Back to chat
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Chat tab'))
      })

      expect(screen.getByRole('log')).toBeInTheDocument()
      expect(screen.getByLabelText('Message input')).toBeInTheDocument()
    })
  })

  describe('urgent insights', () => {
    it('surfaces urgent insights from API response as banners', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { role: 'socius', content: '⚠️ High strain with low calories!', domain: 'socius', related_entity_id: 'ins-99', related_entity_type: 'insight', confidence: 0.8 },
          ],
          classification: { input_type: 'workout_log', domains: ['trainer', 'socius'], confidence: 0.85, context: { has_portions: false, has_score: true, is_benchmark: false } },
          processing_time_ms: 200,
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await act(async () => {
        render(<V2Page />)
      })

      const input = screen.getByLabelText('Message input')
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Log workout' } })
      })

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Send message'))
      })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('dismisses urgent insight when dismiss button is clicked', async () => {
      // Load with urgent insights from DB
      const insightData = [
        { id: 'ins-urgent', pattern_id: 'CAL_DEF', priority: 'urgent', confidence: 0.85, content: 'Caloric deficit detected', created_at: '2026-02-01T12:00:00Z' },
      ]
      insightsChain = buildChain(insightData)

      await act(async () => {
        render(<V2Page />)
      })

      await waitFor(() => {
        expect(screen.getByText('Caloric deficit detected')).toBeInTheDocument()
      })

      const dismissBtn = screen.getByLabelText(/dismiss insight/i)
      await act(async () => {
        fireEvent.click(dismissBtn)
      })

      expect(screen.queryByText('Caloric deficit detected')).not.toBeInTheDocument()
    })
  })
})
