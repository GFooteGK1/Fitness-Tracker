import { describe, expect, it, vi } from 'vitest'
import { readReviewedPending, resolveReviewedPending, saveReviewedPending, sendReviewedPending, type ReviewedPendingSessionRequest } from '@/app/lib/coach/reviewed-session-pending'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
const owner = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222abcdef'
function fixture() {
  const data = new Map<string, string>()
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  const value: ReviewedPendingSessionRequest = { schemaVersion: 1, userId: owner, sessionId, operation: 'set',
    body: { expectedUserId: owner, requestId: 'stable-request', report: reviewedSetReport('bench') } }
  const success = () => new Response(JSON.stringify({ kind: 'saved', requestId: 'stable-request', sessionId, setReport: { id: owner } }))
  return { data, store, value, success }
}
describe('reviewed session pending request recovery', () => {
  it('reload returns the detached exact request and blocks replacement until confirmed', () => {
    const { store, value } = fixture(); const saved = saveReviewedPending(store, value)
    value.body.report = { changed: true }
    expect(readReviewedPending(store, owner, sessionId.toUpperCase())).toEqual(saved)
    expect(() => saveReviewedPending(store, value)).toThrow('Resolve the previous')
  })
  it('does not send if persistence failed or identity changed', async () => {
    const { store, value } = fixture(), fetcher = vi.fn()
    expect(() => saveReviewedPending({ ...store, setItem() { throw new Error('quota') } }, value)).toThrow('quota')
    await expect(sendReviewedPending(store, value, () => owner, fetcher)).rejects.toThrow('saved request changed')
    saveReviewedPending(store, value)
    await expect(sendReviewedPending(store, value, () => null, fetcher)).rejects.toThrow('original account')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([400, 401, 404, 409, 500, 503])('retains exact payload after HTTP %i without automatic resend', async status => {
    const { store, value } = fixture(); saveReviewedPending(store, value)
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Review current state' }), { status }))
    await expect(sendReviewedPending(store, value, () => owner, fetcher)).rejects.toThrow('Review current state')
    expect(readReviewedPending(store, owner, sessionId)).toEqual(value); expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains network/parse failures and mismatched acknowledgements', async () => {
    const { store, value } = fixture(); saveReviewedPending(store, value)
    for (const fetcher of [vi.fn().mockRejectedValue(new Error('offline')), vi.fn().mockResolvedValue(new Response('not JSON')),
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: 'saved', requestId: 'different' })))]) {
      await expect(sendReviewedPending(store, value, () => owner, fetcher)).rejects.toThrow()
      expect(readReviewedPending(store, owner, sessionId)).toEqual(value)
    }
  })
  it('sends exactly the saved body and clears only the matching acknowledgement', async () => {
    const { store, value, success } = fixture(); saveReviewedPending(store, value)
    const fetcher = vi.fn().mockResolvedValue(success())
    await sendReviewedPending(store, value, () => owner, fetcher)
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(value.body))
    expect(readReviewedPending(store, owner, sessionId)).toBeNull()
  })
  it('preserves a late response when the account changes', async () => {
    const { store, value, success } = fixture(); saveReviewedPending(store, value)
    let current: string | null = owner
    await expect(sendReviewedPending(store, value, () => current, vi.fn(async () => { current = null; return success() }))).rejects.toThrow('Account changed')
    expect(readReviewedPending(store, owner, sessionId)).toEqual(value)
  })
  it('does not overwrite corrupt storage', () => {
    const { data, store, value } = fixture(); saveReviewedPending(store, value)
    data.set([...data.keys()][0], '{bad')
    expect(() => saveReviewedPending(store, value)).toThrow(); expect([...data.values()]).toEqual(['{bad'])
  })
})

describe('explicit request resolution', () => {
  function setup() {
    const f = fixture(); saveReviewedPending(f.store, f.value)
    const resolution = { schemaVersion: 1, userId: owner, sessionId, operation: 'set', requestId: f.value.body.requestId,
      payload: f.value.body.report, disposition: 'no_write', resolutionId: owner, resolvedAt: '2026-09-28T00:00:00Z' }
    const response = (changes = {}) => new Response(JSON.stringify({ kind: 'resolved', resolution: { ...resolution, ...changes } }))
    return { ...f, resolution, response }
  }
  it('archives the exact request and fence before clearing; only then permits a new request ID', async () => {
    const f = setup(), fetcher = vi.fn().mockResolvedValue(f.response())
    const decision = await resolveReviewedPending(f.store, f.value, () => owner, fetcher)
    expect(decision.disposition).toBe('no_write'); expect(readReviewedPending(f.store, owner, sessionId)).toBeNull()
    expect(JSON.parse([...f.data.values()][0])).toEqual({ request: f.value, resolution: f.resolution })
    expect(fetcher.mock.calls[0][0]).toBe(`/api/coach/reviewed/sessions/${sessionId}/resolve`)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedUserId: owner, operation: 'set', requestId: f.value.body.requestId, payload: f.value.body.report })
    expect(() => saveReviewedPending(f.store, { ...f.value, body: { ...f.value.body, requestId: 'replacement-key' } })).not.toThrow()
  })
  it('recovers a saved receipt without treating it as an unsaved request', async () => {
    const f = setup()
    const result = await resolveReviewedPending(f.store, f.value, () => owner, vi.fn().mockResolvedValue(f.response({
      disposition: 'saved', result: { id: owner, created_at: '2026-09-28T00:00:00Z', replayed: true },
    })))
    expect(result.disposition).toBe('saved'); expect(readReviewedPending(f.store, owner, sessionId)).toBeNull()
  })
  it.each([{ payload: {} }, { sessionId: owner }, { userId: sessionId }, { operation: 'complete' }, { requestId: 'wrong-key' },
    { resolutionId: 'invalid' }, { resolvedAt: 'invalid' }, { disposition: 'saved', result: {} }])('retains mismatched or malformed decision %j', async change => {
    const f = setup()
    await expect(resolveReviewedPending(f.store, f.value, () => owner, vi.fn().mockResolvedValue(f.response(change)))).rejects.toThrow('unconfirmed')
    expect(readReviewedPending(f.store, owner, sessionId)).toEqual(f.value); expect(f.data.size).toBe(1)
  })
  it('retains on response loss, account changes and concurrent local replacement', async () => {
    const f = setup()
    await expect(resolveReviewedPending(f.store, f.value, () => owner, vi.fn().mockRejectedValue(new Error('lost')))).rejects.toThrow('lost')
    let current = owner
    await expect(resolveReviewedPending(f.store, f.value, () => current, vi.fn(async () => { current = sessionId; return f.response() }))).rejects.toThrow('original account')
    expect(readReviewedPending(f.store, owner, sessionId)).toEqual(f.value)
    await expect(resolveReviewedPending(f.store, f.value, () => owner, vi.fn(async () => {
      f.data.set(`reviewed-session-pending:${owner}:${sessionId}`, JSON.stringify({ ...f.value, body: { ...f.value.body, requestId: 'replacement-key' } }))
      return f.response()
    }))).rejects.toThrow('saved request changed')
    expect(readReviewedPending(f.store, owner, sessionId)?.body.requestId).toBe('replacement-key')
  })
  it('keeps pending when archive storage fails and tolerates reordered JSONB on retry', async () => {
    const f = setup(), fetcher = vi.fn().mockResolvedValue(f.response())
    await expect(resolveReviewedPending({ ...f.store, setItem() { throw new Error('quota') } }, f.value, () => owner, fetcher)).rejects.toThrow('quota')
    expect(readReviewedPending(f.store, owner, sessionId)).toEqual(f.value)
    await expect(resolveReviewedPending({ ...f.store, removeItem() {} }, f.value, () => owner, vi.fn().mockResolvedValue(f.response()))).rejects.toThrow('local pending state remains')
    const reordered = Object.fromEntries(Object.entries(f.value.body.report as object).reverse())
    await resolveReviewedPending(f.store, f.value, () => owner, vi.fn().mockResolvedValue(f.response({ payload: reordered })))
    expect(readReviewedPending(f.store, owner, sessionId)).toBeNull(); expect(f.data.size).toBe(1)
  })
})
