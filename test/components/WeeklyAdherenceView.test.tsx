// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { calculateCumulativeAdherence, calculateWeeklyAdherence } from '@/app/lib/adherence-calculator'
import { PostgrestClient } from '@supabase/postgrest-js'
import { NextRequest } from 'next/server'

const user = { id: 'synthetic-owner' }
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/adherence/weekly/route'
import WeeklyAdherenceView from '@/app/components/WeeklyAdherenceView'

const message = 'Unable to load weekly nutrition data. Please try again.'
const weekStart = new Date(2026, 10, 2)
const targets = { userId: user.id, targetProtein: 100, targetCarbs: 100, targetFat: 40,
  targetCalories: 1160, tolerancePct: 5, updatedAt: new Date('2026-11-02T12:00:00Z') }
const summaries = [{ userId: user.id, date: new Date(2026, 10, 2), totalProtein: 100, totalCarbs: 100,
  totalFat: 40, totalCalories: 1160, mealCount: 1 }]
const healthy = { weeklyAdherence: calculateWeeklyAdherence(summaries, targets, weekStart),
  correctionGuidance: { weeklyScore: 100, needsImprovement: false, overallGuidance: 'Synthetic fixture' },
  targets, daysWithData: 1, weekStart: '2026-11-02', weekEnd: '2026-11-08', daysElapsed: 1,
  cumulativeData: calculateCumulativeAdherence(summaries, targets, 1) }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('shows the weekly error without intake claims and retries the same window successfully', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: message }, { status: 500 }))
    .mockResolvedValueOnce(Response.json(healthy))
  vi.stubGlobal('fetch', fetcher)
  render(<WeeklyAdherenceView weekStart={weekStart} />)
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Weekly Adherence' })).not.toBeInTheDocument()
  expect(screen.queryAllByText('Protein')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  expect(await screen.findByRole('heading', { name: 'Weekly Adherence' })).toBeInTheDocument()
  expect(screen.queryByText(message)).not.toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0])
})

it('hides previously loaded intake when the next weekly read fails', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(healthy))
    .mockResolvedValueOnce(Response.json({ error: message }, { status: 500 }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<WeeklyAdherenceView weekStart={weekStart} />)
  expect(await screen.findByRole('heading', { name: 'Weekly Adherence' })).toBeInTheDocument()
  view.rerender(<WeeklyAdherenceView weekStart={new Date(2026, 10, 9)} />)
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Weekly Adherence' })).not.toBeInTheDocument()
  expect(screen.queryAllByText('Protein')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
})

it('uses the actual weekly route to show target-read retry guidance and recover the same target window', async () => {
  let unavailable = true
  const sdk = new PostgrestClient('https://synthetic.invalid/rest/v1', { fetch: async (input) => {
    const url = new URL(String(input))
    expect(url.searchParams.get('user_id')).toBe('eq.' + user.id)
    if (url.pathname.endsWith('/daily_targets')) {
      if (unavailable) return Response.json({ code: 'PGRST000', message: 'Synthetic private provider detail' }, { status: 503 })
      return Response.json([{ user_id: user.id, target_protein: 150.25, target_carbs: 200.5,
        target_fat: 60.75, target_calories: 1949.8, tolerance_pct: 0, updated_at: '2026-11-02T12:00:00Z' }])
    }
    expect(url.pathname.endsWith('/meals')).toBe(true)
    return Response.json([])
  } })
  vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: sdk.from.bind(sdk) } as any)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const fetcher = vi.fn(async (url: string) => GET(new NextRequest('http://localhost' + url)))
  vi.stubGlobal('fetch', fetcher)
  render(<WeeklyAdherenceView weekStart={weekStart} />)
  expect(await screen.findByText('Unable to load your daily targets. Please try again.')).toBeInTheDocument()
  expect(screen.queryByText(/Please set your daily targets first/)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Weekly Adherence' })).not.toBeInTheDocument()
  unavailable = false
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  expect(await screen.findByRole('heading', { name: 'Weekly Adherence' })).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0])
})
