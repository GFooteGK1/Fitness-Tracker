/** Complete, trusted reviewed work. No route, saved-plan format or numerical activation. */
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION, type DoseSourceBinding } from './initial-dose-policy'
import type { NumericRange, ProgrammingProfile } from './programming-schema'
import type { TrainingWeekday } from './types'
import { reviewedStepSeconds, reviewedSessionActivities, validReviewedSessionTiming, reviewedSessionSchema, reviewedSessionTimeBudget } from './reviewed-session-contract'
import { validateReviewedMovementEligibility } from './reviewed-movement-eligibility'

export const REVIEWED_WEEK_DAYS: readonly TrainingWeekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]
export type ReviewedWeekSchedule = Record<TrainingWeekday, string | null>
export type ReviewedWeekEffort =
  | { kind: 'rpe'; min: number; max: number }
  | { kind: 'rpe_ceiling'; max: number }
  | { kind: 'perceived_percent'; min: number; max: number; cue: string }
  | { kind: 'quality'; cue: string }

export type ReviewedWeekLoad =
  | { kind: 'external'; value: number; unit: 'lb' | 'kg'; convention: 'total' | 'per_hand' }
  | { kind: 'bodyweight' }
  | { kind: 'athlete_selected'; instruction: string }
  | { kind: 'not_applicable' }

/** A qualitative recovery prescription keeps its estimate separate from its meaning. */
export type ReviewedRest = number | { kind: 'as_needed'; estimatedSeconds: number }

/** Work duration allowances are accounting assumptions, never prescribed tempos/speeds. */
export type ReviewedWeekWork =
  | { kind: 'repetitions'; repetitions: NumericRange; sides: 1 | 2; secondsPerRep: number }
  | { kind: 'effort_repetitions'; targetRir: number; sides: 1 | 2; estimatedSecondsPerSet: number; sideSwitchSeconds: number }
  | { kind: 'duration'; seconds: number; sides: 1 | 2; sideSwitchSeconds: number }
  | { kind: 'distance'; stages: Array<{ label: string; metres: number }>;
      targetSeconds: number | null; allowanceSeconds: number; finish: string }

export interface ReviewedWeekActivity {
  kind: 'activity'
  id: string
  /** Reviewed-case identity; catalog compatibility is not implied for absent entries. */
  movementId: string
  role: 'preparation' | 'working' | 'monitoring' | 'cooldown'
  requiredEquipment: string[]
  sets: number
  work: ReviewedWeekWork
  load: ReviewedWeekLoad
  effort: ReviewedWeekEffort
  /** Legacy field names; schema 2 permits explicit qualitative preparation recovery. */
  restBetweenSeconds: ReviewedRest
  restAfterSeconds: ReviewedRest
  protocolId: string | null
  instructions: string[]
}
export type ReviewedWeekStep = ReviewedWeekActivity | {
  kind: 'preparation_window'
  id: string
  seconds: number
  /** Ordered prescribed preparation; duration includes its recovery/setup. */
  activities: ReviewedWeekActivity[]
  instructions: string[]
} | {
  kind: 'allowance'
  id: string
  purpose: 'transition' | 'logging' | 'recovery'
  seconds: number
}
export interface ReviewedWeekSession {
  id: string
  steps: ReviewedWeekStep[]
  /** Reviewed themes, not claims that these doses meet general coverage targets. */
  themes: string[]
  instructions: string[]
  /** Required when preparation recovery is qualitative; never a recovery cap. */
  conditionalTiming?: { kind: 'conditional'; whenOverBudget: string }
  /** Includes the optional exercise's preparation and transitions; final logging stays required. */
  optionalTail?: { fromStepId: string; reason: string }
}
export interface ReviewedWeekProtocol {
  id: string
  sessionId: string
  activityId: string
  /** Entire session is bound, including immediate preparation and preceding work. */
  instructions: string[]
  sensorMetadata: null
  actualObservations: []
}
export interface ReviewedWeekRecipe {
  id: string
  policyVersion: typeof INITIAL_DOSE_POLICY_VERSION
  review: { id: string; contentHash: string }
  sources: DoseSourceBinding[]
  profileHash: string
  /** Includes readiness, symptoms, commitments, familiarity and source/protocol context. */
  contextHash: string
  sessions: ReviewedWeekSession[]
  baseSchedule: ReviewedWeekSchedule
  schedules: Array<{ id: string; days: ReviewedWeekSchedule; reason: string }>
  protocols: ReviewedWeekProtocol[]
  instructions: string[]
  limitations: string[]
}
export interface OfflineReviewedWeekContext {
  recipeId: string
  scheduleId: string
  profile: ProgrammingProfile
  facts: Record<string, unknown>
  currentReviews: Array<{ id: string; contentHash: string }>
  currentSources: DoseSourceBinding[]
  unresolvedReasons: string[]
}
export interface ReviewedWeekRegistration {
  recipe: ReviewedWeekRecipe
  /** Server-owned trusted digest. The request/model cannot supply this registry. */
  contentHash: string
}

export interface OfflineReviewedWeek {
  format: 'offline_reviewed_week_v1'
  policyVersion: typeof INITIAL_DOSE_POLICY_VERSION
  numericRuntimeEligible: false
  persistable: false
  requiresAthleteAcceptance: true
  basis: {
    recipeHash: string
    review: ReviewedWeekRecipe['review']
    sources: DoseSourceBinding[]
    profileSnapshot: ProgrammingProfile
    contextHash: string
    scheduleId: string
    reason: string
  }
  days: Array<{
    day: TrainingWeekday
    availableSeconds: number
    session: ReviewedWeekSession | null
    timing: { estimatedSeconds: number; remainingSeconds: number; components: Array<{ id: string; seconds: number }>; conditional?: true;
      requiredSeconds?: number; optionalSeconds?: number }
  }>
  exposures: Array<{ sessionId: string; themes: string[]; baseDay: TrainingWeekday; day: TrainingWeekday }>
  /** Calendar spacing only; never asserts equal recovery or physiological suitability. */
  spacing: Array<{ from: string; to: string; baseDays: number; selectedDays: number }>
  protocols: ReviewedWeekProtocol[]
  instructions: string[]
  limitations: string[]
}

const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
const nonnegative = (n: number) => { if (!Number.isFinite(n) || n < 0) throw new Error('Invalid time or dose'); return n }
const unique = (ids: string[]) => ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length

function activities(session: ReviewedWeekSession): ReviewedWeekActivity[] {
  return reviewedSessionActivities(session)
}

function validateSchedule(schedule: ReviewedWeekSchedule, ids: string[]): void {
  if (!same(Object.keys(schedule).sort(), [...REVIEWED_WEEK_DAYS].sort())
    || !same(Object.values(schedule).filter(id => id !== null).sort(), [...ids].sort())) {
    throw new Error('Schedule must retain each complete session exactly once')
  }
}

/** Trusted, exact reviewed-case reconciliation. Does not choose new doses or certify training outcomes. */
export function compileOfflineReviewedWeek(context: OfflineReviewedWeekContext, registry: readonly ReviewedWeekRegistration[]):
  { kind: 'compiled'; week: OfflineReviewedWeek } | { kind: 'review_required'; reasons: string[] } {
  try {
    const entries = registry.filter(entry => entry.recipe.id === context.recipeId)
    if (entries.length !== 1) throw new Error('Unique reviewed week registration required')
    const { recipe, contentHash } = entries[0]
    if (!same(contentHash, doseContentHash(recipe)) || recipe.policyVersion !== INITIAL_DOSE_POLICY_VERSION) throw new Error('Reviewed week changed')
    if (!unique(recipe.sources.map(source => source.id)) || !recipe.sources.length
      || !same(context.currentReviews.filter(review => review.id === recipe.review.id), [recipe.review])
      || !same([...context.currentSources].sort((a,b) => a.id.localeCompare(b.id)), [...recipe.sources].sort((a,b) => a.id.localeCompare(b.id)))) throw new Error('Review or source binding changed')
    if (context.unresolvedReasons.length) return { kind: 'review_required', reasons: [...context.unresolvedReasons] }
    if (doseContentHash(context.profile) !== recipe.profileHash || doseContentHash(context.facts) !== recipe.contextHash) throw new Error('Profile or complete reviewed context changed')
    const profile = context.profile
    if (profile.unresolvedConstraintNote || profile.equipment.unresolvedAthleteDescription) throw new Error('Unresolved athlete constraints or equipment')
    const selected = recipe.schedules.filter(schedule => schedule.id === context.scheduleId)
    if (selected.length !== 1) throw new Error('Schedule is not a reviewed option')
    if (!unique(recipe.sessions.map(session => session.id)) || !recipe.sessions.length) throw new Error('Invalid reviewed session identities')
    const ids = recipe.sessions.map(session => session.id)
    validateSchedule(recipe.baseSchedule, ids)
    validateSchedule(selected[0].days, ids)
    if (!unique(profile.sessionAvailability.map(slot => slot.day))
      || profile.sessionAvailability.some(slot => !REVIEWED_WEEK_DAYS.includes(slot.day) || !(slot.minutes > 0) || !Number.isFinite(slot.minutes))) throw new Error('Invalid availability')
    for (const session of recipe.sessions) {
      const movements = activities(session)
      if (!validReviewedSessionTiming(session)) throw new Error('Conditional recovery requires its reviewed time adjustment')
      if (!session.steps.length || !movements.length || !unique([...session.steps.map(step => step.id),
        ...session.steps.flatMap(step => step.kind === 'preparation_window' ? step.activities.map(activity => activity.id) : [])])) throw new Error('Invalid session steps')
      if (!session.steps.some(step => step.kind === 'allowance' && step.purpose === 'logging' && step.seconds > 0)) throw new Error('Logging time missing')
      for (const activity of movements) {
        if (!activity.movementId || !activity.requiredEquipment.length
          || activity.requiredEquipment.some(id => !profile.equipment.resolvedIds.includes(id))) throw new Error(`Equipment unavailable: ${activity.id}`)
        if (profile.preferences.some(preference => preference.movementId === activity.movementId && preference.preference === 'avoid')) throw new Error(`Avoided movement: ${activity.id}`)
        // Broader/clinical restriction reasoning requires a separately reviewed registration.
        if (profile.explicitConstraints.length) throw new Error('Constrained profiles require separate review')
        const eligibility = validateReviewedMovementEligibility(activity.movementId, profile, activity.requiredEquipment)
        if (!eligibility.ok) throw new Error(eligibility.errors.join('; '))
        const effort = activity.effort
        if (!effort || !['rpe', 'rpe_ceiling', 'perceived_percent', 'quality'].includes(effort.kind)
          || (effort.kind === 'quality' ? !effort.cue || activity.role === 'working' || activity.role === 'monitoring'
            : effort.max < 1 || effort.max > (effort.kind === 'perceived_percent' ? 100 : 10)
              || ('min' in effort && (effort.min < 1 || effort.min > effort.max)))) throw new Error(`Invalid effort: ${activity.id}`)
        if (activity.load.kind === 'external') nonnegative(activity.load.value)
        if (activity.protocolId !== null && (activity.role !== 'monitoring'
          || recipe.protocols.filter(protocol => protocol.id === activity.protocolId && protocol.sessionId === session.id && protocol.activityId === activity.id).length !== 1)) throw new Error('Monitoring protocol missing')
      }
    }
    if (!unique(recipe.protocols.map(protocol => protocol.id))) throw new Error('Ambiguous monitoring protocols')
    for (const protocol of recipe.protocols) {
      const session = recipe.sessions.find(item => item.id === protocol.sessionId)
      if (!session || activities(session).filter(activity => activity.id === protocol.activityId && activity.protocolId === protocol.id).length !== 1
        || protocol.sensorMetadata !== null || protocol.actualObservations.length) throw new Error('Invalid synthetic monitoring protocol')
    }
    const days = REVIEWED_WEEK_DAYS.map(day => {
      const availableSeconds = (profile.sessionAvailability.find(slot => slot.day === day)?.minutes ?? 0) * 60
      const session = recipe.sessions.find(item => item.id === selected[0].days[day]) ?? null
      const components = session?.steps.map(step => ({ id: step.id, seconds: reviewedStepSeconds(step) })) ?? []
      const estimatedSeconds = components.reduce((sum, component) => sum + component.seconds, 0)
      const budget = session ? reviewedSessionTimeBudget(session) : { requiredSeconds: 0, optionalSeconds: 0 }
      if (budget.requiredSeconds > availableSeconds) throw new Error(`Complete session exceeds ${day} availability`)
      return { day, availableSeconds, session: structuredClone(session), timing: { estimatedSeconds, remainingSeconds: availableSeconds - estimatedSeconds, components,
        ...(session && reviewedSessionSchema(session) > 1 ? { conditional: true as const } : {}),
        ...(session?.optionalTail ? budget : {}) } }
    })
    const dayOf = (schedule: ReviewedWeekSchedule, id: string) => REVIEWED_WEEK_DAYS.find(day => schedule[day] === id)!
    const exposures = recipe.sessions.map(session => ({ sessionId: session.id, themes: [...session.themes],
      baseDay: dayOf(recipe.baseSchedule, session.id), day: dayOf(selected[0].days, session.id) }))
    const spacing = exposures.flatMap((from, index) => exposures.slice(index + 1).map(to => ({ from: from.sessionId, to: to.sessionId,
      baseDays: REVIEWED_WEEK_DAYS.indexOf(to.baseDay) - REVIEWED_WEEK_DAYS.indexOf(from.baseDay),
      selectedDays: REVIEWED_WEEK_DAYS.indexOf(to.day) - REVIEWED_WEEK_DAYS.indexOf(from.day) })))
    return { kind: 'compiled', week: {
      format: 'offline_reviewed_week_v1', policyVersion: INITIAL_DOSE_POLICY_VERSION,
      numericRuntimeEligible: false, persistable: false, requiresAthleteAcceptance: true,
      basis: { recipeHash: contentHash, review: structuredClone(recipe.review), sources: structuredClone(recipe.sources),
        profileSnapshot: structuredClone(profile), contextHash: recipe.contextHash, scheduleId: context.scheduleId, reason: selected[0].reason },
      days, exposures, spacing, protocols: structuredClone(recipe.protocols), instructions: [...recipe.instructions],
      limitations: [...recipe.limitations,
        'Time fit is arithmetic at reviewed allowances, not measured duration; required rests are never shortened.',
        'Exposure spacing is disclosed, not a physiological recovery or general coverage certification.',
        'Offline trusted review only; authenticated whole-week acceptance and saved readback remain unavailable.'],
    } }
  } catch (error) {
    return { kind: 'review_required', reasons: [error instanceof Error ? error.message : 'Invalid reviewed week'] }
  }
}

/** Reject any altered draft, including timing, dose, basis, flags and schedule. */
export function validateOfflineReviewedWeek(week: OfflineReviewedWeek, context: OfflineReviewedWeekContext, registry: readonly ReviewedWeekRegistration[]) {
  const expected = compileOfflineReviewedWeek(context, registry)
  try {
    return expected.kind === 'compiled' && same(week, expected.week)
      ? { ok: true as const, errors: [] }
      : { ok: false as const, errors: expected.kind === 'review_required' ? expected.reasons : ['Week differs from its complete reviewed compilation'] }
  } catch { return { ok: false as const, errors: ['Invalid reviewed week data'] } }
}
