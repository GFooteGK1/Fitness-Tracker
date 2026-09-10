// @vitest-environment jsdom
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUser = { id: 'user-123' }

vi.mock('@/app/lib/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('@/app/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

import DailyProgressView from '@/app/components/DailyProgressView'

const emptyDailyResponse = {
  meals: [],
  dailyTotals: {
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
  },
  adherence: {
    proteinAdherence: 0,
    carbsAdherence: 0,
    fatAdherence: 0,
    caloriesAdherence: 0,
    overallScore: 0,
    withinTolerance: false,
  },
}

function abortingPendingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('Aborted')
      error.name = 'AbortError'
      reject(error)
    })
  })
}

describe('DailyProgressView', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows retry UI when the daily nutrition request times out', async () => {
    vi.stubGlobal('fetch', vi.fn(abortingPendingFetch))

    render(<DailyProgressView date={new Date('2026-06-15T12:00:00')} />)

    await waitFor(() => {
      expect(screen.getByText('Nutrition data request timed out. Please try again.')).toBeInTheDocument()
    }, { timeout: 1000 })

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('does not keep loading when nutrition targets time out after daily data loads', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.startsWith('/api/meals/daily')) {
        return Promise.resolve(new Response(JSON.stringify(emptyDailyResponse), { status: 200 }))
      }

      if (url === '/api/targets') {
        return abortingPendingFetch(input, init)
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<DailyProgressView date={new Date('2026-06-15T12:00:00')} />)

    await waitFor(() => {
      expect(screen.getByText('0 meals logged')).toBeInTheDocument()
    }, { timeout: 1000 })

    expect(screen.getByText('No Daily Targets Set')).toBeInTheDocument()
    expect(screen.queryByText('Nutrition targets request timed out. Progress targets may be temporarily unavailable.')).not.toBeInTheDocument()
  })
})


it('keeps an empty log neutral even when daily targets are configured', async () => {
  vi.stubGlobal('fetch', vi.fn((input) => Promise.resolve(new Response(JSON.stringify(
    String(input).startsWith('/api/meals/daily') ? emptyDailyResponse : {
      targetProtein: 150, targetCarbs: 200, targetFat: 70, targetCalories: 2030
    }
  ), { status: 200 }))))
  render(<DailyProgressView date={new Date()} />)
  expect(await screen.findByText(/No meals logged yet/)).toBeInTheDocument()
  expect(screen.queryByText(/Outside target range/)).not.toBeInTheDocument()
  expect(screen.queryByText(/0% adherence/)).not.toBeInTheDocument()
  expect(screen.queryByText('Target comparison')).not.toBeInTheDocument()
  vi.unstubAllGlobals()
})
