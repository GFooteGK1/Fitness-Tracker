// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

let activeOwner = 'athlete-a'
vi.mock('@/app/lib/auth/supabase', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: activeOwner } } }) } }) }))
vi.mock('@/app/lib/client/recommendations', async importOriginal => ({ ...await importOriginal<typeof import('@/app/lib/client/recommendations')>(), refreshAfterCanonicalSave: vi.fn() }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState({}, '', '/'); activeOwner = 'athlete-a' })
afterEach(() => { vi.unstubAllGlobals() })
const request = (text = 'eggs', timestamp = '2026-09-04T04:59:00Z') => ({
  method: 'POST', body: JSON.stringify({ text, timestamp })
})
const ok = () => new Response(JSON.stringify({ mealId: 'saved' }))

it('keeps original JSON time and identity across network loss and module reload', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('response lost')).mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const first = await import('@/app/lib/client/logging-request')
  await expect(first.sendLoggingRequest('/api/meals/parse-text',request(),'athlete-a')).rejects.toThrow()
  vi.resetModules()
  const refreshed = await import('@/app/lib/client/logging-request')
  await refreshed.sendLoggingRequest('/api/meals/parse-text',request('eggs','2026-09-04T05:01:00Z'),'athlete-a')
  expect(fetch.mock.calls[1][1].body).toEqual(fetch.mock.calls[0][1].body)
  expect(sessionStorage.length).toBe(0)
})

it('retains identity after an unreadable success body and isolates athletes', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('broken body')).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/log',request(),'athlete-a')).rejects.toThrow('response was interrupted')
  activeOwner = 'athlete-b'
  await sendLoggingRequest('/log',request(),'athlete-b')
  activeOwner = 'athlete-a'
  await sendLoggingRequest('/log',request(),'athlete-a')
  const ids = fetch.mock.calls.map(call => JSON.parse(call[1].body).requestId)
  expect(ids[0]).toBe(ids[2]); expect(ids[1]).not.toBe(ids[0])
})

it('replays uncertain failures but releases only an explicitly safe no-write failure', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({error:'unknown'}),{status:503}))
    .mockResolvedValueOnce(new Response(JSON.stringify({requestStatus:'complete',retryAllowed:true}),{status:503}))
    .mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await sendLoggingRequest('/log',request(),'athlete-a')
  await sendLoggingRequest('/log',request(),'athlete-a')
  await sendLoggingRequest('/log',request(),'athlete-a')
  const ids = fetch.mock.calls.map(call => JSON.parse(call[1].body).requestId)
  expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[1])
})

it('reconciles a lost response before treating an edited date as an amendment', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'saved', receipts: [{ entityId: 'saved-meal', revision: 1 }] })))
    .mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/api/meals/parse-text',request(),'athlete-a',60000,'eggs:2026-09-03')).rejects.toThrow()
  await sendLoggingRequest('/api/meals/parse-text',request('eggs','2026-09-04T12:00:00Z'),'athlete-a',60000,'eggs:2026-09-04')
  expect(fetch.mock.calls[1][0]).toContain('/api/logging/requests/meal-text%3A')
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ timestamp: '2026-09-04T12:00:00Z', correction: { entityId: 'saved-meal', expectedRevision: 1 } })
})

it('never starts an edited create while the original request is still pending or has mixed results', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'save_unconfirmed', retryAllowed: false, receipts: [] })))
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/api/meals/parse-text',request(),'athlete-a')).rejects.toThrow()
  const result = await sendLoggingRequest('/api/meals/parse-text',request('oats'),'athlete-a')
  expect(result.status).toBe(409)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
})

it('only creates an edited occurrence after confirmed no-write failure', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'draft', retryAllowed: true, receipts: [] })))
    .mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/api/meals/parse-text',request(),'athlete-a')).rejects.toThrow()
  await sendLoggingRequest('/api/meals/parse-text',request('oats'),'athlete-a')
  expect(JSON.parse(fetch.mock.calls[2][1].body)).not.toHaveProperty('correction')
  expect(JSON.parse(fetch.mock.calls[0][1].body).requestId).not.toBe(JSON.parse(fetch.mock.calls[2][1].body).requestId)
})

it('blocks older signature-key records without deleting or posting them', async () => {
  sessionStorage.setItem('socius-pending:athlete-a:/api/meals/parse-text:old-signature', JSON.stringify({ requestId: 'legacy-id' }))
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/api/meals/parse-text', request(), 'athlete-a')).rejects.toThrow('earlier entry')
  expect(fetch).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(1)
})
it('does not expose a late response to a different signed-in account', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { activeOwner = 'athlete-b'; return ok() }))
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/api/meals/parse-text', request(), 'athlete-a')).rejects.toThrow('account changed')
  expect(sessionStorage.length).toBe(1)
})
it('keeps a successful HTTP partial result unresolved', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'save_unconfirmed' }), { status: 207 })))
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await sendLoggingRequest('/api/meals/parse-text', request(), 'athlete-a')
  expect(sessionStorage.length).toBe(1)
})
it('freezes correction body across lost response/reload and rejects changed edits', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(ok()); vi.stubGlobal('fetch', fetch)
  const first = await import('@/app/lib/client/logging-request')
  const body = { items: [{ food: 'eggs' }], expectedRevision: 4 }
  await expect(first.sendCaptureCorrection('/api/meals/meal-a', 'PUT', body, 'athlete-a')).rejects.toThrow('lost')
  vi.resetModules(); const reloaded = await import('@/app/lib/client/logging-request')
  await expect(reloaded.sendCaptureCorrection('/api/meals/meal-a', 'PUT', { ...body, expectedRevision: 5 }, 'athlete-a')).rejects.toThrow('unchanged correction')
  await reloaded.sendCaptureCorrection('/api/meals/meal-a', 'PUT', body, 'athlete-a')
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body)
})

it('freezes all photo scalar fields including an amendment across reload', async () => {
  const { webcrypto } = await import('node:crypto')
  vi.stubGlobal('crypto', { randomUUID: () => webcrypto.randomUUID(), subtle: webcrypto.subtle })
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'saved', receipts: [{ entityId: 'saved-meal', revision: 1 }] })))
    .mockRejectedValueOnce(new Error('lost correction')).mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const form = (bytes: string, time: string) => { const body = new FormData(); body.set('photo', new File([bytes], 'meal.jpg')); body.set('timestamp', time); return { method: 'POST', body } }
  const first = await import('@/app/lib/client/logging-request')
  await expect(first.sendLoggingRequest('/api/meals/upload', form('original', '2026-09-17T12:00:00Z'), 'athlete-a')).rejects.toThrow('lost')
  await expect(first.sendLoggingRequest('/api/meals/upload', form('edited', '2026-09-17T13:00:00Z'), 'athlete-a')).rejects.toThrow('lost correction')
  vi.resetModules()
  const reloaded = await import('@/app/lib/client/logging-request')
  await reloaded.sendLoggingRequest('/api/meals/upload', form('edited', '2026-09-17T14:00:00Z'), 'athlete-a')
  const original = fetch.mock.calls[2][1].body as FormData, retry = fetch.mock.calls[3][1].body as FormData
  expect(retry.get('correction')).toBe(original.get('correction'))
  expect(retry.get('requestId')).toBe(original.get('requestId'))
  expect(retry.get('timestamp')).toBe('2026-09-17T13:00:00Z')
})

it('never turns a stale reparse correction into a new create after losing the original create response', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost create'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'saved', receipts: [{ entityId: 'saved-meal', revision: 1 }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ requestStatus: 'complete', retryAllowed: true, correctionRequired: true }), { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'draft', retryAllowed: true, receipts: [] })))
  vi.stubGlobal('fetch', fetch)
  const first = await import('@/app/lib/client/logging-request')
  await expect(first.sendLoggingRequest('/api/meals/parse-text', request(), 'athlete-a')).rejects.toThrow('lost create')
  await first.sendLoggingRequest('/api/meals/parse-text', request('three eggs'), 'athlete-a')
  expect(sessionStorage.length).toBe(1)
  vi.resetModules()
  const reloaded = await import('@/app/lib/client/logging-request')
  const result = await reloaded.sendLoggingRequest('/api/meals/parse-text', request('four eggs'), 'athlete-a')
  expect(result.status).toBe(409)
  expect(await result.json()).toMatchObject({ correctionRequired: true, receipts: [{ entityId: 'saved-meal' }] })
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(2)
  expect(JSON.parse(sessionStorage.getItem('socius-pending:athlete-a:/api/meals/parse-text')!).json).toContain('saved-meal')
})

it('freezes the initial recommendation origin through an interrupted text save and URL change', async () => {
  const origin = '11111111-1111-4111-8111-111111111111'
  window.history.replaceState({}, '', `/log?recommendationId=${origin}`)
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(ok()); vi.stubGlobal('fetch', fetch)
  const first = await import('@/app/lib/client/logging-request')
  await expect(first.sendLoggingRequest('/api/parse-workout', request(), 'athlete-a')).rejects.toThrow('lost')
  window.history.replaceState({}, '', '/log?recommendationId=22222222-2222-4222-8222-222222222222')
  vi.resetModules(); const reloaded = await import('@/app/lib/client/logging-request')
  await reloaded.sendLoggingRequest('/api/parse-workout', request(), 'athlete-a')
  expect(JSON.parse(fetch.mock.calls[1][1].body).recommendationId).toBe(origin)
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
})

it('a saved child refreshes even on failed partial response while uncertainty remains for its sibling', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'save_unconfirmed', receiptBundle: { state: 'save_unconfirmed', receipts: [{ state: 'saved', entityId: 'saved-child' }], unresolved: [{ operationId: 'pending' }] } }), { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  const { refreshAfterCanonicalSave } = await import('@/app/lib/client/recommendations')
  const { hasUnreconciledCapture } = await import('@/app/lib/client/capture-uncertainty')
  const result = await sendLoggingRequest('/api/agent/process', request(), 'athlete-a')
  expect(result.status).toBe(503)
  expect(refreshAfterCanonicalSave).toHaveBeenCalledWith('athlete-a')
  expect(hasUnreconciledCapture('athlete-a')).toBe(true)
})
it('recovers two corrections on one endpoint with their exact bodies and separately bound proof', async () => {
  const { markCaptureCertainty, recoverPendingCaptures, hasUnreconciledCapture } = await import('@/app/lib/client/capture-uncertainty')
  const key = 'socius-correction:athlete-a:/api/capture'
  const draft = (id: string, entity: string) => {
    const value = { entityId: entity, expectedRevision: 1 }
    return { signature: JSON.stringify(value), method: 'PATCH', body: JSON.stringify({ ...value, expectedUserId: 'athlete-a', requestId: id }) }
  }
  const a = draft('correction-a', 'workout-a'), b = draft('correction-b', 'workout-b')
  sessionStorage.setItem(key, JSON.stringify(a)); markCaptureCertainty('athlete-a', key, false)
  sessionStorage.clear(); sessionStorage.setItem(key, JSON.stringify(b)); markCaptureCertainty('athlete-a', key, false)
  recoverPendingCaptures('athlete-a')
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(ok())); vi.stubGlobal('fetch', fetch)
  const { sendCaptureCorrection } = await import('@/app/lib/client/logging-request')
  await sendCaptureCorrection('/api/capture', 'PATCH', JSON.parse(a.signature), 'athlete-a', `${key}:request:correction-a`)
  expect(fetch.mock.calls[0][0]).toBe('/api/capture'); expect(fetch.mock.calls[0][1].body).toBe(a.body)
  expect(hasUnreconciledCapture('athlete-a')).toBe(true)
  await sendCaptureCorrection('/api/capture', 'PATCH', JSON.parse(b.signature), 'athlete-a')
  expect(fetch.mock.calls[1][1].body).toBe(b.body); expect(hasUnreconciledCapture('athlete-a')).toBe(false)
})
