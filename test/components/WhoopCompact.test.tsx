// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WhoopMetricsCard } from '@/app/components/whoop/WhoopMetricsCard'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('compact WHOOP context', () => {
  it('keeps disconnected and unhealthy states compact with recovery actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ connectionStatus: 'disconnected' }) })))
    const view = render(<WhoopMetricsCard compact />)
    expect(await screen.findByRole('button', { name: 'Connect WHOOP' })).toBeInTheDocument()
    expect(screen.queryByText('Connect Your WHOOP')).not.toBeInTheDocument()
    view.unmount()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ connectionStatus: 'unhealthy' }) })))
    render(<WhoopMetricsCard compact />)
    expect(await screen.findByRole('button', { name: 'Reconnect WHOOP' })).toBeInTheDocument()
  })
  it('retries a failed read and preserves numeric details, including zero', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ connectionStatus: 'connected', lastSyncAt: null, recovery: { recovery_score: 70, hrv_rmssd_milli: 56.3 }, sleep: { sleep_performance_percentage: 0, sleep_efficiency_percentage: 0 }, cycle: { strain: 0 } }) }))
    render(<WhoopMetricsCard compact />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry WHOOP' }))
    expect(await screen.findByText('70%')).toBeInTheDocument()
    expect(screen.getByText('0.0')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Recovery details'))
    await waitFor(() => expect(screen.getByText('56 ms')).toBeVisible())
    expect(screen.getAllByText('0%')).toHaveLength(2)
  })
})
