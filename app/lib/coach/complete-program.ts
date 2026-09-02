import {
  buildAdaptivePlanContract,
  type AdaptivePlanContract
} from './adaptive-plan'
import { MOVEMENT_CATALOG_VERSION } from './movement-catalog'
import { COMPLETE_PROGRAMMING_POLICY, COMPLETE_PROGRAMMING_POLICY_VERSION } from './programming-policy'
import { COMPLETE_PROGRAMMING_REFERENCE } from './programming-reference'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  validateProgrammingProfile,
  type CompleteProgrammingSessionPrescription,
  type ProgrammingProfile
} from './programming-schema'
import {
  composeWeeklySessions,
  type SessionCompositionResult
} from './session-composer'
import {
  buildWeeklyCoverageSchedule,
  type WeeklyCoverageSchedule
} from './weekly-coverage'
import type { CoachProgramDomainId } from './types'

const DOMAIN_TITLE: Record<CoachProgramDomainId, string> = {
  strength: 'Strength',
  hypertrophy: 'Build muscle',
  power_explosiveness: 'Power and explosiveness',
  speed_agility: 'Speed and agility',
  aerobic: 'Aerobic conditioning',
  resilience: 'Resilience and movement capacity'
}

export interface CompleteProgrammingWeekDraft {
  weekNumber: number
  role: import('./types').EightWeekRole
  intent: string
  review: {
    status: 'not_scheduled' | 'pending_athlete_review'
    adjustableStressors: Array<'volume' | 'intensity' | 'impact' | 'complexity' | 'density'>
  }
  schedule: WeeklyCoverageSchedule
  sessions: CompleteProgrammingSessionPrescription[]
  uncomposedAvailableDays: SessionCompositionResult['uncomposedAvailableDays']
}

export interface CompleteProgrammingPlanDraft {
  schemaVersion: typeof PROGRAMMING_SCHEMA_VERSION
  format: 'complete_programming_plan_v0_3'
  kernelVersion: typeof PROGRAMMING_KERNEL_VERSION
  policyVersion: string
  evidenceReferenceVersion: string
  movementCatalogVersion: string
  title: string
  startDate: string
  endDate: string
  profileSnapshot: ProgrammingProfile
  adaptiveProgramming: AdaptivePlanContract
  weeks: CompleteProgrammingWeekDraft[]
}

/**
 * Builds an inspectable draft only. Weeks 4 and 8 remain pending review; this
 * function does not infer fatigue, apply a deload, or activate a plan.
 */
export function buildCompleteEightWeekPlan(
  profile: ProgrammingProfile
): CompleteProgrammingPlanDraft {
  const validation = validateProgrammingProfile(profile)
  if (!validation.ok) throw new Error(validation.errors.join('; '))

  const weeks = Array.from({ length: 8 }, (_, index) => {
    const weekNumber = index + 1
    const schedule = buildWeeklyCoverageSchedule(profile, { weekNumber })
    const composition = composeWeeklySessions(profile, schedule)
    const isReviewCheckpoint = schedule.reviewRequired
    const weekIntent = COMPLETE_PROGRAMMING_POLICY.eightWeekIntent.find(item => item.week === weekNumber)
    if (!weekIntent) throw new Error(`Programming policy is missing week ${weekNumber}`)
    return {
      weekNumber,
      role: weekIntent.role,
      intent: weekIntent.intent,
      review: {
        status: isReviewCheckpoint
          ? 'pending_athlete_review' as const
          : 'not_scheduled' as const,
        adjustableStressors: isReviewCheckpoint
          ? [...COMPLETE_PROGRAMMING_POLICY.review.adjustableStressors]
          : []
      },
      schedule,
      sessions: composition.sessions,
      uncomposedAvailableDays: composition.uncomposedAvailableDays
    }
  })
  const adaptiveProgramming = buildAdaptivePlanContract(profile, weeks)

  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    format: 'complete_programming_plan_v0_3',
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
    evidenceReferenceVersion: COMPLETE_PROGRAMMING_REFERENCE.referenceVersion,
    movementCatalogVersion: MOVEMENT_CATALOG_VERSION,
    title: `${DOMAIN_TITLE[profile.primaryGoal.domain]} · 8 weeks`,
    startDate: profile.startDate,
    endDate: addDays(profile.startDate, 55),
    profileSnapshot: cloneProfile(profile),
    adaptiveProgramming,
    weeks
  }
}

function cloneProfile(profile: ProgrammingProfile): ProgrammingProfile {
  return {
    ...profile,
    primaryGoal: structuredClone(profile.primaryGoal),
    secondaryGoals: profile.secondaryGoals.map(goal => structuredClone(goal)),
    sessionAvailability: profile.sessionAvailability.map(day => ({ ...day })),
    equipment: {
      ...profile.equipment,
      resolvedIds: [...profile.equipment.resolvedIds]
    },
    explicitConstraints: profile.explicitConstraints.map(constraint => ({ ...constraint })),
    preferences: profile.preferences.map(preference => ({ ...preference })),
    assessments: profile.assessments.map(assessment => ({ ...assessment })),
    recentTraining: {
      ...profile.recentTraining,
      performedMovementIds: [...profile.recentTraining.performedMovementIds],
      doseByCoverageTarget: profile.recentTraining.doseByCoverageTarget.map(dose => ({ ...dose }))
    },
    inputSource: profile.inputSource.kind === 'structured_v0_3_intake'
      ? { kind: 'structured_v0_3_intake' }
      : {
        kind: 'legacy_v0_2_intake',
        snapshot: {
          ...profile.inputSource.snapshot,
          trainingDays: [...profile.inputSource.snapshot.trainingDays]
        }
      }
  }
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
