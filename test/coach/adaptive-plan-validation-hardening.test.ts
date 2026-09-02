import { describe, expect, it } from 'vitest'
import { validateAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

function buildPlan() {
  return structuredClone(buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[0].profile))
}

describe('adaptive plan validator completeness', () => {
  it('requires the complete week 1, 4, and 8 assessment schedule for every goal', () => {
    const plan = buildPlan()
    plan.adaptiveProgramming.scheduledAssessments.pop()

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toContain('Every adaptive goal needs assessments at weeks 1, 4, and 8')
  })

  it('requires one expected signal for every hypothesis evidence requirement', () => {
    const plan = buildPlan()
    plan.adaptiveProgramming.expectedSignals.pop()

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toContain('Every hypothesis evidence requirement needs one expected signal')
  })

  it('rejects duplicate decision criteria and adaptation without repeated observations', () => {
    const plan = buildPlan()
    const policy = plan.adaptiveProgramming.evaluationPolicies[0]
    const recoverCriterion = policy.criteria.find(criterion => criterion.action === 'recover')
    if (!recoverCriterion) throw new Error('Expected a recover criterion')

    recoverCriterion.comparableObservationRequirement = 'not_met'
    policy.criteria.push(structuredClone(policy.criteria[0]))

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('has duplicate action criteria'),
      expect.stringContaining('cannot recover without repeated observations')
    ]))
  })

  it('requires one hypothesis for each goal instead of duplicate goal ownership', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    profile.secondaryGoals = [{
      id: 'goal:secondary:1:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'maintenance',
      athleteIntent: 'Maintain aerobic capacity'
    }]
    const plan = structuredClone(buildCompleteEightWeekPlan(profile))
    plan.adaptiveProgramming.hypotheses[1].goalId = profile.primaryGoal.id

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toContain('Adaptive plan needs one unique hypothesis per goal')
  })

  it('prevents coverage traces from borrowing another goal evidence links', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    profile.secondaryGoals = [{
      id: 'goal:secondary:1:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'maintenance',
      athleteIntent: 'Maintain aerobic capacity'
    }]
    const plan = structuredClone(buildCompleteEightWeekPlan(profile))
    const primaryTrace = plan.adaptiveProgramming.coverageTraces.find(
      trace => trace.goalId === profile.primaryGoal.id
    )
    const secondaryEmphasis = plan.adaptiveProgramming.qualityEmphases.find(
      emphasis => emphasis.goalId === profile.secondaryGoals[0].id
    )
    const secondaryHypothesis = plan.adaptiveProgramming.hypotheses.find(
      hypothesis => hypothesis.goalId === profile.secondaryGoals[0].id
    )
    if (!primaryTrace || !secondaryEmphasis || !secondaryHypothesis) {
      throw new Error('Expected primary trace and secondary evidence links')
    }
    primaryTrace.qualityEmphasisIds = [secondaryEmphasis.id]
    primaryTrace.hypothesisIds = [secondaryHypothesis.id]

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toContain(
      `Coverage trace ${primaryTrace.requirementId} cannot borrow another goal's evidence links`
    )
  })
})
