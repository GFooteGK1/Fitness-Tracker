/** Browser-safe lossless read contract. Decoding is not permission to generate or accept. */
import type { ReviewedRest, ReviewedWeekActivity, ReviewedWeekSession, ReviewedWeekStep, ReviewedWeekProtocol } from './offline-reviewed-week'
import type { DoseSourceBinding } from './initial-dose-policy'
import type { TrainingWeekday } from './types'

export const REVIEWED_SESSION_FORMAT = 'reviewed_programming_v0_1' as const
export const REVIEWED_SESSION_DAYS: readonly TrainingWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
export interface ReviewedSessionPrescription {
  format: typeof REVIEWED_SESSION_FORMAT
  schemaVersion: 1 | 2 | 3
  policyVersion: 'initial-dose-0.2.0'
  sessionId: string
  day: TrainingWeekday
  title: string
  intent: string
  scheduledMinutes: number
  estimatedSeconds: number
  content: ReviewedWeekSession
  protocols: ReviewedWeekProtocol[]
  source: { recipeId: string; recipeHash: string; review: { id: string; contentHash: string }; sources: DoseSourceBinding[] }
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 30000
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(text)
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000
const count = (value: unknown): value is number => number(value) && Number.isInteger(value) && value > 0 && value <= 1000
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const unique = (values: string[]) => new Set(values).size === values.length

function rest(value: unknown, role: unknown): value is ReviewedRest {
  return number(value) || (role === 'preparation' && record(value)
    && Object.keys(value).sort().join(',') === 'estimatedSeconds,kind'
    && value.kind === 'as_needed' && number(value.estimatedSeconds) && value.estimatedSeconds > 0)
}
export const reviewedRestEstimate = (value: ReviewedRest): number => typeof value === 'number' ? value : value.estimatedSeconds
export function hasQualitativeReviewedRest(session: ReviewedWeekSession): boolean {
  return reviewedSessionActivities(session).some(activity => typeof activity.restBetweenSeconds !== 'number'
    || typeof activity.restAfterSeconds !== 'number')
}
export function reviewedSessionSchema(session: ReviewedWeekSession): 1 | 2 | 3 {
  if (session.optionalTail !== undefined || reviewedSessionActivities(session).some(activity => activity.work.kind === 'effort_repetitions')) return 3
  return hasQualitativeReviewedRest(session) ? 2 : 1
}
export function validReviewedSessionTiming(session: ReviewedWeekSession): boolean {
  const timing = session.conditionalTiming
  if (!validOptionalTail(session)) return false
  return reviewedSessionSchema(session) > 1 ? record(timing)
    && Object.keys(timing).sort().join(',') === 'kind,whenOverBudget'
    && timing.kind === 'conditional' && text(timing.whenOverBudget) && timing.whenOverBudget.trim().length > 0
    : timing === undefined
}

function validOptionalTail(session: ReviewedWeekSession): boolean {
  const tail = session.optionalTail
  if (tail === undefined) return true
  if (!record(tail) || Object.keys(tail).sort().join(',') !== 'fromStepId,reason'
    || !text(tail.fromStepId) || !text(tail.reason) || !tail.reason.trim()) return false
  const start = session.steps.findIndex(step => step.id === tail.fromStepId)
  const last = session.steps.at(-1)
  if (start <= 0 || start >= session.steps.length - 1 || last?.kind !== 'allowance'
    || last.purpose !== 'logging' || last.seconds <= 0) return false
  const optional = session.steps.slice(start, -1)
  const optionalActivities = optional.flatMap(reviewedStepActivities)
  const optionalWork = optionalActivities.filter(activity => activity.role === 'working')
  // One complete trailing exercise: transition, its easy preparation, then work.
  // Starting at the working set would silently leave its preparation mandatory.
  if (optional[0]?.kind !== 'allowance' || optional[0].purpose !== 'transition'
    || optional.length < 3 || optionalWork.length !== 1
    || optional.at(-1)?.kind !== 'activity' || optional.at(-1) !== optionalWork[0]
    || !optional.slice(1, -1).every(step => reviewedStepActivities(step).length > 0
      && reviewedStepActivities(step).every(activity => activity.role === 'preparation'
        && activity.movementId === optionalWork[0].movementId))) return false
  return session.steps.slice(0, start).flatMap(reviewedStepActivities).some(activity => activity.role === 'working')
    && optional.every(step => !(step.kind === 'allowance' && step.purpose === 'logging'))
    && optionalActivities.every(activity => activity.role !== 'monitoring')
}

export function isOptionalReviewedStep(session: ReviewedWeekSession, stepId: string): boolean {
  if (!session.optionalTail || !validOptionalTail(session)) return false
  const start = session.steps.findIndex(step => step.id === session.optionalTail!.fromStepId)
  const index = session.steps.findIndex(step => step.id === stepId)
  return index >= start && index < session.steps.length - 1
}

export function reviewedSessionTimeBudget(session: ReviewedWeekSession): { requiredSeconds: number; optionalSeconds: number } {
  if (!validOptionalTail(session)) throw new Error('Invalid optional session tail')
  return session.steps.reduce((sum, step) => {
    sum[isOptionalReviewedStep(session, step.id) ? 'optionalSeconds' : 'requiredSeconds'] += reviewedStepSeconds(step)
    return sum
  }, { requiredSeconds: 0, optionalSeconds: 0 })
}

export function isReviewedActivity(value: unknown): value is ReviewedWeekActivity {
  if (!record(value) || value.kind !== 'activity' || !text(value.id) || !text(value.movementId)
    || !['preparation', 'working', 'monitoring', 'cooldown'].includes(String(value.role))
    || !texts(value.requiredEquipment) || value.requiredEquipment.length === 0 || !count(value.sets)
    || !rest(value.restBetweenSeconds, value.role) || !rest(value.restAfterSeconds, value.role) || !texts(value.instructions)
    || !(value.protocolId === null || text(value.protocolId))) return false
  if (value.sets === 1 && typeof value.restBetweenSeconds !== 'number') return false
  const { work, effort, load } = value
  if (!record(work) || !record(effort) || !record(load)) return false
  if (work.kind !== 'effort_repetitions' && ('targetRir' in work || 'estimatedSecondsPerSet' in work)) return false
  if (work.kind === 'repetitions') {
    if (!record(work.repetitions) || !count(work.repetitions.min) || !count(work.repetitions.max)
      || work.repetitions.min > work.repetitions.max || ![1, 2].includes(Number(work.sides))
      || typeof work.sides !== 'number' || !number(work.secondsPerRep) || work.secondsPerRep === 0) return false
  } else if (work.kind === 'effort_repetitions') {
    if (Object.keys(work).sort().join(',') !== 'estimatedSecondsPerSet,kind,sideSwitchSeconds,sides,targetRir'
      || value.role !== 'working' || effort.kind !== 'rpe'
      || !number(work.targetRir) || work.targetRir > 10 || ![1, 2].includes(Number(work.sides))
      || typeof work.sides !== 'number' || !number(work.estimatedSecondsPerSet) || work.estimatedSecondsPerSet === 0
      || !number(work.sideSwitchSeconds) || (work.sides === 1 && work.sideSwitchSeconds !== 0)) return false
  } else if (work.kind === 'duration') {
    if (!number(work.seconds) || work.seconds === 0 || ![1, 2].includes(Number(work.sides))
      || typeof work.sides !== 'number' || !number(work.sideSwitchSeconds)) return false
  } else if (work.kind === 'distance') {
    if (!Array.isArray(work.stages) || !work.stages.length || work.stages.length > 10
      || work.stages.some(stage => !record(stage) || !text(stage.label) || !number(stage.metres) || stage.metres === 0)
      || !(work.targetSeconds === null || number(work.targetSeconds) && work.targetSeconds > 0)
      || !number(work.allowanceSeconds) || work.allowanceSeconds === 0 || !text(work.finish)) return false
  } else return false
  if (effort.kind === 'quality') {
    if (!text(effort.cue) || value.role === 'working' || value.role === 'monitoring') return false
  } else {
    if (!['rpe', 'rpe_ceiling', 'perceived_percent'].includes(String(effort.kind)) || !number(effort.max)
      || effort.max < 1 || effort.max > (effort.kind === 'perceived_percent' ? 100 : 10)) return false
    if (effort.kind !== 'rpe_ceiling' && (!number(effort.min) || effort.min < 1 || effort.min > effort.max)) return false
    if (effort.kind === 'perceived_percent' && !text(effort.cue)) return false
  }
  if (load.kind === 'external') {
    if (!number(load.value) || !['lb', 'kg'].includes(String(load.unit)) || !['total', 'per_hand'].includes(String(load.convention))) return false
  } else if (load.kind === 'athlete_selected') {
    if (!text(load.instruction)) return false
  } else if (!['bodyweight', 'not_applicable'].includes(String(load.kind))) return false
  return value.role === 'monitoring' ? text(value.protocolId) : value.protocolId === null
}

export function reviewedActivitySeconds(activity: ReviewedWeekActivity): number {
  if (!isReviewedActivity(activity)) throw new Error('Invalid reviewed activity')
  const work = activity.work
  const workSeconds = work.kind === 'repetitions' ? work.repetitions.max * work.sides * work.secondsPerRep
    : work.kind === 'effort_repetitions' ? work.estimatedSecondsPerSet * work.sides + (work.sides - 1) * work.sideSwitchSeconds
    : work.kind === 'duration' ? work.seconds * work.sides + (work.sides - 1) * work.sideSwitchSeconds
      : work.targetSeconds ?? work.allowanceSeconds
  return activity.sets * workSeconds + (activity.sets - 1) * reviewedRestEstimate(activity.restBetweenSeconds)
    + reviewedRestEstimate(activity.restAfterSeconds)
}

export function reviewedStepSeconds(value: unknown): number {
  if (!record(value) || !text(value.id)) throw new Error('Invalid reviewed step')
  if (value.kind === 'activity') return reviewedActivitySeconds(value as unknown as ReviewedWeekActivity)
  if (!number(value.seconds)) throw new Error('Invalid reviewed time allowance')
  if (value.kind === 'allowance' && ['transition', 'logging', 'recovery'].includes(String(value.purpose))) return value.seconds
  if (value.kind === 'preparation_window' && Array.isArray(value.activities) && value.activities.length > 0
    && value.activities.length <= 100 && value.activities.every(activity => isReviewedActivity(activity) && activity.role === 'preparation')
    && texts(value.instructions)) {
    if (value.activities.some(activity => typeof activity.restBetweenSeconds !== 'number'
      || typeof activity.restAfterSeconds !== 'number')) throw new Error('As-needed recovery cannot be confined to a fixed preparation window')
    if (value.activities.reduce((sum, activity) => sum + reviewedActivitySeconds(activity), 0) > value.seconds) throw new Error('Preparation exceeds its reviewed window')
    return value.seconds
  }
  throw new Error('Unsupported reviewed step')
}

export function reviewedSessionActivities(session: ReviewedWeekSession): ReviewedWeekActivity[] {
  return session.steps.flatMap(step => step.kind === 'activity' ? [step] : step.kind === 'preparation_window' ? step.activities : [])
}

/** Structural/content read validation only. Historical source freshness is deliberately not consulted. */
export function parseReviewedSession(value: unknown): ReviewedSessionPrescription | null {
  try {
    if (!record(value) || value.format !== REVIEWED_SESSION_FORMAT || ![1, 2, 3].includes(Number(value.schemaVersion))
      || typeof value.schemaVersion !== 'number'
      || value.policyVersion !== 'initial-dose-0.2.0' || !text(value.sessionId) || !text(value.title) || !text(value.intent)
      || !REVIEWED_SESSION_DAYS.includes(value.day as TrainingWeekday) || !number(value.scheduledMinutes) || value.scheduledMinutes <= 0
      || !number(value.estimatedSeconds) || !record(value.content) || !text(value.content.id) || value.content.id !== value.sessionId
      || !texts(value.content.instructions) || !texts(value.content.themes) || !Array.isArray(value.content.steps)
      || !value.content.steps.length || value.content.steps.length > 200) return null
    const estimated = value.content.steps.reduce((sum, step) => sum + reviewedStepSeconds(step), 0)
    if (estimated !== value.estimatedSeconds) return null
    const content = value.content as unknown as ReviewedWeekSession
    if (value.schemaVersion !== reviewedSessionSchema(content)) return null
    if (!validReviewedSessionTiming(content)) return null
    if (reviewedSessionTimeBudget(content).requiredSeconds > value.scheduledMinutes * 60) return null
    const ids = content.steps.flatMap(step => [step.id, ...(step.kind === 'preparation_window' ? step.activities.map(activity => activity.id) : [])])
    if (!unique(ids) || !content.steps.some(step => step.kind === 'allowance' && step.purpose === 'logging' && step.seconds > 0)) return null
    if (!record(value.source) || !text(value.source.recipeId) || !hash(value.source.recipeHash)
      || !record(value.source.review) || !text(value.source.review.id) || !hash(value.source.review.contentHash)
      || !Array.isArray(value.source.sources) || !value.source.sources.length || value.source.sources.length > 100
      || value.source.sources.some(source => !record(source) || !text(source.id) || !count(source.revision) || !hash(source.contentHash))
      || !unique(value.source.sources.map(source => source.id))) return null
    if (!Array.isArray(value.protocols) || value.protocols.length > 20 || value.protocols.some(protocol => !record(protocol)
      || !text(protocol.id) || protocol.sessionId !== content.id || !text(protocol.activityId) || !texts(protocol.instructions)
      || protocol.sensorMetadata !== null || !Array.isArray(protocol.actualObservations) || protocol.actualObservations.length !== 0)) return null
    const monitored = reviewedSessionActivities(content).filter(activity => activity.role === 'monitoring')
    if (value.protocols.length !== monitored.length || !unique(value.protocols.map(protocol => protocol.id))
      || monitored.some(activity => value.protocols instanceof Array && value.protocols.filter(protocol => protocol.id === activity.protocolId && protocol.activityId === activity.id).length !== 1)) return null
    return structuredClone(value) as unknown as ReviewedSessionPrescription
  } catch { return null }
}

export function describeReviewedActivity(activity: ReviewedWeekActivity): string[] {
  const work = activity.work
  const range = (min: number, max: number) => min === max ? String(min) : `${min}–${max}`
  const dose = work.kind === 'repetitions' ? `${activity.sets} × ${range(work.repetitions.min, work.repetitions.max)} reps${work.sides === 2 ? ' per side' : ''}`
    : work.kind === 'effort_repetitions' ? `${activity.sets} sets${work.sides === 2 ? ' per side' : ''}; repetitions to about ${work.targetRir} RIR each set. Stop with that many controlled repetitions in reserve; no fixed repetition cap.`
    : work.kind === 'duration' ? `${activity.sets} × ${work.seconds} seconds${work.sides === 2 ? ` per side; ${work.sideSwitchSeconds} seconds to switch sides` : ''}`
      : `${activity.sets} × ${work.stages.map(stage => `${stage.metres} m ${stage.label}`).join(' + ')}${work.targetSeconds === null ? '' : ` in ${work.targetSeconds} seconds each`}. ${work.finish}`
  const effort = activity.effort
  const effortText = effort.kind === 'rpe' ? `Target RPE ${range(effort.min, effort.max)} each set`
    : effort.kind === 'rpe_ceiling' ? `Target RPE no higher than ${effort.max}`
      : effort.kind === 'perceived_percent' ? `${range(effort.min, effort.max)}% perceived effort. ${effort.cue}` : effort.cue
  const load = activity.load
  const loadText = load.kind === 'external' ? `${load.value} ${load.unit} ${load.convention === 'total' ? 'total' : 'per hand'}`
    : load.kind === 'athlete_selected' ? load.instruction : load.kind === 'bodyweight' ? 'Bodyweight' : null
  const recovery = (value: ReviewedRest, where: string) => typeof value === 'number'
    ? `Rest ${value} seconds ${where}` : `Rest as needed ${where}. Time estimate includes ${value.estimatedSeconds} seconds; this is not a recovery limit.`
  return [dose, effortText, loadText,
    work.kind === 'effort_repetitions' && work.sides === 2 ? `Rest ${work.sideSwitchSeconds} seconds between sides` : null,
    work.kind === 'effort_repetitions' ? `Time estimate allows ${work.estimatedSecondsPerSet} seconds per set${work.sides === 2 ? ' per side' : ''}; this is not a set duration limit.` : null,
    activity.sets > 1 ? recovery(activity.restBetweenSeconds, 'between sets/efforts') : null,
    activity.restAfterSeconds ? recovery(activity.restAfterSeconds, 'after this work') : null, ...activity.instructions].filter((item): item is string => item !== null)
}

export function reviewedStepActivities(step: ReviewedWeekStep): ReviewedWeekActivity[] {
  return step.kind === 'activity' ? [step] : step.kind === 'preparation_window' ? step.activities : []
}
