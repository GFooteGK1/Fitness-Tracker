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

/** Legacy rows retain a UTC ingest date label and database-created time, but no
 * provider intervals or mapping provenance. A successful batch cannot supply them.
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
      providerCreatedAt: null, providerUpdatedAt: null, intervalStart: null, intervalEnd: null,
      providerTimezoneOffset: null, lastRecordIngestedAt: null,
      source: { provider: 'WHOOP', table: key === 'strain' ? 'whoop_cycles' : `whoop_${key}`,
        status: source.status, count: source.count, selection: 'latest_stored_date_then_id_desc',
        filter: key === 'sleep' ? 'non_nap' : null, athleteCoverage: 'unknown' },
      record: record(row, fields[key]) }
  }
  return { viewVersion: 'external-recovery-timing-1', connected, connectionSourceStatus: sources.connection.status,
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
