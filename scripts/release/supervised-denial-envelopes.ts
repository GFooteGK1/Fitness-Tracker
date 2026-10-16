/** Pure fixed request construction for isolated synthetic denial qualification. */
import { randomUUID, createHash } from 'node:crypto'
import { reviewedSetReport } from '../../test/fixtures/reviewed-set-report'
import { reviewedCompletion } from '../../test/fixtures/reviewed-completion'
import { reviewedSessionActivities, parseReviewedSession } from '@/app/lib/coach/reviewed-session-contract'
import { bindReviewedSetReport, parseReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { saveReviewedPending } from '@/app/lib/coach/reviewed-session-pending'
import { saveReviewedProposalPending } from '@/app/lib/coach/reviewed-proposal-pending'

export function denialExecutionEnvelopes(input: { ownerId: string; programId: string; sessionId: string;
  scheduledDate: string; prescription: unknown; proposalId: string; planVersionId: string; issueRequestId: string }) {
  const session = parseReviewedSession(input.prescription)
  if (!session) throw Error('Exact reviewed prescription required')
  const activity = reviewedSessionActivities(session.content).find(a => a.role === 'working' && a.movementId === 'barbell_back_squat'
    && a.load.kind === 'external' && a.work.kind === 'repetitions')
  if (!activity) throw Error('Known prescribed squat working set required')
  // Explicit synthetic response. Never saved as performed work by preparation.
  const report = { ...reviewedSetReport(activity.id), schemaVersion: 2, repetitions: 3,
    load: { value: 245, unit: 'lb', convention: 'total' }, rir: 2, performedAt: `${input.scheduledDate}T17:00:00Z` }
  if (!parseReviewedSetReport(report) || !bindReviewedSetReport(input.prescription, report)) throw Error('Valid prescription-bound synthetic report required')
  const completion = { ...reviewedCompletion([], 'skipped'), workoutDate: input.scheduledDate,
    occurredAt: `${input.scheduledDate}T18:00:00Z`, tzOffset: 0 }
  const store = () => { const values = new Map<string, string>(); return {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } }
  const accept = saveReviewedProposalPending(store(), { schemaVersion: 1, userId: input.ownerId, programId: input.programId,
    operation: 'accept', proposalId: input.proposalId, planVersionId: input.planVersionId,
    body: { expectedUserId: input.ownerId, requestId: input.issueRequestId } })
  const set = saveReviewedPending(store(), { schemaVersion: 1, userId: input.ownerId, sessionId: input.sessionId,
    operation: 'set', body: { expectedUserId: input.ownerId, requestId: randomUUID(), report } })
  const complete = saveReviewedPending(store(), { schemaVersion: 1, userId: input.ownerId, sessionId: input.sessionId,
    operation: 'complete', body: { expectedUserId: input.ownerId, requestId: randomUUID(), completion } })
  const envelope = <T extends object>(path: string, body: T) => ({ path, method: 'POST' as const, body,
    bodySha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') })
  return { revoked_accept: envelope(`/api/coach/reviewed/proposals/${input.proposalId}/accept`, accept.body),
    revoked_set: envelope(`/api/coach/reviewed/sessions/${input.sessionId}/sets`, set.body),
    revoked_complete: envelope(`/api/coach/reviewed/sessions/${input.sessionId}/complete`, complete.body) }
}
