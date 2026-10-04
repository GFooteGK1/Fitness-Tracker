import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'

vi.mock('@/app/lib/coach/supervised-candidate-server', async importOriginal => ({
  ...await importOriginal<typeof import('@/app/lib/coach/supervised-candidate-server')>(), prepareSupervisedCandidate: vi.fn(),
}))
const prepare = vi.mocked(prepareSupervisedCandidate)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function harness() {
  const { plan } = reviewedRollingWeek(), input = effortWorkInput(), recipe = input.registry[0].recipe
  const draft = { candidateId: id(1), enrollmentId: id(2), programId: id(3), basePlanVersionId: id(4),
    historyDays: 28, tzOffset: 300, transition: 'same_week' as const, windowStart: plan.windowStart, sequenceNumber: 1,
    recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules, protocols: recipe.protocols,
      instructions: recipe.instructions, limitations: recipe.limitations }, scheduleId: input.input.context.scheduleId, rationale: 'Review full proposed work.' }
  const draftHash = doseContentHash(draft)
  for (const slot of plan.scheduledSessions) slot.prescription.source.review.contentHash = draftHash
  const reviewPacket = { schemaVersion: 1 as const, reviewMode: 'manual_complete_week' as const, week: plan, baseWeek: plan,
    evidenceSource: { sourceHash: 'a'.repeat(64), revision: 1, historyThrough: '2026-09-29', historyDays: 28 },
    rationale: draft.rationale, changes: [{ kind: 'preserved' as const, summary: 'Work retained.', sessionIds: [plan.scheduledSessions[0].prescription.sessionId] }],
    evidence: [], limitations: ['Unapproved candidate'] }
  const candidate = { candidateId: id(1), enrollmentId: id(2), enrollmentVersion: 1, programId: id(3), userId: id(5),
    reviewerId: id(6), basePlanVersionId: id(4), transition: 'same_week' as const, contentHash: 'b'.repeat(64), sourceHash: 'a'.repeat(64),
    reviewPacket, createdAt: '2026-09-29T20:00:00Z' }
  const privatePacket = { schemaVersion: 2, registrationId: id(1), userId: id(5), source: { contextHash: candidate.sourceHash,
    binding: { scope: { programId: id(3), basePlanVersionId: id(4) } } }, intent: { reviewed_week: plan },
    inputSnapshot: { reviewedWeekTransition: { kind: 'same_week' } },
    sessions: plan.scheduledSessions.map((slot, index) => ({ week_number: 1, session_index: index + 1,
      scheduled_date: slot.scheduledDate, prescription: slot.prescription })) }
  const request = { expectedUserId: id(6), candidateId: id(1), requestId: id(7), decision: 'approve' as const,
    enrollmentId: id(2), contentHash: candidate.contentHash, sourceHash: candidate.sourceHash }
  const receipt = { candidateId: id(1), decisionId: id(8), requestId: id(7), decision: 'approve' as const, reviewerId: id(6),
    enrollmentId: id(2), enrollmentVersion: 1, contentHash: candidate.contentHash, sourceHash: candidate.sourceHash,
    decidedAt: '2026-09-29T20:01:00Z', replayed: false }
  const state = { actor: id(5), enabled: true, saved: false, decided: false, loseSubmission: false, loseDecision: false, readError: false }
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_supervised_candidate') return { data: state.saved ? candidate : null, error: state.readError ? { message: 'unavailable' } : null }
    if (name === 'get_supervised_decision_receipt') return { data: state.decided ? { ...receipt, replayed: true } : null, error: null }
    if (name === 'decide_supervised_candidate') { state.decided = true; if (state.loseDecision) throw Error('response lost'); return { data: receipt, error: null } }
    throw Error('Unexpected owner RPC ' + name)
  })
  const serviceRpc = vi.fn(async (name: string) => {
    if (name === 'submit_supervised_candidate') { state.saved = true; if (state.loseSubmission) throw Error('response lost'); return { data: candidate, error: null } }
    if (name === 'get_approved_supervised_candidate') return { data: { candidate, decision: receipt, privatePacket }, error: null }
    throw Error('Unexpected privileged RPC ' + name)
  })
  const auth = vi.fn(async () => ({ data: { user: { id: state.actor } }, error: null }))
  const db = { auth: { getUser: auth }, rpc } as unknown as SupabaseClient
  const service = createSupervisedReviewService({ enabled: () => state.enabled,
    createServiceClient: () => ({ rpc: serviceRpc }) as unknown as SupabaseClient })
  prepare.mockResolvedValue({ kind: 'prepared_candidate', candidateId: id(1), enrollmentId: id(2), privatePacket,
    reviewPacket, submissionHash: 'c'.repeat(64), persistable: false, numericRuntimeEligible: false } as never)
  return { service, db, draft, candidate, privatePacket, request, receipt, state, rpc, serviceRpc, auth }
}

beforeEach(() => vi.clearAllMocks())

describe('supervised review service boundaries', () => {
  it('keeps new candidate writes disabled without losing read access', async () => {
    const h = harness(); h.state.enabled = false
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'disabled' })
    expect(prepare).not.toHaveBeenCalled(); expect(h.serviceRpc).not.toHaveBeenCalled()
    h.state.saved = true
    expect(await h.service.read(h.db, id(1))).toMatchObject({ kind: 'candidate' })
  })
  it('saves only a prepared owned candidate and never calls a programming issuer', async () => {
    const h = harness()
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'saved', replayed: false })
    expect(h.serviceRpc).toHaveBeenCalledTimes(1)
    expect(h.serviceRpc.mock.calls[0][0]).toBe('submit_supervised_candidate')
  })
  it('recovers an uncertain submission without rebuilding source or resending the mutation', async () => {
    const h = harness(); h.state.loseSubmission = true
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'retry_required' })
    h.state.enabled = false
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'saved', replayed: true })
    expect(prepare).toHaveBeenCalledTimes(1); expect(h.serviceRpc).toHaveBeenCalledTimes(1)
  })
  it('preserves conflicting identities instead of recreating a candidate', async () => {
    const h = harness(); h.state.saved = true
    expect(await h.service.submit(h.db, id(5), { ...h.draft, rationale: 'Changed content' })).toMatchObject({ kind: 'request_conflict' })
    expect(prepare).not.toHaveBeenCalled(); expect(h.serviceRpc).not.toHaveBeenCalled()
  })
  it('preserves a saved submission but withholds its result after an account switch', async () => {
    const h = harness(), original = h.serviceRpc.getMockImplementation()!
    h.serviceRpc.mockImplementation(async name => {
      const result = await original(name); h.state.actor = id(9); return result
    })
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'retry_required' })
    expect(h.state.saved).toBe(true); expect(h.serviceRpc).toHaveBeenCalledTimes(1)
  })
  it('does not treat failed lookup as absent or allow an account switch', async () => {
    const h = harness(); h.state.readError = true
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'retry_required' })
    h.state.actor = id(9)
    expect(await h.service.submit(h.db, id(5), h.draft)).toMatchObject({ kind: 'account_changed' })
    expect(h.serviceRpc).not.toHaveBeenCalled()
  })
  it('passes only exact decision identity to the authenticated RPC', async () => {
    const h = harness(); h.state.actor = id(6)
    expect(await h.service.decide(h.db, h.request)).toMatchObject({ kind: 'decided', receipt: { reviewerId: id(6) } })
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_decision_receipt', 'decide_supervised_candidate'])
    expect(h.serviceRpc).not.toHaveBeenCalled()
  })
  it('recovers a lost decision response while disabled through receipt-only lookup', async () => {
    const h = harness(); h.state.actor = id(6); h.state.loseDecision = true
    expect(await h.service.decide(h.db, h.request)).toMatchObject({ kind: 'retry_required' })
    h.state.enabled = false
    expect(await h.service.decide(h.db, h.request)).toMatchObject({ kind: 'decided', receipt: { replayed: true } })
    expect(h.rpc.mock.calls.filter(c => c[0] === 'decide_supervised_candidate')).toHaveLength(1)
  })
  it('refuses changed decision payload on an existing receipt', async () => {
    const h = harness(); h.state.actor = id(6); h.state.decided = true
    expect(await h.service.decide(h.db, { ...h.request, decision: 'reject' })).toMatchObject({ kind: 'request_conflict' })
  })
  it('does not return private source to a reviewer through the ordinary read', async () => {
    const h = harness(); h.state.saved = true; h.state.actor = id(6)
    const read = await h.service.read(h.db, id(1))
    expect(read.kind).toBe('candidate'); expect(JSON.stringify(read)).not.toContain('privatePacket')
    expect(await h.service.resolveApproved(h.db, id(1))).toMatchObject({ kind: 'unavailable' })
    expect(h.serviceRpc).not.toHaveBeenCalled()
  })
  it('resolves exact approved owner content without enabling issuance', async () => {
    const h = harness(); h.state.saved = true
    expect(await h.service.resolveApproved(h.db, id(1))).toMatchObject({ kind: 'approved_candidate', numericRuntimeEligible: false })
    h.receipt.enrollmentVersion = 2
    expect(await h.service.resolveApproved(h.db, id(1))).toMatchObject({ kind: 'unavailable' })
  })
  it.each(['receipt', 'decision'])('withholds a %s response after the authenticated account changes', async phase => {
    const h = harness(); h.state.actor = id(6); h.state.decided = phase === 'receipt'
    const original = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async name => {
      const result = await original(name)
      if (name === (phase === 'receipt' ? 'get_supervised_decision_receipt' : 'decide_supervised_candidate')) h.state.actor = id(9)
      return result
    })
    expect(await h.service.decide(h.db, h.request)).toMatchObject({ kind: 'retry_required' })
    expect(h.state.decided).toBe(true)
    expect(h.rpc.mock.calls.filter(c => c[0] === 'decide_supervised_candidate')).toHaveLength(phase === 'receipt' ? 0 : 1)
  })
  it('rechecks the write switch after the final asynchronous account check', async () => {
    const h = harness(); h.state.actor = id(6)
    h.auth.mockImplementation(async () => {
      if (h.auth.mock.calls.length === 2) h.state.enabled = false
      return { data: { user: { id: h.state.actor } }, error: null }
    })
    expect(await h.service.decide(h.db, h.request)).toMatchObject({ kind: 'disabled' })
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_decision_receipt'])
  })
  it.each(['program', 'base', 'transition', 'sessions'])('refuses approved private data with mismatched %s', async field => {
    const h = harness(); h.state.saved = true
    if (field === 'program') h.privatePacket.source.binding.scope.programId = id(9)
    if (field === 'base') h.privatePacket.source.binding.scope.basePlanVersionId = id(9)
    if (field === 'transition') h.privatePacket.inputSnapshot.reviewedWeekTransition.kind = 'next_week'
    if (field === 'sessions') h.privatePacket.sessions = []
    expect(await h.service.resolveApproved(h.db, id(1))).toMatchObject({ kind: 'unavailable' })
  })
  it('refuses unexpected source fields returned through the bounded read', async () => {
    const h = harness(); h.state.saved = true
    Object.assign(h.candidate.reviewPacket.week.profileSnapshot, { privateMemory: 'Do not share' })
    expect(await h.service.read(h.db, id(1))).toMatchObject({ kind: 'unavailable' })
  })
})
