import { describe, expect, it } from 'vitest'
import { reconcileFirstReviewedWindow, reconcileFirstReviewedExecution } from '@/app/lib/coach/first-reviewed-week'
import { reconcileReviewedWeekWindow } from '@/app/lib/coach/reviewed-week-transition'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import type { ReviewedExecutionSlot } from '@/app/lib/coach/reviewed-execution-continuity'

const owner = '00000000-0000-4000-8000-000000000001'
const program = '00000000-0000-4000-8000-000000000010'
const baseId = '00000000-0000-4000-8000-000000000011'
function input() {
  const sourceProfile = reviewedRollingWeek().plan.profileSnapshot
  const confirmedTargetProfile = { ...structuredClone(sourceProfile), startDate: '2026-10-05' }
  return { basePlanVersionId: baseId,
    base: { windowStart: '2026-09-14', windowEnd: '2026-09-20', sequenceNumber: 4,
      intentFormat: 'rolling_weekly_intent_v0_1', planMode: 'rolling_weekly' },
    sourceProfile, confirmedTargetProfile, confirmedTargetProfileHash: doseContentHash(confirmedTargetProfile),
    target: { windowStart: '2026-10-05', sequenceNumber: 5 } }
}
describe('explicit first reviewed-week bootstrap', () => {
  it('counts one accepted transition across a calendar gap and preserves explicit profile confirmation', () => {
    const data = input(), before = structuredClone(data)
    const r = reconcileFirstReviewedWindow(data)
    expect(r.transition).toMatchObject({ kind: 'first_reviewed', sourceWindow: { sequenceNumber: 4 },
      targetWindow: { windowStart: '2026-10-05', windowEnd: '2026-10-11', sequenceNumber: 5 } })
    expect(data).toEqual(before)
    expect(r.profile).toEqual(data.confirmedTargetProfile)
    r.profile.athleteGoalSummary = 'Detached change'
    expect(data).toEqual(before)
  })
  it('allows confirmed availability updates without replacing observed training', () => {
    const data = input()
    data.confirmedTargetProfile.sessionAvailability[0].minutes += 15
    data.confirmedTargetProfileHash = doseContentHash(data.confirmedTargetProfile)
    expect(reconcileFirstReviewedWindow(data).profile.sessionAvailability).toEqual(data.confirmedTargetProfile.sessionAvailability)
  })
  it.each(['same', 'adjacent', 'non_monday', 'invalid_date', 'sequence', 'reviewed_base', 'profile_date', 'changed_confirmation'])(
    'rejects a wrong bootstrap boundary: %s', failure => {
      const data = input()
      if (failure === 'same') data.target.windowStart = '2026-09-14'
      if (failure === 'adjacent') data.target.windowStart = '2026-09-21'
      if (failure === 'non_monday') data.target.windowStart = '2026-10-06'
      if (failure === 'invalid_date') data.target.windowStart = '2026-02-30'
      if (failure === 'sequence') data.target.sequenceNumber = 7
      if (failure === 'reviewed_base') data.base.intentFormat = 'reviewed_weekly_intent_v0_1'
      if (failure === 'profile_date') data.confirmedTargetProfile.startDate = '2026-10-12'
      if (failure === 'changed_confirmation') data.confirmedTargetProfile.sessionAvailability[0].minutes += 1
      expect(() => reconcileFirstReviewedWindow(data)).toThrow()
    })
  it('rejects invented factual training even if the submitted profile is confirmed again', () => {
    const data = input()
    data.confirmedTargetProfile.recentTraining.completedSessionCount += 1
    data.confirmedTargetProfileHash = doseContentHash(data.confirmedTargetProfile)
    expect(() => reconcileFirstReviewedWindow(data)).toThrow(/authenticated training/)
  })
  it('leaves ordinary adjacent-week rules unchanged', () => {
    const data = input()
    expect(() => reconcileReviewedWeekWindow({ basePlanVersionId: baseId, base: data.base,
      profile: { ...data.sourceProfile, startDate: data.base.windowStart }, target: data.target, kind: 'next_week' })).toThrow(/adjacent/)
  })
  it('rejects forged intake provenance even after confirmation is rehashed', () => {
    const data = input()
    data.confirmedTargetProfile.inputSource = { kind: 'legacy_v0_2_intake', snapshot: {
      primaryDomain: 'strength', goal: 'A different intake source', experience: 'experienced',
      trainingDays: ['monday', 'tuesday'], sessionMinutes: 60, equipment: 'Full gym',
      constraints: '', startDate: '2026-09-14',
    } }
    data.confirmedTargetProfileHash = doseContentHash(data.confirmedTargetProfile)
    expect(() => reconcileFirstReviewedWindow(data)).toThrow(/provenance/)
  })
  function execution() {
    const data = input(), reconciled = reconcileFirstReviewedWindow(data)
    const target = { ...reviewedRollingWeek().plan, windowStart: '2026-10-05', windowEnd: '2026-10-11',
      sequenceNumber: 5, profileSnapshot: reconciled.profile }
    const sourceSlots: ReviewedExecutionSlot[] = [{ userId: owner, programId: program, planVersionId: baseId,
      sessionIndex: 1, scheduledDate: '2026-09-14', prescription: { legacy: 'planned work' },
      executionSessionId: 'prior-session', executionPlanVersionId: baseId,
      status: 'planned', completedWorkoutId: null, completionContractVersion: null, hasReports: false }]
    return { userId: owner, programId: program, basePlanVersionId: baseId, target,
      baseSessions: sourceSlots.map(s => ({ scheduledDate: s.scheduledDate, prescription: s.prescription })),
      sourceSlots, transition: reconciled.transition }
  }
  it('creates fresh roots and keeps prior unreported work unknown, without mutating prior slots', () => {
    const data = execution(), before = structuredClone(data)
    const r = reconcileFirstReviewedExecution(data)
    expect(r.kind).toBe('continuity')
    if (r.kind !== 'continuity') throw Error(r.reasons.join(';'))
    expect(r.binding.priorExecution).toEqual([{ executionSessionId: 'prior-session', disposition: 'unreported' }])
    expect(r.binding.slots.every(s => s.executionSessionId === null && s.executionPlanVersionId === null)).toBe(true)
    expect(data).toEqual(before)
  })
  it('retains the disposition of actual completed history without copying it to target roots', () => {
    const data = execution()
    Object.assign(data.sourceSlots[0], { status: 'completed', completedWorkoutId: 'actual-workout', completionContractVersion: 1 })
    const r = reconcileFirstReviewedExecution(data)
    expect(r.kind).toBe('continuity')
    if (r.kind === 'continuity') expect(r.binding.priorExecution?.[0].disposition).toBe('completed')
  })
  it.each(['begun', 'foreign', 'changed_prescription', 'missing', 'changed_profile'])(
    'returns for clarification for %s prior execution', failure => {
      const data = execution()
      if (failure === 'begun') data.sourceSlots[0].hasReports = true
      if (failure === 'foreign') data.sourceSlots[0].userId = 'foreign'
      if (failure === 'changed_prescription') data.sourceSlots[0].prescription = { edited: true }
      if (failure === 'missing') data.sourceSlots = []
      if (failure === 'changed_profile') data.target.profileSnapshot.sessionAvailability[0].minutes += 1
      expect(reconcileFirstReviewedExecution(data).kind).toBe('review_required')
    })
})
