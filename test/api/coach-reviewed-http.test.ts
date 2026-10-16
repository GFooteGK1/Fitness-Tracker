import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReviewedHttpHandlers } from '@/app/lib/coach/reviewed-http-server'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'

const owner = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222abcdef'
const resultId = '33333333-3333-4333-8333-333333333333'
const envelope = { expectedUserId: owner, requestId: 'stable-request-id' }
const req = (body: unknown) => new Request('http://localhost/api/coach/reviewed', { method: 'POST', body: JSON.stringify(body) })
function harness() {
  const rpc = vi.fn(), auth = vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null })
  const db = { rpc, auth: { getUser: auth } } as unknown as SupabaseClient
  const issue = vi.fn().mockResolvedValue({ kind: 'issued' })
  const enabled = vi.fn(() => true)
  return { ...createReviewedHttpHandlers({ createUserClient: async () => db, enabled, issue }), rpc, auth, issue, enabled }
}
describe('reviewed authenticated HTTP boundary', () => {
  it.each(['propose', 'accept', 'recordSet', 'complete', 'resolve', 'resolveProposal'] as const)('%s authenticates and fails closed while disabled', async name => {
    const h = harness(); h.auth.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await h[name](req(envelope), id)).status).toBe(401)
    h.enabled.mockReturnValue(false)
    const disabled = await h[name](req(envelope), id)
    expect(disabled.status).toBe(409); expect(disabled.headers.get('cache-control')).toBe('private, no-store')
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.issue).not.toHaveBeenCalled()
  })
  it('rejects forged extra content, account mismatch and malformed request keys before mutation', async () => {
    const h = harness()
    expect((await h.accept(req({ ...envelope, packet: {} }), id)).status).toBe(400)
    expect((await h.accept(req({ ...envelope, expectedUserId: 'other' }), id)).status).toBe(409)
    expect((await h.accept(req({ ...envelope, requestId: ' short ' }), id)).status).toBe(400)
    expect((await h.accept(req(envelope), 'invalid')).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON, nonobjects and oversized bodies', async () => {
    const h = harness()
    expect((await h.accept(new Request('http://localhost', { method: 'POST', body: '{' }), id)).status).toBe(400)
    expect((await h.accept(req([]), id)).status).toBe(400)
    expect((await h.accept(req({ note: 'x'.repeat(120001) }), id)).status).toBe(413)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('forwards only IDs to trusted proposal issuance', async () => {
    const h = harness(), body = { ...envelope, reviewId: 'trusted-review', registrationId: id }
    const response = await h.propose(req(body))
    expect(response.status).toBe(200)
    expect(h.issue.mock.calls[0][1]).toEqual({ reviewId: body.reviewId, registrationId: id, requestId: body.requestId })
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it.each([['retry_required', 503], ['review_required', 409], ['request_conflict', 409], ['invalid_request', 400]])(
    'preserves issuer %s result', async (kind, status) => {
      const h = harness(); h.issue.mockResolvedValue({ kind })
      const response = await h.propose(req({ ...envelope, reviewId: 'review', registrationId: id }))
      expect(response.status).toBe(status); expect((await response.json()).kind).toBe(kind)
    })
  it('preserves each reported actual without copying a prescription target', async () => {
    const h = harness(), report = { ...reviewedSetReport('bench'), repetitions: null, rpe: null, restAfterSeconds: null }
    h.rpc.mockResolvedValue({ data: [{ id: resultId, created_at: '2026-09-28T00:00:00Z', replayed: false }], error: null })
    expect((await h.recordSet(req({ ...envelope, report }), id)).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('record_reviewed_session_set', { p_session_id: id, p_request_id: envelope.requestId, p_report: report })
  })
  it('rejects invalid actuals before RPC', async () => {
    const h = harness()
    expect((await h.recordSet(req({ ...envelope, report: { ...reviewedSetReport('bench'), rpe: { value: 99, scale: 'rir_based' } } }), id)).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('forwards the exact completion manifest without current-state preflight', async () => {
    const h = harness(), completion = reviewedCompletion([resultId])
    const result = { prescribed_session_id: id, session_status: 'completed', checkin_id: resultId, workout_id: resultId, replayed: true }
    const receipt = { userId: owner, requestKey: `reviewed-completion:${envelope.requestId}`, entityId: resultId }
    h.rpc.mockResolvedValue({ data: { result, receipt }, error: null })
    const response = await h.complete(req({ ...envelope, completion }), id.toUpperCase())
    expect(response.status).toBe(200); expect((await response.json()).receipt).toEqual(receipt)
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('complete_reviewed_session', { p_session_id: id, p_request_id: envelope.requestId, p_request: completion })
  })
  it('rejects a legacy completion or extra completion fields before RPC', async () => {
    const h = harness()
    expect((await h.complete(req({ ...envelope, completion: { ...reviewedCompletion(), contractVersion: 2 } }), id)).status).toBe(400)
    expect((await h.complete(req({ ...envelope, completion: { ...reviewedCompletion(), ignored: true } }), id)).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('returns confirmed acceptance using the actual SQL return columns without a fragile context refresh', async () => {
    const h = harness(), row = { accepted_program_id: resultId, active_plan_version_id: resultId, proposal_status: 'accepted' }
    h.rpc.mockResolvedValue({ data: [row], error: null })
    const response = await h.accept(req(envelope), id)
    expect(response.status).toBe(200); expect((await response.json()).accepted).toEqual(row)
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('accept_adaptation_proposal', { p_proposal_id: id, p_idempotency_key: envelope.requestId })
  })
  it.each(['40001', '55000', '22023', '23505', 'P0002', '55P03'])('preserves identity on SQL %s without blind resend', async code => {
    const h = harness(); h.rpc.mockResolvedValue({ data: null, error: { code } })
    const response = await h.accept(req(envelope), id)
    expect(response.status).toBe(code === 'P0002' ? 404 : code === '55P03' ? 503 : 409)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await response.json())).not.toContain('new request')
  })
  it('treats thrown or malformed success responses as uncertain and never resends', async () => {
    const h = harness(); h.rpc.mockRejectedValueOnce(new Error('response lost'))
    expect((await h.accept(req(envelope), id)).status).toBe(503)
    h.rpc.mockResolvedValueOnce({ data: [{ program_id: resultId, plan_version_id: resultId }], error: null })
    expect((await h.accept(req(envelope), id)).status).toBe(503)
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
  it('resolves an invalid original payload without validating it as a new save', async () => {
    const h = harness(), payload = { invalid: true }, body = { ...envelope, operation: 'set', payload }
    const resolution = { schemaVersion: 1, userId: owner, sessionId: id, operation: 'set', requestId: envelope.requestId,
      payload, disposition: 'no_write', resolutionId: resultId, resolvedAt: '2026-09-28T00:00:00Z' }
    h.rpc.mockResolvedValue({ data: resolution, error: null })
    const response = await h.resolve(req(body), id.toUpperCase())
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ kind: 'resolved', resolution })
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('resolve_reviewed_session_request', {
      p_session_id: id, p_request_id: envelope.requestId, p_operation: 'set', p_payload: payload,
    })
    h.rpc.mockResolvedValue({ data: { ...resolution, payload: { different: true } }, error: null })
    expect((await h.resolve(req(body), id)).status).toBe(503)
  })
  it('rejects resolution account changes, unknown operations, invalid objects and extra keys', async () => {
    const h = harness(), body = { ...envelope, operation: 'set', payload: {} }
    for (const bad of [{ ...body, operation: 'accept' }, { ...body, payload: null }, { ...body, reset: true }]) {
      expect((await h.resolve(req(bad), id)).status).toBe(400)
    }
    expect((await h.resolve(req({ ...body, expectedUserId: resultId }), id)).status).toBe(409)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it.each(['issue', 'accept'] as const)('binds %s proposal resolution to the exact owned identity', async operation => {
    const h = harness(), identity = operation === 'issue' ? { reviewId: 'trusted', registrationId: resultId } : { proposalId: resultId, planVersionId: resultId }
    const body = { ...envelope, operation, identity }
    const resolution = { schemaVersion: 1, userId: owner, programId: id, operation, requestId: envelope.requestId, identity,
      disposition: 'saved', proposalId: resultId, planVersionId: resultId, activePlanVersionId: id }
    h.rpc.mockResolvedValue({ data: resolution, error: null })
    const response = await h.resolveProposal(req(body), id.toUpperCase())
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ kind: 'resolved', resolution })
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('resolve_reviewed_proposal_request', {
      p_program_id: id, p_request_id: envelope.requestId, p_operation: operation, p_identity: identity,
    })
    h.rpc.mockResolvedValue({ data: { ...resolution, requestId: 'other-request' }, error: null })
    expect((await h.resolveProposal(req(body), id)).status).toBe(503)
    for (const bad of [{ ...body, identity: { ...identity, packet: {} } }, { ...body, operation: 'delete' }, { ...body, identity: null }]) {
      expect((await h.resolveProposal(req(bad), id)).status).toBe(400)
    }
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
})
