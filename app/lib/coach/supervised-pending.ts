/** Browser-owned exact requests. Reads never authorize a resend or a new ID. */
import { isSupervisedJson, parseSupervisedCandidateDraft, type SupervisedCandidateDraft } from './supervised-candidate-draft'
import { parseSupervisedCandidateReview, parseSupervisedDecisionReceipt, parseSupervisedReviewDecision, type SupervisedReviewDecision } from './supervised-programming-contract'
import { stableStringify } from './rolling-weekly-contracts'
import { parseSupervisedRequestResolution } from './supervised-request-resolution'

export type SupervisedPending = { schemaVersion: 1; userId: string; programId: string } & (
  | { operation: 'submit'; body: { expectedUserId: string; draft: SupervisedCandidateDraft } }
  | { operation: 'decide'; body: SupervisedReviewDecision }
  | { operation: 'issue'; body: { expectedUserId: string; programId: string; candidateId: string; requestId: string } })
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).sort().join(',') === [...fields].sort().join(',')
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b)
const key = (user: string, program: string) => `supervised-pending:${user}:${program}`

export function parseSupervisedPending(value: unknown, userId: string, programId: string): SupervisedPending | null {
  try {
    if (!isSupervisedJson(value) || !record(value) || !exact(value, ['schemaVersion', 'userId', 'programId', 'operation', 'body'])
      || value.schemaVersion !== 1 || value.userId !== userId || value.programId !== programId || !uuid(userId) || !uuid(programId)
      || !record(value.body) || value.body.expectedUserId !== userId || JSON.stringify(value).length > 600000) return null
    if (value.operation === 'submit') {
      const draft = exact(value.body, ['expectedUserId', 'draft']) && parseSupervisedCandidateDraft(value.body.draft)
      if (!draft || draft.programId !== programId) return null
    } else if (value.operation === 'decide') {
      if (!parseSupervisedReviewDecision(value.body)) return null
    } else if (value.operation === 'issue') {
      if (!exact(value.body, ['expectedUserId', 'programId', 'candidateId', 'requestId']) || value.body.programId !== programId
        || !uuid(value.body.candidateId) || !uuid(value.body.requestId)) return null
    } else return null
    return structuredClone(value) as SupervisedPending
  } catch { return null }
}
export function readSupervisedPending(store: Store, userId: string, programId: string): SupervisedPending | null {
  const raw = store.getItem(key(userId, programId))
  if (raw === null) return null
  let value: SupervisedPending | null = null
  try { value = parseSupervisedPending(JSON.parse(raw), userId, programId) } catch { /* Preserve unreadable record. */ }
  if (!value) throw new Error('The saved review request could not be read. It has been preserved.')
  return value
}
/** Recovery navigation comes from this owner's saved requests, not current
 * assignment discovery. Revocation must not hide a decision receipt. */
export function listSupervisedPendingPrograms(store: Pick<Storage, 'length' | 'key' | 'getItem'>, userId: string): string[] {
  const prefix = `supervised-pending:${userId}:`, programs: string[] = []
  if (!uuid(userId)) return programs
  if (store.length > 10000) throw new Error('Local request storage is too large to inspect safely. Saved requests remain preserved.')
  for (let i = 0; i < store.length; i++) {
    const name = store.key(i)
    if (!name?.startsWith(prefix)) continue
    const programId = name.slice(prefix.length)
    // Include malformed requests with a valid scoped key so the normal reader
    // can show its preservation error. Never consume another account's record.
    if (uuid(programId)) programs.push(programId)
  }
  return programs.sort()
}
export function saveSupervisedPending(store: Store, input: SupervisedPending) {
  const value = parseSupervisedPending(input, input.userId, input.programId)
  if (!value) throw new Error('Complete all required fields before saving the request.')
  const existing = readSupervisedPending(store, value.userId, value.programId)
  if (existing && !same(existing, value)) throw new Error('Recover the previous request before creating another.')
  const encoded = JSON.stringify(value)
  store.setItem(key(value.userId, value.programId), encoded)
  if (store.getItem(key(value.userId, value.programId)) !== encoded) throw new Error('The request could not be preserved. Nothing was sent.')
  return value
}
export async function supervisedDraftHash(draft: SupervisedCandidateDraft) {
  const data = new TextEncoder().encode(stableStringify(draft))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function performSupervisedPending(store: Store, input: SupervisedPending, currentOwner: () => string | null,
  mode: 'send' | 'recover' | 'resolve' | 'resolution', fetcher: typeof fetch = fetch) {
  const value = parseSupervisedPending(input, input.userId, input.programId)
  if (!value) throw new Error('The saved request is invalid; it has been preserved.')
  const unchanged = () => {
    if (currentOwner() !== value.userId) throw new Error('Restore the original account before recovering this request.')
    if (!same(readSupervisedPending(store, value.userId, value.programId), value)) throw new Error('The pending request changed. It has been preserved.')
  }
  unchanged()
  const candidateId = value.operation === 'submit' ? value.body.draft.candidateId : value.body.candidateId
  const originalId = value.operation === 'submit' ? candidateId : value.body.requestId
  const root = '/api/coach/supervised'
  const resolutionMode = mode === 'resolve' || mode === 'resolution'
  const url = resolutionMode ? `${root}/${mode}` : mode === 'send' ? `${root}/${value.operation === 'submit' ? 'candidates' : value.operation === 'decide' ? 'decisions' : 'issue'}`
    : value.operation === 'submit' ? `${root}/candidates/${candidateId}`
      : value.operation === 'decide' ? `${root}/decisions/${value.body.requestId}` : `${root}/recover`
  const lookup = resolutionMode ? { expectedUserId: value.userId, pending: value } : mode === 'recover' && value.operation === 'issue' ? { expectedUserId: value.userId, programId: value.programId,
    operation: 'issue', requestId: value.body.requestId, identity: { reviewId: candidateId, registrationId: candidateId } } : value.body
  const response = await fetcher(url, mode === 'recover' && value.operation !== 'issue' ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lookup) })
  let result: unknown = await response.json()
  unchanged()
  if (!response.ok || !record(result)) throw new Error(record(result) && typeof result.error === 'string' ? result.error
    : 'The result is unconfirmed. The original request is preserved.')
  let confirmation: Record<string, unknown>
  let disposition: 'saved' | 'no_write' = 'saved'
  const resolved = resolutionMode && result.kind === 'resolved' ? parseSupervisedRequestResolution(result.resolution, value) : null
  if (resolutionMode && (!resolved || resolved.disposition === 'not_found')) throw new Error('The result is unconfirmed. The original request is preserved.')
  if (resolved?.disposition === 'saved') result = resolved.result
  if (!record(result)) throw new Error('The original request is preserved.')
  if (resolved?.disposition === 'no_write') {
    disposition = 'no_write'
    confirmation = { disposition, resolutionId: resolved.resolutionId, resolvedAt: resolved.resolvedAt }
  } else if (value.operation === 'submit') {
    const c = ['saved', 'candidate'].includes(String(result.kind)) && parseSupervisedCandidateReview(result.candidate)
    const draft = value.body.draft, hash = await supervisedDraftHash(draft)
    if (!c || c.candidateId !== candidateId || c.userId !== value.userId || c.programId !== value.programId
      || c.enrollmentId !== draft.enrollmentId || c.basePlanVersionId !== draft.basePlanVersionId || c.transition !== draft.transition
      || !c.reviewPacket.week.scheduledSessions.every(s => s.prescription.source.review.contentHash === hash)) {
      throw new Error('Submission is unconfirmed. Recover the original request before editing again.')
    }
    confirmation = { candidateId, contentHash: c.contentHash, sourceHash: c.sourceHash }
  } else if (value.operation === 'decide') {
    const r = result.kind === 'decided' && parseSupervisedDecisionReceipt(result.receipt), q = value.body
    if (!r || r.candidateId !== candidateId || r.requestId !== q.requestId || r.reviewerId !== value.userId || r.decision !== q.decision
      || r.enrollmentId !== q.enrollmentId || r.contentHash !== q.contentHash || r.sourceHash !== q.sourceHash) throw new Error('Decision is unconfirmed. The original request is preserved.')
    const { replayed: _replayed, ...stable } = r; void _replayed
    confirmation = stable
  } else {
    const recovered = result.kind === 'recovered' && record(result.receipt) ? result.receipt : null
    const r = result.kind === 'issued' ? result : recovered?.disposition === 'saved' ? recovered.result : null
    if (recovered && (!exact(recovered, ['schemaVersion', 'userId', 'programId', 'operation', 'requestId', 'identity', 'disposition', 'result'])
      || recovered.schemaVersion !== 1 || recovered.userId !== value.userId || recovered.programId !== value.programId || recovered.operation !== 'issue'
      || recovered.requestId !== value.body.requestId || !same(recovered.identity, { reviewId: candidateId, registrationId: candidateId })
      || !record(r) || !exact(r, ['proposalId', 'programId', 'planVersionId', 'replayed']) || r.replayed !== true)) {
      throw new Error('Recovered proposal does not match the original request.')
    }
    if (!record(r) || r.programId !== value.programId || !uuid(r.proposalId) || !uuid(r.planVersionId)
      || typeof r.replayed !== 'boolean' || (result.kind === 'issued' && !same(result.request, value.body))) {
      throw new Error('Proposal is unconfirmed. The original request is preserved.')
    }
    confirmation = { candidateId, proposalId: r.proposalId, planVersionId: r.planVersionId }
  }
  unchanged()
  const archiveKey = `supervised-receipt:${value.userId}:${value.operation}:${originalId}`
  const archive = JSON.stringify({ request: value, confirmation }), prior = store.getItem(archiveKey)
  if (prior !== null && !same(JSON.parse(prior), JSON.parse(archive))) throw new Error('Conflicting saved receipt. The original pending request is preserved.')
  store.setItem(archiveKey, archive)
  if (store.getItem(archiveKey) !== archive) throw new Error('Could not retain the confirmed result. Pending request preserved.')
  unchanged()
  store.removeItem(key(value.userId, value.programId))
  if (store.getItem(key(value.userId, value.programId)) !== null) throw new Error('The result is saved; local pending state still needs recovery.')
  return { operation: value.operation, confirmation, disposition }
}
