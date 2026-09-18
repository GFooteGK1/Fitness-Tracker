// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
let owner = 'athlete-a'
vi.mock('@/app/lib/auth/supabase', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) } }) }))
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); owner = 'athlete-a'; window.history.replaceState({}, '', '/') })
afterEach(() => vi.unstubAllGlobals())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ready = { status: 'ready', recommendations: [], refreshState: { sourceRevision: 2, responseRevision: 0, pending: false } }
it('freezes response identity through transport loss, reload, and exact retry; Done only calls response', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(json({ event: 'saved' }))
  vi.stubGlobal('fetch', fetch)
  let client = await import('@/app/lib/client/recommendations')
  await expect(client.sendRecommendationEvent(owner, 'decision', 'response', { response: 'done_reported' })).rejects.toThrow('lost')
  vi.resetModules(); client = await import('@/app/lib/client/recommendations')
  expect(client.pendingRecommendationEvents(owner)).toHaveLength(1)
  await client.sendRecommendationEvent(owner, 'decision', 'response', { response: 'done_reported' })
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
  expect(fetch.mock.calls.every(call => call[0] === '/api/recommendations/decision/response')).toBe(true)
  expect(client.pendingRecommendationEvents(owner)).toEqual([])
})
it('preserves uncertain conflicts, but releases an explicitly proven no-write stale coverage for review', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ error: 'conflict', code: '22023' }, 409)).mockResolvedValueOnce(json({ error: 'changed', noWriteConfirmed: true, refreshRequired: true }, 409))
  vi.stubGlobal('fetch', fetch)
  const client = await import('@/app/lib/client/recommendations')
  const payload = { status: 'partial', expectedSourceRevision: 1 }
  await expect(client.sendRecommendationEvent(owner, 'day', 'coverage', payload)).rejects.toThrow('conflict')
  await expect(client.sendRecommendationEvent(owner, 'day', 'coverage', { status: 'unknown' })).rejects.toThrow('unchanged')
  await expect(client.sendRecommendationEvent(owner, 'day', 'coverage', payload)).rejects.toBeInstanceOf(client.RecommendationNeedsReview)
  expect(client.pendingRecommendationEvents(owner)).toEqual([])
})
it('uses one persisted shown request on repeat presentations, separate from a response', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ event: 'shown' })))
  vi.stubGlobal('fetch', fetch)
  const client = await import('@/app/lib/client/recommendations')
  await client.sendRecommendationEvent(owner, 'decision', 'shown', {})
  await client.sendRecommendationEvent(owner, 'decision', 'shown', {})
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
  expect(client.pendingRecommendationEvents(owner)).toEqual([])
})
it('coalesces a trailing post-save refresh and never exposes the pre-save snapshot', async () => {
  let release!: (value: Response) => void
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve })).mockResolvedValueOnce(json(ready))
  vi.stubGlobal('fetch', fetch)
  const client = await import('@/app/lib/client/recommendations')
  const updates: unknown[] = []
  const listener = (event: Event) => updates.push((event as CustomEvent).detail.view)
  window.addEventListener('recommendations-updated', listener)
  const initial = client.refreshRecommendations(owner).catch(error => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const afterSave = client.refreshRecommendations(owner, true)
  const afterSecondSave = client.refreshRecommendations(owner, true)
  expect(afterSave).toBe(afterSecondSave)
  release(json({ ...ready, recommendations: ['stale'] }))
  expect(await initial).toBeInstanceOf(client.RecommendationRefreshSuperseded)
  await afterSave
  expect(fetch).toHaveBeenCalledTimes(2); expect(updates).toEqual([ready])
  window.removeEventListener('recommendations-updated', listener)
})
it('does not expose a late owner response and keeps that owner retry state separate', async () => {
  let release!: (value: Response) => void
  const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
  vi.stubGlobal('fetch', fetch)
  const client = await import('@/app/lib/client/recommendations')
  const request = client.sendRecommendationEvent(owner, 'decision', 'response', { response: 'done_reported' })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  owner = 'athlete-b'; release(json({ event: 'saved' }))
  await expect(request).rejects.toThrow('account changed')
  expect(client.pendingRecommendationEvents(owner)).toEqual([])
  expect(client.pendingRecommendationEvents('athlete-a')).toHaveLength(1)
})
it('confirmed save refresh failure is independent and does not throw to the save caller', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')))
  const client = await import('@/app/lib/client/recommendations')
  const listener = vi.fn(); window.addEventListener('recommendations-unavailable', listener)
  expect(() => client.refreshAfterCanonicalSave(owner)).not.toThrow()
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
  window.removeEventListener('recommendations-unavailable', listener)
})
