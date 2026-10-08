// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
const { auth } = vi.hoisted(() => ({ auth: { user: { id: 'athlete-a' } } }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/app/lib/auth/supabase', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: auth }) } }) }))
import { CaptureRecovery } from '@/app/components/capture/CaptureRecovery'
import { CaptureReceiptPanel, captureSourceLabel } from '@/app/components/capture/CaptureReceiptPanel'
import type { CaptureReceipt } from '@/app/lib/capture/contracts'
const receipt: CaptureReceipt = { schemaVersion: 2, userId: 'athlete-a', requestId: 'request-1', requestKey: 'meal-text:request-1', operationId: 'op', entityKind: 'meal', entityId: 'meal-a', revision: 1, eventAt: '2026-09-17T12:00:00Z', capturedAt: '2026-09-17T12:00:00Z', inputMethod: 'text', state: 'saved', recommendationId: null, provenance: { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }, fields: { macros: { origin: 'model_estimated', reviewState: 'athlete_confirmed', sourceReferences: [] } } } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => { sessionStorage.clear(); auth.user = { id: 'athlete-a' } })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('explains confirmed-unsaved workout recovery before explicitly releasing the old request', async () => {
  const key = 'socius-pending:athlete-a:/api/parse-workout'
  sessionStorage.setItem(key, JSON.stringify({ requestId: 'failed-workout', json: JSON.stringify({ text: 'APEX RPE 5.5', date: '2026-09-25' }) }))
  const fetch = vi.fn(async (url: string) => url === '/api/capture/drafts'
    ? json({ userId: 'athlete-a', drafts: [] })
    : json({ state: 'draft', retryAllowed: true, receipts: [], pendingItems: [] }))
  vi.stubGlobal('fetch', fetch)
  render(<CaptureRecovery />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry original save' }))
  await screen.findByText('No workout was saved. Choose Log another occurrence, then submit your workout again.')
  expect(sessionStorage.getItem(key)).not.toBeNull()
  expect(screen.queryByText('Workout saved', { exact: true })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log another occurrence' }))
  expect(sessionStorage.getItem(key)).toBeNull()
  expect(fetch.mock.calls.filter(call => call[0] !== '/api/capture/drafts')).toHaveLength(1)
})
it('keeps estimated origin visible after review and hides other-account receipts', () => {
  expect(captureSourceLabel(receipt)).toBe('Estimated · reviewed')
  render(<CaptureReceiptPanel result={{ receipts: [receipt, { ...receipt, entityId: 'other', userId: 'athlete-b' }], state: 'save_unconfirmed' }} />)
  expect(screen.getAllByText('Meal saved', { exact: true })).toHaveLength(1)
  expect(screen.getByText(/Some entries are still unconfirmed/)).toBeVisible()
})
it('requires explicit Save estimate and freezes draft revision/owner on commit', async () => {
  const fetch = vi.fn(async (_url, init) => init?.method === 'POST' ? json({ receipt }) : json({ userId: 'athlete-a', drafts: [{ id: 'draft-a', revision: 3, normalized: { kind: 'meal', record: { items: [{ food: 'Eggs', portion: '2 eggs', calories: 140 }] } } }] }))
  vi.stubGlobal('fetch', fetch)
  render(<CaptureRecovery />)
  await screen.findByRole('button', { name: 'Save estimate' })
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Save estimate' }))
  await screen.findByText('Estimate saved. Its source remains visible.')
  expect(JSON.parse(fetch.mock.calls.find(call => call[1]?.method === 'POST')![1].body)).toMatchObject({ action: 'commit', draftId: 'draft-a', expectedRevision: 3, expectedUserId: 'athlete-a' })
})
it('only releases a legacy envelope for new occurrence after proven reconciliation and explicit action', async () => {
  const key = 'socius-pending:athlete-a:/api/meals/parse-text:legacy-signature'
  sessionStorage.setItem(key, JSON.stringify({ requestId: 'original-id' }))
  vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/logging/') ? json({ state: 'saved', receipts: [receipt] }) : json({ userId: 'athlete-a', drafts: [] })))
  render(<CaptureRecovery />)
  expect(screen.queryByRole('button', { name: 'Log another occurrence' })).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Check save' }))
  await screen.findByRole('button', { name: 'Log another occurrence' })
  expect(sessionStorage.getItem(key)).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Log another occurrence' }))
  expect(sessionStorage.getItem(key)).toBeNull()
})
it('does not offer new occurrence for partial saved and pending children', async () => {
  sessionStorage.setItem('socius-pending:athlete-a:/api/agent/process', JSON.stringify({ requestId: 'original-id' }))
  vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/logging/') ? json({ state: 'save_unconfirmed', receipts: [receipt], pendingItems: ['pending-child'] }) : json({ userId: 'athlete-a', drafts: [] })))
  render(<CaptureRecovery />)
  fireEvent.click(await screen.findByRole('button', { name: 'Check save' }))
  await screen.findByText('Meal saved', { exact: true })
  expect(screen.queryByRole('button', { name: 'Log another occurrence' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Discard unsaved item' })).toBeVisible()
})
it('recovers a persisted correction without requiring reconstruction of edited values', async () => {
  const body = { expectedRevision: 4, items: [{ food: 'eggs' }] }
  sessionStorage.setItem('socius-correction:athlete-a:/api/meals/meal-a', JSON.stringify({ signature: JSON.stringify(body), method: 'PUT', body: JSON.stringify({ ...body, requestId: 'original-id', expectedUserId: 'athlete-a' }) }))
  const fetch = vi.fn(async (_url, init) => init?.method === 'PUT' ? json({ receipt }) : json({ userId: 'athlete-a', drafts: [] }))
  vi.stubGlobal('fetch', fetch)
  render(<CaptureRecovery />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry unchanged correction' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry unchanged correction' })).toBeNull())
  expect(JSON.parse(fetch.mock.calls.find(call => call[1]?.method === 'PUT')![1].body).requestId).toBe('original-id')
})

it('clears correction cards immediately on signout and does not expose them to the next account', async () => {
  sessionStorage.setItem('socius-correction:athlete-a:/api/meals/a', JSON.stringify({ signature: '{}', body: '{}', method: 'PUT' }))
  vi.stubGlobal('fetch', vi.fn(async () => json({ userId: 'athlete-a', drafts: [] })))
  const { rerender } = render(<CaptureRecovery />)
  await screen.findByRole('button', { name: 'Retry unchanged correction' })
  auth.user = null as any
  rerender(<CaptureRecovery />)
  expect(screen.queryByRole('button', { name: 'Retry unchanged correction' })).toBeNull()
  auth.user = { id: 'athlete-b' }
  rerender(<CaptureRecovery />)
  expect(screen.queryByRole('button', { name: 'Retry unchanged correction' })).toBeNull()
})
it('retains cancellation controls after a partial retry bundle response', async () => {
  sessionStorage.setItem('socius-pending:athlete-a:/api/agent/process', JSON.stringify({ requestId: 'original-id' }))
  vi.stubGlobal('fetch', vi.fn(async (url, init) => String(url).includes('/logging/') ? init?.method === 'POST'
    ? json({ receiptBundle: { schemaVersion: 2, state: 'save_unconfirmed', receipts: [receipt], unresolved: [{ operationId: 'pending-child' }] } }, 207)
    : json({ state: 'save_unconfirmed', receipts: [receipt], pendingItems: ['pending-child'] }) : json({ userId: 'athlete-a', drafts: [] })))
  render(<CaptureRecovery />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry original save' }))
  await screen.findByRole('button', { name: 'Discard unsaved item' })
})
it('clearing a known workout quantity submits unknown instead of invented zero', async () => {
  const workout = { ...receipt, entityKind: 'workout' as const }
  let correction: any
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init?.method === 'PATCH') { correction = JSON.parse(init.body); return json({ receipt: workout }) }
    return json({ revision: 2, execution: true, record: { workout_date: '2026-09-17', blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: 5 }] }] } })
  }))
  render(<CaptureReceiptPanel result={{ receipt: workout }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Review or correct' }))
  fireEvent.change(await screen.findByLabelText('reps'), { target: { value: '' } })
  expect(screen.getByLabelText('reps')).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
  await screen.findByText('Correction saved. Your accepted program is unchanged.')
  expect(correction.record.blocks[0].movements[0].reps).toBeNull()
  expect(correction.execution).toBe(true)
})
