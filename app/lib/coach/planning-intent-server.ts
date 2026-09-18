import type { SupabaseClient } from '@supabase/supabase-js'
import { validatePlanningIntent, type PlanningIntentSnapshot, type PlanningOutcome } from './planning-intent'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { refreshExercisePreferencesForDraft } from './exercise-preferences-context'
import type { ProgrammingProfile } from './programming-schema'
import { applyFactualPlanningContext, fetchFactualPlanningContext } from './planning-context'

/** Only new or explicitly changed directions call this; ordinary continuation retains the accepted snapshot. */
export async function refreshConfirmedPlanningContext(supabase: SupabaseClient, userId: string, input: ProgrammingProfile,
  historyOptions: { asOf?: string; tzOffset?: number } = {}): Promise<ProgrammingProfile> {
  let profile = await refreshExercisePreferencesForDraft(supabase, userId, input)
  const capabilities = personalizedCoachingCapabilities()
  if (capabilities.trainingIntent) {
    const intent = await fetchPlanningIntent(supabase, userId)
    if (!intent) throw new Error('Confirm your outcomes before creating a new direction')
    const errors = await validateIntentBaselineOwnership(supabase, userId, intent)
    if (errors.length) throw new Error(errors.join('; '))
    profile = applyConfirmedIntentToProfile(profile, intent)
    const leading = intent.content.outcomes.find(o => o.goal.id === intent.content.priorityOrder?.[0])
    if (capabilities.targetedReview && leading?.domain === 'strength' && leading.binding.movementId) profile = {
      ...profile, executionPriority: { goalId: leading.goal.id, movementId: leading.binding.movementId } }
  }
  if (capabilities.historyContext) profile = applyFactualPlanningContext(profile,
    await fetchFactualPlanningContext(supabase, userId, { startDate: profile.startDate, ...historyOptions }))
  return profile
}

/** Existing domain allocations are athlete setup choices; incompatible choices need correction, never silent omission. */
export function applyConfirmedIntentToProfile(profile: ProgrammingProfile, snapshot: PlanningIntentSnapshot): ProgrammingProfile {
  const active = snapshot.content.outcomes.filter(o => o.goal.status === 'active')
  const supported = active.filter(o => o.capability.status === 'supported' && o.domain !== null)
  const domains = new Set(supported.map(o => o.domain))
  const allocations = [profile.primaryGoal, ...profile.secondaryGoals]
  if (!domains.size) throw new Error('Confirm at least one supported active outcome before creating a direction')
  if (snapshot.content.event && active.some(o => snapshot.content.event!.goalIds.includes(o.goal.id) && o.capability.status === 'unsupported')) {
    throw new Error('This event includes an unsupported outcome. Review its missing capability before requesting an event program')
  }
  if (domains.size > 3 || domains.size !== allocations.length || allocations.some(a => !domains.has(a.domain))) {
    throw new Error('Align the primary and supporting training areas with every supported active outcome. The current compiler supports at most three distinct areas')
  }
  const firstPriority = snapshot.content.priorityOrder?.map(id => supported.find(o => o.goal.id === id)).find(Boolean)
  if (firstPriority && firstPriority.domain !== profile.primaryGoal.domain) throw new Error('The primary training area conflicts with the confirmed outcome priority')
  const adapt = <T extends typeof allocations[number]>(allocation: T): T => {
    const outcomes = supported.filter(o => o.domain === allocation.domain)
    const statement = outcomes.map(o => o.goal.statement).join('; ').slice(0, 500)
    // Shared allocation has no numeric target: separate outcome bindings remain authoritative.
    return { ...allocation, athleteIntent: statement, ...(allocation.outcome ? { outcome: { ...allocation.outcome, statement, target: null } } : {}) }
  }
  return { ...profile, trainingIntent: snapshot, athleteGoalSummary: active.map(o => o.goal.statement).join('; ').slice(0, 500),
    primaryGoal: adapt(profile.primaryGoal), secondaryGoals: profile.secondaryGoals.map(adapt) }
}

/** Latest version including withdrawn rows: never resurrect an older confirmed intent. */
export async function fetchPlanningIntent(supabase: SupabaseClient, userId: string): Promise<PlanningIntentSnapshot | null> {
  const { data, error } = await supabase.from('coach_memories')
    .select('id, version, content, status, effective_from, effective_until, review_after')
    .eq('user_id', userId).eq('memory_key', 'training_intent').order('version', { ascending: false }).limit(1)
  if (error) throw new Error('Confirmed training intent is unavailable')
  const row = data?.[0]
  if (!row || row.status !== 'confirmed') return null
  const now = Date.now()
  if ((row.effective_from && Date.parse(row.effective_from) > now) || (row.effective_until && Date.parse(row.effective_until) <= now) || (row.review_after && Date.parse(row.review_after) <= now)) return null
  const validated = validatePlanningIntent(row.content)
  if (!validated.ok || !Number.isInteger(row.version) || row.version < 1) throw new Error('Saved training intent needs review')
  return { schemaVersion: 1, memoryId: row.id, memoryVersion: row.version, content: validated.value }
}

const BASELINE_GROUP_FIELDS = 'id, status, verification_status, verified_by, source_kind, source_system, workout_id, prescribed_session_id, observed_at, assessment_definition_id, protocol_version, comparison_modifiers, metadata'

export function isComparableIntentBaseline(row: Record<string, any> | undefined, userId: string, outcome: PlanningOutcome): boolean {
  const m = outcome.measurement
  if (!row || !m || row.status !== 'complete' || row.verification_status !== 'athlete_confirmed' || row.verified_by !== userId) return false
  const sourceSupported = (row.source_kind === 'manual' && row.source_system === 'sociusfit_training_baseline' && row.metadata?.origin === 'athlete_reported')
    || (row.source_kind === 'coach_completion' && row.source_system === 'sociusfit' && row.metadata?.completionContractVersion === 2 && row.workout_id && row.prescribed_session_id)
  if (!sourceSupported || row.assessment_definition_id !== m.assessmentDefinition.id || row.protocol_version !== m.protocol.version
    || row.metadata?.assessmentDefinitionVersion !== m.assessmentDefinition.version || row.metadata?.protocolId !== m.protocol.id) return false
  const b = outcome.binding
  const expected = { movementId: b.movementId, variationId: b.variation, distance: b.distance,
    equipmentIds: b.equipmentIds, repetitions: b.assessmentContext?.repetitions ?? null,
    externalLoad: b.assessmentContext?.externalLoad ?? null, duration: b.assessmentContext?.duration ?? null,
    techniqueModifiers: b.assessmentContext?.techniqueModifiers ?? [], environmentModifiers: b.assessmentContext?.environmentModifiers ?? [] }
  const stable = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
  return stable(row.comparison_modifiers) === stable(expected)
}

export async function validateIntentBaselineOwnership(supabase: SupabaseClient, userId: string, snapshot: PlanningIntentSnapshot): Promise<string[]> {
  const errors: string[] = []
  for (const outcome of snapshot.content.outcomes) {
    if (outcome.baseline.status !== 'referenced') continue
    const { data, error } = await supabase.from('performance_observation_groups').select(BASELINE_GROUP_FIELDS)
      .eq('id', outcome.baseline.observationId).eq('user_id', userId).limit(1)
    if (error) throw new Error('Baseline observations are unavailable')
    const row = data?.[0]
    if (!isComparableIntentBaseline(row, userId, outcome)) { errors.push(`${outcome.goal.statement}: baseline is unavailable or not comparable`); continue }
    if (row.source_kind === 'coach_completion' && !await scheduledBaselineIsCurrent(supabase, userId, row.workout_id)) {
      errors.push(`${outcome.goal.statement}: the recorded execution was amended or removed`); continue
    }
    const m = outcome.measurement!
    const values = await supabase.from('performance_observation_values').select('id').eq('group_id', row.id)
      .eq('user_id', userId).eq('status', 'complete').eq('semantic_role', 'direct_outcome').eq('metric_id', m.metricId).eq('unit', m.unit).limit(1)
    if (values.error) throw new Error('Baseline measurement values are unavailable')
    if (!values.data?.length) errors.push(`${outcome.goal.statement}: the confirmed metric and unit are unavailable`)
  }
  return errors
}

export interface IntentBaselineCandidate { goalId: string; observationId: string; value: number; unit: string; observedAt: string; source: 'scheduled_session' | 'manual' }
async function scheduledBaselineIsCurrent(supabase: SupabaseClient, userId: string, workoutId: string): Promise<boolean> {
  const result = await supabase.from('workouts').select('id,capture_revision,execution_revision').eq('id', workoutId).eq('user_id', userId).limit(1)
  if (result.error) throw new Error('Current baseline execution is unavailable')
  const row = result.data?.[0]
  return Boolean(row && row.capture_revision === 1 && row.execution_revision === 0)
}
/** Bounded candidate lookup. The athlete must explicitly link a candidate, and SQL revalidates at confirmation. */
export async function fetchIntentBaselineCandidates(supabase: SupabaseClient, userId: string, snapshot: PlanningIntentSnapshot): Promise<IntentBaselineCandidate[]> {
  const groups = await supabase.from('performance_observation_groups').select(BASELINE_GROUP_FIELDS).eq('user_id', userId)
    .eq('status', 'complete').eq('verification_status', 'athlete_confirmed').order('observed_at', { ascending: false }).limit(32)
  if (groups.error) throw new Error('Baseline candidates unavailable')
  if (!groups.data?.length) return []
  const currentGroups: typeof groups.data = []
  for (const row of groups.data) if (row.source_kind !== 'coach_completion' || await scheduledBaselineIsCurrent(supabase, userId, row.workout_id)) currentGroups.push(row)
  const values = await supabase.from('performance_observation_values').select('group_id,metric_id,unit,value_numeric').eq('user_id', userId)
    .in('group_id', groups.data.map(g => g.id)).eq('status', 'complete').eq('semantic_role', 'direct_outcome')
  if (values.error) throw new Error('Baseline candidate values unavailable')
  return snapshot.content.outcomes.flatMap(outcome => currentGroups.filter(row => isComparableIntentBaseline(row, userId, outcome)).flatMap(row => {
    const value = values.data?.find(v => v.group_id === row.id && v.metric_id === outcome.measurement?.metricId && v.unit === outcome.measurement?.unit)
    return value ? [{ goalId: outcome.goal.id, observationId: row.id, value: Number(value.value_numeric), unit: value.unit, observedAt: row.observed_at,
      source: row.source_kind === 'coach_completion' ? 'scheduled_session' as const : 'manual' as const }] : []
  }))
}
