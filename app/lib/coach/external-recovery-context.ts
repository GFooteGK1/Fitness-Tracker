import type { ContextRow, ContextSource } from './coaching-context'
import { isWhoopSyncEligible } from '../agents/whoop-context-eligibility'

const validDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value

/** Preserve supplied precision/offset. Date labels and zone-less strings are not instants. */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match || !validDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59
    || Number(match[4]) > 59 || (match[5] !== 'Z' && (Number(match[6]) > 14
      || Number(match[7]) > 59 || (Number(match[6]) === 14 && Number(match[7]) !== 0)))
    || !Number.isFinite(Date.parse(value))) return null
  return value
}

const fields = {
  recovery: ['id', 'user_id', 'cycle_id', 'date', 'recovery_score', 'resting_heart_rate', 'hrv_rmssd_milli', 'created_at'],
  sleep: ['id', 'user_id', 'sleep_id', 'date', 'sleep_performance_percentage', 'sleep_efficiency_percentage', 'total_sleep_duration_ms', 'is_nap', 'created_at'],
  strain: ['id', 'user_id', 'cycle_id', 'date', 'strain', 'created_at'],
} as const

function record(row: ContextRow | null, keys: readonly string[]) {
  if (!row) return null
  return Object.fromEntries(keys.flatMap(key => {
    const value = row[key]
    return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.length <= 256) ? [[key, value]] : []
  }))
}

// These are retained provider facts, not observation times or a cross-row join.
const timingColumns = ['provider_created_at', 'provider_updated_at', 'provider_interval_start', 'provider_interval_end',
  'provider_timezone_offset', 'provider_score_state', 'timing_ingested_at', 'timing_mapping_version', 'timing_provenance']
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)
// cycle_id is TEXT in storage, though the provider payload uses a JSON number.
const positiveId = (v: unknown): boolean => {
  const n = typeof v === 'string' && /^[1-9]\d{0,15}$/.test(v) ? Number(v) : v
  return Number.isSafeInteger(n) && Number(n) > 0
}
const zone = (v: unknown): v is string => typeof v === 'string' && v !== '-00:00' && /^(?:[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(v)
function providerInstant(value: unknown) {
  const raw = timestamp(value)
  if (!raw || raw.startsWith('0000-')) return null
  const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(raw)
  if (!match || (match[3] !== 'Z' && !zone(match[3]))) return null
  return { raw, us: BigInt(Date.parse(match[1] + match[3])) * BigInt(1000) + BigInt((match[2] ?? '').padEnd(6, '0')) }
}

function retainedTiming(row: ContextRow | null, kind: keyof typeof fields, asOf: string) {
  const r = row ?? {}, issues: string[] = []
  const supplied = [...timingColumns, 'provider_sleep_id', 'provider_cycle_id'].some(key => r[key] != null)
  if (supplied) for (const key of timingColumns) if (!(key in r)) issues.push(`${key}_missing`)
  const now = providerInstant(asOf)!.us
  const time = (key: string, required = true) => {
    if (r[key] == null) { if (supplied && required) issues.push(`${key}_missing`); return null }
    const value = providerInstant(r[key])
    if (!value) issues.push(`${key}_invalid`)
    else if (value.us > now) issues.push(`${key}_future`)
    return value
  }
  const text = (key: string, valid: (v: unknown) => boolean) => {
    if (r[key] == null) { if (supplied) issues.push(`${key}_missing`); return null }
    if (!valid(r[key])) { issues.push(`${key}_invalid`); return null }
    return r[key] as string
  }
  const created = time('provider_created_at'), updated = time('provider_updated_at'), ingested = time('timing_ingested_at')
  const start = kind === 'recovery' ? null : time('provider_interval_start')
  const end = kind === 'recovery' ? null : time('provider_interval_end', kind === 'sleep')
  const timezone = kind === 'recovery' ? null : text('provider_timezone_offset', zone)
  if (kind === 'recovery' && [r.provider_interval_start, r.provider_interval_end, r.provider_timezone_offset].some(v => v != null)) issues.push('recovery_interval_or_timezone_invalid')
  if ((created && updated && updated.us < created.us) || (updated && ingested && updated.us > ingested.us)
    || (start && end && end.us < start.us) || (ingested && [start, end].some(t => t && t.us > ingested.us))) issues.push('snapshot_order_invalid')
  const mappingVersion = text('timing_mapping_version', v => v === 'whoop_timing_owner_v1')
  const scoreState = text('provider_score_state', v => typeof v === 'string' && ['SCORED', 'PENDING_SCORE', 'UNSCORABLE'].includes(v))
  const expected = { source: 'provider_payload', intervalRole: kind === 'recovery' ? 'none' : kind === 'strain' ? 'cycle' : 'sleep',
    legacyDate: 'unchanged_not_measurement_day', observationTime: 'not_assigned' }
  const p = r.timing_provenance
  const provenance = p && typeof p === 'object' && !Array.isArray(p)
    && Object.entries(expected).every(([key, value]) => (p as ContextRow)[key] === value) ? expected : null
  if (supplied && !provenance) issues.push(p == null ? 'timing_provenance_missing' : 'timing_provenance_invalid')
  const sleepId = kind === 'recovery' ? text('provider_sleep_id', uuid) : null
  const cycleId = kind === 'sleep' ? text('provider_cycle_id', v => typeof v === 'string' && /^[1-9]\d{0,15}$/.test(v) && positiveId(Number(v))) : null
  if (supplied && !(kind === 'sleep' ? uuid(r.sleep_id) : positiveId(r.cycle_id))) issues.push('source_identity_invalid')
  const status = !supplied ? 'unrecorded' : issues.some(v => v.endsWith('_invalid')) ? 'invalid'
    : issues.some(v => v.endsWith('_future')) ? 'future' : issues.length ? 'partial' : 'recorded'
  return {
    providerCreatedAt: created?.raw ?? null, providerUpdatedAt: updated?.raw ?? null,
    intervalStart: start?.raw ?? null, intervalEnd: end?.raw ?? null,
    providerTimezoneOffset: timezone, lastRecordIngestedAt: ingested?.raw ?? null,
    providerTiming: { status, mappingVersion, scoreState, provenance, issues: [...new Set(issues)],
      sourceLink: { sleepId, cycleId, verification: 'not_joined' as const },
      ingestionMeaning: 'last_retained_timing_snapshot_not_every_health_upsert' as const,
      completenessMeaning: 'recognized_stored_fields_not_verified_provider_authenticity_or_atomic_generation' as const },
  }
}

/** Expose retained provider facts separately from measurement freshness. Legacy
 * rows have only a UTC ingest date label and storage time; batch time cannot fill gaps.
 * This projection never diagnoses readiness or causes provider/token/sync effects.
 */
export function projectContextRecovery(sources: Record<string, ContextSource>, asOf: string, localDate: string) {
  const sync = sources.sync.status === 'available' ? sources.sync.rows[0] ?? null : null
  const connected = sources.connection.status === 'available' ? true : sources.connection.status === 'missing' ? false : null
  const now = Date.parse(asOf), utcDate = new Date(now).toISOString().slice(0, 10)
  const lastSyncAt = timestamp(sync?.last_sync_at)
  const batchTimeStatus = sync?.last_sync_at == null ? 'missing' : !lastSyncAt ? 'invalid'
    : Date.parse(lastSyncAt) > now ? 'future' : 'recorded'
  const syncStatus = typeof sync?.status === 'string' && ['idle', 'syncing', 'error'].includes(sync.status) ? sync.status : null
  const eligible = sources.sync.status === 'available' && batchTimeStatus === 'recorded'
    && isWhoopSyncEligible(connected === true, sync, now)
  const counts = sync?.records_synced
  const processedCounts = counts && typeof counts === 'object' && !Array.isArray(counts)
    ? Object.fromEntries(['recovery', 'sleep', 'cycles', 'workouts'].flatMap(key => {
      const value = (counts as ContextRow)[key]
      return Number.isSafeInteger(value) && Number(value) >= 0 ? [[key, value]] : []
    })) : null
  const nextSyncHintAt = timestamp(sync?.next_sync_at)
  const metric = (key: keyof typeof fields) => {
    const source = sources[key], row = source.rows[0] ?? null
    const date = validDate(row?.date) ? row.date : null
    const storageCreatedAt = timestamp(row?.created_at)
    const storageTimeStatus = row?.created_at == null ? 'missing' : !storageCreatedAt ? 'invalid'
      : Date.parse(storageCreatedAt) > now ? 'future' : 'recorded'
    const dateStatus = !date ? 'invalid' : date > utcDate ? 'future' : date < utcDate ? 'historical_label' : 'same_utc_label'
    const value = row?.[key === 'recovery' ? 'recovery_score' : key === 'sleep' ? 'sleep_performance_percentage' : 'strain']
    const status = source.status !== 'available' ? source.status : !date ? 'invalid'
      : dateStatus === 'future' || storageTimeStatus === 'future' ? 'future'
        : value == null ? 'missing_metric' : typeof value !== 'number' || !Number.isFinite(value) ? 'invalid'
          : dateStatus === 'historical_label' ? 'stale' : !eligible ? 'sync_ineligible' : 'timing_unverified'
    return { status, usableAsCurrent: false as const, sourceDateBasis: 'UTC' as const,
      observedAt: null, capturedAt: null, timestampPrecision: 'date_only' as const,
      storageCreatedAt, storageTimeStatus, storedDate: date, storedDateStatus: dateStatus,
      dateMeaning: 'legacy_ingest_calendar_label_not_verified_measurement_day' as const,
      legacyDateOrigin: 'provider_created_or_sync_fallback_unrecorded' as const,
      measurementAgeMs: null, measurementTimingStatus: 'unrecorded' as const,
      ...retainedTiming(row, key, asOf),
      source: { provider: 'WHOOP', table: key === 'strain' ? 'whoop_cycles' : `whoop_${key}`,
        status: source.status, count: source.count, selection: 'latest_stored_date_then_id_desc',
        filter: key === 'sleep' ? 'non_nap' : null, athleteCoverage: 'unknown' },
      record: record(row, fields[key]) }
  }
  return { viewVersion: 'external-recovery-timing-2', connected, connectionSourceStatus: sources.connection.status,
    syncEligible: eligible, syncEligibilityMeaning: 'existing_24h_batch_source_rule_not_measurement_freshness',
    lastSyncAt, syncStatus, syncSourceStatus: sources.sync.status,
    batch: { lastSuccessfulBatchAt: lastSyncAt, timeStatus: batchTimeStatus,
      ageMs: batchTimeStatus === 'recorded' ? now - Date.parse(lastSyncAt!) : null,
      hasRecordedError: sync ? typeof sync.error_message === 'string' && sync.error_message.length > 0 : null,
      statusValidity: !sync ? sources.sync.status : syncStatus ? 'recognized' : 'invalid',
      storageCreatedAt: timestamp(sync?.created_at), statusUpdatedAt: timestamp(sync?.updated_at),
      processedCounts, countMeaning: 'last_recorded_successful_batch_upsert_counts_not_new_measurements',
      nextSyncHintAt, nextSyncHintInPast: nextSyncHintAt ? Date.parse(nextSyncHintAt) < now : null,
      schedulerExecutionVerified: false },
    localDayAlignment: 'unverified' as const,
    calendarLabels: { utcDate, requestedLocalDate: localDate, equal: utcDate === localDate,
      verifiesMeasurementDay: false },
    diagnosis: 'measurement_freshness_and_provider_availability_undetermined_from_stored_evidence',
    metrics: { recovery: metric('recovery'), sleep: metric('sleep'), strain: metric('strain') } }
}
