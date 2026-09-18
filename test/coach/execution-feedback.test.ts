import { describe, expect, it } from 'vitest'
import {
  buildCoachWeeklyReview,
  validateCoachSessionCheckinInput,
  validateStoredCoachSessionCheckin,
  reportedFeedbackProvenance,
  hasExplicitFeedback,
  type CoachExecutionSession,
  type CoachSessionCheckinSummary
} from '@/app/lib/coach/execution-feedback'

const sessions: CoachExecutionSession[] = [
  {
    id: 'session-1',
    weekNumber: 1,
    sessionIndex: 1,
    scheduledDate: '2026-08-03',
    status: 'completed'
  },
  {
    id: 'session-2',
    weekNumber: 1,
    sessionIndex: 2,
    scheduledDate: '2026-08-05',
    status: 'completed'
  },
  {
    id: 'session-3',
    weekNumber: 1,
    sessionIndex: 3,
    scheduledDate: '2026-08-07',
    status: 'completed'
  }
]

function checkin(
  prescribedSessionId: string,
  overrides: Partial<CoachSessionCheckinSummary> = {}
): CoachSessionCheckinSummary {
  return {
    feedbackVersion: 2,
    provenance: reportedFeedbackProvenance({ sessionRpe: 7, energy: 'okay', pain: 'none' }),
    id: `checkin-${prescribedSessionId}`,
    prescribedSessionId,
    outcome: 'as_planned',
    sessionRpe: 7,
    energy: 'okay',
    pain: 'none',
    note: null,
    occurredAt: '2026-08-07T18:00:00.000Z',
    ...overrides
  }
}

describe('coach execution feedback', () => {
  it('allows unknown optional v2 fields without fabricating a report', () => {
    const result = validateCoachSessionCheckinInput({ feedbackVersion: 2, outcome: 'as_planned', occurredAt: '2026-09-17T18:00:00.000Z' })
    expect(result).toMatchObject({ ok: true, value: { sessionRpe: null, energy: null, pain: null,
      provenance: { sessionRpe: { origin: 'unknown', reviewState: 'unreviewed' } } } })
    if (result.ok) expect(hasExplicitFeedback(result.value, 'pain')).toBe(false)
  })

  it('distinguishes explicit no pain and fractional session effort from missing feedback', () => {
    const result = validateCoachSessionCheckinInput({ feedbackVersion: 2, outcome: 'modified', sessionRpe: 7.5,
      pain: 'none', occurredAt: '2026-09-17T18:00:00.000Z' })
    expect(result).toMatchObject({ ok: true, value: { sessionRpe: 7.5, pain: 'none', energy: null } })
    if (result.ok) {
      expect(hasExplicitFeedback(result.value, 'pain')).toBe(true)
      expect(hasExplicitFeedback(result.value, 'sessionRpe')).toBe(true)
      expect(hasExplicitFeedback(result.value, 'energy')).toBe(false)
    }
  })

  it('keeps legacy feedback readable but ineligible for explicit-report rules', () => {
    const result = validateStoredCoachSessionCheckin({ schemaVersion: 1, outcome: 'as_planned',
      sessionRpe: 7, energy: 'okay', pain: 'concerning', note: null }, '2026-09-17T18:00:00.000Z')
    expect(result).toMatchObject({ ok: true, value: { sessionRpe: 7, pain: 'concerning',
      provenance: { sessionRpe: { origin: 'legacy_unknown' } } } })
    if (!result.ok) return
    expect(hasExplicitFeedback(result.value, 'sessionRpe')).toBe(false)
    const review = buildCoachWeeklyReview({ weekNumber: 1, reviewRequired: false, sessions: [sessions[0]],
      checkins: [{ ...result.value, id: 'legacy', prescribedSessionId: sessions[0].id }] })
    expect(review.averageSessionRpe).toBeNull()
    expect(review.adaptationProposal?.action).toBe('pause_and_seek_support')
  })

  it('rejects conflicting versions, unsupported numbers, and forged provenance', () => {
    const base = { feedbackVersion: 2, outcome: 'as_planned', occurredAt: '2026-09-17T18:00:00.000Z' }
    expect(validateCoachSessionCheckinInput({ ...base, schemaVersion: 1 }).ok).toBe(false)
    expect(validateCoachSessionCheckinInput({ ...base, sessionRpe: 7.2 }).ok).toBe(false)
    expect(validateCoachSessionCheckinInput({ ...base, energy: 'great' }).ok).toBe(false)
    expect(validateCoachSessionCheckinInput({ ...base, provenance: reportedFeedbackProvenance({ sessionRpe: 7, energy: null, pain: null }) }).ok).toBe(false)
    expect(validateCoachSessionCheckinInput({ ...base, outcome: 'skipped', sessionRpe: 7 }).ok).toBe(false)
  })

  it('checks persisted v2 feedback binding and rejects mismatched check-in identity', () => {
    const input = { schemaVersion: 2, feedbackVersion: 2, outcome: 'as_planned', sessionRpe: 8.5, energy: null, pain: null,
      provenance: reportedFeedbackProvenance({ sessionRpe: 8.5, energy: null, pain: null }),
      feedbackProvenance: { checkinId: 'checkin-1', revision: 1 } }
    expect(validateStoredCoachSessionCheckin(input, '2026-09-17T18:00:00.000Z', 'checkin-1').ok).toBe(true)
    expect(validateStoredCoachSessionCheckin(input, '2026-09-17T18:00:00.000Z', 'checkin-2').ok).toBe(false)
    expect(validateStoredCoachSessionCheckin({ ...input, provenance: undefined }, '2026-09-17T18:00:00.000Z', 'checkin-1').ok).toBe(false)
  })
  it('normalizes a concise completed-session check-in', () => {
    expect(validateCoachSessionCheckinInput({
      outcome: 'modified',
      sessionRpe: 8,
      energy: 'low',
      pain: 'mild',
      note: '  Used the bike instead of running.  ',
      occurredAt: '2026-08-03T18:30:00.000Z'
    })).toEqual({
      ok: true,
      value: {
        outcome: 'modified',
        sessionRpe: 8,
        energy: 'low',
        pain: 'mild',
        note: 'Used the bike instead of running.',
        occurredAt: '2026-08-03T18:30:00.000Z'
      }
    })
  })

  it('rejects contradictory, overlong, and out-of-range feedback', () => {
    const result = validateCoachSessionCheckinInput({
      outcome: 'skipped',
      sessionRpe: 11,
      energy: 'okay',
      pain: 'none',
      note: 'x'.repeat(501),
      occurredAt: 'not-a-date'
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(expect.arrayContaining([
      'Skipped sessions cannot include session RPE',
      'Session note must be 500 characters or fewer',
      'Completion time must be an ISO timestamp'
    ]))
  })

  it('waits for terminal session results before proposing a weekly adaptation', () => {
    const review = buildCoachWeeklyReview({
      weekNumber: 1,
      reviewRequired: false,
      sessions: sessions.map((session, index) => index === 0
        ? session
        : { ...session, status: 'planned' }),
      checkins: [checkin('session-1')]
    })

    expect(review.status).toBe('in_progress')
    expect(review.completedSessions).toBe(1)
    expect(review.adaptationProposal).toBeNull()
  })

  it('keeps the accepted plan unchanged after complete, controlled work', () => {
    const review = buildCoachWeeklyReview({
      weekNumber: 1,
      reviewRequired: false,
      sessions,
      checkins: sessions.map(session => checkin(session.id))
    })

    expect(review.status).toBe('ready')
    expect(review.completionRate).toBe(1)
    expect(review.averageSessionRpe).toBe(7)
    expect(review).toMatchObject({ explicitRpeCount: 3, eligibleCompletionCount: 3 })
    expect(review.adaptationProposal).toMatchObject({
      action: 'continue_as_written',
      requiresAcceptance: false,
      numericChangeStatus: 'not_needed'
    })
  })

  it('proposes review before a lower-stress replacement when execution was too costly', () => {
    const review = buildCoachWeeklyReview({
      weekNumber: 4,
      reviewRequired: true,
      sessions: [
        { ...sessions[0], weekNumber: 4 },
        { ...sessions[1], weekNumber: 4 },
        { ...sessions[2], weekNumber: 4, status: 'skipped' }
      ],
      checkins: [
        checkin('session-1', { sessionRpe: 9.5, energy: 'low', outcome: 'modified' }),
        checkin('session-2', { sessionRpe: 9, energy: 'low', outcome: 'stopped_early' }),
        checkin('session-3', { outcome: 'skipped', sessionRpe: null, energy: 'low' })
      ]
    })

    expect(review.status).toBe('ready')
    expect(review.checkpointReviewRequired).toBe(true)
    expect(review.adaptationProposal).toMatchObject({
      action: 'reduce_next_week_stress',
      requiresAcceptance: true,
      numericChangeStatus: 'not_generated'
    })
    expect(review.adaptationProposal?.proposedChanges.join(' '))
      .toMatch(/replacement proposal/i)
  })

  it('does not diagnose or silently adapt around a concerning pain signal', () => {
    const review = buildCoachWeeklyReview({
      weekNumber: 1,
      reviewRequired: false,
      sessions,
      checkins: [
        checkin('session-1'),
        checkin('session-2', { pain: 'concerning', outcome: 'stopped_early' }),
        checkin('session-3')
      ]
    })

    expect(review.adaptationProposal).toMatchObject({
      action: 'pause_and_seek_support',
      requiresAcceptance: false,
      numericChangeStatus: 'not_generated'
    })
    expect(review.adaptationProposal?.rationale).toMatch(/qualified professional/i)
  })

  it('keeps known legacy concerning pain ahead of missing feedback without inventing coverage', () => {
    const legacy = checkin('session-1', { feedbackVersion: 1, provenance: undefined, pain: 'concerning' })
    const review = buildCoachWeeklyReview({ weekNumber: 1, reviewRequired: false, sessions, checkins: [legacy] })
    expect(review).toMatchObject({ explicitRpeCount: 0, eligibleCompletionCount: 3, averageSessionRpe: null })
    expect(review.adaptationProposal?.action).toBe('pause_and_seek_support')
  })
})
