/** Pure first-onboarding projection from a complete server-captured source.
 * No source read, confirmation, review or persistence authority is supplied here.
 * Pin projection time; separately bind/recheck the entire current source. */
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import { validatePlanningIntent, type PlanningIntentSnapshot } from './planning-intent'
import { isComparableIntentBaseline, applyConfirmedReviewedIntentToProfile } from './planning-intent-server'
import { buildFactualPlanningContext, applyFactualPlanningContext, type PlanningHistorySnapshot } from './planning-context'
import type { ProgrammingProfile } from './programming-schema'
import type { CoachStrengthAssessmentSummary } from './types'

type Row = Record<string, unknown>
export interface FirstReviewedFactsSource {
  userId: string; asOf: string; contextHash: string; profile: ProgrammingProfile
  binding: {
    userId: string; scope: { historyDays: number; historyThrough: string; tzOffset: number }
    history: Omit<PlanningHistorySnapshot, 'asOf'>
    memories: Row[]; memoryStates: Array<{ id: unknown; state: string }>
    assessments: Row[]; observationGroups: Row[]; observationValues: Row[]
    /** Owned current identity/revisions of referenced scheduled baselines,
     * including those outside the requested performed-history window. */
    intentBaselineWorkouts?: Row[]
  }
}
export interface FirstReviewedBaselineEvidence {
  goalId: string; observationId: string; observedAt: string
  source: 'manual' | 'scheduled_session'
  measurement: NonNullable<PlanningIntentSnapshot['content']['outcomes'][number]['measurement']>
  binding: PlanningIntentSnapshot['content']['outcomes'][number]['binding']
  values: Array<{ id: string; ordinal: number; value: number; unit: string }>
}
const number = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim()))
  && Number.isFinite(Number(v)) ? Number(v) : null
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 500
const day = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  try { return formatUTCAsLocalDateWithOffset(localDateToUTCStart(v, 0), 0) === v } catch { return false }
}
function timestampsCurrent(row: Row, cutoff: number, fields: string[]) {
  return fields.every(k => row[k] == null || (typeof row[k] === 'string'
    && Number.isFinite(Date.parse(row[k] as string)) && Date.parse(row[k] as string) <= cutoff))
}

/** Select the latest version even when withdrawn or expired. Never resurrect an
 * older confirmed snapshot or copy the legacy accepted intent. */
export function currentFirstReviewedIntent(source: FirstReviewedFactsSource, projectionAsOf = source.asOf): PlanningIntentSnapshot | null {
  if (!Number.isFinite(Date.parse(projectionAsOf))) throw new Error('Intent projection cutoff is invalid')
  const rows = source.binding.memories.filter(row => row.memory_key === 'training_intent')
  if (!rows.length) return null
  if (rows.some(row => row.user_id !== source.userId || !text(row.id) || !Number.isSafeInteger(row.version)
    || Number(row.version) < 1)) throw new Error('Current training intent identity or version is invalid')
  const latest = [...rows].sort((a,b) => Number(b.version) - Number(a.version))[0]
  const value = validatePlanningIntent(latest.content)
  if (rows.filter(row => row.version === latest.version).length !== 1 || latest.kind !== 'goal'
    || latest.status !== 'confirmed' || source.binding.memoryStates.filter(row => row.id === latest.id && row.state === 'current').length !== 1
    || !value.ok || !timestampsCurrent(latest, Date.parse(projectionAsOf), ['created_at', 'updated_at', 'confirmed_at'])
    || (value.ok && Date.parse(value.value.confirmedAt) > Date.parse(projectionAsOf))) {
    throw new Error('Latest training intent is unavailable, ambiguous or needs confirmation')
  }
  return { schemaVersion: 1, memoryId: latest.id as string, memoryVersion: latest.version as number, content: value.value }
}

/** Complete assessment projection: an invalid row fails the first review, rather
 * than silently removing evidence. Assessments remain assessments, not imports,
 * event results or load-selection authority. */
function assessment(row: Row, source: FirstReviewedFactsSource, cutoff: number): CoachStrengthAssessmentSummary {
  const load = number(row.load), reps = number(row.reps), confidence = number(row.athlete_confidence), estimated = number(row.estimated_1rm)
  const rir = row.rir == null ? null : number(row.rir), rpe = row.rpe == null ? null : number(row.rpe)
  if (row.user_id !== source.userId || !text(row.id) || !text(row.movement)
    || !(row.variation === null || text(row.variation)) || load === null || load <= 0
    || ![1, 3, 5].includes(reps ?? 0) || !['lb','kg'].includes(String(row.unit))
    || !day(row.assessed_on) || row.assessed_on > source.binding.scope.historyThrough
    || typeof row.is_true_rep_max !== 'boolean' || confidence === null || confidence < 0 || confidence > 1
    || estimated === null || estimated <= 0 || !['reported_1rm','estimated_1rm'].includes(String(row.estimate_kind))
    || !text(row.calculator_version) || (row.rir != null && (rir === null || rir < 0 || rir > 10))
    || (row.rpe != null && (rpe === null || rpe < 0 || rpe > 10))
    || !timestampsCurrent(row, cutoff, ['created_at','updated_at'])) throw new Error(`Assessment ${String(row.id)} requires review; no row was omitted`)
  return { id: row.id, movement: row.movement, variation: row.variation as string | null, load,
    unit: row.unit as 'lb' | 'kg', reps: reps as 1 | 3 | 5, assessedOn: row.assessed_on,
    isTrueRepMax: row.is_true_rep_max, rir, rpe, athleteConfidence: confidence,
    estimatedOneRepMax: estimated, estimateKind: row.estimate_kind as 'reported_1rm' | 'estimated_1rm', calculatorVersion: row.calculator_version }
}

function referencedBaselines(source: FirstReviewedFactsSource, intent: PlanningIntentSnapshot | null, cutoff: number): FirstReviewedBaselineEvidence[] {
  return (intent?.content.outcomes ?? []).flatMap(outcome => {
    if (outcome.baseline.status !== 'referenced') return []
    const observationId = outcome.baseline.observationId
    const matches = source.binding.observationGroups.filter(row => row.id === observationId)
    const group = matches[0]
    if (matches.length !== 1 || group.user_id !== source.userId || !isComparableIntentBaseline(group, source.userId, outcome)
      || typeof group.observed_at !== 'string' || !Number.isFinite(Date.parse(group.observed_at)) || Date.parse(group.observed_at) > cutoff
      || !timestampsCurrent(group, cutoff, ['created_at','updated_at','verified_at','captured_at'])) throw new Error('Referenced baseline is unavailable, unconfirmed or not comparable')
    if (group.source_kind === 'coach_completion') {
      const workouts = (source.binding.intentBaselineWorkouts ?? []).filter(row => row.id === group.workout_id)
      if (workouts.length !== 1 || workouts[0].user_id !== source.userId || workouts[0].capture_revision !== 1
        || workouts[0].execution_revision !== 0 || !timestampsCurrent(workouts[0], cutoff, ['created_at','updated_at','captured_at'])) {
        throw new Error('Referenced scheduled baseline is missing, amended or removed')
      }
    }
    const measurement = outcome.measurement!
    const values = source.binding.observationValues.filter(row => row.group_id === group.id && row.status === 'complete'
      && row.semantic_role === 'direct_outcome' && row.metric_id === measurement.metricId && row.unit === measurement.unit)
    if (!values.length || values.length > 32 || values.some(row => row.user_id !== source.userId || !text(row.id)
      || !Number.isSafeInteger(row.ordinal) || Number(row.ordinal) < 0
      || number(row.value_numeric) === null || !timestampsCurrent(row, cutoff, ['created_at','updated_at']))
      || new Set(values.map(row => row.ordinal)).size !== values.length) throw new Error('Referenced baseline values are unavailable or invalid')
    return [{ goalId: outcome.goal.id, observationId: group.id as string, observedAt: group.observed_at,
      source: group.source_kind === 'manual' ? 'manual' as const : 'scheduled_session' as const,
      measurement: structuredClone(measurement), binding: structuredClone(outcome.binding),
      values: [...values].sort((a,b) => Number(a.ordinal) - Number(b.ordinal))
        .map(row => ({ id: row.id as string, ordinal: row.ordinal as number, value: number(row.value_numeric)!, unit: row.unit as string })) }]
  })
}

/** Caller is the server preparer. Target setup is applied before dependent facts;
 * subsequent confirmation must compare the whole resulting profile. */
export function projectFirstReviewedProfileFacts(source: FirstReviewedFactsSource, targetSetup: ProgrammingProfile,
  projectionAsOf = source.asOf) {
  const cutoff = Date.parse(projectionAsOf), readTime = Date.parse(source.asOf)
  if (!source.userId || source.binding.userId !== source.userId || !/^[a-f0-9]{64}$/.test(source.contextHash)
    || !Number.isFinite(cutoff) || !Number.isFinite(readTime) || cutoff > readTime
    || formatUTCAsLocalDateWithOffset(projectionAsOf, source.binding.scope.tzOffset) !== source.binding.scope.historyThrough) throw new Error('First projection owner, source or cutoff is invalid')
  if (source.binding.assessments.length > 100 || new Set(source.binding.assessments.map(row => row.id)).size !== source.binding.assessments.length) throw new Error('Complete assessment set requires review')
  const assessments = source.binding.assessments.map(row => assessment(row, source, cutoff))
  const trainingIntent = currentFirstReviewedIntent(source, projectionAsOf)
  if (targetSetup.executionPriority) {
    const priority = targetSetup.executionPriority
    const outcome = trainingIntent?.content.outcomes.find(o => o.goal.id === priority.goalId && o.goal.status === 'active'
      && o.capability.status === 'supported' && o.domain === 'strength' && o.binding.movementId === priority.movementId
      && trainingIntent.content.priorityOrder?.[0] === priority.goalId)
    if (!outcome) throw new Error('Confirm execution priority against the current active outcome and movement')
  }
  const baselines = referencedBaselines(source, trainingIntent, cutoff)
  const planningContext = buildFactualPlanningContext({ ...source.binding.history, asOf: projectionAsOf })
  if (!planningContext.retrievalComplete || planningContext.userId !== source.userId) throw new Error('First factual history requires complete owned retrieval')
  // Detach; discard every caller/legacy factual value except original intake provenance.
  const profile = structuredClone(targetSetup)
  delete profile.trainingIntent; delete profile.planningContext; delete profile.prescriptionBasis
  profile.inputSource = structuredClone(source.profile.inputSource)
  profile.assessments = assessments
  if (trainingIntent) profile.trainingIntent = trainingIntent
  const intentProfile = trainingIntent ? applyConfirmedReviewedIntentToProfile(profile, trainingIntent) : profile
  const projected = applyFactualPlanningContext(intentProfile, planningContext, { historyWindowDays: source.binding.scope.historyDays })
  return { schemaVersion: 'first-reviewed-profile-facts-1' as const, projectionAsOf, sourceHash: source.contextHash,
    profile: projected, baselines, assessments: structuredClone(assessments),
    factsHash: doseContentHash({ projectionAsOf, sourceHash: source.contextHash, profile: projected, baselines }),
    numericRuntimeEligible: false as const }
}
