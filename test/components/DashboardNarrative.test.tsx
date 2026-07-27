// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import DashboardNarrative from '@/app/components/DashboardNarrative'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DashboardNarrative', () => {
  it('shows a non-blocking loading state while the composition is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<DashboardNarrative />)

    expect(screen.getByRole('status')).toHaveTextContent("Preparing today's read")
  })

  it('renders a cached composition and its section labels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'ready',
        cached: true,
        generatedAt: '2026-07-27T12:00:00.000Z',
        composition: {
          headline: 'A steady day',
          summary: 'Recovery is 71% and protein is 120g.',
          highlights: [
            { section: 'recovery', text: 'Recovery is 71%.' },
            { section: 'nutrition', text: 'Protein is 120g.' },
          ],
        },
      }),
    }))

    await act(async () => render(<DashboardNarrative />))

    await waitFor(() => expect(screen.getByText('A steady day')).toBeInTheDocument())
    expect(screen.getByText('Recovery')).toBeInTheDocument()
    expect(screen.getByText('Nutrition')).toBeInTheDocument()
    expect(screen.getByText('Updated today')).toBeInTheDocument()
  })

  it('fails quietly when AI is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Unavailable' }),
    }))

    await act(async () => render(<DashboardNarrative />))

    await waitFor(() => {
      expect(screen.getByText('Your dashboard numbers are still current.')).toBeInTheDocument()
    })
  })
})
