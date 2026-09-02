import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_PLAN_CONTRACT_VERSION,
  REQUIRED_ADAPTIVE_DECISION_ACTIONS,
  validateAdaptivePlanContract
} from '@/app/lib/coach/adaptive-plan'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { validateCompleteProgrammingPlan } from '@/app/lib/coach/program-validator'
import { detectCoachPrescriptionFormat } from '@/app/lib/coach/programming-schema'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

describe('adaptive plan contract', () => {
  it.each(GOLDEN_PROGRAMMING_PROFILES)(
    '$id traces every primary emphasis through a goal, hypothesis, assessment, and policy',
    ({ profile }) => {
      const plan = buildCompleteEightWeekPlan(profile)
      const adaptive = plan.adaptiveProgramming
      const primaryEmphases = adaptive.qualityEmphases.filter(
        emphasis => emphasis.state === 'priority_development'
      )

      expect(adaptive.contractVersion).toBe(ADAPTIVE_PLAN_CONTRACT_VERSION)
      expect(adaptive.goals).toHaveLength(1 + profile.secondaryGoals.length)
      expect(adaptive.goals[0]).toMatchObject({
        goalId: profile.primaryGoal.id,
        statement: profile.primaryGoal.athleteIntent,
        priority: 'primary',
        target: null,
        horizon: {
          startsOn: profile.startDate,
          endsOn: plan.endDate
        }
      })
      expect(primaryEmphases.length).toBeGreaterThan(0)

      for (const emphasis of primaryEmphases) {
        expect(adaptive.goals.some(goal => goal.goalId === emphasis.goalId)).toBe(true)
        expect(adaptive.hypotheses.some(hypothesis => hypothesis.id === emphasis.hypothesisId)).toBe(true)
        expect(adaptive.scheduledAssessments.filter(
          assessment => emphasis.scheduledAssessmentIds.includes(assessment.id)
        ).map(assessment => assessment.weekNumber)).toEqual([1, 4, 8])
        expect(adaptive.evaluationPolicies.some(
          policy => policy.id === emphasis.evaluationPolicyId
        )).toBe(true)
      }

      for (const hypothesis of adaptive.hypotheses) {
        expect(hypothesis.evidenceRequirements.every(
          requirement => requirement.minimumComparableObservations >= 2
        )).toBe(true)
        expect(hypothesis.allowedActions).toEqual(expect.arrayContaining([
          ...REQUIRED_ADAPTIVE_DECISION_ACTIONS,
          'hold_collect_more'
        ]))
      }

      expect(validateAdaptivePlanContract(adaptive, profile, plan.weeks)).toEqual({
        ok: true,
        errors: []
      })
    }
  )

  it('traces every composed coverage requirement back to the adaptive hypothesis', () => {
    const plan = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    const traceIds = new Set(plan.adaptiveProgramming.coverageTraces.map(trace => trace.requirementId))
    const requirementIds = new Set(plan.weeks.flatMap(
      week => week.schedule.requirements.map(requirement => requirement.id)
    ))
    const composedRequirementIds = new Set(plan.weeks.flatMap(week => (
      week.sessions.flatMap(session => session.blocks.flatMap(block => block.coverageRequirementIds))
    )))

    expect(traceIds).toEqual(requirementIds)
    expect([...composedRequirementIds].every(id => traceIds.has(id))).toBe(true)
  })

  it('fails closed when a primary emphasis loses its assessment or evaluation trace', () => {
    const plan = structuredClone(buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[0].profile))
    const primary = plan.adaptiveProgramming.qualityEmphases.find(
      emphasis => emphasis.state === 'priority_development'
    )
    if (!primary) throw new Error('Expected a primary emphasis')
    primary.scheduledAssessmentIds = []
    primary.evaluationPolicyId = 'missing-policy'

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('needs scheduled assessments'),
      expect.stringContaining('unknown evaluation policy')
    ]))
  })

  it('rejects traces that borrow another goal hypothesis, assessment, or policy', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    profile.secondaryGoals = [{
      id: 'goal:secondary:1:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'maintenance',
      athleteIntent: 'Maintain aerobic capacity'
    }]
    const plan = structuredClone(buildCompleteEightWeekPlan(profile))
    const primary = plan.adaptiveProgramming.qualityEmphases.find(
      emphasis => emphasis.goalId === profile.primaryGoal.id
    )
    const secondary = plan.adaptiveProgramming.qualityEmphases.find(
      emphasis => emphasis.goalId === profile.secondaryGoals[0].id
    )
    if (!primary || !secondary) throw new Error('Expected primary and secondary emphases')

    primary.hypothesisId = secondary.hypothesisId
    primary.scheduledAssessmentIds = [...secondary.scheduledAssessmentIds]

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('does not match its goal hypothesis'),
      expect.stringContaining('assessment schedule does not match its goal'),
      expect.stringContaining('evaluation policy does not match its hypothesis')
    ]))
  })

  it('rejects a hypothesis that could adapt from one observation', () => {
    const plan = structuredClone(buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[2].profile))
    plan.adaptiveProgramming.hypotheses[0].evidenceRequirements[0].minimumComparableObservations = 1

    const result = validateAdaptivePlanContract(
      plan.adaptiveProgramming,
      plan.profileSnapshot,
      plan.weeks
    )

    expect(result.errors).toContain('Evidence requirements need at least two comparable observations')
  })

  it('keeps legacy complete v0.3 plans and session prescriptions compatible', () => {
    const current = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[1].profile)
    const legacyPlan = structuredClone(current) as unknown as Record<string, unknown>
    delete legacyPlan.adaptiveProgramming
    const validation = validateCompleteProgrammingPlan(legacyPlan)

    expect(validation.ok).toBe(true)
    expect(validation.warnings).toContain(
      'Legacy complete v0.3 plan has no adaptive programming trace'
    )
    expect(detectCoachPrescriptionFormat(current.weeks[0].sessions[0])).toBe('complete_v0_3')
  })

  it('keeps numeric outcomes explicit instead of inventing a target', () => {
    const plan = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[4].profile)

    expect(plan.adaptiveProgramming.goals.every(goal => goal.target === null)).toBe(true)
    expect(plan.adaptiveProgramming.expectedSignals.every(signal => (
      ['increase', 'decrease', 'maintain_or_improve'].includes(signal.expectedDirection)
    ))).toBe(true)
  })
})
