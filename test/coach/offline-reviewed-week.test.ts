import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileOfflineReviewedWeek, validateOfflineReviewedWeek, type ReviewedWeekActivity,
  type OfflineReviewedWeek, type ReviewedWeekRegistration } from '@/app/lib/coach/offline-reviewed-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedDevelopmentalWeek } from '../fixtures/reviewed-developmental-week'
import source from '../fixtures/reviewed-developmental-bench-week.json'

function compile(scheduleId = 'tuesday-bench') {
  const fixture = reviewedDevelopmentalWeek()
  fixture.context.scheduleId = scheduleId
  const result = compileOfflineReviewedWeek(fixture.context, fixture.registry)
  if (result.kind !== 'compiled') throw new Error(result.reasons.join('; '))
  return { ...fixture, week: result.week }
}
const work = (week: OfflineReviewedWeek, sessionId: string, activityId: string) =>
  week.days.find(day => day.session?.id === sessionId)!.session!.steps.find(step => step.id === activityId) as ReviewedWeekActivity

describe('complete reviewed developmental week', () => {
  it('pins the immutable accepted source and complete lowering including instructions and timing assumptions', () => {
    const markdown = readFileSync(source.source.path, 'utf8').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(markdown).digest('hex')).toBe(source.source.sha256)
    // Pin separately from source so changes in structured lowering require deliberate review.
    expect(reviewedDevelopmentalWeek().registry[0].contentHash).toMatchInlineSnapshot(`"67207862e64280e27530407093f344c6a6f9aadb6ebb312b7791dbbc3c941a89"`)
  })

  it('calculates the five accepted totals from full structured work, rest, preparation and overhead', () => {
    const { week, context, registry } = compile()
    for (const expected of source.sessions) {
      const day = week.days.find(value => value.session?.id === expected.id)!
      expect(day.timing.estimatedSeconds).toBe(expected.estimatedSeconds)
      expect(day.timing.components.reduce((sum, component) => sum + component.seconds, 0)).toBe(expected.estimatedSeconds)
      expect(day.timing.remainingSeconds).toBe(day.availableSeconds - expected.estimatedSeconds)
    }
    expect(week.days.filter(day => !day.session).map(day => day.day)).toEqual(['thursday', 'sunday'])
    expect(validateOfflineReviewedWeek(week, context, registry)).toEqual({ ok: true, errors: [] })
    expect(week).toMatchObject({ numericRuntimeEligible: false, persistable: false, requiresAthleteAcceptance: true })
  })

  it('moves entire sessions without changing a dose, warmup, rest, monitoring or instruction', () => {
    const base = compile('base').week
    const swap = compile().week
    for (const day of base.days.filter(day => day.session)) {
      expect(swap.days.find(value => value.session?.id === day.session?.id)?.session).toEqual(day.session)
    }
    expect(swap.days.find(day => day.day === 'tuesday')?.session?.id).toBe('bench-volume')
    expect(swap.days.find(day => day.day === 'wednesday')?.session?.id).toBe('running')
    expect(swap.protocols).toEqual(base.protocols)
    expect(swap.spacing.find(pair => pair.from === 'running' && pair.to === 'upright-trap-bar'))
      .toMatchObject({ baseDays: 3, selectedDays: 2 })
    expect(swap.spacing.find(pair => pair.from === 'bench-volume' && pair.to === 'bench-force'))
      .toMatchObject({ baseDays: 3, selectedDays: 4 })
  })

  it('preserves doubles, rep ranges, per-side work and monitoring RPE ceilings without invented sensor/load values', () => {
    const { week } = compile()
    expect(work(week, 'bench-force', 'bench')).toMatchObject({ sets: 4, work: { repetitions: { min: 2, max: 2 } }, load: { value: 205 }, effort: { kind: 'rpe', min: 7, max: 8 }, restBetweenSeconds: 180 })
    expect(work(week, 'bench-force', 'pull-ups')).toMatchObject({ work: { repetitions: { min: 6, max: 8 } }, load: { kind: 'athlete_selected' } })
    expect(work(week, 'bench-volume', 'rows')).toMatchObject({ load: { kind: 'athlete_selected' }, sets: 3 })
    expect(work(week, 'running', 'dead-bug')).toMatchObject({ work: { sides: 2, repetitions: { min: 6, max: 6 } } })
    expect(work(week, 'acceleration-squat', 'side-plank')).toMatchObject({ sets: 2, work: { kind: 'duration', seconds: 30, sides: 2, sideSwitchSeconds: 15 }, restBetweenSeconds: 60 })
    expect(work(week, 'bench-force', 'monitoring')).toMatchObject({ role: 'monitoring', load: { value: 185 }, effort: { kind: 'rpe_ceiling', max: 7 }, restAfterSeconds: 180 })
    expect(work(week, 'upright-trap-bar', 'monitoring')).toMatchObject({ role: 'monitoring', load: { value: 335 }, restAfterSeconds: 180 })
    expect(week.protocols.every(protocol => protocol.sensorMetadata === null && protocol.actualObservations.length === 0)).toBe(true)
    expect(work(week, 'running', 'intervals')).toMatchObject({ sets: 5, work: { targetSeconds: 100, stages: [{ metres: 400 }] }, restBetweenSeconds: 120 })
    expect(work(week, 'upright-trap-bar', 'upright-runs')).toMatchObject({ work: { targetSeconds: null, stages: [{ metres: 20 }, { metres: 10 }] }, effort: { kind: 'perceived_percent', min: 80, max: 85 } })
  })

  it('does not mutate or alias the reviewed base, input profile or registry', () => {
    const fixture = reviewedDevelopmentalWeek()
    const original = structuredClone(fixture)
    const first = compileOfflineReviewedWeek(fixture.context, fixture.registry)
    expect(first.kind).toBe('compiled')
    if (first.kind !== 'compiled') return
    work(first.week, 'bench-force', 'bench').sets = 9
    first.week.basis.profileSnapshot.equipment.resolvedIds.length = 0
    first.week.protocols[0].instructions.length = 0
    expect(fixture).toEqual(original)
    const second = compileOfflineReviewedWeek(fixture.context, fixture.registry)
    expect(second.kind === 'compiled' && work(second.week, 'bench-force', 'bench').sets).toBe(4)
    fixture.registry[0].recipe.schedules[1].days.monday = null
    expect(reviewedDevelopmentalWeek()).toEqual(original)
  })

  it.each(['budget', 'equipment', 'goals', 'symptoms', 'outside training', 'source correction', 'source deletion', 'review', 'unknown schedule', 'unresolved'])('requires review for changed %s', change => {
    const { context, registry } = reviewedDevelopmentalWeek()
    if (change === 'budget') context.profile.sessionAvailability.find(slot => slot.day === 'saturday')!.minutes = 60
    if (change === 'equipment') context.profile.equipment.resolvedIds = context.profile.equipment.resolvedIds.filter(id => id !== 'high_handle_trap_bar')
    if (change === 'goals') context.profile.primaryGoal.domain = 'hypertrophy'
    if (change === 'symptoms') context.facts.pain = true
    if (change === 'outside training') context.facts.outsideTraining = ['CrossFit']
    if (change === 'source correction') context.currentSources[0].revision++
    if (change === 'source deletion') context.currentSources = []
    if (change === 'review') context.currentReviews = []
    if (change === 'unknown schedule') context.scheduleId = 'sunday-bench'
    if (change === 'unresolved') context.unresolvedReasons = ['Need to clarify soreness']
    expect(compileOfflineReviewedWeek(context, registry).kind).toBe('review_required')
  })

  it('still rejects a 60-minute Saturday even if an author registers that profile as reviewed', () => {
    const { context, registry } = reviewedDevelopmentalWeek()
    context.profile.sessionAvailability.find(slot => slot.day === 'saturday')!.minutes = 60
    registry[0].recipe.profileHash = doseContentHash(context.profile)
    registry[0].contentHash = doseContentHash(registry[0].recipe)
    expect(compileOfflineReviewedWeek(context, registry)).toEqual({ kind: 'review_required', reasons: ['Complete session exceeds saturday availability'] })
  })

  it('checks preparation equipment even for a trusted but incorrectly registered profile', () => {
    const { context, registry } = reviewedDevelopmentalWeek()
    context.profile.equipment.resolvedIds = context.profile.equipment.resolvedIds.filter(id => id !== 'resistance_band')
    registry[0].recipe.profileHash = doseContentHash(context.profile)
    registry[0].contentHash = doseContentHash(registry[0].recipe)
    expect(compileOfflineReviewedWeek(context, registry)).toEqual({ kind: 'review_required', reasons: ['Equipment unavailable: band'] })
  })

  it.each(['rest', 'dose', 'preparation', 'protocol', 'schedule', 'timing', 'basis', 'activation'])('rejects a draft with altered %s', change => {
    const { week, context, registry } = compile()
    if (change === 'rest') work(week, 'bench-force', 'bench').restBetweenSeconds = 60
    if (change === 'dose') work(week, 'bench-force', 'bench').sets = 3
    if (change === 'preparation') week.days[0].session!.steps.shift()
    if (change === 'protocol') week.protocols[0].instructions = []
    if (change === 'schedule') [week.days[1].session, week.days[2].session] = [week.days[2].session, week.days[1].session]
    if (change === 'timing') week.days[0].timing.estimatedSeconds = 60
    if (change === 'basis') week.basis.contextHash = 'changed'
    if (change === 'activation') Object.assign(week, { persistable: true })
    expect(validateOfflineReviewedWeek(week, context, registry).ok).toBe(false)
  })

  it.each(['duplicate session', 'omitted session', 'negative rest', 'overfull preparation', 'missing protocol', 'missing logging'])('rejects malformed trusted data: %s', change => {
    const { context, registry } = reviewedDevelopmentalWeek()
    const recipe = registry[0].recipe
    if (change === 'duplicate session') recipe.sessions.push(recipe.sessions[0])
    if (change === 'omitted session') recipe.schedules[1].days.monday = null
    if (change === 'negative rest') (recipe.sessions[0].steps[1] as ReviewedWeekActivity).restBetweenSeconds = -1
    if (change === 'overfull preparation') Object.assign(recipe.sessions[0].steps[0], { seconds: 5 })
    if (change === 'missing protocol') recipe.protocols.pop()
    if (change === 'missing logging') recipe.sessions[0].steps = recipe.sessions[0].steps.filter(step => step.id !== 'logging')
    registry[0].contentHash = doseContentHash(recipe)
    expect(compileOfflineReviewedWeek(context, registry).kind).toBe('review_required')
  })

  it('rejects a changed registry and never obtains authority from a matching caller hash', () => {
    const { context, registry } = reviewedDevelopmentalWeek()
    ;(registry[0].recipe.sessions[0].steps[1] as ReviewedWeekActivity).sets++
    expect(compileOfflineReviewedWeek(context, registry).kind).toBe('review_required')
    expect(compileOfflineReviewedWeek(context, [] as ReviewedWeekRegistration[]).kind).toBe('review_required')
  })
})
