import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

vi.mock('@/app/lib/coach/supervised-candidate-server', async original => ({
  ...await original<typeof import('@/app/lib/coach/supervised-candidate-server')>(), prepareSupervisedCandidate: vi.fn(),
}))
const prepare = vi.mocked(prepareSupervisedCandidate)
const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
const [userId, programId, candidateId, enrollmentId, basePlanVersionId, proposalId, planVersionId] = ids
const request = { expectedUserId: userId, programId, candidateId, requestId: 'issue-request-0001' }
function setup() {
  const draft = { candidateId, enrollmentId, programId, basePlanVersionId, historyDays: 28, tzOffset: 300,
    transition: 'next_week', windowStart: '2026-08-10', sequenceNumber: 2, scheduleId: 'base', rationale: 'Reviewed work',
    recipe: { sessions: [], baseSchedule: {}, schedules: [], protocols: [], instructions: [], limitations: [] } }
  const reviewPacket = { week: { scheduledSessions: [{ prescription: { source: { review: { contentHash: doseContentHash(draft) } } } }] } }
  const packet = { userId, registrationId: candidateId, inputSnapshot: { supervisedCandidateDraft: draft }, source: { contextHash: 'a'.repeat(64) } }
  const approved = { kind: 'approved_candidate', candidate: { candidateId, enrollmentId, userId, programId,
    basePlanVersionId, transition: 'next_week', reviewPacket }, privatePacket: packet }
  const saved = { registrationId: candidateId, reviewId: candidateId, userId, programId, proposalId, planVersionId }
  const result = { programId, proposalId, planVersionId, replayed: false }
  const state = { enabled: true, actor: userId, registered: false, issued: false }
  const receipt = () => ({ schemaVersion: 1, userId, programId, operation: 'issue', requestId: request.requestId,
    identity: { reviewId: candidateId, registrationId: candidateId },
    disposition: state.issued ? 'saved' : 'not_found', result: state.issued ? { ...result, replayed: true } : null })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_supervised_lifecycle_receipt') return { data: receipt(), error: null }
    if (name === 'get_reviewed_week_registration') return { data: state.registered ? saved : null, error: null }
    if (name === 'create_registered_reviewed_week_proposal') { state.issued = true; return { data: result, error: null } }
    throw new Error(`Unexpected RPC ${name}`)
  })
  const serviceRpc = vi.fn(async () => { state.registered = true; return { error: null, data: saved } })
  const db = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: state.actor } }, error: null })) }, rpc } as unknown as SupabaseClient
  const resolveApproved = vi.fn(async () => structuredClone(approved) as never)
  const read = vi.fn(async () => ({ kind: 'candidate', candidate: structuredClone(approved.candidate) }) as never)
  prepare.mockImplementation(async () => ({ kind: 'prepared_candidate', privatePacket: structuredClone(packet), reviewPacket: structuredClone(reviewPacket) } as never))
  const issue = createSupervisedWeekIssuer({ enabled: () => state.enabled, review: { read, resolveApproved },
    createServiceClient: () => ({ rpc: serviceRpc }) as unknown as SupabaseClient })
  return { state, issue, db, rpc, serviceRpc, read, resolveApproved, approved, packet, reviewPacket, draft, saved }
}
beforeEach(() => vi.clearAllMocks())

describe('supervised proposal issuer', () => {
  it('reproduces exact approved input then registers, reads back and issues once', async () => {
    const h = setup()
    expect(await h.issue(h.db, request)).toEqual({ kind: 'issued', programId, proposalId, planVersionId, replayed: false, request })
  })

  it('binds registration fingerprint and original request identity without caller content', async () => {
    const h = setup(), result = await h.issue(h.db, request)
    expect(result.kind).toBe('issued')
    expect(prepare).toHaveBeenCalledWith(h.db, h.draft)
    expect(h.serviceRpc).toHaveBeenCalledExactlyOnceWith('register_reviewed_week_proposal', {
      p_id: candidateId, p_packet: h.packet, p_fingerprint: doseContentHash(h.packet),
    })
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_lifecycle_receipt', 'get_reviewed_week_registration',
      'get_reviewed_week_registration', 'create_registered_reviewed_week_proposal'])
    expect(await h.issue(h.db, { ...request, packet: h.packet })).toEqual({ kind: 'invalid_request' })
  })

  it('recovers committed issuance while disabled without touching current source or mutation', async () => {
    const h = setup(); h.state.enabled = false; h.state.issued = true
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'recovered', request, receipt: { result: { proposalId, replayed: true } } })
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_lifecycle_receipt'])
    expect(prepare).not.toHaveBeenCalled(); expect(h.serviceRpc).not.toHaveBeenCalled()
  })

  it('does not issue when disabled with an unconfirmed receipt', async () => {
    const h = setup(); h.state.enabled = false
    expect(await h.issue(h.db, request)).toEqual({ kind: 'disabled', request })
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })

  it('uses existing owned registration without reconstructing a changed source', async () => {
    const h = setup(); h.state.registered = true
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'issued', proposalId })
    expect(h.resolveApproved).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(h.serviceRpc).not.toHaveBeenCalled()
  })

  it.each(['missing_draft', 'tampered_draft', 'wrong_program', 'changed_private', 'changed_review'])('requires new review for %s', async scenario => {
    const h = setup()
    if (scenario === 'missing_draft') delete (h.packet.inputSnapshot as Partial<typeof h.packet.inputSnapshot>).supervisedCandidateDraft
    if (scenario === 'tampered_draft') h.draft.rationale = 'Different rationale'
    if (scenario === 'wrong_program') h.approved.candidate.programId = ids[6]
    if (scenario === 'changed_private') prepare.mockResolvedValue({ kind: 'prepared_candidate', privatePacket: { ...h.packet, source: {} }, reviewPacket: h.reviewPacket } as never)
    if (scenario === 'changed_review') prepare.mockResolvedValue({ kind: 'prepared_candidate', privatePacket: h.packet, reviewPacket: { ...h.reviewPacket, extra: true } } as never)
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'review_required', request })
    expect(h.serviceRpc).not.toHaveBeenCalled()
    expect(h.rpc.mock.calls.some(c => c[0] === 'create_registered_reviewed_week_proposal')).toBe(false)
  })

  it('preserves identity after registration response loss and recovers on explicit retry', async () => {
    const h = setup()
    h.serviceRpc.mockImplementationOnce(async () => { h.state.registered = true; throw new Error('response lost') })
    expect(await h.issue(h.db, request)).toEqual({ kind: 'retry_required', request })
    expect(h.state.issued).toBe(false)
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'issued', request })
    expect(h.serviceRpc).toHaveBeenCalledTimes(1)
  })

  it('never automatically resends after issue response loss; next call reads original receipt', async () => {
    const h = setup(); h.state.registered = true
    const original = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async name => { if (name === 'create_registered_reviewed_week_proposal') { h.state.issued = true; throw new Error('lost') } return original(name) })
    expect(await h.issue(h.db, request)).toEqual({ kind: 'retry_required', request })
    h.state.enabled = false
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'recovered', request })
    expect(h.rpc.mock.calls.filter(c => c[0] === 'create_registered_reviewed_week_proposal')).toHaveLength(1)
  })

  it('withholds results after account switch during issue', async () => {
    const h = setup(); h.state.registered = true
    const original = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async name => { const r = await original(name); if (name === 'create_registered_reviewed_week_proposal') h.state.actor = ids[6]; return r })
    expect(await h.issue(h.db, request)).toEqual({ kind: 'account_changed', request })
  })

  it('stops when enablement changes during source preparation', async () => {
    const h = setup(), original = prepare.getMockImplementation()!
    prepare.mockImplementation(async (...args) => { const r = await original(...args); h.state.enabled = false; return r })
    expect(await h.issue(h.db, request)).toEqual({ kind: 'disabled', request })
    expect(h.serviceRpc).not.toHaveBeenCalled()
  })

  it('does not treat unavailable recovery as absence', async () => {
    const h = setup(); h.rpc.mockRejectedValueOnce(new Error('network unavailable'))
    expect(await h.issue(h.db, request)).toEqual({ kind: 'retry_required', request })
    expect(h.rpc).toHaveBeenCalledTimes(1); expect(h.resolveApproved).not.toHaveBeenCalled()
  })

  it('refuses cross-program registration readback', async () => {
    const h = setup(); h.state.registered = true; h.saved.programId = ids[6]
    expect(await h.issue(h.db, request)).toEqual({ kind: 'retry_required', request })
    expect(h.state.issued).toBe(false)
  })

  it('does not issue a legacy nonpilot registration through supervised enablement', async () => {
    const h = setup(); h.state.registered = true
    h.read.mockResolvedValue({ kind: 'not_found' } as never)
    expect(await h.issue(h.db, request)).toMatchObject({ kind: 'review_required', request })
    expect(h.state.issued).toBe(false)
    expect(h.serviceRpc).not.toHaveBeenCalled()
  })

  it('preserves identity when supervised lineage read is unavailable', async () => {
    const h = setup(); h.state.registered = true
    h.read.mockResolvedValue({ kind: 'unavailable' } as never)
    expect(await h.issue(h.db, request)).toEqual({ kind: 'retry_required', request })
    expect(h.state.issued).toBe(false)
  })
})
