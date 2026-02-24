/**
 * BottomNav Component Tests
 *
 * Tests for the bottom navigation bar with Chat, Insights, and PRs tabs,
 * including insight sorting and PR grouping display.
 *
 * **Validates: Requirements 8.7, 8.8, 8.9**
 * - 8.7: Bottom navigation bar with tabs for Chat, Insights, and PRs
 * - 8.8: Insights tab displays insights sorted by priority and recency
 * - 8.9: PRs tab displays benchmark PRs with historical progression
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import BottomNav, { sortInsights } from '@/app/v2/components/BottomNav'
import type { RecentInsight, BenchmarkPR } from '@/app/lib/agents/types'

// ─── Helpers ─────────────────────────────────────────────────────────

function makeInsight(overrides: Partial<RecentInsight> = {}): RecentInsight {
  return {
    id: overrides.id ?? 'insight-1',
    pattern_id: overrides.pattern_id ?? 'CAL_DEF',
    priority: overrides.priority ?? 'notable',
    confidence: overrides.confidence ?? 0.75,
    content: overrides.content ?? 'Test insight content',
    created_at: overrides.created_at ?? '2026-02-01T12:00:00Z',
  }
}

function makePR(overrides: Partial<BenchmarkPR> = {}): BenchmarkPR {
  return {
    benchmark_name: overrides.benchmark_name ?? 'Fran',
    score_value: overrides.score_value ?? 272,
    score_display: overrides.score_display ?? '4:32',
    date: overrides.date ?? '2026-01-15',
    rx_status: overrides.rx_status ?? 'RX',
  }
}

const noop = () => {}

// ─── sortInsights unit tests ─────────────────────────────────────────

describe('sortInsights', () => {
  it('sorts by priority: urgent > notable > informational', () => {
    const insights = [
      makeInsight({ id: '1', priority: 'informational', created_at: '2026-02-01T12:00:00Z' }),
      makeInsight({ id: '2', priority: 'urgent', created_at: '2026-02-01T12:00:00Z' }),
      makeInsight({ id: '3', priority: 'notable', created_at: '2026-02-01T12:00:00Z' }),
    ]
    const sorted = sortInsights(insights)
    expect(sorted.map(i => i.priority)).toEqual(['urgent', 'notable', 'informational'])
  })

  it('sorts by created_at descending within same priority', () => {
    const insights = [
      makeInsight({ id: '1', priority: 'notable', created_at: '2026-01-01T10:00:00Z' }),
      makeInsight({ id: '2', priority: 'notable', created_at: '2026-02-01T10:00:00Z' }),
      makeInsight({ id: '3', priority: 'notable', created_at: '2026-01-15T10:00:00Z' }),
    ]
    const sorted = sortInsights(insights)
    expect(sorted.map(i => i.id)).toEqual(['2', '3', '1'])
  })

  it('returns empty array for empty input', () => {
    expect(sortInsights([])).toEqual([])
  })

  it('does not mutate the original array', () => {
    const insights = [
      makeInsight({ id: '1', priority: 'informational' }),
      makeInsight({ id: '2', priority: 'urgent' }),
    ]
    const original = [...insights]
    sortInsights(insights)
    expect(insights.map(i => i.id)).toEqual(original.map(i => i.id))
  })

  it('handles single element', () => {
    const insights = [makeInsight({ id: '1', priority: 'urgent' })]
    const sorted = sortInsights(insights)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].id).toBe('1')
  })
})

// ─── BottomNav component tests ───────────────────────────────────────

describe('BottomNav', () => {
  describe('navigation bar', () => {
    it('renders three tab buttons: Chat, Insights, PRs', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[]} prs={[]} />)

      expect(screen.getByLabelText('Chat tab')).toBeInTheDocument()
      expect(screen.getByLabelText('Insights tab')).toBeInTheDocument()
      expect(screen.getByLabelText('PRs tab')).toBeInTheDocument()
    })

    it('renders tab icons', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[]} prs={[]} />)

      expect(screen.getByText('💬')).toBeInTheDocument()
      expect(screen.getByText('💡')).toBeInTheDocument()
      expect(screen.getByText('🏆')).toBeInTheDocument()
    })

    it('highlights the active tab with blue text', () => {
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={[]} prs={[]} />)

      const insightsBtn = screen.getByLabelText('Insights tab')
      expect(insightsBtn.className).toContain('text-blue-600')

      const chatBtn = screen.getByLabelText('Chat tab')
      expect(chatBtn.className).toContain('text-gray-400')
    })

    it('sets aria-current="page" on the active tab', () => {
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={[]} />)

      expect(screen.getByLabelText('PRs tab')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByLabelText('Chat tab')).not.toHaveAttribute('aria-current')
    })

    it('calls onTabChange with correct tab id when clicked', () => {
      const onTabChange = vi.fn()
      render(<BottomNav activeTab="chat" onTabChange={onTabChange} insights={[]} prs={[]} />)

      fireEvent.click(screen.getByLabelText('Insights tab'))
      expect(onTabChange).toHaveBeenCalledWith('insights')

      fireEvent.click(screen.getByLabelText('PRs tab'))
      expect(onTabChange).toHaveBeenCalledWith('prs')
    })

    it('all tab buttons have minimum 44px touch targets', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[]} prs={[]} />)

      for (const label of ['Chat tab', 'Insights tab', 'PRs tab']) {
        const btn = screen.getByLabelText(label)
        expect(btn.className).toContain('min-w-[44px]')
        expect(btn.className).toContain('min-h-[44px]')
      }
    })

    it('all tab buttons have touch-action: manipulation', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[]} prs={[]} />)

      for (const label of ['Chat tab', 'Insights tab', 'PRs tab']) {
        const btn = screen.getByLabelText(label)
        expect(btn.style.touchAction).toBe('manipulation')
      }
    })

    it('has a nav element with aria-label', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[]} prs={[]} />)
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    })
  })

  describe('chat tab', () => {
    it('does not render insights or PRs panel when chat tab is active', () => {
      render(<BottomNav activeTab="chat" onTabChange={noop} insights={[makeInsight()]} prs={[makePR()]} />)

      expect(screen.queryByTestId('insights-panel')).not.toBeInTheDocument()
      expect(screen.queryByTestId('prs-panel')).not.toBeInTheDocument()
    })
  })

  describe('insights tab', () => {
    it('renders insights panel when insights tab is active', () => {
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={[makeInsight()]} prs={[]} />)
      expect(screen.getByTestId('insights-panel')).toBeInTheDocument()
    })

    it('shows empty state when no insights', () => {
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={[]} prs={[]} />)
      expect(screen.getByText(/no insights yet/i)).toBeInTheDocument()
    })

    it('displays insight content', () => {
      const insights = [makeInsight({ content: 'Your recovery is declining.' })]
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={insights} prs={[]} />)
      expect(screen.getByText('Your recovery is declining.')).toBeInTheDocument()
    })

    it('displays insights sorted by priority then recency', () => {
      const insights = [
        makeInsight({ id: '1', priority: 'informational', content: 'Info insight', created_at: '2026-02-01T12:00:00Z' }),
        makeInsight({ id: '2', priority: 'urgent', content: 'Urgent insight', created_at: '2026-02-01T12:00:00Z' }),
        makeInsight({ id: '3', priority: 'notable', content: 'Notable insight', created_at: '2026-02-01T12:00:00Z' }),
      ]
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={insights} prs={[]} />)

      const panel = screen.getByTestId('insights-panel')
      const texts = panel.querySelectorAll('p')
      expect(texts[0].textContent).toBe('Urgent insight')
      expect(texts[1].textContent).toBe('Notable insight')
      expect(texts[2].textContent).toBe('Info insight')
    })

    it('shows priority labels with correct colors', () => {
      const insights = [
        makeInsight({ id: '1', priority: 'urgent', content: 'Caloric deficit detected' }),
        makeInsight({ id: '2', priority: 'notable', content: 'Protein trending up' }),
        makeInsight({ id: '3', priority: 'informational', content: 'Consistent training' }),
      ]
      render(<BottomNav activeTab="insights" onTabChange={noop} insights={insights} prs={[]} />)

      // Priority labels rendered by the component
      const urgentLabel = screen.getByText('Urgent')
      const notableLabel = screen.getByText('Notable')
      const infoLabel = screen.getByText('Info')

      expect(urgentLabel).toHaveClass('text-red-700')
      expect(notableLabel).toHaveClass('text-yellow-700')
      expect(infoLabel).toHaveClass('text-blue-700')
    })
  })

  describe('PRs tab', () => {
    it('renders PRs panel when prs tab is active', () => {
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={[makePR()]} />)
      expect(screen.getByTestId('prs-panel')).toBeInTheDocument()
    })

    it('shows empty state when no PRs', () => {
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={[]} />)
      expect(screen.getByText(/no prs recorded yet/i)).toBeInTheDocument()
    })

    it('groups PRs by benchmark name', () => {
      const prs = [
        makePR({ benchmark_name: 'Fran', score_display: '4:32', date: '2026-01-15' }),
        makePR({ benchmark_name: 'Grace', score_display: '3:10', date: '2026-01-20' }),
        makePR({ benchmark_name: 'Fran', score_display: '4:50', date: '2026-01-01' }),
      ]
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={prs} />)

      // Both benchmark names should appear as headings
      expect(screen.getByText('Fran')).toBeInTheDocument()
      expect(screen.getByText('Grace')).toBeInTheDocument()
    })

    it('displays score_display and date for each PR', () => {
      const prs = [makePR({ score_display: '4:32', date: '2026-01-15', rx_status: 'RX' })]
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={prs} />)

      expect(screen.getByText('4:32')).toBeInTheDocument()
      expect(screen.getByText('2026-01-15')).toBeInTheDocument()
      expect(screen.getByText('RX')).toBeInTheDocument()
    })

    it('shows PRs within a benchmark sorted by date descending', () => {
      const prs = [
        makePR({ benchmark_name: 'Fran', score_display: '5:00', date: '2025-12-01' }),
        makePR({ benchmark_name: 'Fran', score_display: '4:32', date: '2026-01-15' }),
        makePR({ benchmark_name: 'Fran', score_display: '4:50', date: '2026-01-01' }),
      ]
      render(<BottomNav activeTab="prs" onTabChange={noop} insights={[]} prs={prs} />)

      const panel = screen.getByTestId('prs-panel')
      const scores = panel.querySelectorAll('.text-base.font-medium')
      expect(scores[0].textContent).toBe('4:32')
      expect(scores[1].textContent).toBe('4:50')
      expect(scores[2].textContent).toBe('5:00')
    })
  })
})
