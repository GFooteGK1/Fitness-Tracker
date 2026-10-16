import { describe, expect, it } from 'vitest'
import { compileOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { describeReviewedActivity, parseReviewedSession, reviewedSessionActivities, reviewedSessionTimeBudget,
  reviewedActivitySeconds, isOptionalReviewedStep } from '@/app/lib/coach/reviewed-session-contract'
import { effortWorkInput, effortWorkSession } from '../fixtures/reviewed-effort-work'
import { conditionalRecoverySession } from '../fixtures/reviewed-conditional-recovery'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { bindReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'

describe('effort-led reviewed work mechanics, not coaching qualification', () => {
  it('preserves uncapped effort work and all optional content through compiler and historical readback', () => {
    const { input, registry } = effortWorkInput()
    const result = compileOfflineReviewedWeek(input.context, registry)
    if (result.kind !== 'compiled') throw new Error(result.reasons.join('; '))
    const day = result.week.days[0]
    expect(day.timing).toMatchObject({ conditional: true, requiredSeconds: 435, optionalSeconds: 4285,
      estimatedSeconds: 4720, remainingSeconds: day.availableSeconds - 4720 })
    expect(day.session).toEqual(registry[0].recipe.sessions[0])
    expect(day.timing.estimatedSeconds).toBeGreaterThan(day.availableSeconds)
    const session = effortWorkSession()
    expect(session.schemaVersion).toBe(3)
    expect(parseReviewedSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    const work = reviewedSessionActivities(session.content).find(activity => activity.id === 'required-work')!
    expect(work.work).not.toHaveProperty('repetitions')
    expect(describeReviewedActivity(work).join(' ')).toContain('about 2 RIR')
    expect(describeReviewedActivity(work).join(' ')).toContain('no fixed repetition cap')
    expect(describeReviewedActivity(work).join(' ')).toContain('not a set duration limit')
  })

  it('charges each side, side change, between-round rest and preparation exactly once', () => {
    const session = effortWorkSession()
    const row = reviewedSessionActivities(session.content).find(activity => activity.id === 'optional-work')!
    expect(reviewedActivitySeconds(row)).toBe(4180)
    expect(reviewedSessionTimeBudget(session.content)).toEqual({ requiredSeconds: 435, optionalSeconds: 4285 })
    for (const id of ['optional-transition', 'optional-prep', 'optional-work']) expect(isOptionalReviewedStep(session.content, id)).toBe(true)
    for (const id of ['logging', 'required-prep', 'required-work', 'absent']) expect(isOptionalReviewedStep(session.content, id)).toBe(false)
  })

  it('retains historical schema1 and schema2 serialization', () => {
    for (const session of [reviewedRollingWeek().plan.scheduledSessions[0].prescription, conditionalRecoverySession()]) {
      expect(JSON.stringify(parseReviewedSession(session))).toBe(JSON.stringify(session))
      expect(session.schemaVersion).toBeLessThan(3)
    }
  })

  it('rejects effort meaning smuggled into a fixed-repetition historical record', () => {
    for (const key of ['targetRir', 'estimatedSecondsPerSet']) {
      const session = reviewedRollingWeek().plan.scheduledSessions[0].prescription
      const activity = reviewedSessionActivities(session.content).find(value => value.work.kind === 'repetitions')!
      Object.assign(activity.work, { [key]: 2 })
      expect(parseReviewedSession(session)).toBeNull()
    }
  })

  it('records actual reps independently and never counts skipped optional work as performed', () => {
    const session = effortWorkSession()
    const report = { ...reviewedSetReport('required-work'), repetitions: 29, rpe: null }
    expect(bindReviewedSetReport(session, report)?.report.repetitions).toBe(29)
    const omitted = { ...report, activityId: 'optional-work', side: 'left', status: 'not_performed', repetitions: null,
      durationSeconds: null, distanceMetres: null, load: null, restAfterSeconds: null, velocity: null }
    expect(bindReviewedSetReport(session, omitted)?.report.status).toBe('not_performed')
    expect(bindReviewedSetReport(session, { ...omitted, repetitions: 20 })).toBeNull()
  })

  it.each(['schema1', 'schema2', 'missing timing', 'rep cap', 'negative rir', 'nan estimate', 'zero estimate',
    'preparation effort work', 'monitoring effort work', 'quality effort', 'single side switch', 'absent tail start',
    'all work optional', 'logging optional', 'missing final logging', 'optional monitoring', 'extra tail key',
    'empty reason', 'required over budget', 'changed estimate', 'orphan preparation', 'orphan transition',
    'different optional preparation'])('rejects malformed or contradictory data: %s', change => {
    const session = effortWorkSession()
    const work = reviewedSessionActivities(session.content).find(activity => activity.id === 'required-work')!
    if (work.work.kind !== 'effort_repetitions') throw new Error('Fixture changed')
    if (change === 'schema1') session.schemaVersion = 1
    if (change === 'schema2') session.schemaVersion = 2
    if (change === 'missing timing') delete session.content.conditionalTiming
    if (change === 'rep cap') Object.assign(work.work, { repetitions: { min: 8, max: 12 } })
    if (change === 'negative rir') work.work.targetRir = -1
    if (change === 'nan estimate') work.work.estimatedSecondsPerSet = NaN
    if (change === 'zero estimate') work.work.estimatedSecondsPerSet = 0
    if (change === 'preparation effort work') work.role = 'preparation'
    if (change === 'monitoring effort work') work.role = 'monitoring'
    if (change === 'quality effort') work.effort = { kind: 'quality', cue: 'Easy' }
    if (change === 'single side switch') work.work.sideSwitchSeconds = 30
    if (change === 'absent tail start') session.content.optionalTail!.fromStepId = 'absent'
    if (change === 'all work optional') session.content.optionalTail!.fromStepId = 'required-prep'
    if (change === 'logging optional') session.content.optionalTail!.fromStepId = 'logging'
    if (change === 'missing final logging') session.content.steps.pop()
    if (change === 'optional monitoring') Object.assign(session.content.steps[4], { role: 'monitoring', work: { kind: 'repetitions', repetitions: { min: 3, max: 3 }, sides: 1, secondsPerRep: 3 } })
    if (change === 'extra tail key') Object.assign(session.content.optionalTail!, { required: true })
    if (change === 'empty reason') session.content.optionalTail!.reason = ' '
    if (change === 'orphan preparation') session.content.optionalTail!.fromStepId = 'optional-work'
    if (change === 'orphan transition') session.content.optionalTail!.fromStepId = 'optional-prep'
    if (change === 'different optional preparation') Object.assign(session.content.steps[3], { movementId: 'unrelated-preparation' })
    if (change === 'required over budget') session.scheduledMinutes = 1
    if (change === 'changed estimate') session.estimatedSeconds++
    expect(parseReviewedSession(session)).toBeNull()
  })

  it('rejects estimate/source changes and required work that cannot fit at compilation', () => {
    const { input, registry } = effortWorkInput()
    registry[0].recipe.sessions[0].optionalTail!.reason += ' changed'
    expect(compileOfflineReviewedWeek(input.context, registry)).toMatchObject({ kind: 'review_required', reasons: ['Reviewed week changed'] })
    registry[0].contentHash = doseContentHash(registry[0].recipe)
    delete registry[0].recipe.sessions[0].optionalTail
    registry[0].contentHash = doseContentHash(registry[0].recipe)
    expect(compileOfflineReviewedWeek(input.context, registry)).toMatchObject({ kind: 'review_required', reasons: ['Complete session exceeds monday availability'] })
  })
})
