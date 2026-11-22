import { contextObject, type ContextRow } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import { describeReviewedActivity, isOptionalReviewedStep, parseReviewedSession, reviewedStepActivities, REVIEWED_SESSION_FORMAT } from './reviewed-session-contract'

type TodayWorkoutContext = Awaited<ReturnType<typeof readCoachingContext>>

interface SessionPreview {
  title: string
  focus: string | null
  status: 'planned' | 'completed' | 'skipped'
  details: string[]
}

export interface TodayWorkoutRecommendation {
  status: 'recommended' | 'planned' | 'completed' | 'skipped' | 'unscheduled' | 'unavailable'
  source: 'saved_recommendation' | 'accepted_plan' | null
  title: string
  reason: string | null
  reviewBeforeTraining?: boolean
  sessions: SessionPreview[]
}

function text(value: unknown, length: number) {
  return typeof value === 'string' ? value.trim().slice(0, length) || null : null
}

function amount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value)
  if (!contextObject(value) || typeof value.min !== 'number' || typeof value.max !== 'number'
    || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.min > value.max) return null
  return value.min === value.max ? String(value.min) : `${value.min}–${value.max}`
}

function previewMovement(value: unknown): string | null {
  if (!contextObject(value)) return null
  const name = text(value.movementName, 75) ?? text(value.movement_name, 75) ?? text(value.name, 75)
  if (!name) return null
  const writtenDose = typeof value.prescription === 'string' && value.prescription.length <= 180
    ? value.prescription.trim() : null
  const dose = contextObject(value.dose) ? value.dose : value
  const sets = amount(dose.sets)
  const series = amount(dose.series)
  const count = sets ? `${sets} sets` : series ? `${series} series` : null
  const reps = amount(dose.repetitions ?? dose.reps ?? dose.repetitionsPerSeries)
  const minutes = amount(dose.durationMinutes)
  const detail = writtenDose || (count && reps ? `${count} × ${reps} reps`
    : count ?? (reps ? `${reps} reps` : minutes ? `${minutes} min` : null))
  return detail ? `${name} · ${detail}` : name
}

function sessionDetails(prescription: ContextRow): string[] {
  if (prescription.format === REVIEWED_SESSION_FORMAT) {
    const session = parseReviewedSession(prescription)
    if (!session) return ['The saved workout details could not be read.']
    const roles = { preparation: 'Warm-up', working: 'Working set', monitoring: 'Monitoring', cooldown: 'Cool-down' }
    const lines = session.content.steps.flatMap(step => reviewedStepActivities(step).map(activity => {
      const name = activity.movementId.replace(/[_-]/g, ' ').slice(0, 75)
      const prefix = isOptionalReviewedStep(session.content, step.id) ? 'Optional' : roles[activity.role]
      return `${prefix}: ${name} · ${describeReviewedActivity(activity).slice(0, 3).join(' · ')}`
    }))
    return lines.length > 8 ? [...lines.slice(0, 8), 'More movements in the accepted plan.'] : lines
  }
  const legacyBlocks = contextObject(prescription.dose) ? prescription.dose.blocks : null
  const blocks: unknown[] = Array.isArray(prescription.blocks) ? prescription.blocks
    : Array.isArray(legacyBlocks) ? legacyBlocks : [prescription]
  const details = blocks.slice(0, 12).flatMap(block => {
    if (!contextObject(block)) return []
    const entries: unknown[] = Array.isArray(block.exercises) ? block.exercises : Array.isArray(block.movements) ? block.movements : []
    return entries.slice(0, 8).flatMap(entry => {
      const line = previewMovement(entry)
      return line ? [line] : []
    })
  })
  return details.length > 8 ? [...details.slice(0, 8), 'More movements in the accepted plan.'] : details
}

export function projectTodayWorkoutRecommendation(context: Pick<TodayWorkoutContext, 'acceptedProgramming' | 'localDate'>): TodayWorkoutRecommendation {
  const programming = context.acceptedProgramming
  if (!programming) return { status: 'unavailable', source: null, title: 'No saved workout schedule available',
    reason: null, sessions: [] }
  const sessions = programming.todaySessions.slice(0, 6).flatMap<SessionPreview>(row => {
    if (row.scheduled_date !== context.localDate || !contextObject(row.prescription)
      || (row.status !== 'planned' && row.status !== 'completed' && row.status !== 'skipped')) return []
    const prescription = row.prescription
    return [{ title: text(prescription.title, 100) ?? text(prescription.session_title, 100) ?? 'Scheduled workout',
      focus: text(prescription.intent, 180), status: row.status, details: sessionDetails(prescription) }]
  })
  const planned = sessions.filter(session => session.status === 'planned')
  if (planned.length) return { status: 'planned', source: 'accepted_plan',
    title: planned.length === 1 ? planned[0].title : 'Workouts from your accepted plan',
    reason: null, sessions }
  if (sessions.some(session => session.status === 'completed')) return { status: 'completed', source: 'accepted_plan',
    title: 'Today’s workout is complete', reason: null, sessions }
  if (sessions.length) return { status: 'skipped', source: 'accepted_plan',
    title: 'Today’s scheduled workout was skipped', reason: null, sessions }
  return { status: 'unscheduled', source: 'accepted_plan', title: 'No workout scheduled today',
    reason: null, sessions: [] }
}
