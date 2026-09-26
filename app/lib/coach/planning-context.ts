import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart, isValidTimezoneOffset } from '../timezone-utils'
import { MOVEMENT_CATALOG } from './movement-catalog'
import type { ProgrammingProfile } from './programming-schema'
import { buildPrescriptionBasis } from './prescription-basis'
import { resolveHistorySnapshot, historyFieldProvenance, confirmedPrescriptionLink, type HistoryCompletion, type ActivityHistoryRevision, type HistoryWorkoutRow } from './planning-history'

export interface FactualPlanningContext {
  version: 'factual-planning-context-1'
  mode: 'current' | 'historical_replay'
  userId: string
  asOf: string
  startsOn: string
  endsOn: string
  status: 'available' | 'cold_start' | 'unavailable' | 'partial' | 'replay_unavailable'
  retrievalComplete: boolean
  loggingCoverage: 'unknown'
  sourceIds: string[]
  movements: Array<{ movementId: string; workoutId: string; sourcePath: string; eventDate: string;
    capturedAt: string; revision: number | null; snapshotId: string | null; origin: string; reviewState: string; completionId: string | null; familiarityEligible: boolean }>
  missing: string[]
  outsideTraining: { status: 'unknown' } | { status: 'reported'; sourceIds: string[]; notes: string[] }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const MAX_WORKOUTS = 100
const MAX_REVISIONS = 400
const canonicalFields = 'id,user_id,workout_date,blocks,rpe,created_at,updated_at,execution_revision,execution_source,execution_status'

/** Raw timezone convention. Missing new columns alone allow a legacy current-state read. */
export async function fetchFactualPlanningContext(supabase: SupabaseClient, userId: string, input: {
  startDate: string; asOf?: string; tzOffset?: number; mode?: FactualPlanningContext['mode']
}): Promise<FactualPlanningContext> {
  return buildFactualPlanningContext(await fetchPlanningHistorySnapshot(supabase, userId, input))
}

/** Shared bounded, owned source read; consumers retain separate interpretation authority. */
export async function fetchPlanningHistorySnapshot(supabase: SupabaseClient, userId: string, input: {
  startDate: string; asOf?: string; tzOffset?: number; mode?: FactualPlanningContext['mode']; windowDays?: number
}): Promise<PlanningHistorySnapshot> {
  const asOf = input.asOf ?? new Date().toISOString()
  const tzOffset = input.tzOffset ?? 0
  const windowDays = input.windowDays ?? 28
  if (!userId) throw new Error('History needs an owner')
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 180) throw new Error('History window must be between 1 and 180 days')
  if (!isValidTimezoneOffset(tzOffset) || !Number.isFinite(Date.parse(asOf))) throw new Error('Invalid history date or timezone')
  if (!validDay(input.startDate)) throw new Error('Invalid history start date')
  const today = formatUTCAsLocalDateWithOffset(asOf, tzOffset)
  const endsOn = input.startDate < today ? input.startDate : today
  const startsOn = formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(endsOn, 0)) - (windowDays - 1) * 86400000).toISOString(), 0)
  const mode = input.mode ?? 'current'
  const query = (columns: string) => supabase.from('workouts').select(columns).eq('user_id', userId)
    .gte('workout_date', startsOn).lte('workout_date', endsOn).lte('created_at', asOf)
    .order('workout_date', { ascending: false }).order('id', { ascending: true }).limit(MAX_WORKOUTS + 1)
  let history = await query(`${canonicalFields},capture_revision,capture_provenance,captured_at,capture_input_method`)
  let legacySchema = false
  if (missingCaptureSchema(history.error)) { legacySchema = true; history = await query(canonicalFields) }
  const checkins = await supabase.from('coach_checkins').select('id,user_id,prescribed_session_id,occurred_at,created_at,responses')
    .eq('user_id', userId).gte('occurred_at', localDateToUTCStart(startsOn, tzOffset)).lte('created_at', asOf)
    .order('created_at', { ascending: false }).limit(MAX_WORKOUTS + 1)
  const revisionResult = mode === 'historical_replay' ? await supabase.from('activity_revisions')
    .select('id,user_id,entity_kind,original_entity_id,revision,record,provenance,captured_at,event_at,deleted')
    .eq('user_id', userId).eq('entity_kind', 'workout').lte('captured_at', asOf)
    // Select terminal revisions even when a correction moved the event outside this window.
    .order('revision', { ascending: false }).limit(MAX_REVISIONS + 1) : { data: [], error: null }
  return { userId, asOf, startsOn, endsOn, mode,
    workouts: history.error ? [] : (history.data ?? []).slice(0, MAX_WORKOUTS) as unknown as HistoryWorkoutRow[],
    completions: (checkins.data ?? []).slice(0, MAX_WORKOUTS) as HistoryCompletion[],
    revisions: (revisionResult.error ? [] : (revisionResult.data ?? []).slice(0, MAX_REVISIONS)) as ActivityHistoryRevision[],
    available: !history.error && !revisionResult.error && !checkins.error,
    complete: !history.error && !revisionResult.error && !checkins.error && (checkins.data?.length ?? 0) <= MAX_WORKOUTS && (history.data?.length ?? 0) <= MAX_WORKOUTS && (revisionResult.data?.length ?? 0) <= MAX_REVISIONS,
    missing: [...(legacySchema ? ['legacy_capture_provenance_unknown'] : []), ...(history.error ? ['workout_history_unavailable'] : []),
      ...(revisionResult.error ? ['revision_history_unavailable'] : []), ...(checkins.error ? ['completion_links_unavailable'] : [])] }
}

export interface PlanningHistorySnapshot {
  userId: string; asOf: string; startsOn: string; endsOn: string; mode: FactualPlanningContext['mode'];
  workouts: HistoryWorkoutRow[]; revisions?: ActivityHistoryRevision[]; completions?: HistoryCompletion[]; available: boolean; complete: boolean;
  missing?: string[]; outsideTraining?: FactualPlanningContext['outsideTraining']
}

export function buildFactualPlanningContext(input: PlanningHistorySnapshot): FactualPlanningContext {
  const resolved = resolveHistorySnapshot({ ...input, revisions: input.revisions ?? [] })
  const missing = [...(input.missing ?? []), ...resolved.issues.map(issue => `${issue.sourceId}:${issue.reason}`)]
  if (!input.complete) missing.push('retrieval_incomplete')
  const movements: FactualPlanningContext['movements'] = []
  const sourceIds: string[] = []
  let structurallyIncomplete = false
  if (input.completions?.some(row => row.user_id !== input.userId)) throw new Error('History completion ownership mismatch')
  for (const row of resolved.workouts) {
    if (row.workout_date < input.startsOn || row.workout_date > input.endsOn) continue
    if (row.execution_status && row.execution_status !== 'completed') continue
    const blocks = Array.isArray(row.blocks) ? row.blocks : isObject(row.blocks) && Array.isArray(row.blocks.blocks) ? row.blocks.blocks : null
    if (!blocks) { missing.push(`${row.id}:unsupported_blocks`); structurallyIncomplete = true; continue }
    sourceIds.push(row.id)
    const completion = confirmedPrescriptionLink(row, input.completions ?? [], input.asOf)
    for (const [bi, block] of blocks.entries()) {
      if (!isObject(block)) { missing.push(`${row.id}:unsupported_block_${bi}`); structurallyIncomplete = true; continue }
      if (Array.isArray(block.exercises) && Array.isArray(block.movements)) { missing.push(`${row.id}:ambiguous_block_${bi}`); structurallyIncomplete = true; continue }
      const canonical = Array.isArray(block.exercises)
      if (canonical && !completion) { missing.push(`${row.id}:prescription_execution_unconfirmed`); continue }
      const entries = canonical ? block.exercises : block.movements
      if (!Array.isArray(entries)) { missing.push(`${row.id}:unsupported_entries_${bi}`); structurallyIncomplete = true; continue }
      for (const [ei, entry] of entries.entries()) {
        if (!isObject(entry)) { missing.push(`${row.id}:unsupported_entry_${bi}_${ei}`); structurallyIncomplete = true; continue }
        if (entry.completed === false || entry.workStatus === 'unsure') continue
        const movement = canonical ? MOVEMENT_CATALOG.find(item => item.id === entry.movementId)
          : MOVEMENT_CATALOG.find(item => typeof entry.name === 'string' && (item.id === entry.name.toLowerCase() || item.name.toLowerCase() === entry.name.trim().toLowerCase()))
        if (!movement) continue
        const sourcePath = `${Array.isArray(row.blocks) ? 'blocks' : 'blocks.blocks'}[${bi}].${canonical ? 'exercises' : 'movements'}[${ei}]`
        const provenance = historyFieldProvenance(row.capture_provenance, sourcePath)
        if (!canonical && ['copied_template', 'imported_unverified'].includes(provenance.origin) && provenance.reviewState === 'unreviewed') continue
        // Stored ranges and doses are deliberately absent from runtime familiarity.
        movements.push({ movementId: movement.id, workoutId: row.id, sourcePath, eventDate: row.workout_date,
          capturedAt: row.historySnapshotAt, revision: row.capture_revision ?? row.execution_revision ?? null,
          snapshotId: row.historySnapshotId, completionId: completion?.id ?? null,
          familiarityEligible: Boolean(completion) || provenance.origin === 'athlete_reported', ...provenance })
      }
    }
  }
  const replayMissing = input.mode === 'historical_replay' && resolved.issues.length > 0
  return { version: 'factual-planning-context-1', mode: input.mode, userId: input.userId, asOf: input.asOf,
    startsOn: input.startsOn, endsOn: input.endsOn,
    status: !input.available ? 'unavailable' : replayMissing ? 'replay_unavailable' : !input.complete || structurallyIncomplete || resolved.issues.length > 0 ? 'partial' : sourceIds.length ? 'available' : 'cold_start',
    retrievalComplete: input.available && input.complete && !structurallyIncomplete && resolved.issues.length === 0, loggingCoverage: 'unknown',
    sourceIds: [...new Set(sourceIds)], movements, missing: [...new Set(missing)], outsideTraining: input.outsideTraining ?? { status: 'unknown' } }
}

/** Only the existing movement-novelty preference consumes history. No dose totals. */
export function applyFactualPlanningContext(profile: ProgrammingProfile, context: FactualPlanningContext): ProgrammingProfile {
  if (context.status === 'unavailable' || context.status === 'partial' || context.status === 'replay_unavailable') {
    throw new Error('Performed history is unavailable or incomplete. Retry before creating a new direction.')
  }
  const avoided = new Set(profile.preferences.filter(item => item.preference === 'avoid').map(item => item.movementId))
  const movementIds = [...new Set(context.movements.filter(item => item.familiarityEligible && !avoided.has(item.movementId)).map(item => item.movementId))].sort()
  const updated = { ...profile, planningContext: context,
    recentTraining: { asOfDate: context.sourceIds.length ? context.endsOn : null,
      lookbackDays: context.sourceIds.length ? 28 : 0, completedSessionCount: context.sourceIds.length,
      performedMovementIds: movementIds, doseByCoverageTarget: [] } }
  return { ...updated, prescriptionBasis: buildPrescriptionBasis(updated, context) }
}

function missingCaptureSchema(error: unknown): boolean {
  if (!isObject(error) || !['42703', 'PGRST204'].includes(String(error.code))) return false
  return /capture_revision|capture_provenance|captured_at|capture_input_method/.test(String(error.message ?? '') + String(error.details ?? ''))
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try { return formatUTCAsLocalDateWithOffset(localDateToUTCStart(value, 0), 0) === value } catch { return false }
}

/** Additive decoder: absence is legacy; unknown versions and malformed fields are rejected. */
export function validateFactualPlanningContext(value: unknown): value is FactualPlanningContext {
  if (!isObject(value) || value.version !== 'factual-planning-context-1' || !['current', 'historical_replay'].includes(String(value.mode))
    || typeof value.userId !== 'string' || !value.userId || typeof value.asOf !== 'string' || !Number.isFinite(Date.parse(value.asOf))
    || !validDay(value.startsOn) || !validDay(value.endsOn) || value.startsOn > value.endsOn
    || !['available', 'cold_start', 'unavailable', 'partial', 'replay_unavailable'].includes(String(value.status))
    || typeof value.retrievalComplete !== 'boolean' || value.loggingCoverage !== 'unknown'
    || !stringList(value.sourceIds, MAX_WORKOUTS) || !stringList(value.missing, 5000)
    || !Array.isArray(value.movements) || value.movements.length > 5000 || !isObject(value.outsideTraining)) return false
  if (['unavailable', 'partial', 'replay_unavailable'].includes(String(value.status)) && value.retrievalComplete) return false
  if (value.status === 'cold_start' && value.sourceIds.length !== 0) return false
  if (value.outsideTraining.status !== 'unknown' && !(value.outsideTraining.status === 'reported'
    && stringList(value.outsideTraining.sourceIds, 100) && stringList(value.outsideTraining.notes, 100))) return false
  return value.movements.every(m => isObject(m) && MOVEMENT_CATALOG.some(item => item.id === m.movementId)
    && typeof m.workoutId === 'string' && (value.sourceIds as string[]).includes(m.workoutId)
    && typeof m.sourcePath === 'string' && m.sourcePath.length <= 300 && validDay(m.eventDate)
    && m.eventDate >= (value.startsOn as string) && m.eventDate <= (value.endsOn as string)
    && typeof m.capturedAt === 'string' && Number.isFinite(Date.parse(m.capturedAt)) && Date.parse(m.capturedAt) <= Date.parse(value.asOf as string)
    && (m.revision === null || (Number.isInteger(m.revision) && Number(m.revision) >= 0))
    && (m.snapshotId === null || typeof m.snapshotId === 'string') && (m.completionId === null || typeof m.completionId === 'string')
    && ['athlete_reported', 'model_estimated', 'copied_template', 'imported_unverified', 'legacy_unknown'].includes(String(m.origin))
    && ['unreviewed', 'athlete_confirmed', 'corrected'].includes(String(m.reviewState)) && typeof m.familiarityEligible === 'boolean'
    && (!m.familiarityEligible || m.origin === 'athlete_reported' || typeof m.completionId === 'string'))
}
function stringList(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= 2000)
}
