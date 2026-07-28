// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import FastMealLogger from '@/app/components/FastMealLogger'

const requestId = '33333333-3333-4333-8333-333333333333'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) }
}

describe('FastMealLogger', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => requestId) })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('quick-logs a common meal with a fresh selected-date timestamp', async () => {
    let quickLogBody: Record<string, unknown> | null = null
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/meals/common')) {
        return jsonResponse({
          meals: [{
            signature: 'eggs',
            sourceMealId: '22222222-2222-4222-8222-222222222222',
            title: 'Eggs',
            items: [],
            totals: { protein: 12, carbs: 1, fat: 10, calories: 140 },
            timesLogged: 3,
            lastLoggedAt: '2026-07-28T12:00:00.000Z',
            needsReview: false,
          }],
        })
      }
      if (url === '/api/meals/quick-log') {
        quickLogBody = JSON.parse(String(init?.body))
        return jsonResponse({ mealId: 'meal-new' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    const onLogged = vi.fn()

    render(<FastMealLogger selectedDate={new Date(2026, 6, 27)} onLogged={onLogged} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log Eggs' }))

    await waitFor(() => expect(onLogged).toHaveBeenCalledWith({ mealId: 'meal-new', analysisStatus: 'complete' }))
    expect(quickLogBody).toMatchObject({
      sourceMealId: '22222222-2222-4222-8222-222222222222',
      requestId,
    })
    expect(new Date(String(quickLogBody!.timestamp)).getDate()).toBe(27)
  })

  it('reuses the request id when a quick-log response is uncertain and retried', async () => {
    const retryRequestId = '44444444-4444-4444-8444-444444444444'
    const randomUUID = vi.fn()
      .mockReturnValueOnce(requestId)
      .mockReturnValueOnce(retryRequestId)
    vi.stubGlobal('crypto', { randomUUID })
    const quickLogBodies: Array<Record<string, unknown>> = []
    let attempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/meals/common')) {
        return jsonResponse({
          meals: [{
            signature: 'eggs',
            sourceMealId: '22222222-2222-4222-8222-222222222222',
            title: 'Eggs',
            items: [],
            totals: { protein: 12, carbs: 1, fat: 10, calories: 140 },
            timesLogged: 3,
            lastLoggedAt: '2026-07-28T12:00:00.000Z',
            needsReview: false,
          }],
        })
      }
      if (url === '/api/meals/quick-log') {
        quickLogBodies.push(JSON.parse(String(init?.body)))
        attempts += 1
        if (attempts === 1) throw new Error('Response lost')
        return jsonResponse({ mealId: 'meal-new' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    const onError = vi.fn()

    render(<FastMealLogger onError={onError} />)
    const quickLogButton = await screen.findByRole('button', { name: 'Log Eggs' })
    fireEvent.click(quickLogButton)
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Response lost'))
    fireEvent.click(quickLogButton)

    await waitFor(() => expect(quickLogBodies).toHaveLength(2))
    expect(quickLogBodies.map(body => body.requestId)).toEqual([requestId, requestId])
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('supports manual label entry and sends reviewed values for deterministic logging', async () => {
    let logBody: Record<string, any> | null = null
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/meals/common')) return jsonResponse({ meals: [] })
      if (url === '/api/foods/log') {
        logBody = JSON.parse(String(init?.body))
        return jsonResponse({ mealId: 'meal-label' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    const onLogged = vi.fn()

    render(<FastMealLogger onLogged={onLogged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter label manually' }))
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Protein bar' } })
    fireEvent.change(screen.getByLabelText('protein per serving'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('carbs per serving'), { target: { value: '24' } })
    fireEvent.change(screen.getByLabelText('fat per serving'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('calories per serving'), { target: { value: '239' } })
    fireEvent.change(screen.getByLabelText('Servings eaten'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log reviewed food' }))

    await waitFor(() => expect(onLogged).toHaveBeenCalledWith({ mealId: 'meal-label', analysisStatus: 'complete' }))
    expect(logBody).toMatchObject({
      requestId,
      servings: 2,
      food: {
        name: 'Protein bar',
        source: 'manual_label',
        nutrition: { protein: 20, carbs: 24, fat: 7, calories: 239 },
      },
    })
  })

  it('keeps manual barcode entry available when native scanning is unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ meals: [] })))
    render(<FastMealLogger />)

    fireEvent.click(screen.getByRole('button', { name: 'Scan UPC' }))

    expect(await screen.findByText('Camera barcode scanning is not supported here. Enter the code manually.')).toBeInTheDocument()
    expect(screen.getByLabelText('UPC or EAN barcode')).toBeInTheDocument()
  })
})
