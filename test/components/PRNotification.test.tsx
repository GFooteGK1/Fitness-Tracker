// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import PRNotification from '@/app/components/PRNotification'
import { type PRResult } from '@/app/lib/pr-detection'

function makePR(overrides: Partial<PRResult> = {}): PRResult {
  return {
    isPR: true,
    prType: 'weight',
    previousBest: 200,
    newRecord: 225,
    exercise: 'Back Squat',
    improvement: '+25 lbs (+12.5%)',
    ...overrides,
  }
}

describe('PRNotification', () => {
  it('renders nothing when prs array is empty', () => {
    const { container } = render(
      <PRNotification prs={[]} onDismiss={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the PR card with exercise name and values', () => {
    const pr = makePR()
    render(<PRNotification prs={[pr]} onDismiss={() => {}} />)

    expect(screen.getByText('PERSONAL RECORD!')).toBeInTheDocument()
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
    expect(screen.getByText('New Max Weight')).toBeInTheDocument()
    expect(screen.getByText('200 lbs')).toBeInTheDocument()
    expect(screen.getByText('225 lbs')).toBeInTheDocument()
    expect(screen.getByText('+25 lbs (+12.5%)')).toBeInTheDocument()
  })

  it('shows correct label for time PR type', () => {
    const pr = makePR({
      prType: 'time',
      exercise: 'Fran',
      previousBest: 210,
      newRecord: 180,
      improvement: '-0:30 (14.3% faster)',
    })
    render(<PRNotification prs={[pr]} onDismiss={() => {}} />)

    expect(screen.getByText('New Time Record')).toBeInTheDocument()
    expect(screen.getByText('Fran')).toBeInTheDocument()
  })

  it('shows correct label for reps PR type', () => {
    const pr = makePR({
      prType: 'reps',
      exercise: 'Bench Press @ 185 lbs',
      improvement: '+2 reps (+25.0%)',
    })
    render(<PRNotification prs={[pr]} onDismiss={() => {}} />)
    expect(screen.getByText('New Rep Record')).toBeInTheDocument()
  })

  it('shows correct label for volume PR type', () => {
    const pr = makePR({
      prType: 'volume',
      exercise: 'Deadlift',
      improvement: '+500 lbs total (+10.0%)',
    })
    render(<PRNotification prs={[pr]} onDismiss={() => {}} />)
    expect(screen.getByText('New Volume Record')).toBeInTheDocument()
  })

  it('shows pagination dots for multiple PRs', () => {
    const prs = [
      makePR({ exercise: 'Back Squat' }),
      makePR({ exercise: 'Deadlift' }),
      makePR({ exercise: 'Bench Press' }),
    ]
    render(<PRNotification prs={prs} onDismiss={() => {}} />)

    // Should show (1/3) indicator
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('shows "--" when previousBest is 0 (first time)', () => {
    const pr = makePR({ previousBest: 0, improvement: 'First time!' })
    render(<PRNotification prs={[pr]} onDismiss={() => {}} />)
    expect(screen.getByText('--')).toBeInTheDocument()
    expect(screen.getByText('First time!')).toBeInTheDocument()
  })

  it('calls onDismiss when backdrop is clicked', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const pr = makePR()
    render(<PRNotification prs={[pr]} onDismiss={onDismiss} />)

    // Click the backdrop (outer div)
    const backdrop = screen.getByText('PERSONAL RECORD!').closest('[class*="fixed inset-0"]')
    if (backdrop) {
      fireEvent.click(backdrop)
      vi.advanceTimersByTime(300)
      expect(onDismiss).toHaveBeenCalled()
    }
    vi.useRealTimers()
  })
})
