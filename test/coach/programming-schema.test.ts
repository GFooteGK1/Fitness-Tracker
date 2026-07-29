import { describe, expect, it } from 'vitest'
import { buildEightWeekProposal } from '@/app/lib/coach/planner'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  detectCoachPrescriptionFormat,
  normalizeLegacyPlanningInput,
  validateProgrammingProfile,
  validateWeeklyCoverageRequirement,
  type ProgrammingProfile,
  type WeeklyCoverageRequirement
} from '@/app/lib/coach/programming-schema'

const legacyInput = {
  primaryDomain: 'strength' as const,
  goal: 'Build useful full-body strength',
  experience: 'consistent' as const,
  trainingDays: ['monday', 'wednesday', 'friday'] as const,
  sessionMinutes: 60 as const,
  equipment: 'Barbell, rack, dumbbells, and a bike',
  constraints: 'Keep Saturday free',
  startDate: '2026-08-03'
}

function validProfile(): ProgrammingProfile {
  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    athleteGoalSummary: 'Build useful strength while maintaining aerobic fitness',
    primaryGoal: {
      id: 'goal:primary:strength',
      domain: 'strength',
      role: 'primary',
      allocation: 'lead',
      athleteIntent: 'Build useful full-body strength'
    },
    secondaryGoals: [{
      id: 'goal:secondary:aerobic',
      domain: 'aerobic',
      role: 'secondary',
      allocation: 'maintenance',
      athleteIntent: 'Maintain an easy aerobic base'
    }],
    trainingExperience: 'consistent',
    startDate: '2026-08-03',
    sessionAvailability: [
      { day: 'monday', minutes: 45 },
      { day: 'wednesday', minutes: 60 },
      { day: 'friday', minutes: 75 }
    ],
    equipment: {
      resolvedIds: ['barbell', 'rack', 'dumbbell'],
      unresolvedAthleteDescription: null
    },
    explicitConstraints: [],
    unresolvedConstraintNote: null,
    preferences: [],
    assessments: [],
    recentTraining: {
      asOfDate: '2026-07-28',
      lookbackDays: 28,
      completedSessionCount: 8,
      performedMovementIds: ['back_squat'],
      doseByCoverageTarget: []
    },
    inputSource: { kind: 'structured_v0_3_intake' }
  }
}

function validCoverageRequirement(): WeeklyCoverageRequirement {
  return {
    id: 'coverage:strength:knee_dominant',
    goalAllocationId: 'goal:primary:strength',
    domain: 'strength',
    kind: 'movement_pattern',
    targetId: 'knee_dominant',
    targetLabel: 'Knee-dominant strength',
    priority: 'priority',
    doseAnchorId: 'strength:primary_pattern',
    estimatedMinutesPerExposure: 12,
    dose: {
      source: 'validated_policy',
      unit: 'working_sets',
      minimum: 4,
      target: { min: 6, max: 10 }
    },
    eligibleDays: ['monday', 'wednesday', 'friday'],
    sequencing: {
      mustPrecedeKinds: ['energy_system'],
      avoidSameDayTargetIds: [],
      preferredRecoveryHours: 48
    },
    fatigueCost: 'high',
    impactCost: 'moderate',
    evidenceRuleIds: ['week.dose-before-split', 'session.priority-first'],
    policyVersion: '0.3.0'
  }
}

describe('complete programming schema', () => {
  it('normalizes the legacy intake without interpreting free text or changing its snapshot', () => {
    const profile = normalizeLegacyPlanningInput(legacyInput)

    expect(profile).toMatchObject({
      schemaVersion: 1,
      kernelVersion: '0.3.0',
      primaryGoal: {
        domain: 'strength',
        role: 'primary',
        allocation: 'lead'
      },
      secondaryGoals: [],
      sessionAvailability: [
        { day: 'monday', minutes: 60 },
        { day: 'wednesday', minutes: 60 },
        { day: 'friday', minutes: 60 }
      ],
      equipment: {
        resolvedIds: [],
        unresolvedAthleteDescription: legacyInput.equipment
      },
      explicitConstraints: [],
      unresolvedConstraintNote: legacyInput.constraints,
      inputSource: {
        kind: 'legacy_v0_2_intake',
        snapshot: legacyInput
      }
    })
    expect(profile.inputSource.kind === 'legacy_v0_2_intake'
      ? profile.inputSource.snapshot
      : null).not.toBe(legacyInput)
    expect(validateProgrammingProfile(profile)).toEqual({ ok: true, errors: [] })
  })

  it('accepts one lead goal, up to two bounded secondary goals, and per-day time budgets', () => {
    const profile = validProfile()
    profile.secondaryGoals = [
      ...profile.secondaryGoals,
      {
        id: 'goal:secondary:resilience',
        domain: 'resilience',
        role: 'secondary',
        allocation: 'development',
        athleteIntent: 'Improve lower-leg capacity'
      }
    ]

    expect(validateProgrammingProfile(profile)).toEqual({ ok: true, errors: [] })
  })

  it('rejects duplicate or over-allocated goals and session budgets outside 30-90 minutes', () => {
    const profile = validProfile()
    profile.secondaryGoals = [
      ...profile.secondaryGoals,
      {
        id: 'goal:secondary:strength',
        domain: 'strength',
        role: 'secondary',
        allocation: 'development',
        athleteIntent: 'Duplicate the lead goal'
      },
      {
        id: 'goal:secondary:resilience',
        domain: 'resilience',
        role: 'secondary',
        allocation: 'maintenance',
        athleteIntent: 'Maintain movement capacity'
      }
    ]
    profile.sessionAvailability = [
      { day: 'monday', minutes: 29 },
      { day: 'monday', minutes: 91 }
    ]

    const result = validateProgrammingProfile(profile)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'Choose no more than two secondary goals',
      'Goal domains must be unique',
      'Choose 2 to 6 different training days',
      'Session minutes must be an integer from 30 through 90'
    ]))
  })

  it('requires weekly coverage dose to come from deterministic policy with traceable evidence', () => {
    expect(validateWeeklyCoverageRequirement(validCoverageRequirement()))
      .toEqual({ ok: true, errors: [] })

    const invalid = validCoverageRequirement()
    invalid.dose = {
      ...invalid.dose,
      source: 'llm_generated' as 'validated_policy',
      target: { min: 3, max: 2 }
    }
    invalid.evidenceRuleIds = []

    expect(validateWeeklyCoverageRequirement(invalid)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Coverage dose must come from validated policy',
        'Coverage target must be ordered and at least the minimum dose',
        'Coverage requirements need at least one evidence rule'
      ])
    })
  })

  it('recognizes current stored prescriptions without upgrading or recomputing them', () => {
    const current = buildEightWeekProposal(legacyInput).sessions[0].prescription

    expect(current.evidence.policyVersion).toBe('0.2.0')
    expect(detectCoachPrescriptionFormat(current)).toBe('legacy_v0_2')
    expect(detectCoachPrescriptionFormat({
      schemaVersion: 1,
      format: 'complete_programming_v0_3',
      kernelVersion: '0.3.0',
      policyVersion: '0.3.0',
      sessionId: 'session-1',
      domain: 'strength',
      title: 'Full-body strength',
      intent: 'Practice high-quality force production',
      scheduledMinutes: 60,
      blocks: []
    })).toBe('complete_v0_3')
    expect(detectCoachPrescriptionFormat({ arbitrary: true })).toBe('unknown')
  })
})
