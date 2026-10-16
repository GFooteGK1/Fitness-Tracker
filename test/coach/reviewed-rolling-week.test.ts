import { describe, expect, it } from 'vitest'
import { buildReviewedRollingWeeklyPlan, type RollingWeeklyPlanDraft } from '@/app/lib/coach/rolling-weekly-plan'
import { decodeCoachWeeklyIntent, parseStoredRollingWeeklyIntent, serializeRollingSessions } from '@/app/lib/coach/rolling-weekly-api'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'
import { describeReviewedActivity, parseReviewedSession, reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { detectCoachPrescriptionFormat } from '@/app/lib/coach/programming-schema'
import { resolveSignalExercise } from '@/app/lib/coach/session-signals'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

describe('reviewed rolling-week compiler and read boundary', () => {
  it('builds five dated lossless sessions at the real compiler boundary, without invented coverage or persistence authority', () => {
    const { result, plan } = reviewedRollingWeek()
    expect(result).toMatchObject({ persistable: false, numericRuntimeEligible: false })
    expect(plan.scheduledSessions.map(session => session.scheduledDate)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07', '2026-08-08'])
    expect(plan.scheduledSessions.map(session => session.prescription.estimatedSeconds)).toEqual([3261, 2529, 2562, 2889, 4029])
    expect(plan).not.toHaveProperty('schedule')
    expect(plan).not.toHaveProperty('adaptive_programming')
    expect(plan.adaptiveEvaluation).toBe('unavailable')
    expect(plan.scheduledSessions.every(session => detectCoachPrescriptionFormat(session.prescription) === 'reviewed_v0_1')).toBe(true)
  })

  it('round-trips JSON through the shared decoder without needing current source/registry data', () => {
    const { plan, intent, input } = reviewedRollingWeek()
    const saved = JSON.parse(JSON.stringify(intent))
    input.context.currentSources.length = 0
    expect(buildReviewedRollingWeeklyPlan(input, reviewedRollingWeek().registry).kind).toBe('review_required')
    expect(decodeCoachWeeklyIntent(saved)).toEqual({ kind: 'reviewed', plan })
    expect(parseStoredRollingWeeklyIntent(saved)).toBeNull()
    expect(parseReviewedRollingWeek({ ...plan, adaptiveEvaluation: 'ready' })).toBeNull()
  })

  it('does not send new sessions to legacy persistence or hardest-set signal contracts', () => {
    const { plan } = reviewedRollingWeek()
    expect(() => serializeRollingSessions(plan as unknown as RollingWeeklyPlanDraft)).toThrow('Reviewed session persistence')
    expect(() => serializeRollingSessions({ ...plan, format: 'rolling_weekly_plan_v0_1', sessions: [],
      scheduledSessions: plan.scheduledSessions } as unknown as RollingWeeklyPlanDraft)).toThrow('Reviewed session persistence')
    expect(resolveSignalExercise(plan.scheduledSessions[0].prescription, 'squat:0')).toBeNull()
  })

  it('preserves range, sided duration, stage distance and distinct monitoring display', () => {
    const { plan } = reviewedRollingWeek()
    const all = plan.scheduledSessions.flatMap(session => reviewedSessionActivities(session.prescription.content))
    const lines = (id: string) => describeReviewedActivity(all.find(activity => activity.id === id)!).join('; ')
    expect(lines('side-plank')).toContain('2 × 30 seconds per side; 15 seconds to switch sides')
    expect(lines('pull-ups')).toContain('3 × 6–8 reps')
    expect(lines('upright-runs')).toContain('20 m gradual entry + 10 m relaxed upright running')
    expect(lines('upright-runs')).not.toContain('in 8 seconds')
    expect(lines('monitoring')).toContain('Target RPE no higher than 7')
    expect(lines('intervals')).toContain('in 100 seconds each')
  })

  it.each(['time', 'negative rest', 'effort', 'unknown effort', 'load', 'unknown load', 'protocol', 'reps', 'duplicate step', 'sides', 'missing instructions'])('rejects malformed stored sessions: %s', change => {
    const session = structuredClone(reviewedRollingWeek().plan.scheduledSessions[4].prescription)
    const bench = reviewedSessionActivities(session.content).find(activity => activity.id === 'bench')!
    if (change === 'time') session.estimatedSeconds--
    if (change === 'negative rest') bench.restBetweenSeconds = -1
    if (change === 'effort') Object.assign(bench.effort, { min: 9, max: 8 })
    if (change === 'unknown effort') Object.assign(bench.effort, { kind: 'made-up' })
    if (change === 'load') Object.assign(bench.load, { value: Infinity })
    if (change === 'unknown load') Object.assign(bench.load, { kind: 'made-up' })
    if (change === 'protocol') session.protocols = []
    if (change === 'reps') Object.assign(bench.work, { repetitions: { min: 4, max: 2 } })
    if (change === 'duplicate step') session.content.steps[0].id = session.content.steps[1].id
    if (change === 'sides') Object.assign(bench.work, { sides: '1' })
    if (change === 'missing instructions') Object.assign(bench, { instructions: null })
    expect(parseReviewedSession(session)).toBeNull()
    expect(detectCoachPrescriptionFormat(session)).toBe('unknown')
  })

  it.each(['date', 'budget', 'session source', 'window', 'duplicate session', 'spacing', 'base spacing', 'basis hash'])('rejects inconsistent week readback: %s', change => {
    const { plan } = reviewedRollingWeek()
    if (change === 'date') plan.scheduledSessions[0].scheduledDate = '2026-08-04'
    if (change === 'budget') plan.profileSnapshot.sessionAvailability.find(slot => slot.day === 'saturday')!.minutes = 60
    if (change === 'session source') plan.scheduledSessions[0].prescription.source.recipeHash = 'a'.repeat(64)
    if (change === 'window') plan.windowEnd = '2026-08-10'
    if (change === 'duplicate session') plan.scheduledSessions[0] = plan.scheduledSessions[1]
    if (change === 'spacing') plan.spacing[0].selectedDays = 6
    if (change === 'base spacing') plan.spacing[0].baseDays = 6
    if (change === 'basis hash') plan.basis.contextHash = 'not-a-hash'
    expect(parseReviewedRollingWeek(plan)).toBeNull()
  })

  it('rejects new generation with a changed profile or undeclared review registration', () => {
    const { input, registry } = reviewedRollingWeek()
    input.context.profile.startDate = '2026-08-10'
    expect(buildReviewedRollingWeeklyPlan(input, registry).kind).toBe('review_required')
    expect(buildReviewedRollingWeeklyPlan(reviewedRollingWeek().input, []).kind).toBe('review_required')
  })

  it('does not reinterpret a malformed reviewed object as legacy by its extra keys', () => {
    expect(detectCoachPrescriptionFormat({ format: 'reviewed_programming_v0_1', domain: 'strength', session_role: 'working',
      dose: {}, evidence: { policyVersion: 'old' } })).toBe('unknown')
  })
})
