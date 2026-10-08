import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReviewedHttpHandlers } from '@/app/lib/coach/reviewed-http-server'
import { resolveSupervisedResource } from '@/app/lib/coach/supervised-resource-access'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'

vi.mock('@/app/lib/coach/reviewed-session-state-server', () => ({ fetchReviewedSessionState: vi.fn() }))
vi.mock('@/app/lib/coach/reviewed-proposal-state-server', () => ({ fetchReviewedProposalState: vi.fn(), fetchReviewedProposalIndex: vi.fn() }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner = id(1), program = id(10), resource = id(20), plan = id(21), resultId = id(30)
const envelope = { expectedUserId: owner, requestId: 'original-request-key' }
const req = (body: unknown) => new Request('http://localhost/api/coach/reviewed', { method: 'POST', body: JSON.stringify(body) })
function harness() {
  const state = { actor: owner, pilot: true, enabled: true, global: false, scopeError: false, scopeMismatch: false, active: true,
    receiptResult: null as Record<string, unknown> | null, receiptMismatch: false, receiptError: false, changeActorAfterReceipt: false }
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === 'get_supervised_resource_scope') return { error: state.scopeError ? { code: 'XX000' } : null,
      data: state.pilot ? { schemaVersion: 1, userId: owner, programId: program, resourceKind: args.p_kind,
        resourceId: state.scopeMismatch ? id(99) : args.p_id, planVersionId: plan, currentEnrollmentActive: state.active } : null }
    if (name === 'get_supervised_lifecycle_receipt') {
      if (state.changeActorAfterReceipt) state.actor = id(2)
      return { error: state.receiptError ? { code: '22023' } : null, data: { schemaVersion: 1, userId: owner, programId: args.p_program_id,
        operation: args.p_operation, requestId: args.p_request_id, identity: state.receiptMismatch ? { altered: true } : args.p_identity,
        disposition: state.receiptResult ? 'saved' : 'not_found', result: state.receiptResult } }
    }
    if (name === 'record_reviewed_session_set') return { data: [{ id: resultId, created_at: '2026-09-29T12:00:00Z', replayed: false }], error: null }
    if (name === 'accept_adaptation_proposal') return { data: [{ accepted_program_id: program, active_plan_version_id: plan, proposal_status: 'accepted' }], error: null }
    throw Error('Unexpected mutation: ' + name)
  })
  const db = { rpc, auth: { getUser: async () => ({ data: { user: { id: state.actor } }, error: null }) } } as unknown as SupabaseClient
  const handlers = createReviewedHttpHandlers({ createUserClient: async () => db, enabled: () => state.global, issue: vi.fn(),
    supervised: { enabled: () => state.enabled, resolve: resolveSupervisedResource } })
  return { state, rpc, handlers }
}
beforeEach(() => vi.clearAllMocks())
describe('reviewed HTTP exact supervised integration', () => {
  it('allows one enabled enrolled resource while leaving global numerical programming disabled', async () => {
    const h = harness(), report = { ...reviewedSetReport('work'), schemaVersion: 2, rir: 2.5 }
    expect((await h.handlers.recordSet(req({ ...envelope, report }), resource)).status).toBe(200)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt', 'record_reviewed_session_set'])
    expect(h.rpc.mock.calls[2][1].p_report).toEqual(report)
  })
  it('does not authorize nonpilot writes with the supervised switch', async () => {
    const h = harness(); h.state.pilot = false
    expect((await h.handlers.accept(req(envelope), resource)).status).toBe(409)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope'])
  })
  it('preserves nonpilot global enablement but never falls back after classification failure', async () => {
    const h = harness(); h.state.pilot = false; h.state.global = true
    expect((await h.handlers.accept(req(envelope), resource)).status).toBe(200)
    h.rpc.mockClear(); h.state.scopeError = true
    expect((await h.handlers.accept(req(envelope), resource)).status).toBe(503)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope'])
  })
  it('uses the supervised switch for pilot resources even when global policy is enabled', async () => {
    const h = harness(); h.state.global = true; h.state.enabled = false
    expect((await h.handlers.accept(req(envelope), resource)).status).toBe(409)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'])
  })
  it('recovers acceptance against its original proposal plan while disabled', async () => {
    const h = harness(); h.state.enabled = false; h.state.active = false
    h.state.receiptResult = { accepted_program_id: program, active_plan_version_id: plan, proposal_status: 'accepted' }
    const response = await h.handlers.accept(req(envelope), resource)
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ kind: 'accepted', accepted: h.state.receiptResult })
    expect(h.rpc.mock.calls[1][1].p_identity).toEqual({ proposalId: resource, planVersionId: plan })
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
  it('recovers exact historical set payload before new-write validation', async () => {
    const h = harness(); h.state.enabled = false
    h.state.receiptResult = { id: resultId, created_at: '2026-09-29T12:00:00Z', replayed: true }
    const report = { historicalSchema: true }
    expect((await h.handlers.recordSet(req({ ...envelope, report }), resource)).status).toBe(200)
    expect(h.rpc.mock.calls[1][1].p_identity).toEqual({ sessionId: resource, report })
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
  it('recovers completion and explicit resolution only through the receipt getter while disabled', async () => {
    const h = harness(); h.state.enabled = false
    const completion = reviewedCompletion([resultId])
    h.state.receiptResult = { result: { prescribed_session_id: resource, session_status: 'completed', checkin_id: resultId, workout_id: resultId, replayed: true },
      receipt: { userId: owner, requestKey: `reviewed-completion:${envelope.requestId}`, entityId: resultId } }
    expect((await h.handlers.complete(req({ ...envelope, completion }), resource)).status).toBe(200)
    expect((await h.handlers.resolve(req({ ...envelope, operation: 'complete', payload: completion }), resource)).status).toBe(200)
    expect(h.rpc.mock.calls.every(c => ['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'].includes(c[0]))).toBe(true)
  })
  it('never turns absent disabled recovery into a write-capable resolution or fresh retry', async () => {
    const h = harness(); h.state.enabled = false
    const response = await h.handlers.resolve(req({ ...envelope, operation: 'set', payload: { prior: true } }), resource)
    expect(response.status).toBe(409); expect((await response.json()).kind).toBe('disabled')
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'])
    expect((await h.handlers.resolveProposal(req({ ...envelope, operation: 'accept', identity: { proposalId: resource, planVersionId: plan } }), program)).status).toBe(409)
    expect(h.rpc.mock.calls.every(c => ['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'].includes(c[0]))).toBe(true)
  })
  it('does not invoke an explicit fence for a revoked enrollment even if the dedicated switch is on', async () => {
    const h = harness(); h.state.active = false
    expect((await h.handlers.resolve(req({ ...envelope, operation: 'set', payload: {} }), resource)).status).toBe(409)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'])
  })
  it.each(['scopeMismatch', 'receiptMismatch', 'receiptError', 'changeActorAfterReceipt'] as const)('fails closed on %s without a mutation', async field => {
    const h = harness(); h.state[field] = true
    expect((await h.handlers.accept(req(envelope), resource)).status).toBe(field === 'changeActorAfterReceipt' || field === 'receiptError' ? 409 : 503)
    expect(h.rpc.mock.calls.every(c => ['get_supervised_resource_scope', 'get_supervised_lifecycle_receipt'].includes(c[0]))).toBe(true)
  })
  it('retains owner history but masks write and acceptance flags while disabled or revoked', async () => {
    const h = harness(); h.state.enabled = false
    vi.mocked(fetchReviewedSessionState).mockResolvedValue({ writable: true } as never)
    vi.mocked(fetchReviewedProposalState).mockResolvedValue({ acceptanceAvailable: true } as never)
    expect(await (await h.handlers.readSession(new Request('http://localhost'), resource)).json()).toMatchObject({ kind: 'session', session: { writable: false } })
    expect(await (await h.handlers.readProposal(new Request('http://localhost'), resource)).json()).toMatchObject({ kind: 'proposal', proposal: { acceptanceAvailable: false } })
    h.state.enabled = true; h.state.active = false
    vi.mocked(fetchReviewedSessionState).mockResolvedValue({ writable: true } as never)
    expect(await (await h.handlers.readSession(new Request('http://localhost'), resource)).json()).toMatchObject({ session: { writable: false } })
    h.state.pilot = false
    expect((await h.handlers.readSession(new Request('http://localhost'), resource)).status).toBe(409)
  })
})
