// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
import type { RecommendationView } from '@/app/lib/client/recommendations'
let user: { id: string } | null = { id: 'athlete-a' }
vi.mock('@/app/lib/offline-queue', () => ({ offlineQueue: { captureNeedsReconciliation: async () => false } }))
let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/app/lib/client/recommendations', async original => ({ ...await original<typeof import('@/app/lib/client/recommendations')>(), refreshRecommendations: vi.fn(), sendRecommendationEvent: vi.fn(), refreshAfterCanonicalSave: vi.fn() }))
import { refreshRecommendations, sendRecommendationEvent, refreshAfterCanonicalSave, RecommendationNeedsReview } from '@/app/lib/client/recommendations'
import { NextActionCard } from '@/app/components/NextActionCard'
function view(): RecommendationView { return { status: 'ready', refreshState: { sourceRevision: 4, responseRevision: 0, pending: false }, recommendations: [{ id: 'saved-decision', lifecycle: 'active', created_at: new Date().toISOString(), decision: { schemaVersion: 1, kind: 'collect_signal', title: 'Confirm your running baseline', reason: 'Your confirmed running outcome needs a comparable measurement.', ruleId: 'missing_signal.baseline', ruleVersion: '1', policyVersion: 'bounded-actions-1', runtimeFingerprint: 'runtime', scopeKey: 'baseline', evidenceFingerprint: 'facts', sourceRevision: 4, responseRevision: 0, localDate: getLocalDate(), tzOffset: getTimezoneOffset(), validUntil: new Date(Date.now() + 60_000).toISOString(), planVersionId: null, intentMemoryId: 'intent', intentVersion: 1, goalId: 'run', reasonCodes: [], missing: ['baseline'], conflicts: [], sources: [], outcome: null, destination: { type: 'baseline', href: '/program?goalId=run' } } }], outcomes: [] } }
beforeEach(() => {
  user = { id: 'athlete-a' }; intersect = undefined; sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof intersect) { intersect = callback }; observe() {}; disconnect() {} })
  vi.mocked(refreshRecommendations).mockResolvedValue(view()); vi.mocked(sendRecommendationEvent).mockResolvedValue({ event: 'saved' })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('shows one persisted action and only acknowledges shown after entering the viewport', async () => {
  render(<NextActionCard />)
  await screen.findByText('Confirm your running baseline')
  // The title can commit before the passive effect registers its observer.
  await waitFor(() => expect(intersect).toBeTypeOf('function'))
  const notifyIntersection = intersect!
  expect(sendRecommendationEvent).not.toHaveBeenCalled()
  act(() => notifyIntersection([{ isIntersecting: false }]))
  expect(sendRecommendationEvent).not.toHaveBeenCalled()
  act(() => notifyIntersection([{ isIntersecting: true }]))
  await waitFor(() => expect(sendRecommendationEvent).toHaveBeenCalledWith('athlete-a', 'saved-decision', 'shown', {}))
  expect(screen.getByRole('link', { name: /^Review your baseline/ })).toHaveAttribute('href', '/program?goalId=run&recommendationId=saved-decision')
})
it('Done records self-report and refreshes; it does not call a canonical capture endpoint', async () => {
  render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  vi.mocked(refreshRecommendations).mockResolvedValue({ ...view(), recommendations: [{ ...view().recommendations[0], id: 'abstain', decision: { ...view().recommendations[0].decision, kind: 'abstain', title: 'No eligible next action', destination: null } }] })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await screen.findByText('Done recorded as your report. No meal or workout was logged.')
  expect(sendRecommendationEvent).toHaveBeenCalledWith('athlete-a', 'saved-decision', 'response', { response: 'done_reported' })
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
})
it('keeps an explicit canonical destination after Adjust is confirmed', async () => {
  render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  fireEvent.click(screen.getByRole('button', { name: 'Ask to adjust' }))
  expect(await screen.findByRole('link', { name: 'Review what to adjust →' })).toHaveAttribute('href', '/program?goalId=run&recommendationId=saved-decision')
})
it('retains an uncertain response and reuses its payload', async () => {
  vi.mocked(sendRecommendationEvent).mockRejectedValueOnce(new Error('Response lost'))
  render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await screen.findByText('Response lost')
  fireEvent.click(screen.getByRole('button', { name: 'Retry same response' }))
  await waitFor(() => expect(sendRecommendationEvent).toHaveBeenCalledTimes(2))
  expect(vi.mocked(sendRecommendationEvent).mock.calls[0]).toEqual(vi.mocked(sendRecommendationEvent).mock.calls[1])
})
it('recovers a lost response even when the original action is no longer returned', async () => {
  sessionStorage.setItem('socius-recommendation:athlete-a:response:old-decision', JSON.stringify({ signature: JSON.stringify({ response: 'done_reported' }), body: '{}' }))
  render(<NextActionCard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry earlier response' }))
  await waitFor(() => expect(sendRecommendationEvent).toHaveBeenCalledWith('athlete-a', 'old-decision', 'response', { response: 'done_reported' }))
})
it('reports source outage truthfully while retaining plan and log links', async () => {
  vi.mocked(refreshRecommendations).mockRejectedValue(new Error('DB unavailable'))
  render(<NextActionCard />); await screen.findByText('Next action unavailable')
  expect(screen.getByRole('link', { name: 'Your plan' })).toBeVisible(); expect(screen.getByRole('link', { name: 'Log activity' })).toBeVisible()
  expect(screen.queryByText('You’re up to date')).not.toBeInTheDocument()
})
it('removes previous account content synchronously and ignores its late load', async () => {
  const rendered = render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  let release!: (value: RecommendationView) => void
  vi.mocked(refreshRecommendations).mockImplementation(() => new Promise(resolve => { release = resolve }))
  user = { id: 'athlete-b' }; rendered.rerender(<NextActionCard />)
  expect(screen.queryByText('Confirm your running baseline')).not.toBeInTheDocument()
  await waitFor(() => expect(release).toBeTypeOf('function'))
  user = null; rendered.rerender(<NextActionCard />)
  await act(async () => release(view()))
  expect(screen.queryByRole('region', { name: 'Next action' })).not.toBeInTheDocument()
})
it('expires the action and refuses to display a different timezone snapshot', async () => {
  const expired = view(); expired.recommendations[0].decision.validUntil = new Date(Date.now() - 1000).toISOString()
  vi.mocked(refreshRecommendations).mockResolvedValue(expired)
  render(<NextActionCard />); await screen.findByText('Your next action needs a fresh check.')
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  cleanup(); const otherZone = view(); otherZone.recommendations[0].decision.tzOffset += 60
  vi.mocked(refreshRecommendations).mockResolvedValue(otherZone)
  render(<NextActionCard />); await screen.findByText('Your next action needs a fresh check.')
})
it('coverage requires an explicit choice/save and uses the current source fence independently from Done', async () => {
  render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  fireEvent.change(screen.getByRole('combobox', { name: 'Coverage' }), { target: { value: 'complete_through' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save coverage report' }))
  await waitFor(() => expect(sendRecommendationEvent).toHaveBeenCalledWith('athlete-a', getLocalDate(), 'coverage', expect.objectContaining({ domain: 'nutrition', status: 'complete_through', expectedSourceRevision: 4 })))
  expect(refreshAfterCanonicalSave).toHaveBeenCalledWith('athlete-a')
})
it('a proven stale coverage write offers review before another report', async () => {
  vi.mocked(sendRecommendationEvent).mockRejectedValue(new RecommendationNeedsReview('Sources changed'))
  render(<NextActionCard />); await screen.findByText('Confirm your running baseline')
  fireEvent.click(screen.getByRole('button', { name: 'Save coverage report' }))
  await screen.findByRole('button', { name: 'Review current records' })
  expect(screen.queryByRole('button', { name: 'Retry same coverage report' })).not.toBeInTheDocument()
})
it('source-invalidated observed outcomes are displayed as unknown with historical detail', async () => {
  vi.mocked(refreshRecommendations).mockResolvedValue({ ...view(), outcomes: [{ id: 'outcome', recommendationId: 'past', title: 'Prior run', lifecycle: 'superseded', createdAt: new Date().toISOString(), invalidated: true, payload: { adherence: 'observed', summary: 'Earlier measurement was recorded.', attributionLimits: ['This does not establish causation.'] } }] })
  render(<NextActionCard />)
  await screen.findByText('Unknown · source records changed')
  expect(screen.queryByText('Observed in records')).not.toBeInTheDocument()
})
