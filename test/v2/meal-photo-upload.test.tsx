/**
 * Regression coverage for meal photo uploads from the V2 chat surface.
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const { mockPush, mockSignOut } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('@/app/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-123', email: 'test@example.com' },
    loading: false,
    signOut: mockSignOut,
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/app/lib/auth/supabase-client', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  })),
}))

import V2Page from '@/app/v2/page'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  }
}

describe('V2 meal photo upload', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a timestamp with meal photo uploads', async () => {
    let uploadBody: FormData | null = null
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/meals/upload') {
        uploadBody = init?.body as FormData
        return jsonResponse({
          mealId: 'meal-1',
          analysisStatus: 'complete',
          analysis: {
            items: [{ food: 'Chicken', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 }],
            total_protein: 42,
            total_carbs: 0,
            total_fat: 3,
            total_calories: 195,
            confidence: 0.9,
            notes: 'Meal logged',
          },
        })
      }

      if (url.startsWith('/api/meals/daily')) {
        return jsonResponse({ dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 } })
      }

      if (url.startsWith('/api/targets')) {
        return jsonResponse({ targetProtein: 180, targetCarbs: 250, targetFat: 70, targetCalories: 2350 })
      }

      if (url.startsWith('/api/workouts')) {
        return jsonResponse({ found: false })
      }

      return jsonResponse({})
    })
    vi.stubGlobal('fetch', mockFetch)

    const { container } = render(<V2Page />)

    fireEvent.click(screen.getByTitle('Photo input'))
    const selectPhotoButtons = await screen.findAllByText('Select Photo')
    fireEvent.click(selectPhotoButtons[0])

    const galleryInput = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
    expect(galleryInput).not.toBeNull()
    const file = new File([new Uint8Array(2048)], 'meal.jpg', { type: 'image/jpeg' })

    fireEvent.change(galleryInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockFetch.mock.calls.some(call => String(call[0]) === '/api/meals/upload')).toBe(true)
    })
    expect(uploadBody).not.toBeNull()

    expect(uploadBody!.get('photo')).toBe(file)
    const timestamp = uploadBody!.get('timestamp')
    expect(timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/))
    expect(Number.isNaN(new Date(String(timestamp)).getTime())).toBe(false)
  })
})
