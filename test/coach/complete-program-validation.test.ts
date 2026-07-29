import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { validateCompleteProgrammingPlan } from '@/app/lib/coach/program-validator'
import { buildEightWeekProposal } from '@/app/lib/coach/planner'
import { COACH_PROGRAM_DOMAIN_IDS } from '@/app/lib/coach/types'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

describe('complete eight-week programming plan', () => {
  it.each(GOLDEN_PROGRAMMING_PROFILES)('$id passes the complete-plan golden gate', ({
    profile,
    expectedTargetId,
    expectedFirstWeekMovementIds
  }) => {
    const plan = buildCompleteEightWeekPlan(profile)
    const validation = validateCompleteProgrammingPlan(plan)

    expect(validation).toEqual({ ok: true, errors: [], warnings: [] })
    expect(plan.weeks).toHaveLength(8)
    expect(plan.weeks[3].review).toMatchObject({
      status: 'pending_athlete_review',
      adjustableStressors: ['volume', 'intensity', 'impact', 'complexity', 'density']
    })
    expect(plan.weeks.map(week => week.role)).toEqual([
      'establish', 'build', 'develop', 'deload_review',
      'reestablish', 'build', 'develop', 'deload_assess'
    ])
    expect(plan.weeks[7].review.status).toBe('pending_athlete_review')
    expect(plan.weeks.flatMap(week => week.schedule.requirements)
      .some(requirement => requirement.targetId === expectedTargetId)).toBe(true)
    expect(plan.weeks[0].sessions.map(session => (
      session.blocks.slice(1).map(block => block.exercises[0].movementId)
    ))).toEqual(expectedFirstWeekMovementIds)
  })

  it('fails when a session has no task-specific preparation', () => {
    const plan = structuredClone(buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[1].profile))
    plan.weeks[0].sessions[0].blocks.shift()

    expect(validateCompleteProgrammingPlan(plan).errors)
      .toContain('Week 1 monday must begin with specific preparation')
  })

  it('rejects a week with fewer than two actionable sessions', () => {
    const plan = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[2].profile)
    plan.weeks[0].sessions = plan.weeks[0].sessions.slice(0, 1)

    expect(validateCompleteProgrammingPlan(plan).errors)
      .toContain('Week 1 must contain at least two actionable sessions')
  })

  it('fails unaccounted coverage, time overflow, and an incomplete conditioning dose', () => {
    const baseline = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[4].profile)
    const noLedger = structuredClone(baseline)
    noLedger.weeks[0].schedule.ledger = undefined as never

    const overflow = structuredClone(baseline)
    overflow.weeks[0].sessions[0].scheduledMinutes = 1

    const incompleteIntervals = structuredClone(baseline)
    const conditioning = incompleteIntervals.weeks[0].sessions.flatMap(candidate => candidate.blocks)
      .flatMap(block => block.exercises)
      .find(exercise => exercise.dose.kind === 'intervals')
    if (!conditioning) throw new Error('Golden aerobic plan must contain interval work')
    conditioning.dose = { kind: 'intervals' } as never

    expect(validateCompleteProgrammingPlan(noLedger).errors)
      .toContain('Week 1 schedule ledger is required')
    expect(validateCompleteProgrammingPlan(overflow).errors)
      .toContain('Week 1 monday exceeds its accepted time budget')
    expect(validateCompleteProgrammingPlan(incompleteIntervals).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining(
        'interval dose must define work, recovery, repetitions, series, total intervals, and series recovery'
      )]))
  })

  it('fails substitutions that do not preserve coverage and loads without assessment provenance', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    profile.assessments = [{
      id: 'assessment-1',
      movement: 'Back Squat',
      variation: null,
      load: 225,
      unit: 'lb',
      reps: 5,
      assessedOn: '2026-07-27',
      isTrueRepMax: true,
      rir: 0,
      rpe: null,
      athleteConfidence: 0.9,
      estimatedOneRepMax: 262.5,
      estimateKind: 'estimated_1rm',
      calculatorVersion: 'epley-general-v1'
    }]
    profile.equipment.resolvedIds = ['bodyweight', 'barbell', 'rack']
    const plan = buildCompleteEightWeekPlan(profile)
    const work = plan.weeks[0].sessions.flatMap(session => session.blocks)
      .flatMap(block => block.exercises)
      .find(exercise => exercise.role !== 'specific_preparation' && exercise.loadAnchor)
    if (!work?.loadAnchor || work.loadAnchor.source !== 'saved_assessment') {
      throw new Error('Golden strength plan must expose a saved assessment load')
    }
    work.substitutionMovementIds = ['push_up']
    work.loadAnchor.assessmentId = 'missing-assessment'

    const badCalculation = buildCompleteEightWeekPlan(profile)
    const calculatedLoad = badCalculation.weeks[0].sessions.flatMap(session => session.blocks)
      .flatMap(block => block.exercises)
      .find(exercise => exercise.role !== 'specific_preparation' && exercise.loadAnchor)
    if (!calculatedLoad?.loadAnchor) throw new Error('Expected a deterministic load calculation')
    calculatedLoad.loadAnchor.loadRange.min = 1

    const validation = validateCompleteProgrammingPlan(plan)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('does not preserve required coverage'),
      expect.stringContaining('references an unavailable assessment')
    ]))
    expect(validateCompleteProgrammingPlan(badCalculation).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining(
        'does not match its assessment and rounding policy'
      )]))
  })

  it('requires pending athlete review at weeks 4 and 8 without pretending a uniform deload occurred', () => {
    const plan = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[2].profile)
    plan.weeks[3].review = { status: 'not_scheduled', adjustableStressors: [] }

    expect(validateCompleteProgrammingPlan(plan).errors)
      .toContain('Week 4 must remain pending athlete review before any deload adaptation')
  })

  it('fails movements that conflict with the accepted constraint snapshot', () => {
    const plan = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[3].profile)
    plan.profileSnapshot.explicitConstraints.push({
      id: 'constraint:no-running',
      kind: 'no_running',
      description: 'No running is currently available',
      source: 'athlete_confirmed'
    })

    expect(validateCompleteProgrammingPlan(plan).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining(
        'violates equipment, experience, or constraint eligibility'
      )]))
  })

  it('returns a validation result instead of throwing for malformed unknown input', () => {
    const malformed = {
      format: 'complete_programming_plan_v0_3',
      schemaVersion: 1,
      kernelVersion: '0.3.0',
      policyVersion: '0.3.0',
      evidenceReferenceVersion: 'complete-programming-0.1.0',
      movementCatalogVersion: 'complete-movements-0.1.0',
      profileSnapshot: {},
      weeks: []
    }

    expect(() => validateCompleteProgrammingPlan(malformed)).not.toThrow()
    expect(validateCompleteProgrammingPlan(malformed).ok).toBe(false)
  })

  it('rejects the legacy one-primary-plus-one-support proposal as a complete v0.3 plan', () => {
    const legacy = buildEightWeekProposal({
      primaryDomain: 'strength',
      goal: 'Build general strength over eight weeks',
      experience: 'consistent',
      trainingDays: ['monday', 'wednesday', 'friday'],
      sessionMinutes: 60,
      equipment: 'full gym',
      constraints: 'none',
      startDate: '2026-08-03'
    })

    const validation = validateCompleteProgrammingPlan(legacy)
    expect(validation.ok).toBe(false)
    expect(validation.errors).toContain('Plan format must be complete_programming_plan_v0_3')
  })
})

test.prop([
  fc.integer({ min: 0, max: GOLDEN_PROGRAMMING_PROFILES.length - 1 }),
  fc.constantFrom(...COACH_PROGRAM_DOMAIN_IDS)
], { numRuns: 36 })('whole-plan validation remains deterministic across representative states and domains', (
  profileIndex,
  domain
) => {
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[profileIndex].profile)
  profile.primaryGoal = {
    id: `goal:primary:${domain}`,
    domain,
    role: 'primary',
    allocation: 'lead',
    athleteIntent: `Develop ${domain}`
  }
  profile.athleteGoalSummary = `Develop ${domain} through a complete eight-week plan`
  const first = buildCompleteEightWeekPlan(profile)
  const second = buildCompleteEightWeekPlan(profile)

  expect(second).toEqual(first)
  const validation = validateCompleteProgrammingPlan(first)
  const underbuiltWeeks = first.weeks.filter(week => week.sessions.length < 2)
  if (underbuiltWeeks.length > 0) {
    expect(validation.ok).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining(
      underbuiltWeeks.map(week => `Week ${week.weekNumber} must contain at least two actionable sessions`)
    ))
  } else {
    expect(validation.ok).toBe(true)
  }
})
