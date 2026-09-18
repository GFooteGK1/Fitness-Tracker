// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
const { send, correct } = vi.hoisted(() => ({ send: vi.fn(), correct: vi.fn() }))
vi.mock('@/app/lib/client/logging-request', () => ({ sendLoggingRequest: send, sendCaptureCorrection: correct, assertCaptureOwner: vi.fn(async () => {}), fileFingerprint: vi.fn().mockResolvedValue('photo') }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('@/app/lib/offline-queue', () => ({ useOfflineQueue: () => ({ stats: { pending: 0 }, isOnline: true }), queuePhotoUpload: vi.fn(), offlineQueue: { getUserOperations: () => [] } }))
import MealCameraCapture from '@/app/components/MealCameraCapture'
import { captureProvenance, type CaptureReceipt } from '@/app/lib/capture/contracts'
const receipt: CaptureReceipt = { schemaVersion: 2, userId: 'user-1', requestId: 'request-photo', requestKey: 'meal_upload:request-photo',
  operationId: 'photo-item', entityKind: 'meal', entityId: 'saved-meal', revision: 1, eventAt: '2026-09-17T12:00:00Z',
  capturedAt: '2026-09-17T12:00:00Z', inputMethod: 'photo', state: 'saved', provenance: captureProvenance('meal'), recommendationId: null }
const result = { mealId: 'saved-meal', receipt, analysisStatus: 'complete', analysis: {
  items: [{ food: 'Rice', portion: '1 cup', protein: 4, carbs: 40, fat: 2, calories: 194 }],
  total_protein: 4, total_carbs: 40, total_fat: 2, total_calories: 194
} }
async function selectPhoto(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['photo'], 'meal.jpg', { type: 'image/jpeg' })] } })
  fireEvent.click(await screen.findByRole('button', { name: 'Analyze Photo' }))
}
beforeEach(() => {
  send.mockReset()
  correct.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:photo')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('meal photo result contracts', () => {
  it('shows the saved estimate immediately and persists whole-meal scaling to the existing meal', async () => {
    send.mockResolvedValue(new Response(JSON.stringify(result)))
    correct.mockResolvedValue(new Response('{}'))
    const complete = vi.fn()
    const { container } = render(<MealCameraCapture onUploadComplete={complete} />)
    await selectPhoto(container)
    expect(await screen.findByText('Review the estimate', {}, { timeout: 1000 })).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Half' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrections' }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith({ mealId: 'saved-meal', analysisStatus: 'complete' }))
    expect(correct).toHaveBeenCalledWith('/api/meals/saved-meal', 'PUT', expect.objectContaining({ expectedRevision: 1, manualOverride: true,
      items: [expect.objectContaining({ calories: 97, protein: 2, carbs: 20, fat: 1 })] }), 'user-1')
  })
  it('retains portion edits after a failed save and retries without scaling twice', async () => {
    send.mockResolvedValue(new Response(JSON.stringify(result)))
    correct.mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response('{}'))
    const complete = vi.fn()
    const { container } = render(<MealCameraCapture onUploadComplete={complete} />)
    await selectPhoto(container)
    await screen.findByText('Review the estimate')
    fireEvent.click(screen.getByRole('button', { name: 'Half' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrections' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply corrections' })).toBeEnabled())
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Half' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrections' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(correct.mock.calls[1][2].items[0].calories).toBe(97)
    expect(correct.mock.calls[1]).toEqual(correct.mock.calls[0])
  })
  it('never claims a failed upload saved a meal and preserves the selected photo for retry or text entry', async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ analysisStatus: 'failed', error: 'Try a clearer image' })))
    const complete = vi.fn(), textEntry = vi.fn()
    const { container } = render(<MealCameraCapture onUploadComplete={complete} onTextEntry={textEntry} />)
    await selectPhoto(container)
    await screen.findByText('Try a clearer image')
    fireEvent.click(screen.getByRole('button', { name: 'Describe meal instead' }))
    expect(textEntry).toHaveBeenCalledTimes(1)
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByAltText('Captured meal')).toHaveAttribute('src', 'blob:photo')
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled()
  })
})
