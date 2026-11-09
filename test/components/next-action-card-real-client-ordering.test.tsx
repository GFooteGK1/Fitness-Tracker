// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RecommendationView } from '@/app/lib/client/recommendations'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

const state = vi.hoisted(() => ({ owner: 'athlete-a' as string | null, trace: [] as string[], getUser: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: state.owner ? { id: state.owner } : null }) }))
vi.mock('@/app/lib/auth/supabase', () => ({ createClient: () => ({ auth: { getUser: state.getUser } }) }))
vi.mock('@/app/lib/offline-queue', () => ({ offlineQueue: { captureNeedsReconciliation: async () => false } }))
vi.mock('@/app/lib/client/recommendations', async original => {
  const actual = await original<typeof import('@/app/lib/client/recommendations')>()
  return { ...actual, refreshRecommendations: state.refresh, refreshAfterCanonicalSave: vi.fn(), pendingRecommendationEvent: (...args: Parameters<typeof actual.pendingRecommendationEvent>) => {
    const value = actual.pendingRecommendationEvent(...args)
    if (args[2] === 'response') state.trace.push(`hydrate:${args[0]}:${args[1]}:${value ? 'pending' : 'null'}`)
    return value
  } }
})
import { pendingRecommendationEvents, recommendationScopeKey, sendRecommendationEvent } from '@/app/lib/client/recommendations'
import { NextActionCard } from '@/app/components/NextActionCard'

function view(id = 'decision-a'): RecommendationView {
  return { status: 'ready', refreshState: { sourceRevision: 4, responseRevision: 0, pending: false }, recommendations: [{ id, lifecycle: 'active', created_at: new Date().toISOString(), decision: { schemaVersion: 1, kind: 'collect_signal', title: `Review ${id}`, reason: 'A synthetic recorded outcome needs a comparable measurement.', ruleId: 'missing_signal.baseline', ruleVersion: '1', policyVersion: 'bounded-actions-1', runtimeFingerprint: 'runtime', scopeKey: 'baseline', evidenceFingerprint: 'facts', sourceRevision: 4, responseRevision: 0, localDate: getLocalDate(), tzOffset: getTimezoneOffset(), validUntil: new Date(Date.now() + 60_000).toISOString(), planVersionId: null, intentMemoryId: 'intent', intentVersion: 1, goalId: 'run', reasonCodes: [], missing: ['baseline'], conflicts: [], sources: [], outcome: null, destination: { type: 'baseline', href: '/program?goalId=run' } } }], outcomes: [] }
}
let observerReady = false
let releaseAuth: (() => void) | undefined
let mutationObserver: MutationObserver | undefined
const sends: Array<{ url: string; body: string }> = []
let fetchMode: 'lost' | 'success' | 'stale' = 'lost'
let releaseTransport: ((value: Response) => void) | undefined
let rejectTransport: ((reason: Error) => void) | undefined
const transports = new Map<string, { resolve: (value: Response) => void; reject: (reason: Error) => void }>()
let holdTransport = false
const rowOwners: Record<string, string> = {}

beforeEach(() => {
  state.owner = 'athlete-a'; state.trace = []; observerReady = false; releaseAuth = undefined; releaseTransport = undefined; rejectTransport = undefined; holdTransport = false; fetchMode = 'lost'; sends.length = 0; transports.clear()
  vi.resetAllMocks(); sessionStorage.clear(); localStorage.clear()
  Object.assign(rowOwners, { 'decision-a': 'athlete-a', 'decision-b': 'athlete-b', 'decision-c': 'athlete-a' })
  vi.stubGlobal('IntersectionObserver', class { constructor() { observerReady = true; state.trace.push('observer:ready') }; observe() {}; disconnect() {} })
  state.getUser.mockImplementation(async () => { state.trace.push(`auth:start:ready:${state.owner}`); return { data: { user: state.owner ? { id: state.owner } : null }, error: null } })
  state.getUser.mockImplementationOnce(() => {
    state.trace.push('auth:start:deferred')
    return new Promise(resolveUser => { releaseAuth = () => { state.trace.push('auth:release'); resolveUser({ data: { user: state.owner ? { id: state.owner } : null }, error: null }) } })
  })
  state.refresh.mockImplementation(async (owner: string) => view(owner === 'athlete-a' ? 'decision-a' : 'decision-b'))
  const originalSet = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key.startsWith('socius-recommendation:') && key.includes(':response:')) state.trace.push(`persist:${key}`)
    return Reflect.apply(originalSet, this, [key, value])
  })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!/^\/api\/recommendations\/decision-[abc]\/response$/.test(url) || init?.method !== 'POST' || typeof init.body !== 'string') throw new Error('Offline probe forbids unexpected request')
    const body = JSON.parse(init.body), id = url.split('/')[3]
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(Object.keys(body).sort()).toEqual(['expectedUserId', 'requestId', 'response', 'tzOffset'].sort())
    expect(body.expectedUserId).toBe(rowOwners[id]); expect(body.expectedUserId).toBe(state.owner)
    expect(body.response).toBe('done_reported'); expect(body.tzOffset).toBe(getTimezoneOffset())
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    sends.push({ url, body: init.body }); state.trace.push(`fetch:${url}`)
    if (holdTransport) return new Promise<Response>((resolveResponse, rejectResponse) => { releaseTransport = resolveResponse; rejectTransport = rejectResponse; transports.set(id, { resolve: resolveResponse, reject: rejectResponse }) })
    if (fetchMode === 'lost') { state.trace.push('transport:lost'); throw new Error('Synthetic response lost') }
    if (fetchMode === 'stale') return new Response(JSON.stringify({ error: 'Synthetic sources changed', noWriteConfirmed: true, refreshRequired: true }), { status: 409 })
    return new Response(JSON.stringify({ event: 'saved' }))
  }))
})
afterEach(async () => {
  mutationObserver?.disconnect(); mutationObserver = undefined; cleanup(); state.owner = null
  if (releaseAuth) await act(async () => releaseAuth?.())
  if (releaseTransport) await act(async () => releaseTransport?.(new Response(JSON.stringify({ event: 'saved' }))))
  await act(async () => { for (const transport of transports.values()) transport.resolve(new Response(JSON.stringify({ event: 'saved' }))) })
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function mountAndClick(mode: 'early' | 'settled') {
  expect(vi.isMockFunction(sendRecommendationEvent)).toBe(false)
  let releaseView!: (value: RecommendationView) => void
  state.refresh.mockImplementationOnce(() => new Promise<RecommendationView>(resolveView => { releaseView = resolveView }))
  const rendered = render(<NextActionCard />)
  await waitFor(() => expect(releaseView).toBeTypeOf('function'))
  if (mode === 'early') {
    let clicked = false
    mutationObserver = new MutationObserver(() => {
      const button = Array.from(document.querySelectorAll('button')).find(node => node.textContent === 'Done')
      if (!button || clicked) return
      clicked = true; state.trace.push(`click:early:observer-${observerReady}`)
      button.click(); state.trace.push('click:return'); mutationObserver?.disconnect()
    })
    mutationObserver.observe(document.body, { subtree: true, childList: true })
    // Deliver at first DOM availability; settling the initial render first hides this ordering.
    releaseView(view())
  } else {
    await act(async () => releaseView(view()))
    state.trace.push(`click:settled:observer-${observerReady}`)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  }
  await waitFor(() => expect(releaseAuth).toBeTypeOf('function'))
  // Observe whether real hydration ran before releasing owner verification.
  await waitFor(() => expect(state.trace.some(item => item.startsWith('hydrate:athlete-a:decision-a:'))).toBe(true))
  return rendered
}
function originalUi() {
  const retry = screen.queryByRole('button', { name: 'Retry same response' })
  return { retry: !!retry, retryEnabled: !!retry && !(retry as HTMLButtonElement).disabled, done: !!screen.queryByRole('button', { name: 'Done' }), alternative: !!screen.queryByRole('button', { name: 'Not applicable' }), defer: !!screen.queryByRole('button', { name: 'Defer' }), adjust: !!screen.queryByRole('button', { name: 'Ask to adjust' }) }
}

it.each(['early', 'settled'] as const)('%s lost response preserves original-mount retry and frozen request', async mode => {
  await mountAndClick(mode)
  const beforeAuth = originalUi()
  expect(beforeAuth.retry, 'Pending owner verification must retain the selected response').toBe(true)
  expect(beforeAuth.retryEnabled).toBe(false)
  expect(beforeAuth.done, 'Pending owner verification must exclude Done').toBe(false)
  expect(beforeAuth.alternative, 'Pending owner verification must exclude alternatives').toBe(false)
  expect(beforeAuth.defer, 'Pending owner verification must exclude Defer').toBe(false)
  expect(beforeAuth.adjust, 'Pending owner verification must exclude Ask to adjust').toBe(false)
  expect(sends).toHaveLength(0); expect(pendingRecommendationEvents('athlete-a')).toEqual([])
  await act(async () => releaseAuth?.())
  await screen.findByText('Synthetic response lost')
  const initial = originalUi(); const first = sends[0]; const body = JSON.parse(first.body)
  // Recovery must remain on this mount, without a remount concealing missing UI.
  expect(initial.retry, 'Original mount must offer Retry same response').toBe(true)
  expect(initial.retryEnabled, 'Original retry must be enabled after response loss').toBe(true)
  expect(initial.done, 'Original mount must exclude Done while uncertain').toBe(false)
  expect(initial.alternative, 'Original mount must exclude alternate responses').toBe(false)
  expect(initial.defer, 'Original mount must exclude Defer').toBe(false)
  expect(initial.adjust, 'Original mount must exclude Ask to adjust').toBe(false)
  expect(body.response).toBe('done_reported'); expect(body.expectedUserId).toBe('athlete-a'); expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(pendingRecommendationEvents('athlete-a')).toEqual([{ id: 'decision-a', kind: 'response', payload: { response: 'done_reported' } }])
  fetchMode = 'success'
  fireEvent.click(await screen.findByRole('button', { name: 'Retry same response' }))
  await screen.findByText('Done recorded as your report. No meal or workout was logged.')
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first)
  expect(pendingRecommendationEvents('athlete-a')).toEqual([])
})

it.each(['early', 'settled'] as const)('%s successful response clears pending state without replay', async mode => {
  fetchMode = 'success'; await mountAndClick(mode); await act(async () => releaseAuth?.())
  await screen.findByText('Done recorded as your report. No meal or workout was logged.')
  expect(sends).toHaveLength(1); expect(pendingRecommendationEvents('athlete-a')).toEqual([])
  expect(screen.queryByRole('button', { name: 'Retry same response' })).not.toBeInTheDocument()
})
it.each(['early', 'settled'] as const)('%s confirmed stale response requires review and releases pending identity', async mode => {
  fetchMode = 'stale'; await mountAndClick(mode); await act(async () => releaseAuth?.())
  await screen.findByRole('button', { name: 'Check again' })
  expect(sends).toHaveLength(1); expect(pendingRecommendationEvents('athlete-a')).toEqual([])
  expect(screen.queryByRole('button', { name: 'Retry same response' })).not.toBeInTheDocument()
})
it('owner change during deferred verification cannot persist or send the previous owner response', async () => {
  const rendered = await mountAndClick('early')
  state.owner = 'athlete-b'; rendered.rerender(<NextActionCard />)
  await act(async () => releaseAuth?.())
  await screen.findByText('Review decision-b')
  expect(globalThis.fetch).not.toHaveBeenCalled()
  expect(sends).toEqual([]); expect(pendingRecommendationEvents('athlete-a')).toEqual([]); expect(pendingRecommendationEvents('athlete-b')).toEqual([])
  expect(screen.queryByText('Synthetic response lost')).not.toBeInTheDocument()
})
it('changed action recovers only the original persisted identity and exact body', async () => {
  holdTransport = true; await mountAndClick('settled'); await act(async () => releaseAuth?.())
  await waitFor(() => expect(releaseTransport).toBeTypeOf('function'))
  const first = sends[0]
  rowOwners['decision-b'] = 'athlete-a'
  state.refresh.mockResolvedValue(view('decision-b'))
  act(() => window.dispatchEvent(new CustomEvent('recommendations-updated', { detail: { owner: 'athlete-a', scope: recommendationScopeKey(), view: view('decision-b') } })))
  await screen.findByText('Review decision-b')
  await act(async () => releaseTransport?.(new Response(JSON.stringify({ error: 'Still unconfirmed' }), { status: 503 })))
  const earlier = await screen.findByRole('button', { name: 'Retry earlier response' })
  expect(screen.queryByRole('button', { name: 'Retry same response' })).not.toBeInTheDocument()
  holdTransport = false; fetchMode = 'success'; fireEvent.click(earlier)
  await waitFor(() => expect(pendingRecommendationEvents('athlete-a')).toEqual([]))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry earlier response' })).not.toBeInTheDocument())
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first); expect(sends.every(send => send.url.includes('/decision-a/response'))).toBe(true)
  expect(pendingRecommendationEvents('athlete-a')).toEqual([])
})

it('a changed action before persistence cannot inherit the old response or retry identity', async () => {
  await mountAndClick('early')
  rowOwners['decision-b'] = 'athlete-a'; state.refresh.mockResolvedValue(view('decision-b'))
  act(() => window.dispatchEvent(new CustomEvent('recommendations-updated', { detail: { owner: 'athlete-a', scope: recommendationScopeKey(), view: view('decision-b') } })))
  await screen.findByText('Review decision-b')
  expect(sends).toEqual([]); expect(pendingRecommendationEvents('athlete-a')).toEqual([])
  await act(async () => releaseAuth?.())
  await screen.findByText('Synthetic response lost')
  expect(screen.queryByRole('button', { name: 'Retry same response' })).not.toBeInTheDocument()
  expect(sends).toHaveLength(1)
  const first = sends[0]
  expect(first.url).toBe('/api/recommendations/decision-a/response')
  expect(pendingRecommendationEvents('athlete-a')).toEqual([{ id: 'decision-a', kind: 'response', payload: { response: 'done_reported' } }])
  // A read-only remount reconciles the late old-row entry; immediate visibility is not assumed.
  cleanup(); await act(async () => { render(<NextActionCard />) })
  await screen.findByText('Review decision-b')
  fetchMode = 'success'; fireEvent.click(await screen.findByRole('button', { name: 'Retry earlier response' }))
  await waitFor(() => expect(pendingRecommendationEvents('athlete-a')).toEqual([]))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry earlier response' })).not.toBeInTheDocument())
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first)
})

function seedPending(owner: string, id: string, kind: 'response' | 'coverage', payload: Record<string, unknown>) {
  const key = `socius-recommendation:${owner}:${kind}:${id}`
  const body = JSON.stringify({ ...payload, requestId: crypto.randomUUID(), expectedUserId: owner, tzOffset: getTimezoneOffset() })
  const stored = JSON.stringify({ signature: JSON.stringify(payload), body })
  sessionStorage.setItem(key, stored)
  return { key, stored, body }
}
function showSecondAction() {
  rowOwners['decision-b'] = 'athlete-a'; state.refresh.mockResolvedValue(view('decision-b'))
  act(() => window.dispatchEvent(new CustomEvent('recommendations-updated', { detail: { owner: 'athlete-a', scope: recommendationScopeKey(), view: view('decision-b') } })))
}
async function changeBeforePersistence() {
  holdTransport = true
  const mounted = await mountAndClick('settled')
  showSecondAction(); await screen.findByText('Review decision-b')
  expect(sends).toEqual([]); expect(pendingRecommendationEvents('athlete-a')).toEqual([])
  await act(async () => releaseAuth?.())
  await waitFor(() => expect(releaseTransport).toBeTypeOf('function'))
  expect(sends).toHaveLength(1)
  expect(sends[0].url).toBe('/api/recommendations/decision-a/response')
  expect(pendingRecommendationEvents('athlete-a')).toEqual([{ id: 'decision-a', kind: 'response', payload: { response: 'done_reported' } }])
  return mounted
}
it.each(['unconfirmed', 'transport'] as const)('late persistence followed by %s exposes the original earlier retry on the existing mount', async mode => {
  await changeBeforePersistence()
  const section = screen.getByRole('region', { name: 'Next action' }), first = { ...sends[0] }
  const unrelated = seedPending('athlete-a', 'decision-c', 'response', { response: 'not_applicable' })
  const otherOwner = seedPending('athlete-b', 'decision-b', 'response', { response: 'done_reported' })
  const coverage = seedPending('athlete-a', getLocalDate(), 'coverage', { domain: 'nutrition', localDate: getLocalDate(), status: 'partial', coverageThrough: new Date().toISOString(), expectedSourceRevision: 4 })
  const refreshCalls = state.refresh.mock.calls.length
  await act(async () => {
    if (mode === 'transport') rejectTransport?.(new Error('Synthetic response lost'))
    else releaseTransport?.(new Response(JSON.stringify({ error: 'Synthetic response lost' }), { status: 503 }))
  })
  await screen.findByText('Synthetic response lost')
  // No pending/update event, remount, focus, tick or refresh may discover this entry.
  expect(screen.getByRole('region', { name: 'Next action' })).toBe(section)
  expect(screen.getByText('Review decision-b')).toBeInTheDocument()
  const earlier = await screen.findByText('Earlier response: done reported')
  const retry = within(earlier.parentElement!).getByRole('button', { name: 'Retry earlier response' })
  expect(retry).toBeEnabled(); expect(screen.queryByRole('button', { name: 'Retry same response' })).not.toBeInTheDocument()
  expect(screen.queryByText('Earlier meal coverage report')).not.toBeInTheDocument()
  expect(state.refresh).toHaveBeenCalledTimes(refreshCalls); expect(sends).toHaveLength(1)
  holdTransport = false; fetchMode = 'success'; fireEvent.click(retry)
  await waitFor(() => expect(sessionStorage.getItem('socius-recommendation:athlete-a:response:decision-a')).toBeNull())
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first)
  for (const entry of [unrelated, otherOwner, coverage]) expect(sessionStorage.getItem(entry.key)).toBe(entry.stored)
})
it.each(['success', 'stale'] as const)('late %s settlement clears only the original entry and preserves unrelated pending state', async mode => {
  await changeBeforePersistence()
  const unrelated = seedPending('athlete-a', 'decision-c', 'response', { response: 'not_applicable' })
  const otherOwner = seedPending('athlete-b', 'decision-b', 'response', { response: 'done_reported' })
  await act(async () => releaseTransport?.(mode === 'success' ? new Response(JSON.stringify({ event: 'saved' })) : new Response(JSON.stringify({ error: 'Synthetic sources changed', noWriteConfirmed: true, refreshRequired: true }), { status: 409 })))
  if (mode === 'success') await screen.findByText('Done recorded as your report. No meal or workout was logged.')
  else await screen.findByRole('button', { name: 'Check again' })
  expect(sessionStorage.getItem('socius-recommendation:athlete-a:response:decision-a')).toBeNull()
  expect(sessionStorage.getItem(unrelated.key)).toBe(unrelated.stored); expect(sessionStorage.getItem(otherOwner.key)).toBe(otherOwner.stored)
  expect(screen.queryByText('Earlier response: done reported')).not.toBeInTheDocument(); expect(sends).toHaveLength(1)
})
it('late owner change cannot expose old recovery; returning to that owner retains the exact request', async () => {
  holdTransport = true; const mounted = await mountAndClick('settled'); await act(async () => releaseAuth?.())
  await waitFor(() => expect(releaseTransport).toBeTypeOf('function'))
  const first = { ...sends[0] }, oldEntry = sessionStorage.getItem('socius-recommendation:athlete-a:response:decision-a')
  state.owner = 'athlete-b'; mounted.rerender(<NextActionCard />); await screen.findByText('Review decision-b')
  const refreshCalls = state.refresh.mock.calls.length
  await act(async () => rejectTransport?.(new Error('Synthetic old owner response lost')))
  expect(screen.queryByText('Synthetic old owner response lost')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry earlier response' })).not.toBeInTheDocument()
  expect(pendingRecommendationEvents('athlete-b')).toEqual([]); expect(state.refresh).toHaveBeenCalledTimes(refreshCalls)
  expect(sessionStorage.getItem('socius-recommendation:athlete-a:response:decision-a')).toBe(oldEntry); expect(sends).toHaveLength(1)
  state.owner = 'athlete-a'; mounted.rerender(<NextActionCard />); await screen.findByText('Review decision-a')
  holdTransport = false; fetchMode = 'success'; fireEvent.click(await screen.findByRole('button', { name: 'Retry same response' }))
  await waitFor(() => expect(pendingRecommendationEvents('athlete-a')).toEqual([]))
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first)
})
it('unmount before owner verification preserves a later uncertain request for read-only remount recovery', async () => {
  holdTransport = true; const mounted = await mountAndClick('settled'); mounted.unmount()
  const refreshCalls = state.refresh.mock.calls.length
  await act(async () => releaseAuth?.()); await waitFor(() => expect(rejectTransport).toBeTypeOf('function'))
  await act(async () => rejectTransport?.(new Error('Synthetic unmounted response lost')))
  expect(state.refresh).toHaveBeenCalledTimes(refreshCalls); expect(sends).toHaveLength(1)
  const first = { ...sends[0] }; expect(pendingRecommendationEvents('athlete-a')).toHaveLength(1)
  showSecondAction(); await act(async () => { render(<NextActionCard />) })
  await screen.findByText('Review decision-b')
  expect(sends).toHaveLength(1); holdTransport = false; fetchMode = 'success'
  fireEvent.click(await screen.findByRole('button', { name: 'Retry earlier response' }))
  await waitFor(() => expect(pendingRecommendationEvents('athlete-a')).toEqual([]))
  expect(sends).toHaveLength(2); expect(sends[1]).toEqual(first)
})
it('recovery enumeration excludes the current row, visible current-day coverage and another owner', async () => {
  const current = seedPending('athlete-a', 'decision-a', 'response', { response: 'not_applicable' })
  const earlier = seedPending('athlete-a', 'decision-c', 'response', { response: 'done_reported' })
  const otherOwner = seedPending('athlete-b', 'decision-b', 'response', { response: 'done_reported' })
  const coverage = seedPending('athlete-a', getLocalDate(), 'coverage', { localDate: getLocalDate(), status: 'partial', expectedSourceRevision: 4 })
  await act(async () => { render(<NextActionCard />) }); await screen.findByText('Review decision-a')
  expect(screen.getAllByRole('button', { name: 'Retry earlier response' })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Retry same response' })).toBeEnabled()
  expect(screen.queryByText('Earlier response: not applicable')).not.toBeInTheDocument()
  expect(screen.queryByText('Earlier meal coverage report')).not.toBeInTheDocument(); expect(globalThis.fetch).not.toHaveBeenCalled()
  for (const entry of [current, earlier, otherOwner, coverage]) expect(sessionStorage.getItem(entry.key)).toBe(entry.stored)
})
it('parent settlement does not release an in-flight earlier retry or replace either frozen request', async () => {
  const earlier = seedPending('athlete-a', 'decision-c', 'response', { response: 'done_reported' })
  holdTransport = true; await act(async () => { render(<NextActionCard />) }); await screen.findByText('Review decision-a')
  fireEvent.click(screen.getByRole('button', { name: 'Retry earlier response' }))
  await waitFor(() => expect(releaseAuth).toBeTypeOf('function')); await act(async () => releaseAuth?.())
  await waitFor(() => expect(transports.has('decision-c')).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(transports.has('decision-a')).toBe(true))
  const current = { ...sends[1] }
  await act(async () => transports.get('decision-a')!.reject(new Error('Synthetic current response lost')))
  await screen.findByText('Synthetic current response lost')
  expect(screen.getByRole('button', { name: 'Retry earlier response' })).toBeDisabled(); expect(sends).toHaveLength(2)
  expect(sessionStorage.getItem(earlier.key)).toBe(earlier.stored)
  const refreshCalls = state.refresh.mock.calls.length
  await act(async () => transports.get('decision-c')!.resolve(new Response(JSON.stringify({ event: 'saved' }))))
  await waitFor(() => expect(sessionStorage.getItem(earlier.key)).toBeNull())
  await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(refreshCalls + 1))
  expect(sessionStorage.getItem(earlier.key)).toBeNull(); expect(sends[0].body).toBe(earlier.body)
  expect(await screen.findByRole('button', { name: 'Retry same response' })).toBeEnabled()
  expect(pendingRecommendationEvents('athlete-a')).toEqual([{ id: 'decision-a', kind: 'response', payload: { response: 'done_reported' } }])
  holdTransport = false; fetchMode = 'success'; fireEvent.click(screen.getByRole('button', { name: 'Retry same response' }))
  await waitFor(() => expect(pendingRecommendationEvents('athlete-a')).toEqual([]))
  expect(sends).toHaveLength(3); expect(sends[2]).toEqual(current)
})
it('an earlier retry settling after unmount does not refresh or change another owner mount', async () => {
  seedPending('athlete-a', 'decision-c', 'response', { response: 'done_reported' })
  holdTransport = true; const mounted = render(<NextActionCard />); await screen.findByText('Review decision-a')
  fireEvent.click(screen.getByRole('button', { name: 'Retry earlier response' }))
  await waitFor(() => expect(releaseAuth).toBeTypeOf('function')); await act(async () => releaseAuth?.())
  await waitFor(() => expect(transports.has('decision-c')).toBe(true)); mounted.unmount()
  state.owner = 'athlete-b'; await act(async () => { render(<NextActionCard />) }); await screen.findByText('Review decision-b')
  const refreshCalls = state.refresh.mock.calls.length
  await act(async () => transports.get('decision-c')!.resolve(new Response(JSON.stringify({ event: 'saved' }))))
  expect(screen.queryByText('Earlier response confirmed.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry earlier response' })).not.toBeInTheDocument()
  expect(state.refresh).toHaveBeenCalledTimes(refreshCalls); expect(sends).toHaveLength(1)
  expect(pendingRecommendationEvents('athlete-a')).toHaveLength(1); expect(pendingRecommendationEvents('athlete-b')).toEqual([])
})
