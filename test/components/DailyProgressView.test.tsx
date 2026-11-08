// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ user: { id: 'user-123' } as { id: string } | null }))
const corrections = vi.hoisted(() => ({ send: vi.fn(), owner: vi.fn() }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/app/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/app/lib/client/logging-request', () => ({ sendCaptureCorrection: corrections.send, assertCaptureOwner: corrections.owner }))
import DailyProgressView from '@/app/components/DailyProgressView'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

const date = new Date(2026, 5, 15, 12), nextDate = new Date(2026, 5, 16, 12)
const meal = { id: 'meal-current', userId: 'user-123', captureRevision: 7, mealTimestamp: '2026-06-15T12:00:00Z',
  items: [{ food: 'Synthetic eggs', portion: '2 eggs', protein: 12.25, carbs: 0, fat: 3.75, calories: 82.75 }],
  totalProtein: 12.25, totalCarbs: 0, totalFat: 3.75, totalCalories: 82.75, needsReview: false, manualOverride: true }
const daily = { adherenceAvailability: 'available' as const, meals: [meal], dailyTotals: { protein: 12.25, carbs: 0, fat: 3.75, calories: 82.75 },
  adherence: { proteinAdherence: 8, carbsAdherence: 0, fatAdherence: 6, caloriesAdherence: 4, overallScore: 4.5, withinTolerance: false } }
const target = { userId: 'user-123', targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1949.8, tolerancePct: 0 }
const empty = { ...target, targetProtein: 0, targetCarbs: 0, targetFat: 0, targetCalories: 0 }
const response = (body: unknown, status = 200) => Response.json(body, { status })
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function pendingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
}
const summary = () => within(screen.getByRole('region', { name: 'Daily nutrition summary' }))
const message = 'Daily targets are temporarily unavailable. Please try again.'
function assertTotals() { for (const text of ['12.3g', '0g', '3.8g', '82.8']) expect(summary().getByText(text)).toBeInTheDocument() }
function assertNoComparison() {
  expect(screen.queryByText('No Daily Targets Set')).not.toBeInTheDocument()
  expect(screen.queryByText('Target comparison')).not.toBeInTheDocument()
  expect(summary().queryByText(/ target$/)).not.toBeInTheDocument()
}
function mockReads(targetRead: (init?: RequestInit) => Promise<Response>, mealRead: () => Promise<Response> = async () => response(daily)) {
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('/api/meals/daily')) return mealRead()
    if (String(input) === '/api/targets') return targetRead(init)
    throw new Error('Unexpected request ' + String(input))
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
beforeEach(() => {
  auth.user = { id: 'user-123' }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  corrections.send.mockReset()
  corrections.owner.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Daily Progress target availability', () => {
  it.each(['http', 'network', 'json'] as const)('preserves facts and distinguishes %s target failure from absence', async kind => {
    mockReads(async () => {
      if (kind === 'network') throw new Error('Offline')
      return kind === 'json' ? new Response('invalid json') : response({ error: 'private provider error' }, 500)
    })
    render(<DailyProgressView date={date} />)
    await screen.findByText(message)
    assertTotals(); assertNoComparison()
    expect(screen.getByRole('button', { name: 'Retry comparison' })).toBeEnabled()
    expect(screen.queryByText(/private provider error/)).not.toBeInTheDocument()
  })
  it('keeps daily facts visible while targets are pending and after timeout', async () => {
    mockReads(init => pendingFetch('/api/targets', init))
    render(<DailyProgressView date={date} />)
    await screen.findByText('1 meal logged')
    assertTotals(); assertNoComparison()
    await screen.findByText(message)
    assertTotals()
  })
  it.each([0, 12.5, 100])('preserves fractional configured targets with tolerance %s', async tolerancePct => {
    mockReads(async () => response({ ...target, tolerancePct }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('of 150.3g target')
    assertTotals()
    for (const text of ['of 200.5g target', 'of 60.8g target', 'of 1949.8 target']) expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.queryByText('No Daily Targets Set')).not.toBeInTheDocument()
    expect(screen.getByText('Target comparison')).toBeInTheDocument()
    expect(screen.getByText(/5% adherence for logged meals only/)).toBeInTheDocument()
  })
  it('keeps a genuinely empty log neutral with configured targets', async () => {
    mockReads(async () => response(target), async () => response({ ...daily, meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 } }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('of 150.3g target')
    expect(screen.getByText(/No meals logged yet/)).toBeInTheDocument()
    expect(screen.queryByText('Target comparison')).not.toBeInTheDocument()
    expect(screen.queryByText(/0% adherence/)).not.toBeInTheDocument()
  })
  it('offers setup only after successful empty targets', async () => {
    mockReads(async () => response(empty), async () => response({ ...daily, adherenceAvailability: 'not_configured', adherence: null }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('No Daily Targets Set')
    expect(screen.getByRole('link', { name: 'Set Targets' })).toHaveAttribute('href', '/food-progress?view=targets')
    assertTotals()
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument()
  })
  it('retries reads only, preserves totals through repeated failure and recovers', async () => {
    const pending = deferred<Response>(); let reads = 0
    const fetcher = mockReads(async () => ++reads === 1 ? response({}, 500) : reads === 2 ? pending.promise : response(target))
    render(<DailyProgressView date={date} />)
    await screen.findByText(message)
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await waitFor(() => expect(reads).toBe(2))
    const retry = screen.getByRole('button', { name: /Retry (Targets|comparison)/ })
    expect(retry).toBeDisabled(); fireEvent.click(retry); expect(reads).toBe(2)
    assertTotals(); assertNoComparison()
    await act(async () => pending.resolve(response({}, 500)))
    expect(screen.getByText(message)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await screen.findByText('of 150.3g target')
    assertTotals()
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/meals/daily'))).toHaveLength(3)
  })
  it('recovers from failure to confirmed empty targets', async () => {
    let reads = 0, days = 0
    mockReads(async () => response(++reads === 1 ? {} : empty, reads === 1 ? 500 : 200), async () => response(++days === 1 ? daily : { ...daily, adherenceAvailability: 'not_configured', adherence: null }))
    render(<DailyProgressView date={date} />)
    await screen.findByText(message)
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await screen.findByText('No Daily Targets Set')
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument()
  })
  it.each(['success', 'error'] as const)('ignores old target %s after date navigation even without transport cancellation', async result => {
    const old = deferred<Response>(); let reads = 0
    mockReads(async () => ++reads === 1 ? old.promise : response({ ...target, targetProtein: 170.25 }))
    const view = render(<DailyProgressView date={date} />)
    await waitFor(() => expect(reads).toBe(1))
    view.rerender(<DailyProgressView date={nextDate} />)
    await screen.findByText('of 170.3g target')
    await act(async () => { if (result === 'success') old.resolve(response(empty)); else old.reject(new Error('late error')) })
    expect(screen.getByText('of 170.3g target')).toBeInTheDocument()
    expect(screen.queryByText('No Daily Targets Set')).not.toBeInTheDocument()
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument()
  })
  it('suppresses former targets when a refreshed date cannot load targets', async () => {
    let reads = 0
    mockReads(async () => response(++reads === 1 ? target : {}, reads === 1 ? 200 : 500))
    const view = render(<DailyProgressView date={date} />)
    await screen.findByText('of 150.3g target')
    view.rerender(<DailyProgressView date={nextDate} />)
    expect(screen.queryByText('of 150.3g target')).not.toBeInTheDocument()
    await screen.findByText(message)
    assertTotals(); assertNoComparison()
  })
  it.each(['success', 'error'] as const)('ignores old daily %s and finally while the new date is pending', async result => {
    const old = deferred<Response>(), current = deferred<Response>(); let reads = 0
    mockReads(async () => response(target), async () => ++reads === 1 ? old.promise : current.promise)
    const view = render(<DailyProgressView date={date} />)
    await waitFor(() => expect(reads).toBe(1))
    view.rerender(<DailyProgressView date={nextDate} />)
    await waitFor(() => expect(reads).toBe(2))
    await act(async () => { if (result === 'success') old.resolve(response(daily)); else old.reject(new Error('old daily error')) })
    expect(screen.queryByText('1 meal logged')).not.toBeInTheDocument()
    expect(screen.queryByText('old daily error')).not.toBeInTheDocument()
    await act(async () => current.resolve(response({ ...daily, dailyTotals: { ...daily.dailyTotals, protein: 99.5 } })))
    await screen.findByText('99.5g')
    expect(summary().queryByText('12.3g')).not.toBeInTheDocument()
  })
  it('hides previous owner data while the next owner loads and after signout', async () => {
    const current = deferred<Response>(); let reads = 0
    mockReads(async () => response(target), async () => ++reads === 1 ? response(daily) : current.promise)
    const view = render(<DailyProgressView date={date} />)
    await screen.findByText('of 150.3g target')
    auth.user = { id: 'owner-next' }; view.rerender(<DailyProgressView date={date} />)
    expect(screen.queryByText('of 150.3g target')).not.toBeInTheDocument()
    auth.user = null; view.rerender(<DailyProgressView date={date} />)
    await act(async () => current.resolve(response(daily)))
    expect(screen.queryByText('12.3g')).not.toBeInTheDocument()
    expect(screen.queryByText('No Daily Targets Set')).not.toBeInTheDocument()
  })
  it('aborts pending retry on unmount and ignores its late completion', async () => {
    const pending = deferred<Response>(); let reads = 0
    const fetcher = mockReads(async () => ++reads === 1 ? response({}, 500) : pending.promise)
    const view = render(<DailyProgressView date={date} />)
    await screen.findByText(message); fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await waitFor(() => expect(reads).toBe(2))
    const signal = fetcher.mock.calls.filter(([url]) => url === '/api/targets')[1][1]?.signal
    view.unmount(); expect(signal?.aborted).toBe(true)
    await act(async () => pending.resolve(response(target)))
    expect(screen.queryByText('of 150.3g target')).not.toBeInTheDocument()
  })
  it('survives StrictMode and preserves date query and Add Meal callback', async () => {
    const add = vi.fn(), fetcher = mockReads(async () => response(target))
    render(<React.StrictMode><DailyProgressView date={date} onAddMeal={add} /></React.StrictMode>)
    await screen.findByText('of 150.3g target')
    fireEvent.click(screen.getByRole('button', { name: 'Add Meal' })); expect(add).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('/api/meals/daily?date=' + getLocalDate(date) + '&tzOffset=' + getTimezoneOffset() + '&availability=explicit', expect.objectContaining({ signal: expect.any(AbortSignal), cache: 'no-store' }))
  })
  it('keeps meal failure/retry separate and does not request targets until meals recover', async () => {
    let reads = 0
    const fetcher = mockReads(async () => response(target), async () => ++reads === 1 ? response({ error: 'Meals unavailable' }, 500) : response(daily))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Meals unavailable')
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/targets')).toHaveLength(0)
    expect(screen.queryByText('No Daily Targets Set')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' })); await screen.findByText('of 150.3g target'); assertTotals()
  })
  it('preserves the bounded daily nutrition timeout and retry', async () => {
    vi.stubGlobal('fetch', vi.fn(pendingFetch))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Nutrition data request timed out. Please try again.')
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled()
  })
  it('closes a confirmed correction before a slow independent target refresh', async () => {
    const pending = deferred<Response>(); let reads = 0
    const fetcher = mockReads(async () => ++reads === 1 ? response(target) : pending.promise)
    const read = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => String(url) === '/api/meals/meal-current' ? Promise.resolve(response({ meal })) : read(url, init))
    corrections.send.mockResolvedValue(response({ meal: { ...meal, captureRevision: 8 } }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('of 150.3g target')
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    await screen.findByRole('heading', { name: 'Edit Meal' })
    fireEvent.change(await screen.findByPlaceholderText('e.g., 6 oz, 1 cup, 150g'), { target: { value: '3 eggs' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Changes' })))
    expect(reads).toBe(2)
    expect(screen.getByText('1 meal logged')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit Meal' })).not.toBeInTheDocument()
    expect(corrections.send).toHaveBeenCalledOnce()
    expect(corrections.send).toHaveBeenCalledWith('/api/meals/meal-current', 'PUT', expect.objectContaining({ expectedRevision: 7, expectedUserId: 'user-123', manualOverride: true }), 'user-123')
    await act(async () => pending.resolve(response(target)))
  })

  it.each([0, 87])('keeps old-server facts but never displays its unverified score %s', async overallScore => {
    const { adherenceAvailability, ...legacy } = daily
    mockReads(async () => response(target), async () => response({ ...legacy, adherence: { ...daily.adherence, overallScore } }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Target comparison could not be verified. Please try again.')
    assertTotals(); assertNoComparison()
    expect(screen.getByRole('button', { name: 'Retry comparison' })).toBeEnabled()
  })

  it.each([
    ['available', null], ['unavailable', daily.adherence], ['not_configured', daily.adherence],
    ['unexpected', null], ['available', { overallScore: 75 }],
    ['available', { ...daily.adherence, overallScore: -1 }],
    ['available', { ...daily.adherence, withinTolerance: 'false' }],
  ])('fails closed for an inconsistent %s discrimination', async (adherenceAvailability, adherence) => {
    mockReads(async () => response(target), async () => response({ ...daily, adherenceAvailability, adherence }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Target comparison could not be verified. Please try again.')
    assertTotals(); assertNoComparison()
  })

  it('does not let independent target success reveal an unavailable comparison', async () => {
    let targets = 0
    mockReads(async () => { targets++; return response(target) }, async () => response({ ...daily, adherenceAvailability: 'unavailable', adherence: null }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Target comparison is temporarily unavailable. Please try again.')
    await waitFor(() => expect(targets).toBe(1))
    assertTotals(); assertNoComparison()
  })

  const revised = {
    ...daily, dailyTotals: { protein: 75.125, carbs: 100.25, fat: 30.375, calories: 974.9 },
    meals: [{ ...meal, captureRevision: 8, totalProtein: 75.125, totalCarbs: 100.25, totalFat: 30.375, totalCalories: 974.9,
      items: [{ ...meal.items[0], portion: '3 eggs', protein: 75.125, carbs: 100.25, fat: 30.375, calories: 974.9 }] }],
    adherence: { proteinAdherence: 50, carbsAdherence: 50, fatAdherence: 50, caloriesAdherence: 50, overallScore: 50, withinTolerance: false },
  }

  it('keeps facts through read-only comparison retry failure, then applies fresh totals and score together', async () => {
    const pending = deferred<Response>(); let days = 0
    const fetcher = mockReads(async () => response(target), async () => ++days === 1
      ? response({ ...daily, adherenceAvailability: 'unavailable', adherence: null })
      : days === 2 ? pending.promise : response(revised))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Target comparison is temporarily unavailable. Please try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    expect(screen.getByRole('button', { name: 'Retry comparison' })).toBeDisabled()
    assertTotals(); assertNoComparison()
    await act(async () => pending.resolve(response({ error: 'Meal read unavailable' }, 500)))
    await screen.findByText('Target comparison is temporarily unavailable. Please try again.')
    assertTotals(); assertNoComparison()
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await screen.findByText(/50% adherence for logged meals only/)
    expect(summary().getByText('75.1g')).toBeInTheDocument()
    expect(summary().queryByText('12.3g')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
    for (const [url, init] of fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/meals/daily'))) {
      expect(new URL(String(url), 'http://local.invalid').searchParams.getAll('availability')).toEqual(['explicit'])
      expect(init?.cache).toBe('no-store')
    }
  })

  it.each(['success', 'error'])('a same-date correction supersedes an old comparison retry %s', async outcome => {
    const pending = deferred<Response>(); let days = 0
    const fetcher = mockReads(async () => response(target), async () => ++days === 1
      ? response({ ...daily, adherenceAvailability: 'unavailable', adherence: null })
      : days === 2 ? pending.promise : response(revised))
    const read = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => String(url) === '/api/meals/meal-current' ? Promise.resolve(response({ meal })) : read(url, init))
    corrections.send.mockResolvedValue(response({ meal: revised.meals[0] }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Target comparison is temporarily unavailable. Please try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await waitFor(() => expect(days).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    fireEvent.change(await screen.findByPlaceholderText('e.g., 6 oz, 1 cup, 150g'), { target: { value: '3 eggs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await screen.findByText(/50% adherence for logged meals only/)
    await act(async () => { if (outcome === 'success') pending.resolve(response(daily)); else pending.reject(new Error('Old comparison error')) })
    expect(summary().getByText('75.1g')).toBeInTheDocument()
    expect(screen.getByText(/50% adherence for logged meals only/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit Meal' })).not.toBeInTheDocument()
    expect(corrections.send).toHaveBeenCalledOnce()
  })

  it('does not manufacture facts from a malformed successful daily response', async () => {
    const fetcher = mockReads(async () => response(target), async () => response({ ...daily, dailyTotals: { protein: 12 } }))
    render(<DailyProgressView date={date} />)
    await screen.findByText('Unable to read daily meal facts. Please try again.')
    expect(screen.queryByText('1 meal logged')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/targets')).toHaveLength(0)
  })
})
