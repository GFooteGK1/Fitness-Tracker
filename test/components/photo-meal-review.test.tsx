// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ user: { id: 'athlete-a' } as { id: string } | null }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/app/components/capture/CaptureRecovery', () => ({ CaptureRecovery: () => <p>Pending saves</p> }))
vi.mock('@/app/lib/client/logging-request', () => ({ assertCaptureOwner: vi.fn(async () => {}), sendCaptureCorrection: vi.fn(), sendLoggingRequest: vi.fn() }))
vi.mock('@/app/lib/imageUtils', () => ({ compressImage: vi.fn(async () => ({ compressedDataUrl: 'data:image/jpeg;base64,ZWdn' })) }))
import { sendCaptureCorrection, sendLoggingRequest } from '@/app/lib/client/logging-request'
import { PhotoMealReview } from '@/app/components/capture/PhotoMealReview'

const item = { food: 'Egg', portion: '1 egg', protein: 6, carbs: 0, fat: 5, calories: 69 }
const draft = { id: '11111111-1111-4111-8111-111111111111', user_id: 'athlete-a', kind: 'meal', input_method: 'photo', status: 'draft', revision: 1, expires_at: '2099-01-01T00:00:00Z', normalized: { kind: 'meal', record: { items: [item], meal_timestamp: '2026-10-06T12:00:00Z' } } }
let drafts: typeof draft[], fetcher: ReturnType<typeof vi.fn>
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: 'athlete-a' }; drafts = [structuredClone(draft)]
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
  fetcher = vi.fn(async (url: string) => url.startsWith('data:') ? new Response(new Blob(['egg'])) : response({ userId: auth.user?.id, drafts }))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('photo review UI', () => {
  it('requires selecting and approving a photo before invoking analysis and never accepts automatically', async () => {
    vi.mocked(sendLoggingRequest).mockResolvedValue(response({ draft, canonicalChanged: false }))
    render(<PhotoMealReview />)
    const button = screen.getByRole('button', { name: 'Analyze approved photo' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Photo', { exact: true }), { target: { files: [new File(['egg'], 'meal.jpg', { type: 'image/jpeg' })] } })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(button)
    await waitFor(() => expect(sendLoggingRequest).toHaveBeenCalledTimes(1))
    const form = vi.mocked(sendLoggingRequest).mock.calls[0][1].body as FormData
    expect(form.get('approved')).toBe('true'); expect(form.get('timestamp')).toMatch(/Z$/)
    expect(sendCaptureCorrection).not.toHaveBeenCalled()
    await screen.findByText('Estimate saved for review. Nutrition totals have not changed.')
  })
  it('reloads a pending draft and saves corrections before accepting its latest revision', async () => {
    render(<PhotoMealReview />)
    await screen.findByText(/Egg · 1 egg/)
    fireEvent.click(screen.getByRole('button', { name: 'Correct estimate' }))
    fireEvent.change(screen.getByLabelText('Portion (include units)'), { target: { value: '2 eggs' } })
    fireEvent.change(screen.getByLabelText('protein (g)'), { target: { value: '12' } })
    vi.mocked(sendCaptureCorrection).mockImplementationOnce(async () => { drafts = [{ ...draft, revision: 2, normalized: { ...draft.normalized, record: { ...draft.normalized.record, items: [{ ...item, portion: '2 eggs', protein: 12 }] } } }]; return response({ draft: drafts[0] }) })
    fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }))
    await screen.findByText(/Egg · 2 eggs/)
    expect(vi.mocked(sendCaptureCorrection).mock.calls[0][2]).toMatchObject({ expectedRevision: 1, items: [{ ...item, portion: '2 eggs', protein: 12 }] })
    vi.mocked(sendCaptureCorrection).mockResolvedValueOnce(response({ receipt: { entityId: 'saved-meal' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept meal' }))
    await screen.findByText('Meal accepted and added to nutrition totals.')
    expect(vi.mocked(sendCaptureCorrection).mock.calls[1][2]).toMatchObject({ action: 'commit', expectedRevision: 2 })
  })
  it('dismisses only after the explicit action and retains uncertainty after a lost response', async () => {
    vi.mocked(sendCaptureCorrection).mockRejectedValue(new Error('Transport lost. Retry unchanged values.'))
    render(<PhotoMealReview />); await screen.findByText(/Egg · 1 egg/)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await screen.findByText('Transport lost. Retry unchanged values.')
    expect(screen.getByRole('button', { name: 'Accept meal' })).toBeVisible()
    expect(vi.mocked(sendCaptureCorrection).mock.calls[0][2]).toMatchObject({ action: 'discard' })
  })
  it('rejects a late account A read after switching to B and then back to A', async () => {
    let resolve!: (value: Response) => void
    const delayed = new Promise<Response>(done => { resolve = done })
    fetcher.mockImplementationOnce(() => delayed)
    const ui = render(<PhotoMealReview />)
    auth.user = { id: 'athlete-b' }; drafts = []; ui.rerender(<PhotoMealReview />)
    await screen.findByText('No photo estimates awaiting review.')
    await act(async () => resolve(response({ userId: 'athlete-a', drafts: [draft] })))
    expect(screen.queryByText(/Egg · 1 egg/)).not.toBeInTheDocument()
    auth.user = { id: 'athlete-a' }; ui.rerender(<PhotoMealReview />)
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Photo estimates awaiting review' })).queryByText(/Egg · 1 egg/)).not.toBeInTheDocument())
  })
})
