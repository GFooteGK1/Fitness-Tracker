import { describe, expect, it } from 'vitest'
import { compileOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { describeReviewedActivity, parseReviewedSession, reviewedSessionActivities, reviewedStepSeconds } from '@/app/lib/coach/reviewed-session-contract'
import { conditionalRecoveryInput, conditionalRecoverySession } from '../fixtures/reviewed-conditional-recovery'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { bindReviewedSetReport, parseReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'

describe('qualitative preparation recovery contract (not coaching approval)', () => {
  it('preserves exact structured meaning through compiler, JSON readback and conditional arithmetic', () => {
    const { input, registry } = conditionalRecoveryInput()
    const compiled = compileOfflineReviewedWeek(input.context, registry)
    if (compiled.kind !== 'compiled') throw new Error(compiled.reasons.join('; '))
    expect(compiled.week.days[0].timing.conditional).toBe(true)
    const session = conditionalRecoverySession()
    const read = parseReviewedSession(JSON.parse(JSON.stringify(session)))!
    expect(read).toEqual(session)
    expect(read.schemaVersion).toBe(2)
    const first = reviewedSessionActivities(read.content)[0]
    expect(first.restAfterSeconds).toEqual({ kind: 'as_needed', estimatedSeconds: 180 })
    const withoutRecovery = structuredClone(first)
    withoutRecovery.restAfterSeconds = 0
    expect(reviewedStepSeconds(first) - reviewedStepSeconds(withoutRecovery)).toBe(180)
    expect(read.estimatedSeconds).toBe(read.content.steps.reduce((sum, step) => sum + reviewedStepSeconds(step), 0))
    expect(describeReviewedActivity(first).join(' ')).toContain('Rest as needed after this work')
    expect(describeReviewedActivity(first).join(' ')).not.toContain('Rest 180 seconds')
  })

  it('preserves fixed-rest schema1 records byte-for-byte across the read boundary', () => {
    const { plan } = reviewedRollingWeek()
    for (const { prescription } of plan.scheduledSessions) {
      expect(prescription.schemaVersion).toBe(1)
      expect(JSON.stringify(parseReviewedSession(prescription))).toBe(JSON.stringify(prescription))
      expect(prescription.content.conditionalTiming).toBeUndefined()
    }
  })

  it('keeps actual recovery unknown or reported, never copied from a prescription estimate', () => {
    const session = conditionalRecoverySession(), activity = reviewedSessionActivities(session.content)[0]
    const report = { ...reviewedSetReport(activity.id), repetitions: null, load: null, rpe: null, restAfterSeconds: null }
    expect(bindReviewedSetReport(session, report)?.report.restAfterSeconds).toBeNull()
    expect(bindReviewedSetReport(session, { ...report, restAfterSeconds: 245 })?.report.restAfterSeconds).toBe(245)
    expect(parseReviewedSetReport({ ...report, restAfterSeconds: activity.restAfterSeconds })).toBeNull()
    expect(report.restAfterSeconds).toBeNull()
  })

  it.each(['schema1', 'string version', 'missing instruction', 'empty instruction', 'extra timing key',
    'missing estimate', 'zero estimate', 'negative estimate', 'infinite estimate', 'extra rest key',
    'working role', 'cooldown role', 'unused between', 'changed estimate'])('rejects malformed or contradictory saved recovery: %s', change => {
    const session = conditionalRecoverySession()
    const activity = reviewedSessionActivities(session.content)[0]
    if (change === 'schema1') session.schemaVersion = 1
    if (change === 'string version') Object.assign(session, { schemaVersion: '2' })
    if (change === 'missing instruction') delete session.content.conditionalTiming
    if (change === 'empty instruction') session.content.conditionalTiming!.whenOverBudget = ' '
    if (change === 'extra timing key') Object.assign(session.content.conditionalTiming!, { hardLimit: true })
    if (change === 'missing estimate') Object.assign(activity, { restAfterSeconds: { kind: 'as_needed' } })
    if (change === 'zero estimate') activity.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: 0 }
    if (change === 'negative estimate') activity.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: -1 }
    if (change === 'infinite estimate') activity.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: Infinity }
    if (change === 'extra rest key') Object.assign(activity.restAfterSeconds, { maxSeconds: 180 })
    if (change === 'working role') activity.role = 'working'
    if (change === 'cooldown role') activity.role = 'cooldown'
    if (change === 'unused between') activity.restBetweenSeconds = { kind: 'as_needed', estimatedSeconds: 60 }
    if (change === 'changed estimate') activity.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: 181 }
    expect(parseReviewedSession(session)).toBeNull()
  })

  it('rejects conditional recovery inside a fixed preparation window even with ample time', () => {
    const session = conditionalRecoverySession()
    const first = reviewedSessionActivities(session.content)[0]
    expect(() => reviewedStepSeconds({ kind: 'preparation_window', id: 'bounded', seconds: 3600,
      activities: [first], instructions: ['Rest as needed'] })).toThrow('fixed preparation window')
  })

  it('requires reviewed timing content and rejects source recipe changes before compilation', () => {
    const { input, registry } = conditionalRecoveryInput()
    delete registry[0].recipe.sessions[0].conditionalTiming
    registry[0].contentHash = doseContentHash(registry[0].recipe)
    expect(compileOfflineReviewedWeek(input.context, registry)).toMatchObject({ kind: 'review_required',
      reasons: ['Conditional recovery requires its reviewed time adjustment'] })
    const fresh = conditionalRecoveryInput()
    const first = fresh.registry[0].recipe.sessions[0].steps[0]
    if (first.kind !== 'activity') throw new Error('Fixture changed')
    first.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: 181 }
    expect(compileOfflineReviewedWeek(fresh.input.context, fresh.registry)).toMatchObject({ kind: 'review_required', reasons: ['Reviewed week changed'] })
  })
})
