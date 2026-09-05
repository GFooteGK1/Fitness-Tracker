// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); sessionStorage.clear() })
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
  await sendLoggingRequest('/log',request(),'athlete-b')
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

it('treats an explicitly changed date as a new submission', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetch)
  const { sendLoggingRequest } = await import('@/app/lib/client/logging-request')
  await expect(sendLoggingRequest('/log',request(),'athlete-a',60000,'eggs:2026-09-03')).rejects.toThrow()
  await sendLoggingRequest('/log',request('eggs','2026-09-04T12:00:00Z'),'athlete-a',60000,'eggs:2026-09-04')
  expect(JSON.parse(fetch.mock.calls[0][1].body).requestId).not.toBe(JSON.parse(fetch.mock.calls[1][1].body).requestId)
  expect(JSON.parse(fetch.mock.calls[1][1].body).timestamp).toBe('2026-09-04T12:00:00Z')
})
