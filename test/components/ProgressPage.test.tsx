// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/lib/auth/AuthContext', () => {
  const user = { id: 'progress-test' }
  return { useAuth: () => ({ user }) }
})
vi.mock('@/app/components/auth/ProtectedRoute', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/components/PerformanceMonitor', () => ({ default: () => null }))
vi.mock('@/app/components/whoop/WhoopMetricsCard', () => ({ WhoopMetricsCard: () => <div>Recovery context</div> }))
vi.mock('@/app/components/ExportDialog', () => ({ default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div role="dialog">Export options</div> : null }))

import Progress from '@/app/progress/page'

const stats = { totalWorkouts: 48, monthToDate: 9, strengthSessions: 30, metcons: 20, cardio: 12, currentMonth: 'September 2026' }
const response = (data: unknown, ok = true) => ({ ok, json: async () => data })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Progress page', () => {
  it('keeps training totals, overlapping categories, record values, and export available', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.startsWith('/api/dashboard-stats') ? stats : {
      records: [{ id: 'pr-1', exercise: 'Back squat', pr_type: 'weight', value: 225, previous_value: 215, achieved_at: '2026-09-04T15:00:00Z' }], summary: { thisMonth: 1 }
    })))
    render(<Progress />)
    const summary = screen.getByRole('region', { name: 'Training summary' })
    await waitFor(() => expect(within(summary).getByText('48')).toBeInTheDocument())
    expect(within(summary).getByText('9')).toBeInTheDocument()
    expect(within(summary).getByText('30')).toBeInTheDocument()
    expect(within(summary).getByText(/more than one category/)).toBeInTheDocument()
    expect(await screen.findByText('225 lbs')).toBeInTheDocument()
    expect(screen.getByText('1 improvement this month')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View records' })).toHaveAttribute('href', '/pr-history')
  })

  it('distinguishes confirmed empty training and records from loading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.startsWith('/api/dashboard-stats') ? { ...stats, totalWorkouts: 0, monthToDate: 0 } : { records: [], summary: { thisMonth: 0 } })))
    render(<Progress />)
    expect(await screen.findByRole('link', { name: 'Log a workout' })).toHaveAttribute('href', '/log')
    expect(await screen.findByText(/first results establish a baseline/)).toBeInTheDocument()
    expect(screen.queryByText(/Training mix/)).not.toBeInTheDocument()
  })

  it('keeps records failure separate from empty history and retries without hiding training', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/dashboard-stats')) return response(stats)
      attempts++
      return attempts === 1 ? response({}, false) : response({ records: [], summary: { thisMonth: 0 } })
    }))
    render(<Progress />)
    expect(await screen.findByText('Your records could not load.')).toBeInTheDocument()
    expect(screen.queryByText(/first results establish a baseline/)).not.toBeInTheDocument()
    expect(screen.getByText('48')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry records' }))
    expect(await screen.findByText(/first results establish a baseline/)).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('shows a loading message without claiming there are no records', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<Progress />)
    expect(screen.getByText('Loading your training…')).toBeInTheDocument()
    expect(screen.getByText('Loading records…')).toBeInTheDocument()
    expect(screen.queryByText(/first results establish a baseline/)).not.toBeInTheDocument()
  })
})
