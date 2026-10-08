import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { denialExecutionEnvelopes } from '../../scripts/release/supervised-denial-envelopes'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { bindReviewedSetReport, parseReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedSessionActivities, parseReviewedSession } from '@/app/lib/coach/reviewed-session-contract'

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
function input() {
  const slot = reviewedRollingWeek().plan.scheduledSessions[0]
  return { ownerId: id(1), programId: id(2), sessionId: id(3), scheduledDate: slot.scheduledDate,
    prescription: slot.prescription, proposalId: id(4), planVersionId: id(5), issueRequestId: id(6) }
}

describe('reserved revoked execution envelopes', () => {
  it('binds the synthetic load to squat rather than the preceding jump, and preserves exact request bytes', () => {
    const original = input(), requests = denialExecutionEnvelopes(original)
    const report = parseReviewedSetReport(requests.revoked_set.body.report)!
    expect(bindReviewedSetReport(original.prescription, report)).toBeTruthy()
    const session = parseReviewedSession(original.prescription)!
    expect(reviewedSessionActivities(session.content).find(a => a.id === report.activityId)?.movementId).toBe('barbell_back_squat')
    expect(report.repetitions).toBe(3)
    expect(report.load).toEqual({ value: 245, unit: 'lb', convention: 'total' })
    expect(requests.revoked_accept.body.requestId).toBe(original.issueRequestId)
    expect(requests.revoked_complete.path).toBe(`/api/coach/reviewed/sessions/${original.sessionId}/complete`)
    for (const envelope of Object.values(requests)) {
      expect(envelope.method).toBe('POST')
      expect(envelope.bodySha256).toBe(createHash('sha256').update(JSON.stringify(envelope.body)).digest('hex'))
      expect(envelope.body.expectedUserId).toBe(original.ownerId)
    }
  })
  it('rejects invalid identity, invalid prescription and a session without the prescribed squat', () => {
    expect(() => denialExecutionEnvelopes({ ...input(), ownerId: 'invalid' })).toThrow()
    expect(() => denialExecutionEnvelopes({ ...input(), prescription: {} })).toThrow()
    const running = reviewedRollingWeek().plan.scheduledSessions.find(s =>
      !reviewedSessionActivities(parseReviewedSession(s.prescription)!.content).some(a => a.movementId === 'barbell_back_squat'))!
    expect(() => denialExecutionEnvelopes({ ...input(), prescription: running.prescription })).toThrow('Known prescribed squat')
  })
})
