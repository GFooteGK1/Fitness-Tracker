import { formatUTCAsLocalDateWithOffset, isValidTimezoneOffset } from '../timezone-utils'
import { validatePlanningIntent } from './planning-intent'
import { isWhoopSyncEligible } from '../agents/whoop-context-eligibility'

export const COACHING_CONTEXT_VERSION = 1 as const
export const REQUIREMENT_KEYS = ['training_intent', 'primary_goal', 'training_schedule', 'available_equipment', 'training_constraints', 'exercise_preferences'] as const
export type ContextRow = Record<string, unknown>
export interface ContextSource {
  status: 'available' | 'missing' | 'unavailable' | 'truncated'
  rows: ContextRow[]
  count: number | null
}

export class CoachingContextError extends Error {
  constructor(public readonly status: 400 | 401 | 409 | 503, message: string) { super(message) }
}

export function parseCoachingContextRequest(params: URLSearchParams) {
  if ([...params.keys()].some(key => !['tzOffset', 'days'].includes(key) || params.getAll(key).length !== 1)) {
    throw new CoachingContextError(400, 'Only tzOffset and days are supported')
  }
  const offset = params.get('tzOffset')
  const dayText = params.get('days') ?? '28'
  if (offset === null || !/^-?\d+$/.test(offset) || !/^\d+$/.test(dayText)) {
    throw new CoachingContextError(400, 'A whole-number tzOffset and days are required')
  }
  const tzOffset = Number(offset), days = Number(dayText)
  if (!Number.isSafeInteger(tzOffset) || !isValidTimezoneOffset(tzOffset) || !Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new CoachingContextError(400, 'Invalid timezone offset or history window (1–90 days)')
  }
  return { tzOffset, days }
}

export const contextObject = (value: unknown): value is ContextRow => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

/** Persistence envelopes contain private review/workflow state. Only named
 * coaching scalars cross this projection; unknown and nested fields never do.
 */
function coachingScalars(value: unknown, fields: readonly string[]): ContextRow {
  if (!contextObject(value)) return {}
  return Object.fromEntries(fields.flatMap(key => {
    const item = value[key]
    return item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))
      || (typeof item === 'string' && item.length <= 10_000) ? [[key, item]] : []
  }))
}

export function projectCoachingDirection(value: unknown) {
  return coachingScalars(value, ['goalSummary', 'goalTargetDate', 'hypothesis'])
}

export function projectCoachingPlan(value: ContextRow) {
  const intent = contextObject(value.intent) ? value.intent : {}
  const week = contextObject(intent.reviewed_week) ? intent.reviewed_week
    : contextObject(intent.weekly_plan) ? intent.weekly_plan : {}
  const basis = contextObject(week.basis) ? week.basis : {}
  const decision = contextObject(week.reviewDecision) ? week.reviewDecision : {}
  return { ...coachingScalars(value, ['id', 'version', 'status', 'plan_mode', 'window_start', 'window_end',
    'reference_version', 'policy_version', 'accepted_at', 'created_at']),
    intent: { ...coachingScalars(intent, ['format', 'horizon_weeks', 'primary_domain', 'rationale']),
      weeklySummary: { ...coachingScalars(week, ['title', 'source', 'sequenceNumber', 'windowStart', 'windowEnd']),
        direction: projectCoachingDirection(week.directionSnapshot),
        rationale: coachingScalars(decision, ['action', 'rationale', 'evidenceStatus']),
        schedulingBasis: coachingScalars(basis, ['reason']) } },
    input_snapshot: null,
    inputSnapshotStatus: 'private_storage_not_exported' as const }
}

export function projectCoachingProposal(value: ContextRow) {
  return { ...coachingScalars(value, ['id', 'program_id', 'base_plan_version_id', 'proposed_plan_version_id', 'status', 'created_at',
    'sourceValidity', 'canReplaceAcceptedPlan', 'acceptanceEligibility']),
    rationale: coachingScalars(value.rationale, ['reason', 'rationale', 'summary', 'explanation', 'why', 'hypothesis', 'action',
      'policyVersion', 'algorithmVersion', 'kernelVersion', 'generatedBy', 'automaticPlanActivation', 'athleteReviewRequired']) }
}

export function projectRequirement(source: ContextSource, key: typeof REQUIREMENT_KEYS[number], asOf: string) {
  const row = source.rows[0]
  let status: string = source.status === 'available' ? 'current' : source.status
  if (row && status === 'current') {
    if (row.status !== 'confirmed') status = 'withdrawn'
    else if (row.memory_key !== key || !validTime(row.confirmed_at) || Date.parse(row.confirmed_at) > Date.parse(asOf)
      || !Number.isSafeInteger(row.version) || Number(row.version) < 1 || !contextObject(row.content)
      || !contextObject(row.provenance)) status = 'invalid'
    else if (['effective_from', 'effective_until', 'review_after'].some(field => row[field] != null && !validTime(row[field]))) status = 'invalid'
    else if (validTime(row.effective_from) && Date.parse(row.effective_from) > Date.parse(asOf)) status = 'not_yet_effective'
    else if (validTime(row.effective_until) && Date.parse(row.effective_until) <= Date.parse(asOf)) status = 'expired'
    else if (validTime(row.review_after) && Date.parse(row.review_after) <= Date.parse(asOf)
      && (!validTime(row.last_reviewed_at) || Date.parse(row.last_reviewed_at) < Date.parse(row.review_after)
        || Date.parse(row.last_reviewed_at) > Date.parse(asOf))) status = 'needs_review'
    else if (key === 'training_intent' && !validatePlanningIntent(row.content).ok) status = 'invalid'
  }
  return { status, value: status === 'current' ? row?.content ?? null : null,
    source: row ? { id: row.id, version: row.version, status: row.status, confirmedAt: row.confirmed_at,
      effectiveFrom: row.effective_from ?? null, effectiveUntil: row.effective_until ?? null,
      reviewAfter: row.review_after ?? null, provenance: row.provenance } : null }
}

export function projectContextRecovery(sources: Record<string, ContextSource>, asOf: string, localDate: string) {
  const sync = sources.sync.rows[0] ?? null
  const connected = sources.connection.status === 'available'
  const eligible = sources.sync.status === 'available' && isWhoopSyncEligible(connected, sync, Date.parse(asOf))
  const utcDate = formatUTCAsLocalDateWithOffset(asOf, 0)
  const metric = (key: string) => {
    const source = sources[key], row = source.rows[0] ?? null
    const dateValid = typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      && Number.isFinite(Date.parse(row.date)) && new Date(row.date).toISOString().startsWith(row.date)
    const value = row?.[key === 'recovery' ? 'recovery_score' : key === 'sleep' ? 'sleep_performance_percentage' : 'strain']
    const status = source.status !== 'available' ? source.status : !dateValid ? 'invalid'
      : (validTime(row?.created_at) && Date.parse(row.created_at) > Date.parse(asOf)) || String(row!.date) > utcDate ? 'future'
        : String(row!.date) < utcDate ? 'stale' : value == null ? 'missing_metric'
          : typeof value !== 'number' || !Number.isFinite(value) ? 'invalid' : !eligible ? 'sync_ineligible' : 'current'
    return { status, usableAsCurrent: status === 'current' && utcDate === localDate, sourceDateBasis: 'UTC' as const,
      observedAt: null, capturedAt: validTime(row?.created_at) ? row.created_at : null,
      timestampPrecision: 'date_only' as const, record: row }
  }
  return { connected, syncEligible: eligible, lastSyncAt: sync?.last_sync_at ?? null,
    syncStatus: sync?.status ?? null, syncSourceStatus: sources.sync.status,
    localDayAlignment: utcDate === localDate ? 'aligned_calendar_date' as const : 'unverified' as const,
    metrics: { recovery: metric('recovery'), sleep: metric('sleep'), strain: metric('strain') } }
}
