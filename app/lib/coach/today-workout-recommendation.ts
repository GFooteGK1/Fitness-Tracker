import type { SupabaseClient } from '@supabase/supabase-js'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { recommendationScope } from '../recommendations/context'
import { contextObject, type ContextRow } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import { describeReviewedActivity, isOptionalReviewedStep, parseReviewedSession, reviewedStepActivities, REVIEWED_SESSION_FORMAT } from './reviewed-session-contract'
import { stableStringify } from './rolling-weekly-contracts'

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
  sessions: SessionPreview[]
}

const refreshFields = 'user_id,source_revision,response_revision,processed_source_revision,processed_response_revision,processed_context,current_recommendation_id,next_due_at,last_error'
const recommendationFields = 'id,user_id,decision,rule_id,policy_version,runtime_fingerprint,scope_key,evidence_fingerprint,source_revision,response_revision,local_date,timezone_offset,valid_until,plan_version_id,intent_memory_id,intent_version,lifecycle'

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
  if (!programming) return { status: 'unavailable', source: null, title: 'No workout recommendation available',
    reason: 'Ask Socius to suggest a workout using your goals and recent training.', sessions: [] }
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
    reason: 'Your accepted plan schedules this work for today.', sessions }
  if (sessions.some(session => session.status === 'completed')) return { status: 'completed', source: 'accepted_plan',
    title: 'Today’s workout is complete', reason: null, sessions }
  if (sessions.length) return { status: 'skipped', source: 'accepted_plan',
    title: 'Today’s scheduled workout was skipped', reason: null, sessions }
  return { status: 'unscheduled', source: 'accepted_plan', title: 'No workout scheduled today',
    reason: 'Ask Socius whether to train or recover today.', sessions: [] }
}

function ownedRows(value: { data: unknown; error: unknown }, owner: string, max: number): ContextRow[] {
  if (value.error || !Array.isArray(value.data) || value.data.length > max
    || value.data.some(row => !contextObject(row) || row.user_id !== owner)) throw new Error('Owner recommendation source unavailable')
  return value.data as ContextRow[]
}

function authority(context: TodayWorkoutContext) {
  const planRow: unknown = context.acceptedProgramming?.plan
  const plan = contextObject(planRow) ? planRow.id : null
  const intent = context.requirements.training_intent
  // On uncertain reads we can't confirm that a saved recommendation is current.
  if ((typeof plan !== 'string' && !context.gaps.includes('accepted_plan_missing'))
    || !['current', 'missing', 'withdrawn', 'expired', 'not_yet_effective'].includes(intent.status)) return null
  const currentIntent = intent.status === 'current' ? intent.source : null
  if (currentIntent && (typeof currentIntent.id !== 'string' || typeof currentIntent.version !== 'number'
    || (typeof currentIntent.reviewAfter === 'string' && Date.parse(currentIntent.reviewAfter) <= Date.now()))) return null
  return { activePlanId: plan ?? null, intentMemoryId: currentIntent?.id ?? null, intentVersion: currentIntent?.version ?? null }
}

function currentState(state: ContextRow | undefined, scope: ReturnType<typeof recommendationScope>, ownership: NonNullable<ReturnType<typeof authority>>) {
  if (!state || typeof state.current_recommendation_id !== 'string'
    || !Number.isSafeInteger(state.source_revision) || !Number.isSafeInteger(state.response_revision)
    || state.source_revision !== state.processed_source_revision || state.response_revision !== state.processed_response_revision
    || state.last_error !== null || (state.next_due_at !== null && (typeof state.next_due_at !== 'string'
      || !(Date.parse(state.next_due_at) > Date.now())))) return false
  return stableStringify(state.processed_context) === stableStringify({ ...ownership,
    localDate: scope.localDate, timezoneOffset: scope.tzOffset, runtimeFingerprint: scope.runtimeFingerprint })
}

/** Authenticated SELECT-only equivalent of the recommendation service's visibility check.
 * The normal read RPC seeds refresh state and is intentionally outside this view.
 */
export async function readCurrentWorkoutRecommendation(
  db: SupabaseClient, owner: string, context: TodayWorkoutContext,
): Promise<Pick<TodayWorkoutRecommendation, 'title' | 'reason'> | null> {
  if (!personalizedCoachingCapabilities().recommendations) return null
  const ownership = authority(context)
  const scope = recommendationScope(context.timezoneOffset)
  if (!ownership || scope.localDate !== context.localDate) return null
  const readState = async () => ownedRows(await db.from('recommendation_refresh_state')
    .select(refreshFields).eq('user_id', owner).limit(1), owner, 1)[0]
  try {
    const state = await readState()
    if (!currentState(state, scope, ownership)) return null
    const [row] = ownedRows(await db.from('recommendations').select(recommendationFields)
      .eq('user_id', owner).eq('id', state.current_recommendation_id).limit(1), owner, 1)
    if (!row || row.id !== state.current_recommendation_id || row.lifecycle !== 'active'
      || row.local_date !== scope.localDate || row.timezone_offset !== scope.tzOffset
      || row.runtime_fingerprint !== scope.runtimeFingerprint || row.plan_version_id !== ownership.activePlanId
      || row.intent_memory_id !== ownership.intentMemoryId || row.intent_version !== ownership.intentVersion
      || row.source_revision !== state.source_revision || row.response_revision !== state.response_revision
      || typeof row.scope_key !== 'string' || typeof row.evidence_fingerprint !== 'string'
      || !contextObject(row.decision) || typeof row.valid_until !== 'string' || !(Date.parse(row.valid_until) > Date.now())) return null
    const decision = row.decision
    if (decision.schemaVersion !== 1 || decision.ruleId !== row.rule_id || decision.policyVersion !== row.policy_version
      || decision.sourceRevision !== row.source_revision || decision.responseRevision !== row.response_revision
      || (decision.kind !== 'action' && decision.kind !== 'collect_signal') || !contextObject(decision.destination)
      || !['session', 'review', 'proposal', 'baseline'].includes(String(decision.destination.type))) return null

    const suppressions = ownedRows(await db.from('recommendation_suppressions').select('user_id,response,defer_until,evidence_fingerprint')
      .eq('user_id', owner).eq('scope_key', row.scope_key).limit(101), owner, 100)
    if (suppressions.some(suppression => suppression.response === 'deferred'
      ? typeof suppression.defer_until === 'string' && Date.parse(suppression.defer_until) > Date.now()
      : suppression.evidence_fingerprint === row.evidence_fingerprint)) return null
    // A transactional source change makes the refresh row become dirty. A second
    // read prevents mixing generations across these small owner-bound SELECTs.
    const after = await readState()
    if (!currentState(after, scope, ownership) || stableStringify(after) !== stableStringify(state)
      || !(Date.parse(row.valid_until) > Date.now())) return null
    const title = text(decision.title, 120)
    return title ? { title, reason: text(decision.reason, 350) } : null
  } catch { return null }
}
