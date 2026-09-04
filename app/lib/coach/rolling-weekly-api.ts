import { createHash } from 'crypto'
import type { AdaptivePlanContract } from './adaptive-plan'
import { validateCompleteProgrammingWeekDose } from './program-validator'
import {
  buildProgrammingGoalOutcome,
  validateProgrammingProfile,
  type ProgrammingProfile
} from './programming-schema'
import {
  stableStringify,
  validateRollingTrainingDirection
} from './rolling-weekly-contracts'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'

export interface StoredRollingWeeklyIntent {
  format: 'rolling_weekly_intent_v0_1'
  horizon_weeks: 1
  kernel_version: string
  weekly_plan: RollingWeeklyPlanDraft
  adaptive_programming: AdaptivePlanContract
}

export interface RollingProposalRpcRow {
  proposal_id: string
  proposed_program_id: string
  proposed_plan_version_id: string
}

export function buildStoredRollingWeeklyIntent(
  plan: RollingWeeklyPlanDraft,
  adaptivePlan: AdaptivePlanContract
): StoredRollingWeeklyIntent {
  return {
    format: 'rolling_weekly_intent_v0_1',
    horizon_weeks: 1,
    kernel_version: plan.kernelVersion,
    weekly_plan: structuredClone(plan),
    adaptive_programming: structuredClone(adaptivePlan)
  }
}

export function parseStoredRollingWeeklyIntent(value: unknown): StoredRollingWeeklyIntent | null {
  if (!isRecord(value)) return null
  if (
    value.format !== 'rolling_weekly_intent_v0_1'
    || value.horizon_weeks !== 1
    || typeof value.kernel_version !== 'string'
    || !isRecord(value.weekly_plan)
    || !isRecord(value.adaptive_programming)
  ) return null

  const weeklyPlan = value.weekly_plan as unknown as RollingWeeklyPlanDraft
  if (
    weeklyPlan.kind !== 'weekly_plan'
    || !isIsoDate(weeklyPlan.windowStart)
    || !isIsoDate(weeklyPlan.windowEnd)
    || !Array.isArray(weeklyPlan.sessions)
    || !Array.isArray(weeklyPlan.scheduledSessions)
    || !isRecord(weeklyPlan.profileSnapshot)
    || !isRecord(weeklyPlan.directionSnapshot)
    || !isRecord(weeklyPlan.schedule)
  ) return null

  const profileValidation = validateProgrammingProfile(weeklyPlan.profileSnapshot)
  const directionErrors = validateRollingTrainingDirection(
    weeklyPlan.directionSnapshot,
    weeklyPlan.profileSnapshot
  )
  const weekValidation = validateCompleteProgrammingWeekDose(
    weeklyPlan.profileSnapshot,
    weeklyPlan.schedule,
    weeklyPlan.sessions
  )
  if (!profileValidation.ok || directionErrors.length > 0 || !weekValidation.ok) return null

  return value as unknown as StoredRollingWeeklyIntent
}

export function profileForDirectionHorizon(
  profile: ProgrammingProfile,
  startDate: string,
  goalTargetDate: string | null
): ProgrammingProfile {
  const next = structuredClone(profile)
  next.startDate = startDate
  if (goalTargetDate !== null) {
    if (!isIsoDate(goalTargetDate) || goalTargetDate < startDate) {
      throw new Error('Goal target date must be on or after the weekly start date')
    }
    const existingGoalStart = next.primaryGoal.outcome?.horizon.startsOn ?? startDate
    if (!next.primaryGoal.outcome) {
      next.primaryGoal.outcome = buildProgrammingGoalOutcome(
        next.primaryGoal.domain,
        next.primaryGoal.athleteIntent,
        startDate
      )
    }
    next.primaryGoal.outcome.horizon = {
      startsOn: existingGoalStart,
      endsOn: goalTargetDate
    }
  }
  const validation = validateProgrammingProfile(next)
  if (!validation.ok) throw new Error(validation.errors.join('; '))
  return next
}

export function serializeRollingSessions(plan: RollingWeeklyPlanDraft) {
  return plan.scheduledSessions.map((session, index) => ({
    week_number: 1,
    session_index: index + 1,
    scheduled_date: session.scheduledDate,
    prescription: session.prescription
  }))
}

export function rollingFingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function nextIsoDate(value: string): string {
  if (!isIsoDate(value)) throw new Error('Date must use YYYY-MM-DD')
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function isMonday(value: string): boolean {
  return isIsoDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 1
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

export function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString() === value ? value : null
}

export function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}

export function validWindowDays(value: unknown): number | null {
  if (value === undefined) return 84
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 180
    ? value
    : null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
