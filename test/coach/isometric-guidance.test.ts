import { describe, expect, it } from 'vitest'
import { ISOMETRIC_GUIDANCE, proposeIsometricHold, requestsIsometrics } from '@/app/lib/coach/isometric-guidance'
import { validateExercisePreferences, resolveExercisePreferences, preferenceSupportNotes, type ExercisePreferences } from '@/app/lib/coach/exercise-preferences'
import { getCoachReference } from '@/app/lib/coach/reference'
import { COMPLETE_PROGRAMMING_REFERENCE } from '@/app/lib/coach/programming-reference'
import { compileOfflineReviewedWeek, validateOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { isReviewedActivity, reviewedStepSeconds, reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { isometricReviewedWeek } from '../fixtures/isometric-reviewed-week'
import { reviewedDevelopmentalWeek } from '../fixtures/reviewed-developmental-week'

const preference: ExercisePreferences = { schemaVersion: 1, state: 'specified', entries: [
  { athleteWording: 'Include isometrics as warm-up or accessories', target: { kind: 'interest', id: 'isometric_training' } }
] }

describe('isometric programming guidance', () => {
  it('retains the requested role as preference data without inventing movement mappings or doses', () => {
    expect(validateExercisePreferences(preference)).toBe(true)
    expect(requestsIsometrics(preference)).toBe(true)
    expect(resolveExercisePreferences(preference)).toEqual([])
    expect(preferenceSupportNotes(preference).join(' ')).toContain('Isometrics requested in warm-ups or accessories')
    expect(requestsIsometrics(undefined)).toBe(false)
    expect(requestsIsometrics({ schemaVersion: 1, state: 'none', entries: [] })).toBe(false)
    expect(requestsIsometrics({ ...preference, entries: [{ athleteWording: 'isometrics', target: { kind: 'unresolved' } }] })).toBe(false)
  })
  it('delivers the sourced qualitative method through the existing runtime reference', () => {
    const reference = getCoachReference(['resilience', 'power_explosiveness'])
    const guidance = reference.domains.find(domain => domain.id === 'resilience')!.guidance
    expect(guidance).toContain(ISOMETRIC_GUIDANCE.preparation)
    expect(guidance).toContain(ISOMETRIC_GUIDANCE.accessories)
    expect(guidance).toContain(ISOMETRIC_GUIDANCE.continuity)
    const rule = COMPLETE_PROGRAMMING_REFERENCE.evidenceRules.find(rule => rule.id === 'isometric.intent-and-placement')!
    expect(rule.sourceIds).toEqual(['oranchuk-isometric-2019', 'miao-isometric-jump-2026'])
    expect(reference.domains.find(domain => domain.id === 'power_explosiveness')!.guidance).toContain(ISOMETRIC_GUIDANCE.preparation)
  })
  it('requires an explicit hold dose and discards conflicting repetition cues without mutating source work', () => {
    const { accessory } = isometricReviewedWeek()
    const before = structuredClone(accessory)
    const blank = proposeIsometricHold(accessory)
    expect(blank.work).toMatchObject({ kind: 'duration', seconds: NaN, sides: 2 })
    expect(isReviewedActivity(blank)).toBe(false)
    expect(blank.instructions).toHaveLength(1)
    expect(blank.instructions.join(' ')).not.toContain('Old repetition cue')
    expect(accessory).toEqual(before)
    expect(blank.effort).toEqual(before.effort)
    expect(blank.restBetweenSeconds).toEqual(before.restBetweenSeconds)
    for (const bad of [{ ...accessory, protocolId: 'monitor' }, { ...accessory, role: 'monitoring' as const },
      { ...accessory, role: 'cooldown' as const }, { ...accessory, movementId: 'barbell_bench_press' }, { ...accessory, movementId: 'constructor' }]) {
      expect(() => proposeIsometricHold(bad)).toThrow('supported preparation or accessory')
    }
  })
  it('compiles a complete synthetic week with preparation and accessory holds and exact per-side time', () => {
    const { context, registry, warmup, accessory } = isometricReviewedWeek()
    const before = structuredClone({ context, registry })
    const result = compileOfflineReviewedWeek(context, registry)
    if (result.kind !== 'compiled') throw new Error(result.reasons.join('; '))
    const lower = result.week.days.find(day => day.session?.id === 'upright-trap-bar')!
    const activities = reviewedSessionActivities(lower.session!)
    expect(activities.find(a => a.id === warmup.id)).toEqual(warmup)
    expect(activities.findIndex(a => a.id === warmup.id)).toBeLessThan(activities.findIndex(a => a.id === 'upright-runs'))
    expect(activities.findIndex(a => a.id === accessory.id)).toBeGreaterThan(activities.findIndex(a => a.id === 'monitoring'))
    expect(activities.find(a => a.id === accessory.id)).toEqual(accessory)
    expect(activities.find(a => a.id === 'monitoring')!.protocolId).toBe('synthetic-isometric-pull-protocol')
    // Preparation: 10s per side + 5s switch + 20s recovery, inside its existing window.
    expect(reviewedStepSeconds(warmup)).toBe(45)
    // Accessory: 2 sets x (20s per side + 5s switch) + 30s between + 15s after.
    expect(reviewedStepSeconds(accessory)).toBe(135)
    const base = reviewedDevelopmentalWeek()
    const baseline = compileOfflineReviewedWeek(base.context, base.registry)
    if (baseline.kind !== 'compiled') throw new Error('Baseline must compile')
    expect(lower.timing.estimatedSeconds).toBe(baseline.week.days.find(day => day.session?.id === lower.session!.id)!.timing.estimatedSeconds + 135)
    expect(lower.timing.remainingSeconds).toBeGreaterThanOrEqual(0)
    expect(result.week.days).toHaveLength(7)
    expect(result.week.days.filter(day => day.session)).toHaveLength(5)
    expect(result.week).toMatchObject({ numericRuntimeEligible: false, persistable: false, requiresAthleteAcceptance: true })
    expect(validateOfflineReviewedWeek(result.week, context, registry)).toEqual({ ok: true, errors: [] })
    expect({ context, registry }).toEqual(before)
  })
})
