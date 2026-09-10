// @vitest-environment jsdom
import React from 'react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import PRNotification from '@/app/components/PRNotification'
import { detectPRsFromBlocks, type PRResult } from '@/app/lib/pr-detection'

const improvement: PRResult = { isPR: true, exercise: 'Back squat', prType: 'weight', previousBest: 200, newRecord: 225, improvement: '+25 lbs' }

describe('quiet record feedback', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('renders nothing for an empty result', () => {
    const { container } = render(<PRNotification prs={[]} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
  it.each([['weight', 'Max weight'], ['reps', 'Repetitions'], ['time', 'Time'], ['volume', 'Session volume']] as const)('identifies the %s comparison', (prType, label) => {
    render(<PRNotification prs={[{ ...improvement, prType }]} onDismiss={vi.fn()} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Back squat')).toBeInTheDocument()
    expect(screen.getByText('+25 lbs')).toBeInTheDocument()
  })
  it('can be dismissed with Escape or a downward swipe', () => {
    const dismiss = vi.fn()
    render(<PRNotification prs={[improvement]} onDismiss={dismiss} />)
    const region = screen.getByRole('region', { name: 'Workout records' })
    fireEvent.keyDown(region, { key: 'Escape' })
    fireEvent.touchStart(region, { touches: [{ clientY: 100 }] })
    fireEvent.touchEnd(region, { changedTouches: [{ clientY: 190 }] })
    expect(dismiss).toHaveBeenCalledTimes(2)
  })
  it('does not celebrate a baseline', () => {
    render(<PRNotification prs={[{ ...improvement, isPR: false, previousBest: 0 }]} onDismiss={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'Workout records' })).toBeNull()
    cleanup()
  })
  it('groups records without a timer and dismisses explicitly', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<PRNotification prs={[improvement, { ...improvement, exercise: 'Deadlift' }]} onDismiss={dismiss} />)
    expect(screen.getByText('2 new personal records')).toBeInTheDocument()
    vi.advanceTimersByTime(30000)
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close records' }))
    expect(dismiss).toHaveBeenCalledOnce()
    cleanup()
    vi.useRealTimers()
  })
  it('does not interpret a cardio duration as a faster-is-better benchmark', () => {
    expect(detectPRsFromBlocks([{ block_type: 'CARDIO', title: 'Cool Down Walk', block_score: { time_s: 480 } }], [{ exercise: 'Cool Down Walk', pr_type: 'time', value: 600 }])).toEqual([])
  })
})
