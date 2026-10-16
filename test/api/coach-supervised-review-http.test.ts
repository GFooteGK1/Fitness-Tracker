import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedReviewHttp } from '@/app/lib/coach/supervised-review-http'
import type { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const req = (value: unknown) => new Request('http://localhost/api/coach/supervised', { method: 'POST', body: JSON.stringify(value) })
function harness() {
  const auth = vi.fn().mockResolvedValue({ data: { user: { id: id(1) } }, error: null })
  const rpc = vi.fn(), db = { auth: { getUser: auth }, rpc } as unknown as SupabaseClient
  const read = vi.fn().mockResolvedValue({ kind: 'candidate', candidate: { candidateId: id(2) } })
  const submit = vi.fn().mockResolvedValue({ kind: 'disabled' }), decide = vi.fn().mockResolvedValue({ kind: 'disabled' })
  const review = { read, submit, decide } as unknown as ReturnType<typeof createSupervisedReviewService>
  return { handlers: createSupervisedReviewHttp({ createUserClient: async () => db, review }), auth, rpc, db, read, submit, decide }
}
describe('supervised review HTTP factory', () => {
  it.each(['submit', 'decide', 'recover'] as const)('%s authenticates before inspecting or forwarding a body', async operation => {
    const h = harness(); h.auth.mockResolvedValue({ data: { user: null }, error: null })
    expect((await h.handlers[operation](req({ expectedUserId: id(1) }))).status).toBe(401)
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(h.decide).not.toHaveBeenCalled()
  })
  it('returns bounded candidate reads with private no-store caching', async () => {
    const h = harness(); h.read.mockResolvedValue({ kind: 'candidate', candidate: { candidateId: id(2) }, privatePacket: { secret: 'hidden' } })
    const response = await h.handlers.readCandidate(id(2))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ kind: 'candidate', candidate: { candidateId: id(2) } })
    expect(h.handlers).not.toHaveProperty('resolveApproved')
  })
  it('rejects a changed expected account and extra submission authority fields', async () => {
    const h = harness()
    expect((await h.handlers.submit(req({ expectedUserId: id(3), draft: {} }))).status).toBe(409)
    expect((await h.handlers.submit(req({ expectedUserId: id(1), draft: {}, approved: true }))).status).toBe(400)
    expect(h.submit).not.toHaveBeenCalled()
  })
  it('forwards the proposed draft to the owned service and preserves its disabled result', async () => {
    const h = harness(), draft = { candidateId: id(2) }
    expect((await h.handlers.submit(req({ expectedUserId: id(1), draft }))).status).toBe(409)
    expect(h.submit).toHaveBeenCalledExactlyOnceWith(h.db, id(1), draft)
  })
  it('forwards authenticated review decisions without granting reviewer identity itself', async () => {
    const h = harness(), decision = { expectedUserId: id(1), candidateId: id(2), decision: 'approve' }
    h.decide.mockResolvedValue({ kind: 'decided', receipt: { requestId: id(3) } })
    expect((await h.handlers.decide(req(decision))).status).toBe(200)
    expect(h.decide).toHaveBeenCalledExactlyOnceWith(h.db, decision)
  })
  it('preserves uncertain submission identity and does not retry on service failure', async () => {
    const h = harness(), identity = { candidateId: id(2), draftHash: 'a'.repeat(64) }
    h.submit.mockResolvedValue({ kind: 'retry_required', identity, privatePacket: { forbidden: true } })
    const response = await h.handlers.submit(req({ expectedUserId: id(1), draft: {} }))
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ kind: 'retry_required', identity })
    expect(h.submit).toHaveBeenCalledTimes(1)
  })
  it('keeps recovery available without calling a disabled writer or mutating resolver', async () => {
    const h = harness(), identity = { reviewId: id(2), registrationId: id(2) }
    const request = { expectedUserId: id(1), programId: id(3), operation: 'issue', requestId: 'original-key', identity }
    h.rpc.mockResolvedValue({ data: { schemaVersion: 1, userId: id(1), programId: id(3), operation: 'issue',
      requestId: request.requestId, identity, disposition: 'not_found', result: null }, error: null })
    const response = await h.handlers.recover(req(request))
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ kind: 'unconfirmed', request })
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc.mock.calls[0][0]).toBe('get_supervised_lifecycle_receipt')
    expect(h.submit).not.toHaveBeenCalled(); expect(h.decide).not.toHaveBeenCalled()
  })
  it('rejects malformed and oversized request bodies before service calls', async () => {
    const h = harness()
    expect((await h.handlers.submit(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400)
    expect((await h.handlers.submit(req([]))).status).toBe(400)
    expect((await h.handlers.submit(req({ padding: 'x'.repeat(500001) }))).status).toBe(413)
    expect(h.submit).not.toHaveBeenCalled()
  })
  it('returns a generic uncertain result without leaking thrown database details', async () => {
    const h = harness(); h.read.mockRejectedValue(Error('private database detail'))
    const response = await h.handlers.readCandidate(id(2))
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('private database detail')
  })
})
