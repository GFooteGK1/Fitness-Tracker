import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import { CoachingContextError, contextObject } from './coaching-context'
import { createOwnedCoachingContextReader, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import { COACHING_REFERENCE_MAX_DOMAINS, readCoachingReference, type COACHING_REFERENCE_DOMAINS } from './external-coaching-reference'
import { validatePlanningIntent } from './planning-intent'
import type { CoachProgramDomainId } from './types'
import { createWorkoutTodayReader } from './workout-today-app'

const historyDays = 28
const dayMilliseconds = 86_400_000
const maximumMovementsPerWorkout = 16

type Context = Awaited<ReturnType<ReturnType<typeof createOwnedCoachingContextReader>>>
type WorkoutToday = Awaited<ReturnType<ReturnType<typeof createWorkoutTodayReader>>>
type Work = NonNullable<Context['performedWork']>
type WorkRecord = Work['records'][number]
type ReferenceDomain = typeof COACHING_REFERENCE_DOMAINS[number]

const domainSections: Record<CoachProgramDomainId, ReferenceDomain> = {
  strength: 'strength', hypertrophy: 'strength', power_explosiveness: 'power',
  speed_agility: 'power', aerobic: 'conditioning', resilience: 'recovery',
}

function shiftCalendarDate(date: string, days: number) {
  return formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(date, 0)) + days * dayMilliseconds).toISOString(), 0)
}

function currentGoals(requirements: Context['requirements']) {
  const saved = requirements.training_intent
  const intent = saved.status === 'current' ? validatePlanningIntent(saved.value) : null
  if (intent?.ok) {
    const { outcomes, priorityOrder } = intent.value
    const order = priorityOrder ?? []
    return outcomes.filter(({ goal }) => goal.status === 'active').map((outcome) => ({
      id: outcome.goal.id, statement: outcome.goal.statement, domain: outcome.domain, priority: outcome.goal.priority,
      rank: order.includes(outcome.goal.id) ? order.indexOf(outcome.goal.id) + 1 : null,
      target: outcome.goal.target, targetDate: outcome.goal.targetDate, binding: outcome.binding,
      measurement: outcome.measurement, baseline: outcome.baseline, capability: outcome.capability,
      source: { id: saved.source?.id ?? null, version: saved.source?.version ?? null },
    })).sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
      || Number(right.priority === 'primary') - Number(left.priority === 'primary')
      || left.id.localeCompare(right.id))
  }
  const primary = requirements.primary_goal
  const statement = contextObject(primary.value) ? primary.value.statement ?? primary.value.goal : null
  return primary.status === 'current' && typeof statement === 'string' && statement.trim() ? [{
    id: 'primary_goal', statement: statement.trim().slice(0, 500), domain: null, priority: 'primary' as const, rank: 1,
    target: null, targetDate: null, binding: null, measurement: null, baseline: null, capability: null,
    source: { id: primary.source?.id ?? null, version: primary.source?.version ?? null },
  }] : []
}

function workoutMovement(record: WorkRecord) {
  const native = 'sessionEffort' in record ? record : null
  const segmented = 'recordedEvent' in record ? record : null
  return {
    sourcePath: record.sourcePath, name: record.recordedName?.trim().slice(0, 160) || null,
    movementId: record.movementId, role: record.role, basis: record.basis, origin: record.origin,
    reviewState: record.reviewState, completionState: record.completionState, quantities: record.quantities,
    loadUnit: native?.quantities.loadUnit ?? segmented?.loadUnit ?? null,
    effort: native?.effort ?? null, protocol: native?.protocol ?? null,
    distance: native?.setEvidence?.distanceMetres ?? segmented?.recordedEvent.performed.distance ?? null,
    duration: native?.setEvidence?.durationSeconds ?? segmented?.recordedEvent.performed.duration ?? null,
  }
}

function projectHistory(work: Work) {
  type Workout = {
    id: string; date: string; revision: number | null; sessionEffort: Extract<WorkRecord, { sessionEffort: unknown }>['sessionEffort'] | null;
    movements: ReturnType<typeof workoutMovement>[];
  }
  const byId = new Map<string, Workout>()
  const encounteredWorkoutIds = new Set<string>()
  let dropped = 0
  for (const record of work.records) {
    if (!record.workoutId || record.date < work.window.startsOn || record.date > work.window.endsOn) {
      dropped++
      continue
    }
    encounteredWorkoutIds.add(record.workoutId)
    if (record.completionState === 'explicitly_not_completed') continue
    if (record.completionState === 'uncertain' || (!record.movementId && !record.recordedName?.trim())) {
      dropped++
      continue
    }
    const entry = byId.get(record.workoutId) ?? { id: record.workoutId, date: record.date, revision: record.revision,
      sessionEffort: null, movements: [] }
    if (entry.date !== record.date || entry.revision !== record.revision || entry.movements.length >= maximumMovementsPerWorkout) {
      dropped++
      continue
    }
    if ('sessionEffort' in record && record.sessionEffort.value !== null && !entry.sessionEffort) {
      entry.sessionEffort = record.sessionEffort
    }
    entry.movements.push(workoutMovement(record))
    byId.set(record.workoutId, entry)
  }
  const workouts = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const workoutWithoutUsableDetails = [...encounteredWorkoutIds].some(id => !byId.has(id))
  const weeks = Array.from({ length: 4 }, (_, index) => {
    const startsOn = shiftCalendarDate(work.window.startsOn, index * 7)
    const endsOn = shiftCalendarDate(startsOn, 6)
    const workoutIds = workouts.filter(workout => workout.date >= startsOn && workout.date <= endsOn).map(workout => workout.id)
    return { startsOn, endsOn, workoutIds, loggedWorkoutCount: workoutIds.length }
  })
  const historyCoverage = {
    complete: work.coverage.complete && dropped === 0 && !workoutWithoutUsableDetails,
    retrievalComplete: work.coverage.retrievalComplete,
    athleteCoverage: 'unknown' as const,
    gaps: [...new Set([...work.coverage.missing, ...work.coverage.issues.map(issue => issue.reason),
      ...work.coverage.omitted.map(omission => omission.reason), ...(dropped ? ['draft_workout_projection_incomplete'] : []),
      ...(workoutWithoutUsableDetails ? ['draft_workout_details_unavailable'] : [])])].sort(),
  }
  return { workouts, weeks, historyCoverage }
}

function playbookFor(context: Context, goals: ReturnType<typeof currentGoals>) {
  const pointer = context.coachingReference
  if (pointer.status !== 'available') return null
  const subjects = new Set<ReferenceDomain>()
  for (const goal of goals) {
    if (goal.domain) subjects.add(domainSections[goal.domain])
  }
  for (const general of ['assessment', 'recovery'] as const) {
    if (subjects.size < COACHING_REFERENCE_MAX_DOMAINS) subjects.add(general)
  }
  const reference = readCoachingReference({ version: pointer.version, domains: [...subjects] })
  return reference.contentHash === pointer.contentHash ? reference : null
}

const reviewRequired = (message = 'Review your saved plan before drafting a session.') => ({ status: 'review_required' as const, message })
const unavailable = (message: string) => ({ status: 'unavailable' as const, message })
const needsInput = (message: string) => ({ status: 'needs_input' as const, message })

export function projectSessionDraftRequirement(item: Context['requirements']['training_constraints']) {
  return { status: item.status, value: item.value, source: item.source ? { id: item.source.id, version: item.source.version } : null }
}

function currentRequirements(requirements: Context['requirements']) {
  const keys = ['training_schedule', 'available_equipment', 'training_constraints', 'exercise_preferences'] as const
  return Object.fromEntries(keys.map(key => [key, projectSessionDraftRequirement(requirements[key])]))
}

function dayScheduleFor(date: string, programming: Context['acceptedProgramming']) {
  for (const status of ['planned', 'completed', 'skipped'] as const) {
    if (programming?.todaySessions.some(session => session.status === status)) return status
  }
  const window = programming?.scheduleWindow
  return window && date >= window.startsOn && date <= window.endsOn ? 'scheduled_rest' as const : 'unscheduled' as const
}

function buildEvidence(context: Context, assessment: Extract<Context['dailyCheckIn'], { status: 'saved' }>,
  work: Work, history: ReturnType<typeof projectHistory>, goals: ReturnType<typeof currentGoals>,
  playbook: NonNullable<ReturnType<typeof playbookFor>>, today: WorkoutToday, planId: string | null) {
  const acceptedSessions = context.acceptedProgramming?.todaySessions.map(({ id, status, prescription }) => ({ id, status, prescription }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id))) ?? []
  const alreadyTrainedToday = today.lastWorkout.date === context.localDate || acceptedSessions.some(session => session.status === 'completed')
    || history.workouts.some(workout => workout.date === context.localDate)
  const daySchedule = dayScheduleFor(context.localDate, context.acceptedProgramming)
  return {
    date: context.localDate, window: work.window, goals, ...history, playbook,
    checkIn: assessment.checkIn, checkInScale: assessment.scale,
    requirements: currentRequirements(context.requirements), alreadyTrainedToday,
    todayWorkStatus: alreadyTrainedToday ? 'recorded' as const : today.lastWorkout.status === 'unavailable' ? 'unknown' as const : 'no_records' as const,
    daySchedule, hasPlannedSession: daySchedule === 'planned',
    acceptedSession: { planId, sessions: acceptedSessions },
  }
}

export type SessionDraftEvidence = ReturnType<typeof buildEvidence>
export type DraftEvidenceResult = { status: 'ready'; evidence: SessionDraftEvidence; checkInRevision?: string }
  | { status: 'needs_input' | 'review_required' | 'unavailable'; message: string }

/** Use the existing authenticated reader and current plan safety boundary. Reads only. */
export function createSessionDraftEvidenceReader(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return async (tzOffset: number): Promise<DraftEvidenceResult> => {
    const authorized = await authorize()
    const bound = async () => authorized
    const context = await createOwnedCoachingContextReader(bound, policy)({ tzOffset, days: historyDays })
    const { dailyCheckIn, performedWork: work } = context
    if (dailyCheckIn.status === 'unavailable') return unavailable('Today’s saved check-in could not be verified. Try again.')
    if (dailyCheckIn.status !== 'saved') return needsInput('Can you save today’s check-in before drafting a session?')
    if (!context.acceptedProgramming && !context.gaps.includes('accepted_plan_missing')) {
      return unavailable('Your accepted plan could not be verified. Try again before drafting a session.')
    }
    const plan: unknown = context.acceptedProgramming?.plan
    const planId = contextObject(plan) ? plan.id : null
    const today = await createWorkoutTodayReader(bound, policy)(context)
    const safety = today.safety
    if (formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset) !== context.localDate) {
      throw new CoachingContextError(409, 'The local date changed. Save the current check-in before drafting.')
    }
    if (safety.status === 'unavailable') {
      return unavailable('Training safety could not be verified. Try again before drafting a session.')
    }
    if (safety.status === 'hold') return safety.reason === 'concerning_feedback'
      ? reviewRequired('Review the concerning pain in your saved session feedback before drafting a session.')
      : reviewRequired()
    if (['unavailable', 'truncated', 'invalid'].includes(context.requirements.training_intent.status)) {
      return unavailable('Your current training goals could not be verified. Try again before drafting a session.')
    }
    if (context.requirements.training_intent.status === 'needs_review') {
      return needsInput('Can you review and confirm your current training goals in SociusFit before trying again?')
    }
    const constraintStatus = context.requirements.training_constraints.status
    if (['unavailable', 'truncated', 'invalid'].includes(constraintStatus)) {
      return unavailable('Your saved training restrictions could not be verified. Try again before drafting a session.')
    }
    if (constraintStatus === 'needs_review') {
      return reviewRequired('Review and confirm your saved training restrictions in SociusFit before drafting a session.')
    }
    const goals = currentGoals(context.requirements)
    if (!goals.length) return needsInput('Can you confirm and save the training goal for today’s draft in SociusFit before trying again?')
    const playbook = playbookFor(context, goals)
    if (!playbook) return unavailable('The reviewed coaching playbook could not be verified. Try again.')
    if (!work || work.status === 'unavailable' || work.window.endsOn !== context.localDate
      || work.window.startsOn !== shiftCalendarDate(context.localDate, 1 - historyDays)) {
      return unavailable('The four-week training history could not be verified. Try again.')
    }
    const history = projectHistory(work)
    if (!history.workouts.length) return needsInput('Can you use SociusFit to log your completed sessions from the past four weeks before trying again?')
    return { status: 'ready', checkInRevision: dailyCheckIn.revision, evidence: buildEvidence(context, dailyCheckIn, work, history, goals, playbook,
      today, typeof planId === 'string' ? planId : null) }
  }
}
