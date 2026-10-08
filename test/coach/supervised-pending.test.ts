import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performSupervisedPending, readSupervisedPending, saveSupervisedPending, type SupervisedPending } from '@/app/lib/coach/supervised-pending'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture(operation: SupervisedPending['operation']) {
  const userId = id(1), programId = id(2), candidateId = id(3), basePlanVersionId = id(4), enrollmentId = id(5), requestId = id(6)
  const week = reviewedRollingWeek().plan, seed = seedSupervisedWeek(week, 'same_week')!
  const draft = { ...seed, candidateId, enrollmentId, programId, basePlanVersionId, historyDays: 90, tzOffset: 300, rationale: 'Proposed work for review.' }
  week.scheduledSessions.forEach(s => { s.prescription.source.review.contentHash = doseContentHash(draft) })
  const candidate = { candidateId, enrollmentId, enrollmentVersion: 1, userId, programId, reviewerId: userId,
    basePlanVersionId, transition: 'same_week', contentHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), createdAt: '2026-09-29T12:00:00Z',
    reviewPacket: { schemaVersion: 1, reviewMode: 'manual_complete_week', week, baseWeek: reviewedRollingWeek().plan, rationale: draft.rationale,
      changes: [{ kind: 'preserved', sessionIds: [week.scheduledSessions[0].prescription.sessionId], summary: 'Retained work' }],
      evidence: [], evidenceSource: { sourceHash: 'b'.repeat(64), revision: 1, historyDays: 90, historyThrough: '2026-09-29' }, limitations: ['No athlete evidence in test.'] } }
  const decision = { expectedUserId: userId, candidateId, requestId, decision: 'approve' as const, enrollmentId, contentHash: candidate.contentHash, sourceHash: candidate.sourceHash }
  const receipt = { candidateId, requestId, decisionId: id(7), reviewerId: userId, enrollmentId, enrollmentVersion: 1,
    contentHash: candidate.contentHash, sourceHash: candidate.sourceHash, decision: 'approve', decidedAt: '2026-09-29T13:00:00Z', replayed: false }
  const issue = { expectedUserId: userId, programId, candidateId, requestId }
  const pending = { schemaVersion: 1, userId, programId, operation, body: operation === 'submit' ? { expectedUserId: userId, draft }
    : operation === 'decide' ? decision : issue } as SupervisedPending
  const issueResult = { proposalId: id(8), programId, planVersionId: id(9), replayed: true }
  const recovered = { schemaVersion: 1, userId, programId, operation: 'issue', requestId,
    identity: { reviewId: candidateId, registrationId: candidateId }, disposition: 'saved', result: issueResult }
  const data = new Map<string, string>(), store = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  saveSupervisedPending(store, pending)
  const reply = (mode: 'send' | 'recover') => operation === 'submit' ? { kind: mode === 'send' ? 'saved' : 'candidate', candidate }
    : operation === 'decide' ? { kind: 'decided', receipt } : mode === 'send' ? { kind: 'issued', request: issue, ...issueResult }
      : { kind: 'recovered', receipt: recovered }
  return { userId, programId, pending, data, store, candidate, receipt, recovered, reply }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())
describe('supervised browser pending requests', () => {
  const closure = (pending: SupervisedPending) => ({ schemaVersion: 1, request: pending, disposition: 'no_write',
    resolutionId: id(40), resolvedAt: '2026-10-03T13:50:00Z' })
  it.each(['submit', 'decide', 'issue'] as const)('archives verified %s no-write closure without sending the original mutation', async operation => {
    const h = fixture(operation), resolution = closure(h.pending)
    const fetcher = vi.fn(async () => Response.json({ kind: 'resolved', resolution }))
    const result = await performSupervisedPending(h.store, h.pending, () => h.userId, 'resolve', fetcher)
    expect(result.disposition).toBe('no_write'); expect(readSupervisedPending(h.store,h.userId,h.programId)).toBeNull()
    expect((fetcher.mock.calls[0] as unknown as [string,RequestInit])[0]).toBe('/api/coach/supervised/resolve')
    const [,options] = fetcher.mock.calls[0] as unknown as [string,RequestInit]
    expect(JSON.parse(options.body as string)).toEqual({ expectedUserId: h.userId, pending: h.pending })
    expect([...h.data.values()].some(v => JSON.parse(v).confirmation.resolutionId === id(40))).toBe(true)
  })
  it.each(['submit', 'decide', 'issue'] as const)('a saved %s resolution uses the original saved-result validator', async operation => {
    const h = fixture(operation), result = h.reply('send')
    const resolved = { schemaVersion: 1, request: h.pending, disposition: 'saved', result }
    expect((await performSupervisedPending(h.store,h.pending,() => h.userId,'resolve',async () => Response.json({ kind: 'resolved', resolution: resolved }))).disposition).toBe('saved')
  })
  it('recovers a lost closure response through the pure getter, preserving the same request', async () => {
    const h = fixture('submit'), resolution = closure(h.pending)
    await expect(performSupervisedPending(h.store,h.pending,() => h.userId,'resolve',async () => { throw new Error('lost closure response') })).rejects.toThrow('lost closure')
    expect(readSupervisedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    const fetcher = vi.fn(async () => Response.json({ kind:'resolved',resolution }))
    await performSupervisedPending(h.store,h.pending,() => h.userId,'resolution',fetcher)
    expect((fetcher.mock.calls[0] as unknown as [string,RequestInit])[0]).toBe('/api/coach/supervised/resolution')
    expect(readSupervisedPending(h.store,h.userId,h.programId)).toBeNull()
  })
  it.each(['changed', 'missing', 'invalid', 'extra'] as const)('keeps pending after %s closure proof', async reason => {
    const h = fixture('decide'), resolution: Record<string,unknown> = closure(h.pending)
    if (reason === 'changed') resolution.request = { ...h.pending, programId: id(20) }
    if (reason === 'missing') { resolution.disposition = 'not_found'; delete resolution.resolutionId; delete resolution.resolvedAt }
    if (reason === 'invalid') resolution.resolutionId = 'unknown'
    if (reason === 'extra') resolution.approved = true
    await expect(performSupervisedPending(h.store,h.pending,() => h.userId,'resolution',async () => Response.json({ kind:'resolved',resolution }))).rejects.toThrow()
    expect(readSupervisedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
  })
  it('keeps pending when a closure archive cannot be written; removal retry retains the same receipt', async () => {
    const h = fixture('issue'), resolution = closure(h.pending), write = h.store.setItem, remove = h.store.removeItem
    const fetcher = async () => Response.json({ kind:'resolved',resolution })
    h.store.setItem = () => { throw new Error('quota') }
    await expect(performSupervisedPending(h.store,h.pending,() => h.userId,'resolve',fetcher)).rejects.toThrow('quota')
    expect(readSupervisedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    h.store.setItem = write; h.store.removeItem = () => undefined
    await expect(performSupervisedPending(h.store,h.pending,() => h.userId,'resolution',fetcher)).rejects.toThrow(/local pending/)
    h.store.removeItem = remove
    await performSupervisedPending(h.store,h.pending,() => h.userId,'resolution',fetcher)
    expect(readSupervisedPending(h.store,h.userId,h.programId)).toBeNull()
  })
  it.each(['submit', 'decide', 'issue'] as const)('archives exact %s then clears only confirmed pending work', async operation => {
    const h = fixture(operation), fetcher = vi.fn(async () => Response.json(h.reply('send')))
    const result = await performSupervisedPending(h.store, h.pending, () => h.userId, 'send', fetcher)
    expect(result.operation).toBe(operation); expect(fetcher).toHaveBeenCalledTimes(1)
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toBeNull()
    expect([...h.data.keys()].some(k => k.startsWith('supervised-receipt:'))).toBe(true)
  })
  it.each(['submit', 'decide', 'issue'] as const)('recovers %s with read-only HTTP semantics', async operation => {
    const h = fixture(operation), fetcher = vi.fn(async () => Response.json(h.reply('recover')))
    await performSupervisedPending(h.store, h.pending, () => h.userId, 'recover', fetcher)
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(operation === 'submit' ? '/candidates/' : operation === 'decide' ? '/decisions/' : '/recover')
    expect(options.method).toBe(operation === 'issue' ? 'POST' : undefined)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['submit', 'decide', 'issue'] as const)('keeps original %s after absent recovery and never resends', async operation => {
    const h = fixture(operation), fetcher = vi.fn(async () => Response.json({ kind: 'not_found' }))
    await expect(performSupervisedPending(h.store, h.pending, () => h.userId, 'recover', fetcher)).rejects.toThrow()
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('keeps original request after response loss and rejects replacement payload or identity', async () => {
    const h = fixture('submit'), fetcher = vi.fn(async () => { throw new Error('lost') })
    await expect(performSupervisedPending(h.store, h.pending, () => h.userId, 'send', fetcher)).rejects.toThrow('lost')
    const changed = structuredClone(h.pending); if (changed.operation === 'submit') changed.body.draft.candidateId = id(20)
    expect(() => saveSupervisedPending(h.store, changed)).toThrow(/Recover the previous/)
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
  })
  it('rejects a candidate saved from a different draft even with matching IDs', async () => {
    const h = fixture('submit'); h.candidate.reviewPacket.week.scheduledSessions.forEach(s => { s.prescription.source.review.contentHash = 'c'.repeat(64) })
    await expect(performSupervisedPending(h.store, h.pending, () => h.userId, 'recover', async () => Response.json(h.reply('recover')))).rejects.toThrow(/Submission is unconfirmed/)
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
  })
  it.each(['version', 'replayed', 'extra'])('rejects malformed issue receipt %s without clearing pending', async kind => {
    const h = fixture('issue')
    if (kind === 'version') h.recovered.schemaVersion = 2
    if (kind === 'replayed') h.recovered.result.replayed = false
    if (kind === 'extra') Object.assign(h.recovered, { unknown: true })
    await expect(performSupervisedPending(h.store, h.pending, () => h.userId, 'recover', async () => Response.json(h.reply('recover')))).rejects.toThrow()
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
  })
  it('withholds account-switched replies', async () => {
    const h = fixture('issue'); let actor = h.userId
    await expect(performSupervisedPending(h.store, h.pending, () => actor, 'send', async () => { actor = id(20); return Response.json(h.reply('send')) })).rejects.toThrow(/original account/)
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
  })
  it('keeps pending when receipt archive storage fails', async () => {
    const h = fixture('decide'), original = h.store.setItem
    h.store.setItem = (key, value) => { if (key.startsWith('supervised-receipt:')) throw new Error('quota'); original(key, value) }
    await expect(performSupervisedPending(h.store, h.pending, () => h.userId, 'send', async () => Response.json(h.reply('send')))).rejects.toThrow('quota')
    expect(readSupervisedPending(h.store, h.userId, h.programId)).toEqual(h.pending)
  })
})
