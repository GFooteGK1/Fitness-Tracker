/** Server-internal read/compile seam. No HTTP endpoint, registration write or numerical activation. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import { fetchPlanningHistorySnapshot } from './planning-context'
import { buildPerformedWorkEvidence } from './performed-work-context'
import { parseCoachContextRevision } from './proposal-context-revision'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { captureSetupMemoryBindings, setupMemoryBindingsCurrent } from './setup-memory-bindings'
import { compileOfflineReviewedSession, type OfflineReviewedSessionContext } from './offline-reviewed-session'
import { REVIEWED_MOVEMENT_CATALOG_VERSION } from './movement-catalog'
import { fetchReviewedExecutionSlots } from './reviewed-execution-context-server'

type Row = Record<string, unknown>
export interface ReviewedContextScope {
  programId: string
  basePlanVersionId: string
  /** Explicit retrieval scope, not a biological expiry or training-volume assumption. */
  historyThrough: string
  historyDays: number
  tzOffset: number
}

/** Server-owned review record; never accept this object or its hashes from a request/model. */
export interface TrustedReviewedSessionRegistration {
  userId: string
  scope: ReviewedContextScope
  contextHash: string
  compilation: Omit<OfflineReviewedSessionContext, 'profile'>
}

async function authenticatedOwner(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.auth.getUser()
  if (error || !data.user?.id) throw new Error('Authentication required')
  return data.user.id
}

/** The existing revision RPC initializes a row. This SELECT intentionally performs no write. */
async function readRevision(db: SupabaseClient, userId: string): Promise<number> {
  const result = await db.from('coach_context_revisions').select('user_id,revision').eq('user_id', userId).limit(2)
  if (result.error || !Array.isArray(result.data) || result.data.length > 1) throw new Error('Context revision unavailable')
  const row = result.data[0]
  if (!row) return 0
  const revision = parseCoachContextRevision(row.revision)
  if (row.user_id !== userId || revision === null) throw new Error('Invalid context revision')
  return revision
}

async function readBase(db: SupabaseClient, userId: string, scope: ReviewedContextScope) {
  const [program, plan] = await Promise.all([
    db.from('training_programs').select('id,user_id,status,program_mode,active_plan_version_id')
      .eq('user_id', userId).eq('id', scope.programId).limit(2),
    db.from('training_plan_versions').select('id,user_id,program_id,status,plan_mode,intent,input_snapshot,window_start,window_end,sequence_number')
      .eq('user_id', userId).eq('program_id', scope.programId).eq('id', scope.basePlanVersionId).limit(2),
  ])
  const p = program.data?.[0], v = plan.data?.[0]
  if (program.error || plan.error || program.data?.length !== 1 || plan.data?.length !== 1 || !p || !v
    || p.user_id !== userId || p.id !== scope.programId || p.status !== 'active' || p.program_mode !== 'rolling_weekly'
    || p.active_plan_version_id !== scope.basePlanVersionId || v.user_id !== userId || v.id !== scope.basePlanVersionId
    || v.program_id !== scope.programId || v.status !== 'accepted' || v.plan_mode !== 'rolling_weekly') {
    throw new Error('Active accepted plan unavailable or changed')
  }
  const intent = decodeCoachWeeklyIntent(v.intent)
  if (!intent) throw new Error('Accepted plan cannot be decoded')
  if (intent.kind === 'reviewed' && (intent.plan.windowStart !== v.window_start || intent.plan.windowEnd !== v.window_end
    || intent.plan.sequenceNumber !== v.sequence_number)) throw new Error('Reviewed accepted window changed')
  return { program: p, plan: v, profile: intent.plan.profileSnapshot,
    reviewedSessions: intent.plan.scheduledSessions }
}

async function readOwnedRows(db: SupabaseClient, userId: string, table: string, limit: number): Promise<Row[]> {
  const result = await db.from(table).select('*', { count: 'exact' }).eq('user_id', userId).order('id', { ascending: true }).limit(limit + 1)
  if (result.error || !Array.isArray(result.data) || result.data.length > limit
    || !Number.isSafeInteger(result.count) || result.count !== result.data.length) throw new Error(`Incomplete ${table} retrieval`)
  if (result.data.some(row => row.user_id !== userId || typeof row.id !== 'string')
    || new Set(result.data.map(row => row.id)).size !== result.data.length) throw new Error(`Invalid ${table} ownership or identity`)
  return result.data
}

function lifecycle(row: Row, asOf: number) {
  const time = (value: unknown) => value == null ? null : typeof value === 'string' ? Date.parse(value) : NaN
  const start = time(row.effective_from), end = time(row.effective_until), review = time(row.review_after)
  if ([start, end, review].some(value => value !== null && !Number.isFinite(value))) return 'invalid'
  if (row.status !== 'confirmed') return 'unconfirmed'
  if (start !== null && start > asOf) return 'future'
  if (end !== null && end <= asOf) return 'expired'
  if (review !== null && review <= asOf) return 'review_due'
  return 'current'
}

/** Authenticates and reads the bounded source packet. A complete query is not complete athlete evidence. */
export async function fetchReviewedDoseContext(db: SupabaseClient, scope: ReviewedContextScope) {
  const userId = await authenticatedOwner(db)
  const revision = await readRevision(db, userId)
  const base = await readBase(db, userId, scope)
  const asOf = new Date().toISOString()
  const [history, memories, assessments, observationGroups, observationValues, imports, setup, setReports, sessionSignals, executionSlots] = await Promise.all([
    fetchPlanningHistorySnapshot(db, userId, { startDate: scope.historyThrough, asOf,
      windowDays: scope.historyDays, tzOffset: scope.tzOffset, includeNarrative: true, requireExactCounts: true, includePostCutoffSources: true }),
    readOwnedRows(db, userId, 'coach_memories', 200),
    readOwnedRows(db, userId, 'coach_strength_assessments', 100),
    readOwnedRows(db, userId, 'performance_observation_groups', 200),
    readOwnedRows(db, userId, 'performance_observation_values', 1000),
    readOwnedRows(db, userId, 'measurement_imports', 100),
    // This stage cannot reconcile changed setup with an old accepted profile yet.
    captureSetupMemoryBindings(db, userId, base.profile),
    readOwnedRows(db, userId, 'coach_reviewed_set_reports', 2000),
    readOwnedRows(db, userId, 'coach_session_signals', 2000),
    fetchReviewedExecutionSlots(db, userId, scope.programId, scope.basePlanVersionId, base.reviewedSessions),
  ])
  // A database clock ahead of this process must not turn just-saved evidence into
  // an apparently complete empty history. Retain current rows and reject the skew.
  if ([...history.workouts, ...(history.completions ?? [])].some(row => (
    !row.created_at || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > Date.parse(asOf)
  ))) throw new Error('Source timestamps exceed the current read cutoff')
  const performed = buildPerformedWorkEvidence(history)
  if (history.endsOn !== formatUTCAsLocalDateWithOffset(asOf, scope.tzOffset)) throw new Error('History window excludes current training')
  if (!history.available || !history.complete || history.missing?.length || !performed.coverage.complete) {
    throw new Error('Performed evidence retrieval is incomplete or requires review')
  }
  const memoryStates = memories.map(row => ({ id: row.id, state: lifecycle(row, Date.parse(asOf)) }))
  if (memoryStates.some(row => row.state === 'invalid')) throw new Error('Memory lifecycle needs review')
  const intents = memories.filter(row => row.memory_key === 'training_intent')
  if (intents.some(row => !Number.isSafeInteger(row.version) || Number(row.version) < 1)) throw new Error('Invalid training intent version')
  intents.sort((a, b) => Number(b.version) - Number(a.version))
  const currentIntent = intents[0], acceptedIntent = base.profile.trainingIntent
  if (currentIntent ? !acceptedIntent || memoryStates.find(row => row.id === currentIntent.id)?.state !== 'current'
    || currentIntent.id !== acceptedIntent.memoryId || currentIntent.version !== acceptedIntent.memoryVersion
    || doseContentHash(currentIntent.content) !== doseContentHash(acceptedIntent.content)
    || intents.some(row => row !== currentIntent && row.version === currentIntent.version) : Boolean(acceptedIntent)) {
    throw new Error('Confirmed training intent changed or needs review')
  }
  // Source values, not volatile read timestamps, bind subsequent readback. Lifecycle states
  // remain included so clock-driven expiry changes the fingerprint without a database write.
  const { asOf: _readTime, ...historySources } = history
  void _readTime
  const binding = { version: 'reviewed-dose-context-3', reviewedMovementCatalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION, userId, scope, revision,
    base: { program: base.program, plan: base.plan }, history: historySources,
    memories, memoryStates, assessments, observationGroups, observationValues, imports, setup, setReports, sessionSignals, executionSlots }
  const [afterBase, setupCurrent, afterOwner] = await Promise.all([
    readBase(db, userId, scope),
    setupMemoryBindingsCurrent(db, userId, setup), authenticatedOwner(db),
  ])
  const afterRevision = await readRevision(db, userId)
  if (afterRevision !== revision || afterOwner !== userId || !setupCurrent
    || doseContentHash(afterBase) !== doseContentHash(base)
    || doseContentHash(memoryStates) !== doseContentHash(memories.map(row => ({ id: row.id, state: lifecycle(row, Date.now()) })))) {
    throw new Error('Training context changed during read')
  }
  return { userId, asOf, contextHash: doseContentHash(binding), binding, profile: structuredClone(base.profile), performed,
    numericRuntimeEligible: false as const, limitations: ['Bounded source retrieval only', 'Older history and outside logging coverage remain unknown',
      'No numerical sufficiency, preparation eligibility, whole-week feasibility or persistence authority'] }
}

/** Request selects an ID only. The server supplies reviewed registry, facts, recipe and source scope. */
export async function compileAuthenticatedReviewedSession(db: SupabaseClient, optionId: string,
  registry: readonly TrustedReviewedSessionRegistration[]) {
  try {
    const owner = await authenticatedOwner(db)
    const matches = registry.filter(entry => entry.userId === owner && entry.compilation.input.optionId === optionId)
    if (matches.length !== 1) return { kind: 'review_required' as const, reasons: ['Owned reviewed option unavailable or ambiguous'] }
    // Detach before awaiting: caller mutation cannot change reviewed authority during reads.
    const entry = structuredClone(matches[0])
    const context = await fetchReviewedDoseContext(db, entry.scope)
    if (context.userId !== owner || context.contextHash !== entry.contextHash) {
      return { kind: 'review_required' as const, reasons: ['Reviewed source context changed'] }
    }
    const result = compileOfflineReviewedSession({ ...entry.compilation, profile: context.profile })
    return { ...result, sourceBinding: { userId: owner, contextHash: context.contextHash, readAt: context.asOf },
      limitations: context.limitations }
  } catch {
    return { kind: 'review_required' as const, reasons: ['Authenticated evidence unavailable, incomplete or changed'] }
  }
}
