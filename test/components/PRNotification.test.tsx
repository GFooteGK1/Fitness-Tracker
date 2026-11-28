// @vitest-environment jsdom
import React from 'react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import PRNotification from '@/app/components/PRNotification'
import type { PRResult } from '@/app/lib/pr-detection'

const improvement: PRResult = { isPR: true, exercise: 'Bench Press', prType: '1rm', previousBest: 200, newRecord: 225 }

describe('quiet record feedback', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('renders nothing for an empty result', () => {
    const { container } = render(<PRNotification prs={[]} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
  it.each([['1rm', '1RM'], ['3rm', '3RM'], ['5rm', '5RM']] as const)('identifies the %s comparison', (prType, label) => {
    render(<PRNotification prs={[{ ...improvement, prType }]} onDismiss={vi.fn()} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText('225 lbs')).toBeInTheDocument()
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
    render(<PRNotification prs={[improvement, { ...improvement, exercise: 'Power Clean' }]} onDismiss={dismiss} />)
    expect(screen.getByText('2 new personal records')).toBeInTheDocument()
    vi.advanceTimersByTime(30000)
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close records' }))
    expect(dismiss).toHaveBeenCalledOnce()
    cleanup()
    vi.useRealTimers()
  })
})
