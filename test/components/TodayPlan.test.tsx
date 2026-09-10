// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodayPlan } from '@/app/components/TodayPlan'

const auth = vi.hoisted(() => ({ user: { id: 'athlete' } }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/app/lib/timezone-utils', () => ({ getLocalDate: () => '2026-09-10' }))
const response = (activeProgram: unknown) => ({ ok: true, json: async () => ({ context: { storageAvailable: true, activeProgram } }) })
afterEach(() => vi.unstubAllGlobals())

describe('TodayPlan', () => {
  it('uses the accepted session on the local date and opens its existing execution route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ title: 'Strength', upcomingSessions: [
      { scheduledDate: '2026-09-11', status: 'planned', prescription: { title: 'Tomorrow' } },
      { scheduledDate: '2026-09-10', status: 'planned', prescription: { title: 'Lower-body strength', scheduledMinutes: 45 } },
    ] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TodayPlan />)
    expect(await screen.findByText('Lower-body strength')).toBeInTheDocument()
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open workout' })).toHaveAttribute('href', '/program')
    expect(fetchMock).toHaveBeenCalledWith('/api/coach', { signal: expect.any(AbortSignal) })
  })
  it('does not infer recovery or completed training from an empty day', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ upcomingSessions: [] })))
    render(<TodayPlan />)
    expect(await screen.findByText('No session scheduled today')).toBeInTheDocument()
    expect(screen.queryByText(/recovery day|completed/i)).not.toBeInTheDocument()
  })
  it('shows a terminal session without offering to complete it again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ title: 'Strength', upcomingSessions: [
      { scheduledDate: '2026-09-10', status: 'completed', prescription: { session_title: 'Stored legacy title' } },
    ] })))
    render(<TodayPlan />)
    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Stored legacy title')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open workout' })).not.toBeInTheDocument()
  })
  it('distinguishes failed reads from no plan and retries', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(response(null))
    vi.stubGlobal('fetch', fetchMock)
    render(<TodayPlan />)
    expect(await screen.findByText('Your plan is unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Build your training plan')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Build your training plan')).toBeInTheDocument())
  })
})
