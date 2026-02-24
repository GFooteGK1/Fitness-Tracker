/**
 * ChatArea Component Tests
 *
 * Tests for the chat message area component that displays agent-attributed
 * messages, typing indicator, and urgent insight banners.
 *
 * **Validates: Requirements 8.1, 8.2, 8.6, 8.11**
 * - 8.1: Scrollable message area in single-page chat layout
 * - 8.2: Visually distinguish each agent using unique icons and color accents
 * - 8.6: Typing indicator when agent response is pending
 * - 8.11: Dismissible urgent insight banner at top of chat view
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatArea from '@/app/v2/components/ChatArea'
import type { AgentMessage, RecentInsight } from '@/app/lib/agents/types'

// Stub scrollIntoView for jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ─── Helpers ─────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<AgentMessage> & { role: AgentMessage['role']; content: string }): AgentMessage {
  return {
    role: overrides.role,
    content: overrides.content,
    domain: overrides.domain,
    confidence: overrides.confidence,
    related_entity_id: overrides.related_entity_id,
    related_entity_type: overrides.related_entity_type,
    smart_defaults: overrides.smart_defaults,
  }
}

function makeInsight(overrides: Partial<RecentInsight> = {}): RecentInsight {
  return {
    id: overrides.id ?? 'insight-1',
    pattern_id: overrides.pattern_id ?? 'CAL_DEF',
    priority: overrides.priority ?? 'urgent',
    confidence: overrides.confidence ?? 0.85,
    content: overrides.content ?? 'High strain day with low calories.',
    created_at: overrides.created_at ?? '2026-02-01T12:00:00Z',
  }
}

const noop = () => {}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ChatArea', () => {
  describe('message rendering', () => {
    it('renders empty state when no messages and not loading', () => {
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
    })

    it('renders user messages right-aligned', () => {
      const messages = [makeMessage({ role: 'user', content: 'Did Fran in 4:32' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Did Fran in 4:32')).toBeInTheDocument()
      // User messages should be in a flex container with justify-end
      const wrapper = screen.getByText('Did Fran in 4:32').closest('[class*="justify-end"]')
      expect(wrapper).toBeInTheDocument()
    })

    it('renders trainer messages with correct icon and label', () => {
      const messages = [makeMessage({ role: 'trainer', domain: 'trainer', content: 'Nice workout!' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Nice workout!')).toBeInTheDocument()
      expect(screen.getByText('Trainer')).toBeInTheDocument()
      expect(screen.getByText('🏋️')).toBeInTheDocument()
    })

    it('renders nutritionist messages with correct icon and label', () => {
      const messages = [makeMessage({ role: 'nutritionist', domain: 'nutritionist', content: 'Great protein intake!' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Great protein intake!')).toBeInTheDocument()
      expect(screen.getByText('Nutritionist')).toBeInTheDocument()
      expect(screen.getByText('🥗')).toBeInTheDocument()
    })

    it('renders socius messages with correct icon and label', () => {
      const messages = [makeMessage({ role: 'socius', domain: 'socius', content: 'Recovery looks good.' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Recovery looks good.')).toBeInTheDocument()
      expect(screen.getByText('Socius')).toBeInTheDocument()
      expect(screen.getByText('🔮')).toBeInTheDocument()
    })

    it('renders system messages with system icon', () => {
      const messages = [makeMessage({ role: 'system', content: 'Session started.' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Session started.')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
      expect(screen.getByText('⚙️')).toBeInTheDocument()
    })

    it('renders multiple messages from different agents', () => {
      const messages = [
        makeMessage({ role: 'user', content: 'Log my workout and lunch' }),
        makeMessage({ role: 'trainer', domain: 'trainer', content: 'Workout logged!' }),
        makeMessage({ role: 'nutritionist', domain: 'nutritionist', content: 'Meal logged!' }),
      ]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Log my workout and lunch')).toBeInTheDocument()
      expect(screen.getByText('Workout logged!')).toBeInTheDocument()
      expect(screen.getByText('Meal logged!')).toBeInTheDocument()
    })

    it('does not show agent label for user messages', () => {
      const messages = [makeMessage({ role: 'user', content: 'Hello' })]
      render(<ChatArea messages={messages} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.queryByText('You')).not.toBeInTheDocument()
    })
  })

  describe('typing indicator', () => {
    it('shows typing indicator when isLoading is true', () => {
      render(<ChatArea messages={[]} isLoading={true} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.getByText('Thinking…')).toBeInTheDocument()
      expect(screen.getByLabelText('Agent is typing')).toBeInTheDocument()
    })

    it('hides typing indicator when isLoading is false', () => {
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
    })

    it('does not show empty state when loading', () => {
      render(<ChatArea messages={[]} isLoading={true} urgentInsights={[]} onDismissInsight={noop} />)

      // Empty state should not appear while loading
      expect(screen.queryByText(/start a conversation/i)).not.toBeInTheDocument()
    })
  })

  describe('urgent insight banner', () => {
    it('renders urgent insight banner with content', () => {
      const insights = [makeInsight({ content: 'You need more calories today!' })]
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={insights} onDismissInsight={noop} />)

      expect(screen.getByText('You need more calories today!')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('renders multiple urgent insight banners', () => {
      const insights = [
        makeInsight({ id: 'i1', content: 'Low calories on high strain day.' }),
        makeInsight({ id: 'i2', content: 'Recovery score declining.' }),
      ]
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={insights} onDismissInsight={noop} />)

      expect(screen.getByText('Low calories on high strain day.')).toBeInTheDocument()
      expect(screen.getByText('Recovery score declining.')).toBeInTheDocument()
      expect(screen.getAllByRole('alert')).toHaveLength(2)
    })

    it('calls onDismissInsight with correct id when dismiss button clicked', () => {
      const onDismiss = vi.fn()
      const insights = [makeInsight({ id: 'insight-42', content: 'Urgent alert' })]
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={insights} onDismissInsight={onDismiss} />)

      const dismissBtn = screen.getByLabelText(/dismiss insight/i)
      fireEvent.click(dismissBtn)

      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(onDismiss).toHaveBeenCalledWith('insight-42')
    })

    it('does not render banner section when no urgent insights', () => {
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('dismiss button has minimum 44px touch target', () => {
      const insights = [makeInsight()]
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={insights} onDismissInsight={noop} />)

      const dismissBtn = screen.getByLabelText(/dismiss insight/i)
      expect(dismissBtn.className).toContain('min-w-[44px]')
      expect(dismissBtn.className).toContain('min-h-[44px]')
    })
  })

  describe('accessibility', () => {
    it('has a log role on the container', () => {
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)
      expect(screen.getByRole('log')).toBeInTheDocument()
    })

    it('has aria-label on the chat container', () => {
      render(<ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />)
      expect(screen.getByLabelText('Chat messages')).toBeInTheDocument()
    })

    it('typing indicator has sr-only text', () => {
      render(<ChatArea messages={[]} isLoading={true} urgentInsights={[]} onDismissInsight={noop} />)
      expect(screen.getByText('Agent is typing')).toHaveClass('sr-only')
    })
  })

  describe('auto-scroll', () => {
    it('calls scrollIntoView when messages change', () => {
      const scrollSpy = vi.fn()
      Element.prototype.scrollIntoView = scrollSpy

      const { rerender } = render(
        <ChatArea messages={[]} isLoading={false} urgentInsights={[]} onDismissInsight={noop} />
      )

      const callsBefore = scrollSpy.mock.calls.length

      rerender(
        <ChatArea
          messages={[makeMessage({ role: 'user', content: 'New message' })]}
          isLoading={false}
          urgentInsights={[]}
          onDismissInsight={noop}
        />
      )

      expect(scrollSpy.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
