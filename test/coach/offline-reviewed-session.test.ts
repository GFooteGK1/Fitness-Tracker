import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { compileOfflineReviewedSession } from '@/app/lib/coach/offline-reviewed-session'
import { validateOfflineReviewedSession, validateCompleteProgrammingWeekDose } from '@/app/lib/coach/program-validator'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'

import { reviewedBenchExample as example } from '../fixtures/reviewed-bench-session'

function compile(context = example()) {
  const result = compileOfflineReviewedSession(context)
  if (result.kind !== 'compiled') throw new Error(result.reasons.join('; '))
  return result.session
}

describe('reviewed offline session compiler', () => {
  it('lowers the actual accepted bench session and preserves unknown timing', () => {
    const source = readFileSync('docs/verification/programming-quality/bench-next-exposure-review-1.md', 'utf8').replace(/\r\n/g, '\n')
    const context = example()
    expect(doseContentHash(source)).toBe(context.registry[0].option.review.contentHash)
    // Pins the reviewed translation as well as its prose source. Changes need explicit review.
    expect(doseContentHash(context.recipes[0].recipe)).toMatchInlineSnapshot(`"cab357a7165ca102c0ff299fbd46eba67005bb050cce74cd7ffb0d479069adc9"`)
    const session = compile(context)
    expect(session.working).toMatchObject({ movementId: 'barbell_bench_press', dose: { kind: 'sets_reps', sets: { min: 3, max: 3 }, repetitions: { min: 6, max: 6 } },
      executionTarget: { kind: 'rpe', range: { min: 7, max: 8 } }, restSeconds: { min: 180, max: 180 },
      loadAnchor: { source: 'reviewed_option', loadRange: { min: 170, max: 170, unit: 'lb' }, protocolId: 'same-bench-variation' } })
    expect(session.preparation).toEqual(context.recipes[0].recipe.preparation)
    expect(session.preparation.map(step => step.id)).toEqual(['bike', 'band', 'scapular', 'ramp-45', 'ramp-95', 'ramp-135', 'ramp-155'])
    expect(session.timing).toEqual({ estimatedMinutes: null, wholeWeekFitVerified: false })
    expect(session.persistable).toBe(false)
    expect(session.numericRuntimeEligible).toBe(false)
    expect(MOVEMENT_CATALOG.find(item => item.id === 'barbell_bench_press')?.programmingStatus).toBe('evidence_only')
  })

  it.each(['load', 'unit', 'effort', 'rest', 'protocol', 'convention', 'omit_prep', 'reorder_prep', 'rest_prep', 'instructions', 'time', 'persistable'])(
    'detects post-compilation tampering: %s', change => {
      const context = example(), session = compile(context)
      const anchor = session.working.loadAnchor!
      if (anchor.source !== 'reviewed_option') throw new Error('Expected reviewed source')
      if (change === 'load') anchor.loadRange.min++
      if (change === 'unit') anchor.loadRange.unit = 'kg'
      if (change === 'effort') session.working.executionTarget = { kind: 'rpe', range: { min: 9, max: 10 } }
      if (change === 'rest') session.working.restSeconds.min = 60
      if (change === 'protocol') anchor.protocolId = 'floor-press'
      if (change === 'convention') anchor.loadConvention = 'per_hand_external'
      if (change === 'omit_prep') session.preparation.pop()
      if (change === 'reorder_prep') session.preparation.reverse()
      if (change === 'rest_prep') session.preparation[0].restAfterSeconds = { min: 60, max: 60 }
      if (change === 'instructions') session.workingInstructions.pop()
      if (change === 'time') Object.assign(session.timing, { estimatedMinutes: 30, wholeWeekFitVerified: true })
      if (change === 'persistable') Object.assign(session, { persistable: true })
      expect(validateOfflineReviewedSession(session, context).ok).toBe(false)
    },
  )

  it.each(['equipment', 'avoid', 'experience', 'source', 'recipe', 'review', 'facts', 'week_unknown'])(
    'refuses incompatible or changed input: %s', change => {
      const context = example()
      if (change === 'equipment') context.profile.equipment.resolvedIds = ['bodyweight']
      if (change === 'avoid') context.profile.preferences = [{ movementId: 'barbell_bench_press', preference: 'avoid', source: 'athlete_confirmed' }]
      if (change === 'experience') context.profile.trainingExperience = 'new_or_returning'
      if (change === 'source') context.input.currentSources[0].revision++
      if (change === 'recipe') context.recipes[0].recipe.preparation.pop()
      if (change === 'review') context.input.currentReviews = []
      if (change === 'facts') context.input.facts!.pain = true
      if (change === 'week_unknown') context.input.wholeWeekFit = 'unknown'
      expect(compileOfflineReviewedSession(context).kind).toBe('review_required')
    },
  )

  it('does not alias authority or mutate accepted evidence', () => {
    const context = example(), original = structuredClone(context), session = compile(context)
    expect(context).toEqual(original)
    session.preparation.reverse()
    session.working.restSeconds.max = 10
    expect(context).toEqual(original)
    context.registry[0].option.after.sets++
    expect(validateOfflineReviewedSession(compile(original), context).ok).toBe(false)
  })

  it('preserves doubles and load ranges in a mechanical retention fixture without a new coaching label', () => {
    const context = example(), option = context.registry[0].option
    option.operation = 'retain'
    option.review = { id: 'mechanical-retention-only', contentHash: doseContentHash('Not a human acceptance') }
    option.before = { ...option.before, repetitions: { min: 2, max: 2 }, load: { min: 200, max: 205, unit: 'lb' }, targetRpe: { min: 7, max: 8 } }
    option.after = structuredClone(option.before)
    context.input.before = structuredClone(option.before)
    context.input.currentReviews = [option.review]
    context.registry[0].contentHash = doseContentHash(option)
    Object.assign(context.recipes[0].recipe, { optionHash: doseContentHash(option), review: option.review })
    context.recipes[0].contentHash = doseContentHash(context.recipes[0].recipe)
    expect(compile(context).working).toMatchObject({ dose: { repetitions: { min: 2, max: 2 } }, loadAnchor: { loadRange: { min: 200, max: 205, unit: 'lb' } } })
  })

  it.each([0, 1])('normal week validation rejects reviewed source even in block %s', blockIndex => {
    const context = example(), session = compile(context)
    const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: context.profile.startDate, profile: context.profile,
      direction: buildRollingTrainingDirection(context.profile, { hypothesis: 'Repeatable moderate exposures support strength development.', goalTargetDate: '2027-04-01' }) })
    if (plan.kind !== 'weekly_plan') throw new Error('Expected weekly plan')
    expect(validateCompleteProgrammingWeekDose(context.profile, plan.schedule, plan.sessions).ok).toBe(true)
    plan.sessions[0].blocks[blockIndex].exercises[0].loadAnchor = session.working.loadAnchor
    expect(validateCompleteProgrammingWeekDose(context.profile, plan.schedule, plan.sessions).errors).toEqual(expect.arrayContaining([expect.stringContaining('load source is not permitted in live programming')]))
  })
})
