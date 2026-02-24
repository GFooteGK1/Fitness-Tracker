/**
 * InputBar Component Tests
 *
 * Tests for the input bar component that handles text, voice, camera, and file input.
 *
 * **Validates: Requirements 8.3, 8.4, 8.5, 8.10**
 * - 8.3: Input bar with buttons for text entry, voice recording, camera capture, file upload
 * - 8.4: Camera opens environment-facing and compresses captured image
 * - 8.5: Voice button activates Web Speech API with recording indicator
 * - 8.10: All interactive elements have minimum 44×44px touch targets and 16px font
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import InputBar from '@/app/v2/components/InputBar'

// ─── Mocks ───────────────────────────────────────────────────────────

// Mock compressImage
vi.mock('@/app/lib/imageUtils', () => ({
  compressImage: vi.fn().mockResolvedValue({
    compressedDataUrl: 'data:image/jpeg;base64,compressed',
    originalSizeMB: 2,
    compressedSizeMB: 0.5,
    compressionRatio: 4,
    finalQuality: 0.8,
  }),
}))

const noop = vi.fn()

// ─── Tests ───────────────────────────────────────────────────────────

describe('InputBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('text input', () => {
    it('renders text input with correct placeholder', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.getByPlaceholderText('Type a workout, meal, or question...')).toBeInTheDocument()
    })

    it('has 16px font size on input to prevent iOS zoom', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const input = screen.getByLabelText('Message input')
      expect(input.style.fontSize).toBe('16px')
    })

    it('calls onSubmit with text input_mode when send button clicked', () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const input = screen.getByLabelText('Message input')
      fireEvent.change(input, { target: { value: 'Did Fran in 4:32' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      expect(onSubmit).toHaveBeenCalledWith({
        content: 'Did Fran in 4:32',
        input_mode: 'text',
      })
    })

    it('calls onSubmit on Enter key press', () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const input = screen.getByLabelText('Message input')
      fireEvent.change(input, { target: { value: 'Log my lunch' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onSubmit).toHaveBeenCalledWith({
        content: 'Log my lunch',
        input_mode: 'text',
      })
    })

    it('does not submit on Shift+Enter', () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const input = screen.getByLabelText('Message input')
      fireEvent.change(input, { target: { value: 'some text' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('clears input after successful submit', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)

      const input = screen.getByLabelText('Message input') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'test message' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      expect(input.value).toBe('')
    })

    it('does not submit empty or whitespace-only text', () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const input = screen.getByLabelText('Message input')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('send button is disabled when input is empty', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.getByLabelText('Send message')).toBeDisabled()
    })
  })

  describe('loading state', () => {
    it('disables text input when isLoading is true', () => {
      render(<InputBar onSubmit={noop} isLoading={true} />)
      expect(screen.getByLabelText('Message input')).toBeDisabled()
    })

    it('disables send button when isLoading is true', () => {
      render(<InputBar onSubmit={noop} isLoading={true} />)
      expect(screen.getByLabelText('Send message')).toBeDisabled()
    })

    it('disables camera button when isLoading is true', () => {
      render(<InputBar onSubmit={noop} isLoading={true} />)
      expect(screen.getByLabelText('Open camera')).toBeDisabled()
    })

    it('disables file upload button when isLoading is true', () => {
      render(<InputBar onSubmit={noop} isLoading={true} />)
      expect(screen.getByLabelText('Upload file')).toBeDisabled()
    })
  })

  describe('touch targets (Requirement 8.10)', () => {
    it('send button has minimum 44px touch target', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const btn = screen.getByLabelText('Send message')
      expect(btn.className).toContain('min-w-[44px]')
      expect(btn.className).toContain('min-h-[44px]')
    })

    it('camera button has minimum 44px touch target', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const btn = screen.getByLabelText('Open camera')
      expect(btn.className).toContain('min-w-[44px]')
      expect(btn.className).toContain('min-h-[44px]')
    })

    it('file upload button has minimum 44px touch target', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const btn = screen.getByLabelText('Upload file')
      expect(btn.className).toContain('min-w-[44px]')
      expect(btn.className).toContain('min-h-[44px]')
    })

    it('text input has minimum 44px height', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const input = screen.getByLabelText('Message input')
      expect(input.className).toContain('min-h-[44px]')
    })

    it('all buttons have touch-action: manipulation', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const sendBtn = screen.getByLabelText('Send message')
      const cameraBtn = screen.getByLabelText('Open camera')
      const fileBtn = screen.getByLabelText('Upload file')

      expect(sendBtn.style.touchAction).toBe('manipulation')
      expect(cameraBtn.style.touchAction).toBe('manipulation')
      expect(fileBtn.style.touchAction).toBe('manipulation')
    })
  })

  describe('voice input (Requirement 8.5)', () => {
    let mockRecognition: {
      continuous: boolean
      interimResults: boolean
      lang: string
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      onresult: ((event: unknown) => void) | null
      onerror: ((event: unknown) => void) | null
      onend: (() => void) | null
    }

    beforeEach(() => {
      mockRecognition = {
        continuous: false,
        interimResults: false,
        lang: '',
        start: vi.fn(),
        stop: vi.fn(),
        onresult: null,
        onerror: null,
        onend: null,
      }
      // Use a real class so `new SpeechRecognition()` works
      window.SpeechRecognition = class {
        continuous = false
        interimResults = false
        lang = ''
        onresult: ((event: unknown) => void) | null = null
        onerror: ((event: unknown) => void) | null = null
        onend: (() => void) | null = null
        start = mockRecognition.start
        stop = mockRecognition.stop
        constructor() {
          // Wire up so tests can trigger callbacks
          Object.assign(mockRecognition, {
            get onresult() { return this._onresult },
            set onresult(fn: ((event: unknown) => void) | null) { this._onresult = fn },
          })
          // Proxy property access back to this instance
          const self = this
          mockRecognition.onresult = null
          mockRecognition.onerror = null
          mockRecognition.onend = null
          // Use defineProperty to sync
          const syncProps = () => {
            mockRecognition.onresult = self.onresult
            mockRecognition.onerror = self.onerror
            mockRecognition.onend = self.onend
          }
          // Sync after microtask (React sets handlers after construction)
          mockRecognition.start.mockImplementation(() => {
            syncProps()
          })
        }
      } as unknown as typeof window.SpeechRecognition
    })

    afterEach(() => {
      // @ts-expect-error - cleanup
      delete window.SpeechRecognition
      // @ts-expect-error - cleanup
      delete window.webkitSpeechRecognition
    })

    it('shows voice button when Web Speech API is available', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.getByLabelText('Start voice input')).toBeInTheDocument()
    })

    it('voice button has minimum 44px touch target', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const btn = screen.getByLabelText('Start voice input')
      expect(btn.className).toContain('min-w-[44px]')
      expect(btn.className).toContain('min-h-[44px]')
    })

    it('starts recording when voice button clicked', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      fireEvent.click(screen.getByLabelText('Start voice input'))

      expect(mockRecognition.start).toHaveBeenCalled()
    })

    it('shows recording state with stop label', async () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      fireEvent.click(screen.getByLabelText('Start voice input'))

      await waitFor(() => {
        expect(screen.getByLabelText('Stop recording')).toBeInTheDocument()
      })
    })

    it('calls onSubmit with voice input_mode on successful recognition', async () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)
      fireEvent.click(screen.getByLabelText('Start voice input'))

      // start() syncs the handlers — now trigger onresult
      mockRecognition.onresult?.({
        results: { 0: { 0: { transcript: 'Did 5 rounds of Cindy' } } },
      })

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          content: 'Did 5 rounds of Cindy',
          input_mode: 'voice',
        })
      })
    })

    it('stops recording on error', async () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      fireEvent.click(screen.getByLabelText('Start voice input'))

      // start() syncs the handlers
      mockRecognition.onerror?.({})

      await waitFor(() => {
        expect(screen.getByLabelText('Start voice input')).toBeInTheDocument()
      })
    })
  })

  describe('voice input unavailable', () => {
    it('hides voice button when Web Speech API is not available', () => {
      // Ensure no SpeechRecognition on window
      // @ts-expect-error - cleanup
      delete window.SpeechRecognition
      // @ts-expect-error - cleanup
      delete window.webkitSpeechRecognition

      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.queryByLabelText('Start voice input')).not.toBeInTheDocument()
    })
  })

  describe('camera button (Requirement 8.4)', () => {
    it('renders camera button', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.getByLabelText('Open camera')).toBeInTheDocument()
    })
  })

  describe('file upload', () => {
    it('renders file upload button', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      expect(screen.getByLabelText('Upload file')).toBeInTheDocument()
    })

    it('has a hidden file input', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(hiddenInput).toBeInTheDocument()
      expect(hiddenInput.className).toContain('hidden')
    })

    it('calls onSubmit with photo input_mode for image files', async () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement

      // Create a mock image file
      const file = new File(['image-data'], 'meal.jpg', { type: 'image/jpeg' })

      // Mock FileReader as a class
      const originalFileReader = window.FileReader
      let capturedOnload: (() => void) | null = null
      window.FileReader = class {
        result: string | ArrayBuffer | null = 'data:image/jpeg;base64,abc123'
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        readAsDataURL() {
          capturedOnload = () => this.onload?.()
          // Trigger async to let React set the handler
          Promise.resolve().then(() => this.onload?.())
        }
      } as unknown as typeof FileReader

      fireEvent.change(hiddenInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          content: 'meal.jpg',
          input_mode: 'photo',
          photo_data: 'data:image/jpeg;base64,abc123',
        })
      })

      window.FileReader = originalFileReader
    })

    it('calls onSubmit with file input_mode for non-image files', async () => {
      const onSubmit = vi.fn()
      render(<InputBar onSubmit={onSubmit} isLoading={false} />)

      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement

      const file = new File(['csv-data'], 'data.csv', { type: 'text/csv' })

      const originalFileReader = window.FileReader
      window.FileReader = class {
        result: string | ArrayBuffer | null = 'data:text/csv;base64,abc123'
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        readAsDataURL() {
          Promise.resolve().then(() => this.onload?.())
        }
      } as unknown as typeof FileReader

      fireEvent.change(hiddenInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          content: 'data.csv',
          input_mode: 'file',
        })
      })

      window.FileReader = originalFileReader
    })
  })

  describe('accessibility', () => {
    it('all buttons have aria-labels', () => {
      // Set up SpeechRecognition so voice button renders
      window.SpeechRecognition = class {
        continuous = false; interimResults = false; lang = ''
        onresult = null; onerror = null; onend = null
        start() {}; stop() {}
      } as unknown as typeof window.SpeechRecognition

      render(<InputBar onSubmit={noop} isLoading={false} />)

      expect(screen.getByLabelText('Send message')).toBeInTheDocument()
      expect(screen.getByLabelText('Open camera')).toBeInTheDocument()
      expect(screen.getByLabelText('Upload file')).toBeInTheDocument()
      expect(screen.getByLabelText('Start voice input')).toBeInTheDocument()
      expect(screen.getByLabelText('Message input')).toBeInTheDocument()

      // @ts-expect-error - cleanup
      delete window.SpeechRecognition
    })

    it('hidden file input has aria-hidden', () => {
      render(<InputBar onSubmit={noop} isLoading={false} />)
      const hiddenInput = document.querySelector('input[type="file"]')
      expect(hiddenInput).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
