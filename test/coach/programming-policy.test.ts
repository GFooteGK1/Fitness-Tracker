import { describe, expect, it } from 'vitest'
import { COACH_PROGRAM_DOMAIN_IDS } from '@/app/lib/coach/types'
import { COMPLETE_PROGRAMMING_REFERENCE } from '@/app/lib/coach/programming-reference'
import {
  COMPLETE_PROGRAMMING_POLICY,
  COMPLETE_PROGRAMMING_POLICY_VERSION,
  getDoseAnchor,
  getSessionTimeBudget
} from '@/app/lib/coach/programming-policy'

describe('complete programming policy v0.3', () => {
  it('is versioned against the evidence reference and preserves application authority', () => {
    expect(COMPLETE_PROGRAMMING_POLICY_VERSION).toBe('0.3.0')
    expect(COMPLETE_PROGRAMMING_POLICY).toMatchObject({
      schemaVersion: 1,
      evidenceReferenceVersion: COMPLETE_PROGRAMMING_REFERENCE.referenceVersion,
      authority: {
        numericPrescriptionSource: 'validated_policy',
        modelMayCreateNumericDose: false,
        activationRequiresAthleteAcceptance: true
      },
      goalAllocation: {
        primaryGoals: 1,
        maximumSecondaryGoals: 2
      }
    })
    expect(JSON.stringify(COMPLETE_PROGRAMMING_POLICY)).not.toContain('exerciseCount')
  })

  it('resolves every evidence rule used by policy', () => {
    const knownRuleIds = new Set(
      COMPLETE_PROGRAMMING_REFERENCE.evidenceRules.map(rule => rule.id)
    )

    for (const anchor of COMPLETE_PROGRAMMING_POLICY.doseAnchors) {
      expect(anchor.evidenceRuleIds.length).toBeGreaterThan(0)
      expect(anchor.evidenceRuleIds.every(id => knownRuleIds.has(id))).toBe(true)
    }
    for (const template of COMPLETE_PROGRAMMING_POLICY.weeklyCoverageTemplates) {
      expect(template.evidenceRuleIds.length).toBeGreaterThan(0)
      expect(template.evidenceRuleIds.every(id => knownRuleIds.has(id))).toBe(true)
      expect(getDoseAnchor(template.doseAnchorId).domain).toBe(template.domain)
    }
    expect(COMPLETE_PROGRAMMING_POLICY.evidenceRuleIds.every(
      id => knownRuleIds.has(id)
    )).toBe(true)
  })

  it('reserves preparation and priority work across the supported 30-90 minute range', () => {
    for (const minutes of [30, 45, 60, 75, 90]) {
      const budget = getSessionTimeBudget(minutes)
      expect(budget.sessionMinutes).toBe(minutes)
      expect(budget.specificPreparationMinutes).toBeGreaterThanOrEqual(5)
      expect(budget.priorityAdaptationMinutes).toBeGreaterThanOrEqual(15)
      expect(budget.flexibleMinutes).toBeGreaterThanOrEqual(0)
      expect(
        budget.specificPreparationMinutes
        + budget.priorityAdaptationMinutes
        + budget.flexibleMinutes
      ).toBe(minutes)
      expect(budget.preservedRoles).toEqual([
        'specific_preparation',
        'priority_adaptation'
      ])
    }

    expect(() => getSessionTimeBudget(29)).toThrow(
      'sessionMinutes must be an integer from 30 through 90'
    )
    expect(() => getSessionTimeBudget(91)).toThrow(
      'sessionMinutes must be an integer from 30 through 90'
    )
  })

  it('uses weekly coverage priority before role-based trimming', () => {
    expect(COMPLETE_PROGRAMMING_POLICY.sessionTime).toMatchObject({
      coveragePriorityPrecedesRoleTiebreaker: true,
      preservedRoles: ['specific_preparation', 'priority_adaptation'],
      removalOrder: [
        'downshift',
        'assistance_and_capacity',
        'conditioning',
        'secondary_adaptation'
      ]
    })
  })

  it('defines goal-specific coverage and at least one numeric dose anchor for every domain', () => {
    expect(Object.keys(COMPLETE_PROGRAMMING_POLICY.coverageByDomain).sort())
      .toEqual([...COACH_PROGRAM_DOMAIN_IDS].sort())

    for (const domain of COACH_PROGRAM_DOMAIN_IDS) {
      const coverage = COMPLETE_PROGRAMMING_POLICY.coverageByDomain[domain]
      expect(coverage.allowedKinds.length).toBeGreaterThan(0)
      expect(coverage.doseAnchorIds.length).toBeGreaterThan(0)
      for (const anchorId of coverage.doseAnchorIds) {
        expect(getDoseAnchor(anchorId).domain).toBe(domain)
      }
    }
  })

  it('protects power and speed quality and fully specifies aerobic intervals', () => {
    const power = getDoseAnchor('power:ballistic_quality')
    const speed = getDoseAnchor('speed:max_quality')
    const intervals = getDoseAnchor('aerobic:controlled_intervals')

    expect(JSON.stringify(power).toLowerCase()).toContain('speed')
    expect(JSON.stringify(power).toLowerCase()).not.toContain('failure')
    expect(JSON.stringify(speed).toLowerCase()).toContain('mechanic')
    expect(intervals.dose).toMatchObject({
      kind: 'intervals',
      workSeconds: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      recoverySeconds: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      repetitions: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      series: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      seriesRecoverySeconds: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) })
    })
  })

  it('changes one principal progression variable and reviews rather than auto-deloading weeks 4 and 8', () => {
    expect(COMPLETE_PROGRAMMING_POLICY.progression.maxPrincipalVariablesPerRevision).toBe(1)
    expect(COMPLETE_PROGRAMMING_POLICY.progression.allowedVariables).toEqual(expect.arrayContaining([
      'load', 'repetitions', 'sets', 'duration', 'distance', 'density', 'complexity', 'execution_quality'
    ]))
    expect(COMPLETE_PROGRAMMING_POLICY.review).toMatchObject({
      checkpointWeeks: [4, 8],
      uniformNoTrainingWeek: false,
      automaticPlanActivation: false
    })
    expect(COMPLETE_PROGRAMMING_POLICY.review.adjustableStressors).toEqual(expect.arrayContaining([
      'volume', 'intensity', 'impact', 'complexity', 'density'
    ]))
  })
})
