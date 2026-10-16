import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReviewedWeekProposalIssuer } from '../../app/lib/coach/reviewed-proposal-issuer-server'
import type { TrustedReviewedWeekRegistration } from '../../app/lib/coach/reviewed-week-context-server'
import { issueReviewedWeekProposal } from '../../app/lib/coach/reviewed-proposal-service'

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }))
vi.mock('../../app/lib/coach/reviewed-proposal-registration', () => ({ prepareReviewedWeekProposalRegistration: prepare }))
vi.mock('../../app/lib/auth/supabase-server', () => ({ createServiceRoleClient: () => { throw new Error('Disabled composition accessed service credentials') } }))
const owner = '10000000-0000-4000-8000-000000000001'
const request = { reviewId: 'review-1', registrationId: '20000000-0000-4000-8000-000000000001', requestId: 'stable-request-1' }
const saved = { ...request, userId: owner, proposalId: '30000000-0000-4000-8000-000000000001',
  planVersionId: '40000000-0000-4000-8000-000000000001', programId: '50000000-0000-4000-8000-000000000001' }
const prepared = { kind: 'prepared_registration', packet: { userId: owner, registrationId: request.reviewId }, fingerprint: 'fingerprint' }
const issued = { proposalId: saved.proposalId, planVersionId: saved.planVersionId, programId: saved.programId, replayed: false }
function harness(existing: unknown = null) {
  let stored = existing
  const auth = vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null })
  const rpc = vi.fn(async (name: string) => ({ data: name === 'get_reviewed_week_registration' ? stored : issued, error: null as unknown }))
  const register = vi.fn(async () => { stored = saved; return { data: saved, error: null } })
  const createServiceClient = vi.fn(() => ({ rpc: register }) as unknown as SupabaseClient)
  const enabled = vi.fn(() => true)
  const db = { auth: { getUser: auth }, rpc } as unknown as SupabaseClient
  const registry = [{ id: 'review-1', userId: owner }] as TrustedReviewedWeekRegistration[]
  const issue = createReviewedWeekProposalIssuer({ registry, enabled, createServiceClient })
  return { issue, db, auth, rpc, register, createServiceClient, enabled, registry }
}
beforeEach(() => { prepare.mockReset(); prepare.mockResolvedValue(prepared) })

describe('server reviewed proposal issuance', () => {
  it('actual application composition stays disabled before database access', async () => {
    expect(await issueReviewedWeekProposal({} as SupabaseClient, request)).toEqual({ kind: 'disabled' })
    expect(prepare).not.toHaveBeenCalled()
  })
  it('disabled composition performs no reads, preparation or service-client creation', async () => {
    const h = harness(); h.enabled.mockReturnValue(false)
    expect(await h.issue(h.db, request)).toEqual({ kind: 'disabled' })
    expect(h.auth).not.toHaveBeenCalled(); expect(h.createServiceClient).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled()
  })
  it.each([null, {}, { ...request, packet: prepared.packet }, { ...request, registrationId: 'bad' },
    { ...request, requestId: ' short ' }, { ...request, requestId: 'x'.repeat(201) }, { ...request, reviewId: '' }])(
    'rejects malformed or content-bearing request %j', async input => {
      const h = harness(); expect(await h.issue(h.db, input)).toEqual({ kind: 'invalid_request' }); expect(h.auth).not.toHaveBeenCalled()
    })
  it('authenticates before lookup or service authority', async () => {
    const h = harness(); h.auth.mockResolvedValue({ data: { user: null }, error: null })
    expect(await h.issue(h.db, request)).toEqual({ kind: 'unauthenticated' }); expect(h.rpc).not.toHaveBeenCalled()
    expect(h.createServiceClient).not.toHaveBeenCalled()
  })
  it('uses detached server registry, owner source preparation, protected registration and owned issuance', async () => {
    const h = harness(); h.registry[0].id = 'mutated'
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'issued', request, replayed: false, proposalId: saved.proposalId })
    expect(prepare.mock.calls[0][2][0].id).toBe('review-1')
    expect(h.register).toHaveBeenCalledExactlyOnceWith('register_reviewed_week_proposal', {
      p_id: request.registrationId, p_packet: prepared.packet, p_fingerprint: prepared.fingerprint,
    })
    expect(h.rpc).toHaveBeenLastCalledWith('create_registered_reviewed_week_proposal', {
      p_registration_id: request.registrationId, p_idempotency_key: request.requestId,
    })
  })
  it('recovers saved authority without recompilation or service access', async () => {
    const h = harness(saved); prepare.mockRejectedValue(new Error('source changed'))
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'issued' })
    expect(prepare).not.toHaveBeenCalled(); expect(h.createServiceClient).not.toHaveBeenCalled()
  })
  it('does not confuse lookup failure with absence', async () => {
    const h = harness(); h.rpc.mockResolvedValue({ data: null, error: { message: 'transport' } })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
    expect(prepare).not.toHaveBeenCalled(); expect(h.register).not.toHaveBeenCalled()
  })
  it.each([{ ...saved, userId: 'foreign' }, { ...saved, reviewId: 'other' }, { ...saved, registrationId: 'other' },
    { ...saved, proposalId: null }, undefined])('fails closed on mismatched or malformed readback %j', async value => {
    const h = harness(saved); h.rpc.mockResolvedValue({ data: value, error: null })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
    expect(h.rpc).toHaveBeenCalledTimes(1); expect(h.register).not.toHaveBeenCalled()
  })
  it('does not register incomplete source or a changed owner', async () => {
    const h = harness(); prepare.mockResolvedValue({ kind: 'review_required', reasons: ['changed source'] })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'review_required', request })
    prepare.mockResolvedValue(prepared); h.auth.mockResolvedValueOnce({ data: { user: { id: owner } }, error: null })
      .mockResolvedValue({ data: { user: { id: 'other' } }, error: null })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
    expect(h.register).not.toHaveBeenCalled()
  })
  it('retains the original request after registration response loss and recovers without rebuilding', async () => {
    const h = harness(); const register = h.register.getMockImplementation()!
    h.register.mockImplementationOnce(async () => { await register(); throw new Error('lost response') })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'issued', request })
    expect(prepare).toHaveBeenCalledTimes(1); expect(h.register).toHaveBeenCalledTimes(1)
  })
  it('does not resend uncertain issuance within the same invocation', async () => {
    const h = harness(saved); const original = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async name => {
      if (name === 'create_registered_reviewed_week_proposal') throw new Error('lost response')
      return original(name)
    })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
    expect(h.rpc.mock.calls.filter(([name]) => name === 'create_registered_reviewed_week_proposal')).toHaveLength(1)
  })
  it('retains identity on rejected or malformed issuance responses', async () => {
    const h = harness(saved)
    h.rpc.mockResolvedValueOnce({ data: saved, error: null }).mockResolvedValueOnce({ data: { ...issued, proposalId: 'wrong' }, error: null })
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'retry_required', request })
  })
  it('rechecks the activation gate before privileged registration', async () => {
    const h = harness(); h.enabled.mockReturnValueOnce(true).mockReturnValue(false)
    expect(await h.issue(h.db, request)).toEqual({ kind: 'disabled' }); expect(h.createServiceClient).not.toHaveBeenCalled()
  })
  it.each([
    [{ code: '40001', message: 'Reviewed source validity elapsed' }, 'review_required'],
    [{ code: '40001', message: 'Reviewed execution source changed or incomplete' }, 'review_required'],
    [{ code: '55000', message: 'Resolve begun execution before advancing the week' }, 'review_required'],
    [{ code: '22023', message: 'Registration was issued with another request key' }, 'request_conflict'],
    [{ code: '40001', message: 'could not serialize access due to concurrent update' }, 'retry_required'],
    [{ code: '55P03', message: 'lock timeout' }, 'retry_required'],
    [{ code: 'unrecognized', message: 'Reviewed source validity elapsed' }, 'retry_required'],
  ])('distinguishes exact SQL rejections from uncertain/retryable errors %j', async (error, kind) => {
    const h = harness(saved)
    h.rpc.mockResolvedValueOnce({ data: saved, error: null }).mockResolvedValueOnce({ data: null, error })
    expect(await h.issue(h.db, request)).toMatchObject({ kind, request })
  })
})
