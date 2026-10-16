import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSupervisedLifecycleRequest, parseSupervisedLifecycleReceipt, recoverSupervisedLifecycle,
  type SupervisedLifecycleRequest } from '@/app/lib/coach/supervised-lifecycle-recovery'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const operations = ['issue', 'accept', 'set', 'complete'] as const
function fixture(operation: typeof operations[number]) {
  const identity = operation === 'issue' ? { reviewId: id(3), registrationId: id(3) }
    : operation === 'accept' ? { proposalId: id(4), planVersionId: id(5) }
      : operation === 'set' ? { sessionId: id(6), report: { ...reviewedSetReport('bench-work'), schemaVersion: 2, rir: 2.5 } }
        : { sessionId: id(6), completion: reviewedCompletion([id(7)]) }
  const request = parseSupervisedLifecycleRequest({ expectedUserId: id(1), programId: id(2),
    operation, requestId: 'original-request-key', identity })!
  const result = operation === 'issue' ? { proposalId: id(4), programId: id(2), planVersionId: id(5), replayed: true }
    : operation === 'accept' ? { accepted_program_id: id(2), active_plan_version_id: id(5), proposal_status: 'accepted' }
      : operation === 'set' ? { id: id(7), created_at: '2026-09-29T22:00:00Z', replayed: true }
        : { result: { prescribed_session_id: id(6), session_status: 'completed', checkin_id: id(8), workout_id: id(9),
          observation_group_ids: [], occurred_at: '2026-08-04T18:00:00Z', replayed: true },
        receipt: { userId: id(1), requestKey: 'reviewed-completion:original-request-key', entityId: id(9) } }
  const envelope = { schemaVersion: 1, userId: id(1), programId: id(2), operation, requestId: request.requestId,
    identity: structuredClone(identity), disposition: 'saved', result }
  const state = { actor: id(1) }
  const auth = vi.fn(async () => ({ data: { user: { id: state.actor } }, error: null }))
  const rpc = vi.fn(async () => ({ data: envelope as unknown, error: null as null | { code: string } }))
  const db = { auth: { getUser: auth }, rpc } as unknown as SupabaseClient
  return { request, envelope, state, auth, rpc, db }
}

describe('supervised lifecycle receipt-only recovery', () => {
  it.each(operations)('recovers exact %s with one authenticated read and no mutation', async operation => {
    const h = fixture(operation)
    expect(await recoverSupervisedLifecycle(h.db, h.request)).toMatchObject({ kind: 'recovered', receipt: h.envelope })
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('get_supervised_lifecycle_receipt', {
      p_program_id: id(2), p_operation: operation, p_request_id: h.request.requestId, p_identity: h.request.identity })
  })
  it.each(operations)('keeps an absent %s pending without declaring it unsaved or resending', async operation => {
    const h = fixture(operation)
    h.rpc.mockResolvedValue({ data: { ...h.envelope, disposition: 'not_found', result: null }, error: null })
    expect(await recoverSupervisedLifecycle(h.db, h.request)).toMatchObject({ kind: 'unconfirmed', request: h.request })
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects identities, ownership or body echoes that do not match the saved request', () => {
    for (const operation of operations) {
      const h = fixture(operation)
      for (const patch of [{ userId: id(9) }, { programId: id(9) }, { requestId: 'changed-request' },
        { identity: { sessionId: id(9), payload: {} } }, { disposition: 'closed' }, { unknown: 'private source' }]) {
        expect(parseSupervisedLifecycleReceipt({ ...h.envelope, ...patch }, h.request)).toBeNull()
      }
    }
  })
  it('validates actual saved set and completion results and preserves independent RIR', () => {
    const h = fixture('set')
    expect(parseSupervisedLifecycleReceipt(h.envelope, h.request)?.identity).toMatchObject({ report: { rir: 2.5, rpe: { value: 7 } } })
    expect(parseSupervisedLifecycleReceipt({ ...h.envelope, result: { id: id(7), created_at: 'bad', replayed: true } }, h.request)).toBeNull()
    const completed = fixture('complete'), bad = structuredClone(completed.envelope)
    Object.assign(bad.result, { receipt: { userId: id(9), requestKey: 'reviewed-completion:original-request-key', entityId: id(9) } })
    expect(parseSupervisedLifecycleReceipt(bad, completed.request)).toBeNull()
  })
  it('recovers an accepted historical target without claiming it is still the current active plan', () => {
    const h = fixture('accept')
    expect(parseSupervisedLifecycleReceipt(h.envelope, h.request)?.result).toMatchObject({ active_plan_version_id: id(5) })
    expect(parseSupervisedLifecycleReceipt({ ...h.envelope,
      result: { accepted_program_id: id(2), active_plan_version_id: id(10), proposal_status: 'accepted' } }, h.request)).toBeNull()
  })
  it('rejects malformed or excessive requests before accessing the database', async () => {
    const h = fixture('set')
    for (const patch of [{ expectedUserId: 'bad' }, { requestId: ' short ' }, { extra: true },
      { identity: { sessionId: id(6), report: { data: 'x'.repeat(120001) } } },
      { identity: { sessionId: id(6), report: { repetitions: Infinity } } }]) {
      expect(await recoverSupervisedLifecycle(h.db, { ...h.request, ...patch })).toEqual({ kind: 'invalid_request' })
    }
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.auth).not.toHaveBeenCalled()
  })
  it('withholds the previous account receipt if the account changes during lookup', async () => {
    const h = fixture('complete')
    h.rpc.mockImplementation(async () => { h.state.actor = id(9); return { data: h.envelope, error: null } })
    const result = await recoverSupervisedLifecycle(h.db, h.request)
    expect(result).toMatchObject({ kind: 'account_changed', request: h.request })
    expect(result).not.toHaveProperty('receipt')
  })
  it('preserves request conflicts and transport uncertainty without automatic retries', async () => {
    const h = fixture('issue')
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } }).mockRejectedValueOnce(Error('response lost'))
    expect(await recoverSupervisedLifecycle(h.db, h.request)).toMatchObject({ kind: 'request_conflict', request: h.request })
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(await recoverSupervisedLifecycle(h.db, h.request)).toMatchObject({ kind: 'retry_required', request: h.request })
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
  it('detaches the pending request before the first asynchronous call', async () => {
    const h = fixture('set'), original = structuredClone(h.request)
    h.auth.mockImplementationOnce(async () => {
      const identity = (h.request as Extract<SupervisedLifecycleRequest, { operation: 'set' }>).identity
      identity.report.rir = 0
      return { data: { user: { id: id(1) } }, error: null }
    })
    expect(await recoverSupervisedLifecycle(h.db, h.request)).toMatchObject({ kind: 'recovered', request: original })
  })
})
