import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedReviewHttp } from '@/app/lib/coach/supervised-review-http'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { isSupervisedProgrammingEnabled } from '@/app/lib/coach/supervised-programming-capability'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const req = (body: unknown) => new Request('http://localhost/api/coach/supervised', { method: 'POST', body: JSON.stringify(body) })
function harness() {
  const state = { actor: id(1), enabled: false, response: null as unknown, changeActor: false }
  const rpc = vi.fn(async (_name: string, _args: unknown) => { void _name; void _args; if (state.changeActor) state.actor = id(3); return { data: state.response, error: null } })
  const auth = vi.fn(async () => ({ data: { user: { id: state.actor } }, error: null }))
  const db = { rpc, auth: { getUser: auth } } as unknown as SupabaseClient
  const options = { enabled: () => state.enabled, createServiceClient: vi.fn(() => { throw Error('No privileged calls expected') }) }
  const review = createSupervisedReviewService(options)
  const draft = vi.fn().mockResolvedValue({ kind: 'disabled' })
  const handlers = createSupervisedReviewHttp({ createUserClient: async () => db, review, enabled: options.enabled,
    draft, issue: createSupervisedWeekIssuer({ ...options, review }) })
  return { state, rpc, auth, draft, handlers, service: options.createServiceClient }
}
function decision() { return { candidateId: id(10), decisionId: id(11), requestId: id(12), decision: 'approve', reviewerId: id(1),
  enrollmentId: id(13), enrollmentVersion: 1, contentHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), decidedAt: '2026-09-29T20:00:00Z', replayed: true } }
afterEach(() => vi.unstubAllEnvs())
describe('supervised runtime HTTP integration', () => {
  it('defaults off and never changes the global initial-dose policy', () => {
    vi.stubEnv('COACH_SUPERVISED_PROGRAMMING_ENABLED', '')
    expect(isSupervisedProgrammingEnabled()).toBe(false)
    vi.stubEnv('COACH_SUPERVISED_PROGRAMMING_ENABLED', 'TRUE')
    expect(isSupervisedProgrammingEnabled()).toBe(false)
    vi.stubEnv('COACH_SUPERVISED_PROGRAMMING_ENABLED', 'true')
    expect(isSupervisedProgrammingEnabled()).toBe(true)
    expect(personalizedCoachingCapabilities().initialDosePolicy).toBe(false)
  })
  it('returns independent writesEnabled beside the strict read-only page while disabled', async () => {
    const h = harness(); h.state.response = { schemaVersion: 1, actorId: id(1), programs: [], nextAfterProgramId: null }
    const response = await h.handlers.listPrograms(new Request('http://localhost/api/coach/supervised/programs?limit=1'))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ kind: 'programs', page: h.state.response, writesEnabled: false })
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('list_supervised_programs', { p_after_program_id: null, p_limit: 1 })
    expect(h.service).not.toHaveBeenCalled()
  })
  it.each(['limit=51', 'limit=0', 'limit=1&limit=2', 'source=private', 'afterProgramId=invalid'])('rejects malformed/extra discovery query %s', async query => {
    const h = harness()
    expect((await h.handlers.listPrograms(new Request(`http://localhost/api/coach/supervised/programs?${query}`))).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('validates the draft envelope and takes the program only from the route', async () => {
    const h = harness()
    expect((await h.handlers.draft(req({ expectedUserId: id(1), transition: 'next_week', programId: id(99) }), id(10))).status).toBe(400)
    expect(h.draft).not.toHaveBeenCalled()
    expect((await h.handlers.draft(req({ expectedUserId: id(1), transition: 'next_week' }), id(10))).status).toBe(409)
    expect(h.draft.mock.calls[0][1]).toEqual({ expectedUserId: id(1), programId: id(10), transition: 'next_week' })
  })
  it('uses only the decision receipt getter when verifying and never decides after an absent result', async () => {
    const h = harness(); h.state.response = decision()
    const response = await h.handlers.readDecision(id(12))
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ kind: 'decided', receipt: decision() })
    h.state.response = null
    expect((await h.handlers.readDecision(id(12))).status).toBe(404)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_decision_receipt', 'get_supervised_decision_receipt'])
    expect(h.service).not.toHaveBeenCalled()
  })
  it.each(['reviewerId', 'requestId', 'replayed'] as const)('rejects a mismatched decision receipt %s', async field => {
    const h = harness(); h.state.response = { ...decision(), [field]: field === 'replayed' ? false : id(99) }
    expect((await h.handlers.readDecision(id(12))).status).toBe(503)
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('rechecks the actor after decision recovery', async () => {
    const h = harness(); h.state.response = decision(); h.state.changeActor = true
    expect((await h.handlers.readDecision(id(12))).status).toBe(409)
  })
  it('uses the real issuer to recover disabled issue results without registering or mutating', async () => {
    const h = harness(), input = { expectedUserId: id(1), programId: id(10), candidateId: id(20), requestId: 'original-issue-key' }
    h.state.response = { schemaVersion: 1, userId: id(1), programId: id(10), operation: 'issue', requestId: input.requestId,
      identity: { reviewId: id(20), registrationId: id(20) }, disposition: 'saved', result: { proposalId: id(30), planVersionId: id(31), programId: id(10), replayed: true } }
    expect((await h.handlers.issue(req(input))).status).toBe(200)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['get_supervised_lifecycle_receipt'])
    expect(h.service).not.toHaveBeenCalled()
    expect((await h.handlers.issue(req({ ...input, approved: true }))).status).toBe(400)
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
})
