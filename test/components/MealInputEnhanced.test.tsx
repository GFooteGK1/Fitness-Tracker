// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/app/components/FastMealLogger', () => ({ default: () => null }))
vi.mock('@/app/components/MealCameraCapture', () => ({ default: () => null }))

import MealInputEnhanced from '@/app/components/MealInputEnhanced'

class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
}

describe('MealInputEnhanced', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('submits Food-page text and reports non-JSON API failures', async () => {
    const onError = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('upstream unavailable', { status: 502 })
    ))
    render(<MealInputEnhanced onError={onError} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show text input' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'granola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit meal' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Meal analysis failed (502). Try again.'))
  })

  it('surfaces browser speech-service errors instead of failing silently', async () => {
    let recognition: MockSpeechRecognition | undefined
    class CapturingSpeechRecognition extends MockSpeechRecognition {
      constructor() {
        super()
        recognition = this
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: CapturingSpeechRecognition,
    })
    const onError = vi.fn()
    render(<MealInputEnhanced onError={onError} />)

    const voiceButton = await screen.findByRole('button', { name: 'Voice input' })
    fireEvent.click(voiceButton)
    await act(async () => {
      recognition?.onerror?.({ error: 'network' })
    })

    await waitFor(() => expect(onError).toHaveBeenCalledWith(
      'Voice recognition could not reach its speech service. Try Safari or use text entry.'
    ))
  })
})
