import type { SupabaseClient } from '@supabase/supabase-js'
import { CoachingContextError, contextObject } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import { buildExternalPerformedWorkContext } from './external-performed-work-context'
import type { EvidenceQuantity } from './performed-dose-evidence'
import { historyFieldProvenance, type HistoryWorkoutRow } from './planning-history'
import { projectTodayWorkoutRecommendation, readCurrentWorkoutRecommendation } from './today-workout-recommendation'

type CoachingContext = Awaited<ReturnType<typeof readCoachingContext>>
type Work = ReturnType<typeof buildExternalPerformedWorkContext>
type WorkRecord = Work['records'][number]
type WorkoutHeader = Pick<HistoryWorkoutRow, 'id' | 'user_id' | 'workout_date' | 'created_at' | 'updated_at'
  | 'execution_status' | 'execution_revision' | 'capture_revision'>

const HEADER_LIMIT = 31
const MOVEMENT_LIMIT = 12
const headerFields = 'id,user_id,workout_date,created_at,updated_at,execution_status,execution_revision,capture_revision'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export interface TodayWorkoutEvidence {
  workoutId: string
  revision: number | null
  performedAt: string | null
  sessionRpe: number | null
  rpeOrigin: string
  rpeReviewState: string
}

export interface LastCompletedWorkout {
  status: 'available' | 'partial' | 'empty' | 'unavailable'
  date: string | null
  timing: 'exact' | 'date_only' | 'same_day_order_unknown' | null
  movements: Array<{ name: string; measurements: string[]; phase?: 'warmup' }>
  sessionRpe: number | null
}

const emptyWorkout = (status: 'empty' | 'unavailable'): LastCompletedWorkout =>
  ({ status, date: null, timing: null, movements: [], sessionRpe: null })

function quantity(q: EvidenceQuantity) {
  if (q.kind === 'unknown') return null
  return q.kind === 'exact' ? String(q.value) : `${q.min}–${q.max}`
}

function positiveWhole(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function rpe(value: unknown): number | null {
  const n = finite(value)
  return n !== null && n >= 1 && n <= 10 ? n : null
}

interface SetLine {
  count: number | null
  reps: string | null
  load: string | null
  effort: number | null
  extra: string | null
  perSide: boolean
}

function setDetail(value: unknown): SetLine | null {
  if (!contextObject(value)) return null
  const perLeg = positiveWhole(value.reps_per_leg)
  const reps = perLeg ?? positiveWhole(value.reps)
  const savedLoad = contextObject(value.load) ? value.load : null
  const loadAmount = finite(savedLoad?.value)
  const load = loadAmount !== null && (savedLoad?.unit === 'lb' || savedLoad?.unit === 'kg')
    ? `${loadAmount} ${savedLoad.unit}`
    : typeof value.weight === 'string' ? value.weight.trim().slice(0, 32) || null : null
  const effort = rpe(value.rpe)
  return reps !== null || load || effort !== null ? {
    count: positiveWhole(value.sets) ?? 1, reps: reps === null ? null : String(reps), load, effort, extra: null, perSide: perLeg !== null,
  } : null
}

function firstUsableSets(...sources: unknown[]): SetLine[] {
  for (const source of sources) {
    if (!Array.isArray(source)) continue
    const entries = source.flatMap(value => setDetail(value) ?? [])
    if (entries.length) return entries
  }
  return []
}

function recordLines(record: WorkRecord, nested: Work['nestedSetContexts']): SetLine[] {
  if ('recordedEvent' in record) {
    const recorded = record.recordedEvent.performed
    // Aliases can contain the same source facts. Prefer the first usable list
    // without summing both or letting an empty primary list hide real sets.
    const recordedSets = firstUsableSets(recorded.sets, recorded.set_details)
    if (recordedSets.length) return recordedSets
    const distance = contextObject(recorded.distance) ? recorded.distance : null
    const distanceUnit = typeof distance?.unit === 'string' ? distance.unit.trim().slice(0, 10) : ''
    const secs = finite(recorded.time_s)
    const rounds = positiveWhole(record.segmentContext.recordedRounds)
    const extras = [finite(distance?.value) !== null && distanceUnit ? `${distance?.value} ${distanceUnit}` : null,
      secs !== null ? `${secs} s` : null, rounds !== null && rounds > 1 ? `${rounds} recorded rounds` : null].filter(Boolean)
    const loadAmount = quantity(record.quantities.load)
    const count = record.quantities.sets.kind === 'exact' ? positiveWhole(record.quantities.sets.value) : null
    return [{ count, reps: quantity(record.quantities.repetitions), load: loadAmount && record.loadUnit ? `${loadAmount} ${record.loadUnit}` : null,
      effort: null, extra: extras.join(' · ') || null, perSide: false }]
  }
  const legacySets = firstUsableSets(...nested.filter(item => item.workoutId === record.workoutId
    && (item.sourcePath === `${record.sourcePath}.sets` || item.sourcePath === `${record.sourcePath}.set_details`))
    .map(item => item.recordedSets))
  if (legacySets.length) return legacySets
  const loadUnit = record.quantities.loadUnit
  const loadAmount = quantity(record.quantities.load)
  const load = loadAmount && loadUnit ? `${loadAmount} ${loadUnit}` : typeof record.recordedWeight?.value === 'string'
    ? record.recordedWeight.value.trim().slice(0, 32) || null : null
  const duration = quantity(record.quantities.durationMinutes)
  const set = 'setEvidence' in record && contextObject(record.setEvidence) ? record.setEvidence : null
  const durationSeconds = finite(set?.durationSeconds)
  const distanceMetres = finite(set?.distanceMetres)
  const effort = contextObject(record.effort) && record.effort.scale === 'RPE' && record.effort.scope === 'set'
    ? rpe(record.effort.value) : null
  const explicitCount = record.quantities.sets.kind === 'exact' ? positiveWhole(record.quantities.sets.value) : null
  const extra = [distanceMetres !== null ? `${distanceMetres} m` : null,
    durationSeconds !== null ? `${durationSeconds} s` : duration ? `${duration} min` : null].filter(Boolean).join(' · ') || null
  return [{ count: explicitCount ?? (set ? 1 : null), reps: quantity(record.quantities.repetitions), load, effort, extra,
    perSide: record.unilateralConvention === true || record.unilateralConvention === 'per_side' }]
}

function warmupBlocks(blocks: unknown) {
  const entries = Array.isArray(blocks) ? blocks : contextObject(blocks) && Array.isArray(blocks.blocks) ? blocks.blocks : []
  const marked = new Set<number>()
  for (const [index, block] of entries.entries()) {
    if (!contextObject(block)) continue
    if (block.role === 'specific_preparation' || [block.role, block.block_type].some(value =>
      typeof value === 'string' && /^warm[ _-]*up$/i.test(value.trim()))
      || typeof block.title === 'string' && /^warm[ _-]*up\b/i.test(block.title.trim())) marked.add(index)
  }
  return marked
}

function renderMovements(work: Work, workoutId: string, blocks: unknown) {
  const warmups = warmupBlocks(blocks)
  type Amount = SetLine & { isHold: boolean; effortValues: Set<number>; notes: string[] }
  type Bucket = { name: string; isWarmup: boolean; notes: Set<string>; amounts: Map<string, Amount> }
  const buckets = new Map<string, Bucket>()
  for (const record of work.records) {
    if (record.workoutId !== workoutId || record.completionState === 'explicitly_not_completed') continue
    const savedName = record.recordedName?.trim().replace(/\s+/g, ' ')
    const timedHold = 'recordedEvent' in record && finite(record.recordedEvent.performed.time_s) !== null
      ? /^(.+?),\s*hold [1-9]\d*$/i.exec(savedName ?? '') : null
    const recordedName = timedHold?.[1].trim() ?? savedName
    const name = recordedName?.slice(0, 100) || 'Recorded movement'
    const block = /^(?:blocks\.blocks|blocks)\[(\d+)\]/.exec(record.sourcePath)
    const isWarmup = record.role === 'preparation' || (block !== null && warmups.has(Number(block[1])))
    const segment = 'segmentContext' in record ? record.segmentContext : null
    const metadata = 'protocol' in record ? [record.role, record.protocol, record.equipment, record.unilateralConvention] : null
    // A catalog ID can cover differently named recorded work, such as separate running drills.
    const identity = recordedName
      ? ['name', recordedName.toLowerCase(), record.movementId, !record.movementId && 'equipment' in record ? record.equipment : null]
      : ['source', record.sourcePath]
    const key = JSON.stringify([isWarmup, identity])
    const notes = [...(record.basis === 'estimated_work' ? ['Estimated'] : []),
      ...(record.completionState === 'uncertain' ? ['Completion uncertain'] : [])]
    const bucket: Bucket = buckets.get(key) ?? { name, isWarmup, notes: new Set(), amounts: new Map() }
    buckets.set(key, bucket)
    // A recorded round count belongs to its segment. It can group rows under a
    // movement heading, but it cannot establish a set total across segments.
    const roundScope = segment && segment.recordedRounds !== null && segment.recordedRounds !== 1 ? segment.sourcePath : null
    let hasAmount = false
    for (const savedLine of recordLines(record, work.nestedSetContexts)) {
      // A timed event explicitly numbered as a hold represents one hold. Keep
      // hold counts local to the segment and do not multiply by its rounds.
      const isHold = Boolean(timedHold && savedLine.count === null && savedLine.extra)
      const line = isHold ? { ...savedLine, count: 1 } : savedLine
      if (line.count === null && !line.reps && !line.load && !line.extra && line.effort === null) continue
      hasAmount = true
      const doseScope = line.count === null || isHold ? segment?.sourcePath ?? block?.[0] ?? record.sourcePath : null
      const lineKey = JSON.stringify([roundScope, doseScope, isHold, metadata, record.basis, record.completionState,
        line.reps, line.load, line.extra, line.perSide])
      const matching = bucket.amounts.get(lineKey)
      if (matching) {
        if (matching.count !== null && line.count !== null && Number.isSafeInteger(matching.count + line.count)) matching.count += line.count
        if (line.effort !== null) matching.effortValues.add(line.effort)
      } else bucket.amounts.set(lineKey, { ...line, isHold, notes, effortValues: new Set(line.effort === null ? [] : [line.effort]) })
    }
    if (!hasAmount) for (const note of notes) bucket.notes.add(note)
  }
  const groups = [...buckets.values()]
  const movements: LastCompletedWorkout['movements'] = groups.slice(0, MOVEMENT_LIMIT).map(bucket => ({
    name: bucket.name,
    ...(bucket.isWarmup ? { phase: 'warmup' as const } : {}),
    measurements: [...bucket.amounts.values()].slice(0, 8).map(line => {
      const reps = line.reps ? `${line.reps} reps${line.perSide ? ' per side' : ''}` : null
      const countUnit = line.isHold ? 'hold' : 'set'
      const count = line.count !== null ? `${line.count} ${countUnit}${line.count === 1 ? '' : 's'}` : null
      const dose = [count, reps].filter(Boolean).join(' × ')
      const strength = [dose, line.load].filter(Boolean).join(' at ')
      const amount = [strength, line.extra].filter(Boolean).join(line.isHold ? ' × ' : ' · ')
      const effort = [...line.effortValues]
      return [amount, effort.length ? `Set RPE ${effort.join(', ')}` : null, ...line.notes].filter(Boolean).join(' · ')
    }).concat([...bucket.notes]),
  }))
  return { movements, truncated: groups.length > MOVEMENT_LIMIT || groups.some(bucket => bucket.amounts.size > 8) }
}

async function verifiedOccurrenceTimes(db: SupabaseClient, owner: string, rows: WorkoutHeader[], asOf: number) {
  const matching = rows.filter(row => uuid.test(row.id) && positiveWhole(row.capture_revision) !== null)
  const times = new Map<string, string>()
  if (!matching.length) return times
  try {
    const filter = matching.map(row => `and(original_entity_id.eq.${row.id},revision.eq.${row.capture_revision})`).join(',')
    const { data, error } = await db.from('activity_revisions')
      .select('user_id,original_entity_id,revision,event_at,event_precision,deleted,captured_at')
      .eq('user_id', owner).eq('entity_kind', 'workout').or(filter).limit(matching.length + 1)
    if (error || !Array.isArray(data) || data.length > matching.length) return times
    const seen = new Set<string>()
    for (const row of data) {
      const source = matching.find(item => item.id === row.original_entity_id && item.capture_revision === row.revision)
      if (row.user_id !== owner || !source || seen.has(source.id)) return new Map<string, string>()
      seen.add(source.id)
      if (row.deleted === false && row.event_precision === 'timestamp' && typeof row.event_at === 'string' && timestamp.test(row.event_at)
        && typeof row.captured_at === 'string' && Date.parse(row.event_at) <= asOf && Date.parse(row.captured_at) <= asOf) {
        times.set(source.id, row.event_at)
      }
    }
  } catch { /* The canonical date is available even when exact event timing is missing. */ }
  return times
}

async function readLastCompletedWorkout(db: SupabaseClient, owner: string, context: CoachingContext): Promise<{
  lastWorkout: LastCompletedWorkout; workoutEvidence: TodayWorkoutEvidence | null
}> {
  const unavailable = { lastWorkout: emptyWorkout('unavailable'), workoutEvidence: null }
  const { localDate, readCompletedAt, performedWork } = context
  try {
    const { data, error } = await db.from('workouts').select(headerFields).eq('user_id', owner).eq('execution_status', 'completed')
      .lte('workout_date', localDate).lte('created_at', readCompletedAt)
      .order('workout_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: true }).limit(HEADER_LIMIT)
    if (error || !Array.isArray(data) || data.length > HEADER_LIMIT || data.some(row => row.user_id !== owner
      || row.execution_status !== 'completed' || typeof row.id !== 'string' || typeof row.workout_date !== 'string'
      || row.workout_date > localDate || !(Date.parse(row.created_at) <= Date.parse(readCompletedAt)))) return unavailable
    const rows: WorkoutHeader[] = data
    if (!rows.length) return { lastWorkout: emptyWorkout('empty'), workoutEvidence: null }
    const sameDay = rows.filter(row => row.workout_date === rows[0].workout_date)
    const times = await verifiedOccurrenceTimes(db, owner, sameDay, Date.parse(readCompletedAt))
    const exactSort = sameDay.length < HEADER_LIMIT && sameDay.every(row => times.has(row.id))
    const latest = exactSort ? [...sameDay].sort((a, b) => Date.parse(times.get(b.id)!) - Date.parse(times.get(a.id)!))[0] : sameDay[0]
    const performedAt = times.get(latest.id) ?? null
    const timing = sameDay.length > 1 && (!exactSort || sameDay.filter(row => Date.parse(times.get(row.id) ?? '') === Date.parse(performedAt ?? '')).length > 1)
      ? 'same_day_order_unknown' : performedAt ? 'exact' : 'date_only'
    // Read the selected row only. A correction during retrieval invalidates the
    // read instead of mixing old revision metadata with new performed sets.
    const { data: full, error: fullError } = await db.from('workouts')
      .select(`${headerFields},blocks,rpe,execution_source,capture_provenance,captured_at`)
      .eq('user_id', owner).eq('id', latest.id).limit(1)
    const current: HistoryWorkoutRow | undefined = full?.[0]
    if (fullError || full?.length !== 1 || !current || current.user_id !== owner || current.id !== latest.id
      || current.capture_revision !== latest.capture_revision || current.updated_at !== latest.updated_at
      || current.workout_date !== latest.workout_date || current.execution_status !== 'completed'
      || !(Date.parse(current.updated_at ?? current.captured_at ?? current.created_at) <= Date.parse(readCompletedAt))) return unavailable
    const savedRpe = rpe(current.rpe)
    const effort = historyFieldProvenance(current.capture_provenance, 'rpe', 'rpe')
    const workoutEvidence = { workoutId: latest.id, revision: positiveWhole(latest.capture_revision),
      performedAt: timing === 'same_day_order_unknown' ? null : performedAt, sessionRpe: savedRpe,
      rpeOrigin: effort.origin, rpeReviewState: effort.reviewState }
    // Use the exact checked context when it contains matched program-runner
    // completion evidence. Otherwise project only the selected canonical row.
    const relevant = performedWork?.records.filter(record => record.workoutId === latest.id)
    const normalizedRevision = latest.capture_revision ?? latest.execution_revision ?? null
    const matchingContext = Boolean(relevant?.length && relevant.every(record => record.revision === normalizedRevision
      && Date.parse(record.capturedAt) === Date.parse(current.updated_at ?? current.captured_at ?? current.created_at)))
    const work = matchingContext && performedWork ? performedWork
      : JSON.stringify(current.blocks ?? null).length <= 128_000 ? buildExternalPerformedWorkContext({
        userId: owner, asOf: readCompletedAt, startsOn: current.workout_date, endsOn: current.workout_date,
        mode: 'current', workouts: [current], available: true, complete: true,
      }) : null
    const { movements, truncated } = work ? renderMovements(work, latest.id, current.blocks) : { movements: [], truncated: false }
    const partial = !work || !movements.length || truncated || timing === 'same_day_order_unknown'
      || work.coverage.additionalOmissions > 0
      || work.coverage.issues.some(issue => issue.sourceId === latest.id || issue.sourceId === `workout:${latest.id}`)
      || work.coverage.omitted.some(item => item.sourceId === latest.id || item.sourceId === `workout:${latest.id}`)
    return { lastWorkout: { status: partial ? 'partial' : 'available', date: latest.workout_date, timing, movements, sessionRpe: savedRpe }, workoutEvidence }
  } catch { return unavailable }
}

export function createWorkoutTodayReader(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return async (context: CoachingContext) => {
    const { principal, db } = await authorize()
    assertVerifiedContextPrincipal(principal, policy)
    const identity = await db.auth.getUser()
    if (identity.error || identity.data.user?.id !== principal.subject
      || (context.performedWork && context.performedWork.userId !== principal.subject)) {
      throw new CoachingContextError(401, 'Authenticated subject mismatch')
    }
    const owner = principal.subject
    const [last, storedRecommendation] = await Promise.all([
      readLastCompletedWorkout(db, owner, context),
      readCurrentWorkoutRecommendation(db, owner, context),
    ])
    const plan = projectTodayWorkoutRecommendation(context)
    const workoutRecommendation = storedRecommendation ? {
      ...plan, ...storedRecommendation, status: 'recommended' as const, source: 'saved_recommendation' as const,
    } : plan
    return { ...last, workoutRecommendation }
  }
}
