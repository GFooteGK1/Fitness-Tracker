import {
  MOVEMENT_EQUIPMENT_IDS,
  type MovementEquipmentId
} from './movement-catalog'
import { validateCoachPlanningInput } from './planner'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  validateProgrammingProfile,
  type ProgrammingConstraint,
  type ProgrammingProfile
} from './programming-schema'
import {
  COACH_PROGRAM_DOMAIN_IDS,
  type CoachPlanningInput,
  type CoachProgramDomainId,
  type CoachStrengthAssessmentSummary
} from './types'

export interface CompleteCoachSecondaryGoalInput {
  domain: CoachProgramDomainId
  allocation: 'development' | 'maintenance'
  athleteIntent: string
}

export interface CompleteCoachPlanningInput extends CoachPlanningInput {
  format: 'complete_programming_intake_v0_3'
  resolvedEquipmentIds: MovementEquipmentId[]
  constraintKinds: Array<ProgrammingConstraint['kind']>
  secondaryGoals: CompleteCoachSecondaryGoalInput[]
}

export type CompleteCoachPlanningValidation =
  | { ok: true; value: CompleteCoachPlanningInput }
  | { ok: false; errors: string[] }

const EQUIPMENT_IDS = new Set<string>(MOVEMENT_EQUIPMENT_IDS)
const CONSTRAINT_KINDS: Array<ProgrammingConstraint['kind']> = ['no_overhead', 'no_running']

export function validateCompleteCoachPlanningInput(
  value: unknown
): CompleteCoachPlanningValidation {
  const base = validateCoachPlanningInput(value)
  if (!base.ok) return base
  if (!isRecord(value)) return { ok: false, errors: ['Planning input must be an object'] }

  const errors: string[] = []
  const equipment = Array.isArray(value.resolvedEquipmentIds)
    ? value.resolvedEquipmentIds
    : []
  const constraintKinds = Array.isArray(value.constraintKinds)
    ? value.constraintKinds
    : []
  const secondaryGoals = Array.isArray(value.secondaryGoals)
    ? value.secondaryGoals
    : []

  if (value.format !== 'complete_programming_intake_v0_3') {
    errors.push('Coach setup format is unsupported')
  }
  if (
    equipment.length === 0
    || new Set(equipment).size !== equipment.length
    || equipment.some(id => typeof id !== 'string' || !EQUIPMENT_IDS.has(id))
  ) {
    errors.push('Choose at least one recognized equipment option')
  }
  if (
    new Set(constraintKinds).size !== constraintKinds.length
    || constraintKinds.some(kind => !CONSTRAINT_KINDS.includes(kind as ProgrammingConstraint['kind']))
  ) {
    errors.push('Choose only supported explicit constraints')
  }
  if (secondaryGoals.length > 2 || secondaryGoals.some(goal => !validSecondaryGoal(goal))) {
    errors.push('Choose no more than two valid secondary goals')
  }
  const secondaryDomains = secondaryGoals
    .filter(isRecord)
    .map(goal => goal.domain)
  if (secondaryDomains.includes(base.value.primaryDomain)) {
    errors.push('Primary and secondary goal domains must be different')
  }
  if (new Set(secondaryDomains).size !== secondaryDomains.length) {
    errors.push('Secondary goal domains must be different')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      ...base.value,
      format: 'complete_programming_intake_v0_3',
      resolvedEquipmentIds: equipment as MovementEquipmentId[],
      constraintKinds: constraintKinds as Array<ProgrammingConstraint['kind']>,
      secondaryGoals: secondaryGoals as CompleteCoachSecondaryGoalInput[]
    }
  }
}

export function buildProgrammingProfile(
  input: CompleteCoachPlanningInput,
  assessments: readonly CoachStrengthAssessmentSummary[]
): ProgrammingProfile {
  const profile: ProgrammingProfile = {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    athleteGoalSummary: input.goal,
    primaryGoal: {
      id: `goal:primary:${input.primaryDomain}`,
      domain: input.primaryDomain,
      role: 'primary',
      allocation: 'lead',
      athleteIntent: input.goal
    },
    secondaryGoals: input.secondaryGoals.map((goal, index) => ({
      id: `goal:secondary:${index + 1}:${goal.domain}`,
      domain: goal.domain,
      role: 'secondary',
      allocation: goal.allocation,
      athleteIntent: goal.athleteIntent
    })),
    trainingExperience: input.experience,
    startDate: input.startDate,
    sessionAvailability: input.trainingDays.map(day => ({
      day,
      minutes: input.sessionMinutes
    })),
    equipment: {
      resolvedIds: [...input.resolvedEquipmentIds],
      unresolvedAthleteDescription: input.equipment.trim() || null
    },
    explicitConstraints: input.constraintKinds.map(kind => ({
      id: `constraint:${kind}`,
      kind,
      description: kind === 'no_overhead'
        ? 'Athlete confirmed that overhead work is unavailable.'
        : 'Athlete confirmed that running is unavailable.',
      source: 'athlete_confirmed'
    })),
    unresolvedConstraintNote: input.constraints.trim() || null,
    preferences: [],
    assessments: assessments.map(assessment => ({ ...assessment })),
    recentTraining: {
      asOfDate: null,
      lookbackDays: 0,
      completedSessionCount: 0,
      performedMovementIds: [],
      doseByCoverageTarget: []
    },
    inputSource: { kind: 'structured_v0_3_intake' }
  }
  const validation = validateProgrammingProfile(profile)
  if (!validation.ok) throw new Error(validation.errors.join('; '))
  return profile
}

function validSecondaryGoal(value: unknown): boolean {
  return isRecord(value)
    && COACH_PROGRAM_DOMAIN_IDS.includes(value.domain as CoachProgramDomainId)
    && (value.allocation === 'development' || value.allocation === 'maintenance')
    && typeof value.athleteIntent === 'string'
    && value.athleteIntent.trim().length >= 3
    && value.athleteIntent.length <= 300
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
