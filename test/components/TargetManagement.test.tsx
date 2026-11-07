// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, expect, it, vi } from 'vitest'

let user: { id: string } = { id: 'synthetic-owner' }
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/app/lib/client/recommendations', () => ({ refreshAfterCanonicalSave: vi.fn() }))
import { refreshAfterCanonicalSave } from '@/app/lib/client/recommendations'
import TargetManagement from '@/app/components/TargetManagement'

const saved = { userId: user.id, targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75,
  targetCalories: 1949.8, tolerancePct: 0, updatedAt: '2026-11-02T12:00:00Z' }
const empty = { ...saved, targetProtein: 0, targetCarbs: 0, targetFat: 0, targetCalories: 0, tolerancePct: 5 }
const message = 'Unable to load your daily targets. Please try again.'
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function noSetup() {
  expect(screen.queryByRole('heading', { name: 'No Targets Set' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Set.*Targets/ })).not.toBeInTheDocument()
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); user = { id: saved.userId } })

it.each(['http', 'fetch', 'json'])('keeps an initial %s read failure out of setup and offers safe retry', async kind => {
  const fetcher = vi.fn().mockImplementation(async () => {
    if (kind === 'fetch') throw new Error('Synthetic private transport detail')
    if (kind === 'json') return new Response('{')
    return Response.json({ error: 'Synthetic private provider detail' }, { status: 500 })
  })
  vi.stubGlobal('fetch', fetcher)
  render(<TargetManagement />)
  await screen.findByRole('heading', { name: 'Daily Targets' })
  noSetup()
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('supports pending and repeated read retries, then restores the saved fractional target', async () => {
  const pending = deferred<Response>()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 500 }))
    .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json(saved))
  vi.stubGlobal('fetch', fetcher)
  render(<TargetManagement />)
  await screen.findByRole('button', { name: 'Try Again' })
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  noSetup()
  expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(Response.json({}, { status: 503 })))
  fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }))
  await screen.findByRole('button', { name: 'Edit' })
  noSetup()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByPlaceholderText('150')).toHaveValue(150.25)
  expect(screen.getByPlaceholderText('5.0')).toHaveValue(0)
  expect(fetcher).toHaveBeenCalledTimes(3)
  for (const [url, options] of fetcher.mock.calls) { expect(url).toBe('/api/targets'); expect(options?.method).toBeUndefined() }
  expect(refreshAfterCanonicalSave).not.toHaveBeenCalled()
})

it('cancels an interrupted retry and ignores its late result', async () => {
  const pending = deferred<Response>()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 500 })).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json(saved))
  vi.stubGlobal('fetch', fetcher)
  const first = render(<TargetManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }))
  const signal = fetcher.mock.calls[1][1]?.signal
  first.unmount()
  expect(signal?.aborted).toBe(true)
  render(<TargetManagement />)
  await screen.findByRole('button', { name: 'Edit' })
  await act(async () => pending.resolve(Response.json(empty)))
  noSetup()
  expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
})

it('ignores an old owner read after the auth-dependent effect starts a new read', async () => {
  const pending = deferred<Response>()
  const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json({ ...saved, userId: 'synthetic-owner-two' }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<TargetManagement />)
  user = { id: 'synthetic-owner-two' }
  view.rerender(<TargetManagement />)
  await screen.findByRole('button', { name: 'Edit' })
  expect(fetcher.mock.calls[0][1]?.signal.aborted).toBe(true)
  await act(async () => pending.resolve(Response.json(empty)))
  noSetup()
})

it('keeps a genuinely unconfigured target editable and Cancel returns to confirmed setup', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(empty)))
  render(<TargetManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Set Your Targets' }))
  expect(screen.getByPlaceholderText('150')).toHaveValue(0)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { name: 'No Targets Set' })).toBeInTheDocument()
})

it.each([saved, empty])('preserves the editable draft and Cancel after a save/validation error ($targetProtein)', async initial => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(initial))
    .mockResolvedValueOnce(Response.json({ error: 'All target values must be positive numbers' }, { status: 400 }))
  vi.stubGlobal('fetch', fetcher)
  render(<TargetManagement />)
  fireEvent.click(await screen.findByRole('button', { name: initial.targetProtein ? 'Edit' : 'Set Your Targets' }))
  fireEvent.change(screen.getByPlaceholderText('150'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Targets' }))
  await screen.findByText('All target values must be positive numbers')
  expect(screen.getByPlaceholderText('150')).toHaveValue(0)
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: initial.targetProtein ? 'Edit' : 'Set Your Targets' }))
  expect(screen.getByPlaceholderText('150')).toHaveValue(initial.targetProtein)
  expect(refreshAfterCanonicalSave).not.toHaveBeenCalled()
})

it('retries an unchanged draft after a failed save and retains the existing success callback and formula', async () => {
  const updated = { ...saved, targetProtein: 150.5, targetCalories: 1950.8 }
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(saved))
    .mockResolvedValueOnce(Response.json({ error: 'Failed to save daily targets' }, { status: 500 }))
    .mockResolvedValueOnce(Response.json(updated, { status: 201 }))
  const onTargetsUpdated = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<TargetManagement onTargetsUpdated={onTargetsUpdated} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByPlaceholderText('150'), { target: { value: '150.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Targets' }))
  await screen.findByText('Failed to save daily targets')
  expect(onTargetsUpdated).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Targets' }))
  await screen.findByRole('button', { name: 'Edit' })
  expect(onTargetsUpdated).toHaveBeenCalledExactlyOnceWith(updated)
  expect(refreshAfterCanonicalSave).toHaveBeenCalledExactlyOnceWith(saved.userId)
  expect(fetcher.mock.calls[1][1]?.body).toBe(fetcher.mock.calls[2][1]?.body)
  expect(JSON.parse(fetcher.mock.calls[2][1]?.body)).toEqual({ targetProtein: 150.5, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1950.8, tolerancePct: 0 })
})
