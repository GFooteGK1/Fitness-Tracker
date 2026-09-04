import type {
  ProgrammingProfile,
  WeeklyCoverageDoseUnit
} from './programming-schema'

export const ROLLING_WEEKLY_SCHEMA_VERSION = 1 as const
export const ROLLING_WEEKLY_KERNEL_VERSION = '0.1.0'
export const ROLLING_WEEKLY_POLICY_VERSION = 'rolling-weekly-0.1.0'
export const ROLLING_WEEKLY_REVIEW_ALGORITHM_VERSION = 'weekly-review-0.1.0'

export type RollingWeeklyAction =
  | 'continue'
  | 'adjust_dose'
  | 'collect_signal'
  | 'recover'
  | 'shift_emphasis'
  | 'pause_review'

export type RollingWeeklyPresentationClass =
  | 'same_track'
  | 'needs_signal'
  | 'small_adjustment'
  | 'material_change'
  | 'safety'

export type RollingWeeklyEvidenceStatus =
  | 'sufficient'
  | 'insufficient'
  | 'safety_override'

export interface RollingWeeklyEmphasis {
  goalAllocationId: string
  domain: ProgrammingProfile['primaryGoal']['domain']
  allocation: 'lead' | 'development' | 'maintenance'
}

export interface RollingTrainingDirection {
  schemaVersion: typeof ROLLING_WEEKLY_SCHEMA_VERSION
  goalSummary: string
  goalTargetDate: string | null
  currentEmphasis: RollingWeeklyEmphasis[]
  hypothesis: string
  constraintIds: string[]
}

export interface RollingWeeklyDoseChange {
  assignmentId: string
  unit: WeeklyCoverageDoseUnit
  from: number
  to: number
}

export interface RollingWeeklySignalRequest {
  coverageRequirementId: string
  movementId: string
  metricId: string
  protocolId: string
}

export interface RollingWeeklySafetyBoundary {
  reason: string
  prohibitedMovementIds: string[]
}

export interface RollingWeeklyPlanningDecision {
  reviewId: string
  action: RollingWeeklyAction
  presentationClass: RollingWeeklyPresentationClass
  evidenceStatus: RollingWeeklyEvidenceStatus
  rationale: string
  doseChange?: RollingWeeklyDoseChange
  signalRequest?: RollingWeeklySignalRequest
  safetyBoundary?: RollingWeeklySafetyBoundary
}

export interface RollingWeeklyReviewObservationLink {
  groupId: string
  disposition: 'included' | 'excluded'
  reason?: string
}

export function buildRollingTrainingDirection(
  profile: ProgrammingProfile,
  options: {
    hypothesis: string
    goalTargetDate?: string | null
  }
): RollingTrainingDirection {
  return {
    schemaVersion: ROLLING_WEEKLY_SCHEMA_VERSION,
    goalSummary: profile.athleteGoalSummary,
    goalTargetDate: options.goalTargetDate ?? profile.primaryGoal.outcome?.horizon.endsOn ?? null,
    currentEmphasis: [
      {
        goalAllocationId: profile.primaryGoal.id,
        domain: profile.primaryGoal.domain,
        allocation: 'lead'
      },
      ...profile.secondaryGoals.map(goal => ({
        goalAllocationId: goal.id,
        domain: goal.domain,
        allocation: goal.allocation
      }))
    ],
    hypothesis: options.hypothesis.trim(),
    constraintIds: profile.explicitConstraints.map(constraint => constraint.id).sort()
  }
}

export function validateRollingTrainingDirection(
  direction: RollingTrainingDirection,
  profile: ProgrammingProfile
): string[] {
  const errors: string[] = []
  if (direction.schemaVersion !== ROLLING_WEEKLY_SCHEMA_VERSION) {
    errors.push('Rolling training direction schema version is unsupported')
  }
  if (direction.goalSummary !== profile.athleteGoalSummary) {
    errors.push('Rolling training direction goal does not match the planning profile')
  }
  if (direction.hypothesis.length < 5 || direction.hypothesis.length > 500) {
    errors.push('Rolling training direction needs a concise programming hypothesis')
  }
  if (direction.goalTargetDate !== null && !isIsoDate(direction.goalTargetDate)) {
    errors.push('Rolling training direction goal target must be a YYYY-MM-DD date')
  }

  const expectedEmphasis = buildRollingTrainingDirection(profile, {
    hypothesis: direction.hypothesis,
    goalTargetDate: direction.goalTargetDate
  }).currentEmphasis
  if (stableStringify(direction.currentEmphasis) !== stableStringify(expectedEmphasis)) {
    errors.push('Rolling training direction emphasis does not match the planning profile')
  }
  if (
    new Set(direction.currentEmphasis.map(item => item.goalAllocationId)).size
    !== direction.currentEmphasis.length
  ) {
    errors.push('Rolling training direction emphasis IDs must be unique')
  }

  const expectedConstraintIds = profile.explicitConstraints.map(constraint => constraint.id).sort()
  if (stableStringify([...direction.constraintIds].sort()) !== stableStringify(expectedConstraintIds)) {
    errors.push('Rolling training direction constraints do not match the planning profile')
  }
  return errors
}

export function expectedPresentationClass(
  action: RollingWeeklyAction
): RollingWeeklyPresentationClass[] {
  if (action === 'continue') return ['same_track']
  if (action === 'collect_signal') return ['needs_signal']
  if (action === 'adjust_dose') return ['small_adjustment']
  if (action === 'shift_emphasis') return ['material_change']
  if (action === 'pause_review') return ['safety']
  return ['small_adjustment', 'material_change']
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}
