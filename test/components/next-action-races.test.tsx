// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
import type { RecommendationView } from '@/app/lib/client/recommendations'

const auth = vi.hoisted(() => ({ user: { id: 'athlete-a' } as { id: string } | null }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/app/lib/offline-queue', () => ({ offlineQueue: { captureNeedsReconciliation: vi.fn(async () => false) } }))
vi.mock('@/app/components/capture/CaptureRecovery', () => ({ CaptureRecovery: () => <p>Capture reconciliation controls</p> }))
vi.mock('@/app/lib/client/recommendations', async original => ({
  ...await original<typeof import('@/app/lib/client/recommendations')>(),
  refreshRecommendations: vi.fn(), sendRecommendationEvent: vi.fn(), refreshAfterCanonicalSave: vi.fn(),
}))
import { refreshRecommendations, sendRecommendationEvent } from '@/app/lib/client/recommendations'
import { NextActionCard } from '@/app/components/NextActionCard'

function snapshot(title: string, expiresIn = 60_000): RecommendationView {
  return { status: 'ready', refreshState: { sourceRevision: 1, responseRevision: 0, pending: false }, outcomes: [], coverage: null,
    recommendations: [{ id: title, lifecycle: 'active', created_at: new Date().toISOString(), decision: {
      schemaVersion: 1, kind: 'action', ruleId: 'accepted_plan.session', ruleVersion: '1', policyVersion: 'bounded-actions-1',
      runtimeFingerprint: 'test', scopeKey: title, evidenceFingerprint: 'test', sourceRevision: 1, responseRevision: 0,
      localDate: getLocalDate(), tzOffset: getTimezoneOffset(), validUntil: new Date(Date.now() + expiresIn).toISOString(),
      planVersionId: 'plan', intentMemoryId: null, intentVersion: null, goalId: null, title, reason: 'Open the accepted session.',
      reasonCodes: [], missing: [], conflicts: [], sources: [], outcome: null, destination: { type: 'session', href: '/program?sessionId=session' },
    } }],
  }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 17, 12, 0, 0))
  sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); auth.user = { id: 'athlete-a' }
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.mocked(sendRecommendationEvent).mockResolvedValue({ event: {} })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('does not let account A late data replace an already loaded account B action', async () => {
  const pending = deferred<RecommendationView>(), old = snapshot('A private action')
  vi.mocked(refreshRecommendations).mockImplementation(owner => owner === 'athlete-a' ? pending.promise : Promise.resolve(snapshot('B current action')))
  const ui = render(<NextActionCard />)
  auth.user = { id: 'athlete-b' }; ui.rerender(<NextActionCard />); await flush()
  expect(screen.getByText('B current action')).toBeVisible()
  await act(async () => pending.resolve(old))
  expect(screen.queryByText('A private action')).not.toBeInTheDocument()
  expect(screen.getByText('B current action')).toBeVisible()
})

it('ignores an old-account response confirmation after account B has loaded', async () => {
  const response = deferred<unknown>()
  vi.mocked(refreshRecommendations).mockImplementation(owner => Promise.resolve(snapshot(owner === 'athlete-a' ? 'A action' : 'B action')))
  vi.mocked(sendRecommendationEvent).mockImplementation(() => response.promise)
  const ui = render(<NextActionCard />); await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  const aLoads = vi.mocked(refreshRecommendations).mock.calls.filter(([owner]) => owner === 'athlete-a').length
  auth.user = { id: 'athlete-b' }; ui.rerender(<NextActionCard />); await flush()
  await act(async () => response.resolve({ event: {} }))
  expect(screen.getByText('B action')).toBeVisible()
  expect(screen.queryByText('Done recorded as your report. No meal or workout was logged.')).not.toBeInTheDocument()
  expect(vi.mocked(refreshRecommendations).mock.calls.filter(([owner]) => owner === 'athlete-a')).toHaveLength(aLoads)
})

it('removes action controls when a displayed decision expires without another network response', async () => {
  vi.mocked(refreshRecommendations).mockResolvedValue(snapshot('Expiring action', 500))
  render(<NextActionCard />); await flush()
  expect(screen.getByRole('button', { name: 'Done' })).toBeVisible()
  await act(async () => vi.advanceTimersByTime(1000))
  expect(screen.queryByText('Expiring action')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Log activity' })).toBeVisible()
})

it('hides yesterday while the new local-day refresh is still pending', async () => {
  vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 59))
  const old = snapshot('Yesterday action', 120_000), next = deferred<RecommendationView>()
  vi.mocked(refreshRecommendations).mockResolvedValueOnce(old).mockImplementation(() => next.promise)
  render(<NextActionCard />); await flush()
  expect(screen.getByText('Yesterday action')).toBeVisible()
  await act(async () => vi.advanceTimersByTime(2000))
  expect(screen.queryByText('Yesterday action')).not.toBeInTheDocument()
  await act(async () => next.resolve(snapshot('Today action')))
  expect(screen.getByText('Today action')).toBeVisible()
})

