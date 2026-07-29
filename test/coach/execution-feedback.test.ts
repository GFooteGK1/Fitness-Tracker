import { describe, expect, it } from 'vitest'
import {
  buildCoachWeeklyReview,
  validateCoachSessionCheckinInput,
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
})
