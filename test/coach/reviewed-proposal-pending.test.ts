import { describe, expect, it, vi } from 'vitest'
import { readReviewedProposalPending, resolveReviewedProposalPending, saveReviewedProposalPending, sendReviewedProposalPending, type ReviewedProposalPending } from '@/app/lib/coach/reviewed-proposal-pending'
const owner = '11111111-1111-4111-8111-111111111111', program = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333', plan = '44444444-4444-4444-8444-444444444444'
function fixture(operation: 'issue' | 'accept') {
  const data = new Map<string, string>(), store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  const common = { schemaVersion: 1 as const, userId: owner, programId: program }, body = { expectedUserId: owner, requestId: 'original-request' }
  const value: ReviewedProposalPending = operation === 'issue' ? { ...common, operation, body: { ...body, reviewId: 'trusted', registrationId: id } }
    : { ...common, operation, proposalId: id, planVersionId: plan, body }
  const result = operation === 'issue' ? { kind: 'issued', programId: program, proposalId: id, planVersionId: plan, replayed: true,
    request: { requestId: body.requestId, reviewId: 'trusted', registrationId: id } }
    : { kind: 'accepted', requestId: body.requestId, proposalId: id, accepted: { accepted_program_id: program, active_plan_version_id: plan, proposal_status: 'accepted' } }
  return { data, store, value, result, response: () => new Response(JSON.stringify(result)) }
}
describe.each(['issue', 'accept'] as const)('%s proposal recovery', operation => {
  const resolution = (disposition: 'saved' | 'closed') => ({ schemaVersion: 1, userId: owner, programId: program, operation,
    requestId: 'original-request', identity: operation === 'issue' ? { reviewId: 'trusted', registrationId: id } : { proposalId: id, planVersionId: plan },
    disposition, proposalId: disposition === 'saved' || operation === 'accept' ? id : null,
    planVersionId: disposition === 'saved' || operation === 'accept' ? plan : null,
    ...(disposition === 'saved' ? { activePlanVersionId: program } : { resolutionId: id, resolvedAt: '2026-09-28T00:00:00Z' }) })
  it.each(['saved', 'closed'] as const)('resolves %s with exact identity and archives before clearing', async disposition => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    const result = resolution(disposition), fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: 'resolved', resolution: result })))
    expect(await resolveReviewedProposalPending(f.store, f.value, () => owner, fetcher)).toEqual(result)
    expect(fetcher.mock.calls[0][0]).toBe(`/api/coach/reviewed/programs/${program}/resolve`)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedUserId: owner, operation, requestId: 'original-request', identity: result.identity })
    expect(readReviewedProposalPending(f.store, owner, program)).toBeNull()
    expect([...f.data.values()].map(v => JSON.parse(v))[0].request).toEqual(f.value)
  })
  it('preserves pending through unconfirmed resolution, changed account and failed archive', async () => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    for (const result of [{ ...resolution('closed'), requestId: 'wrong-request' }, { ...resolution('saved'), programId: id },
      { ...resolution('closed'), identity: {} }, { ...resolution('closed'), proposalId: program }]) {
      await expect(resolveReviewedProposalPending(f.store, f.value, () => owner,
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: 'resolved', resolution: result }))))).rejects.toThrow('unconfirmed')
    }
    const response = () => new Response(JSON.stringify({ kind: 'resolved', resolution: resolution('closed') }))
    await expect(resolveReviewedProposalPending(f.store, f.value, () => owner, vi.fn().mockRejectedValue(new Error('lost')))).rejects.toThrow('lost')
    let active = owner
    await expect(resolveReviewedProposalPending(f.store, f.value, () => active, vi.fn(async () => { active = program; return response() }))).rejects.toThrow('original account')
    await expect(resolveReviewedProposalPending({ ...f.store, setItem() { throw new Error('quota') } }, f.value, () => owner,
      vi.fn().mockResolvedValue(response()))).rejects.toThrow('quota')
    expect(readReviewedProposalPending(f.store, owner, program)).toEqual(f.value)
  })
  it('recovers an archived saved result after failed removal even if the active plan changes', async () => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    const saved = resolution('saved')
    await expect(resolveReviewedProposalPending({ ...f.store, removeItem() {} }, f.value, () => owner,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: 'resolved', resolution: saved }))))).rejects.toThrow('pending state remains')
    const changed = { ...saved, activePlanVersionId: id }
    expect(await resolveReviewedProposalPending(f.store, f.value, () => owner,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: 'resolved', resolution: changed }))))).toEqual(changed)
    expect(readReviewedProposalPending(f.store, owner, program)).toBeNull()
  })
  it('persists exact request across reload and archives confirmed identity before clearing', async () => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    const reloaded = readReviewedProposalPending(f.store, owner, program)!
    const fetcher = vi.fn().mockResolvedValue(f.response())
    expect(await sendReviewedProposalPending(f.store, reloaded, () => owner, fetcher)).toEqual({ proposalId: id, planVersionId: plan, operation })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(f.value.body)
    expect(readReviewedProposalPending(f.store, owner, program)).toBeNull(); expect(f.data.size).toBe(1)
  })
  it.each([400, 409, 503])('preserves the original on HTTP %i and blocks replacement', async status => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    await expect(sendReviewedProposalPending(f.store, f.value, () => owner, vi.fn().mockResolvedValue(new Response('{}', { status })))).rejects.toThrow('unconfirmed')
    expect(readReviewedProposalPending(f.store, owner, program)).toEqual(f.value)
    const replacement = structuredClone(f.value); replacement.body.requestId = 'replacement-key'
    expect(() => saveReviewedProposalPending(f.store, replacement)).toThrow('previous proposal')
  })
  it('keeps recovery through loss, mismatched success, owner change and archive failure', async () => {
    const f = fixture(operation); saveReviewedProposalPending(f.store, f.value)
    await expect(sendReviewedProposalPending(f.store, f.value, () => owner, vi.fn().mockRejectedValue(new Error('lost')))).rejects.toThrow('lost')
    await expect(sendReviewedProposalPending(f.store, f.value, () => owner, vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...f.result,
      ...(operation === 'issue' ? { programId: id } : { proposalId: program }) }))))).rejects.toThrow()
    let active = owner
    await expect(sendReviewedProposalPending(f.store, f.value, () => active, vi.fn(async () => { active = program; return f.response() }))).rejects.toThrow('original account')
    await expect(sendReviewedProposalPending({ ...f.store, setItem() { throw new Error('quota') } }, f.value, () => owner, vi.fn().mockResolvedValue(f.response()))).rejects.toThrow('quota')
    expect(readReviewedProposalPending(f.store, owner, program)).toEqual(f.value)
  })
  it('does not send when persistence or ownership is unavailable', async () => {
    const f = fixture(operation), fetcher = vi.fn()
    await expect(sendReviewedProposalPending(f.store, f.value, () => owner, fetcher)).rejects.toThrow('changed')
    saveReviewedProposalPending(f.store, f.value)
    await expect(sendReviewedProposalPending(f.store, f.value, () => null, fetcher)).rejects.toThrow('original account')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
