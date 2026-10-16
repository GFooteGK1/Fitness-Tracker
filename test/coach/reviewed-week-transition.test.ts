import { describe, expect, it } from 'vitest'
import { reconcileReviewedWeekWindow } from '@/app/lib/coach/reviewed-week-transition'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

describe('explicit reviewed week date reconciliation', () => {
  it('crosses the year boundary using date-only UTC arithmetic and retains every other profile field', () => {
    const profile = { ...reviewedRollingWeek().plan.profileSnapshot, startDate: '2026-12-28' }, before = structuredClone(profile)
    const result = reconcileReviewedWeekWindow({ basePlanVersionId: 'base', profile, kind: 'next_week',
      base: { windowStart: '2026-12-28', windowEnd: '2027-01-03', sequenceNumber: 9 }, target: { windowStart: '2027-01-04', sequenceNumber: 10 } })
    expect(result.profile).toEqual({ ...profile, startDate: '2027-01-04' })
    expect(profile).toEqual(before)
    expect(result.transition.targetWindow).toEqual({ windowStart: '2027-01-04', windowEnd: '2027-01-10', sequenceNumber: 10 })
  })
  it.each(['non_monday', 'invalid_date', 'profile_date', 'window_end', 'sequence'])(
    'rejects invalid accepted %s before rebasing', failure => {
      const plan = reviewedRollingWeek().plan
      const base = { windowStart: plan.windowStart, windowEnd: plan.windowEnd, sequenceNumber: 1 }
      const profile = structuredClone(plan.profileSnapshot)
      if (failure === 'non_monday') { base.windowStart = profile.startDate = '2026-08-04'; base.windowEnd = '2026-08-10' }
      if (failure === 'invalid_date') base.windowStart = profile.startDate = '2026-02-30'
      if (failure === 'profile_date') profile.startDate = '2026-08-10'
      if (failure === 'window_end') base.windowEnd = '2026-08-10'
      if (failure === 'sequence') base.sequenceNumber = 0
      expect(() => reconcileReviewedWeekWindow({ basePlanVersionId: 'base', base, profile,
        kind: 'next_week', target: { windowStart: '2026-08-10', sequenceNumber: 2 } })).toThrow()
    })
})
