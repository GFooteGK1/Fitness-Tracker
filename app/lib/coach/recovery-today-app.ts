import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { CoachingContextError, contextObject, type ContextRow } from './coaching-context'
import { readRecoverySources, selectOnlyClient } from './coaching-context-server'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import { projectContextRecovery, qualifiedRecoveryBefore } from './external-recovery-context'

export interface WorkoutRecoveryEvidence {
  performedAt: string | null
  sessionRpe: number | null
  rpeOrigin: string
  rpeReviewState: string
}

type RecoveryBeforeWorkout = NonNullable<ReturnType<typeof qualifiedRecoveryBefore>>
const PRECEDING_WINDOW_MS = 24 * 60 * 60 * 1000

function reportedRpe(workout: WorkoutRecoveryEvidence | null | undefined) {
  const rpe = workout?.sessionRpe
  return typeof rpe === 'number' && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 && workout?.rpeOrigin === 'athlete_reported'
    && (workout.rpeReviewState === 'athlete_confirmed' || workout.rpeReviewState === 'corrected') ? rpe : null
}

function workoutTime(workout: WorkoutRecoveryEvidence | null | undefined) {
  const at = workout?.performedAt
  return at && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.now()
    ? at : null
}

export function createOwnedTodayRecoveryReader(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return async (tzOffset: number) => {
    const { principal, db } = await authorize()
    assertVerifiedContextPrincipal(principal, policy)
    const identity = await db.auth.getUser()
    if (identity.error || identity.data.user?.id !== principal.subject) {
      throw new CoachingContextError(401, 'Authenticated subject mismatch')
    }

    const sources = Object.fromEntries(await readRecoverySources(selectOnlyClient(db), principal.subject))
    if (Object.values(sources).some(source => source.status === 'unavailable' || source.status === 'truncated')) {
      throw new CoachingContextError(503, 'Saved WHOOP data is temporarily unavailable')
    }
    const readAt = new Date().toISOString()
    const date = formatUTCAsLocalDateWithOffset(readAt, tzOffset)
    const recovery = projectTodayRecovery(projectContextRecovery(sources, readAt, date), tzOffset)
    return { date, recovery }
  }
}

/** Pair retrospectively using the provider's score update time. A later valid
 * sync can retain an earlier WHOOP version. Sync time does not establish when
 * Socius knew the score or when an athlete performed a workout. */
export function createOwnedWorkoutRecoveryReader(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return async (workout: WorkoutRecoveryEvidence | null): Promise<RecoveryBeforeWorkout | null> => {
    const at = workoutTime(workout)
    if (!at || reportedRpe(workout) === null) return null

    const { principal, db } = await authorize()
    assertVerifiedContextPrincipal(principal, policy)
    const identity = await db.auth.getUser()
    if (identity.error || identity.data.user?.id !== principal.subject) {
      throw new CoachingContextError(401, 'Authenticated subject mismatch')
    }
    const guarded = selectOnlyClient(db, principal.subject)
    const start = new Date(Date.parse(at) - PRECEDING_WINDOW_MS).toISOString()
    const asOf = new Date().toISOString()
    try {
      const { data, error } = await guarded.from('whoop_recovery')
        .select('user_id,cycle_id,recovery_score,provider_created_at,provider_updated_at,provider_interval_start,provider_interval_end,provider_timezone_offset,provider_score_state,timing_ingested_at,timing_mapping_version,timing_provenance,provider_sleep_id')
        .eq('user_id', principal.subject).eq('provider_score_state', 'SCORED')
        .gte('provider_updated_at', start).lte('provider_updated_at', at).lte('timing_ingested_at', asOf)
        .order('provider_updated_at', { ascending: false }).order('cycle_id', { ascending: false }).limit(20)
      if (error || !Array.isArray(data)) return null

      for (const row of data) {
        if (!contextObject(row)) continue
        const qualified = qualifiedRecoveryBefore(row, at, asOf, PRECEDING_WINDOW_MS)
        if (qualified) return qualified
      }
    } catch (error) {
      if (error instanceof CoachingContextError) throw error
      // Historical comparison is optional. A transient read failure leaves the
      // comparison unavailable while the verified Today snapshot still renders.
    }
    return null
  }
}

function metricNumber(row: ContextRow | null, key: string, max = Infinity) {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null
}

function savedScoreStatus(score: number | null, earlier: boolean) {
  return score === null ? 'unavailable' : earlier ? 'stale' : 'stored'
}

/** Dashboard-only saved WHOOP facts. The external context's conservative
 * freshness contract remains intact and the presentation does not infer risk,
 * training readiness or a causal effect from one paired session. */
export function projectTodayRecovery(recovery: ReturnType<typeof projectContextRecovery>, tzOffset: number,
  workout?: WorkoutRecoveryEvidence | null, pairedScore?: RecoveryBeforeWorkout | null) {
  const { recovery: metric, sleep, strain } = recovery.metrics
  const { requestedLocalDate, utcDate } = recovery.calendarLabels
  function hasEarlierDate(reading: typeof metric, providerDate: string | null) {
    // Use a retained source timestamp when available. Untimed storage dates
    // are UTC labels and can straddle a different local calendar day.
    if (reading.providerTiming.status === 'recorded' && providerDate) {
      return formatUTCAsLocalDateWithOffset(providerDate, tzOffset) < requestedLocalDate
    }
    return !!reading.storedDate && reading.storedDate < utcDate && reading.storedDate < requestedLocalDate
  }
  const canDisplay = recovery.connected !== false
  const storedMetric = canDisplay && metric.source.status === 'available' && !['invalid', 'future'].includes(metric.status)
    ? metric.record : null
  const storedSleep = canDisplay && sleep.source.status === 'available' && !['invalid', 'future'].includes(sleep.status)
    ? sleep.record : null
  const storedStrain = canDisplay && strain.source.status === 'available' && !['invalid', 'future'].includes(strain.status)
    ? strain.record : null
  const recoveryScore = metricNumber(storedMetric, 'recovery_score', 100)
  const hrvMs = metricNumber(storedMetric, 'hrv_rmssd_milli')
  const restingHeartRate = metricNumber(storedMetric, 'resting_heart_rate')
  const sleepPerformance = metricNumber(storedSleep, 'sleep_performance_percentage', 100)
  const sleepInBedMs = metricNumber(storedSleep, 'total_sleep_duration_ms')
  const strainScore = metricNumber(storedStrain, 'strain', 21)
  const earlierRecovery = hasEarlierDate(metric, metric.providerCreatedAt)
  const sleepStatus = savedScoreStatus(sleepPerformance, hasEarlierDate(sleep, sleep.intervalEnd))
  const strainStatus = savedScoreStatus(strainScore, hasEarlierDate(strain, strain.providerCreatedAt))
  const hasRecoveryOrSleep = [recoveryScore, hrvMs, restingHeartRate, sleepPerformance, sleepInBedMs].some(value => value !== null)
  const stale = (earlierRecovery && storedMetric !== null) || (!hasRecoveryOrSleep && strainStatus === 'stale')
  const status = recovery.connected === false ? 'disconnected'
    : stale ? 'stale'
      : !hasRecoveryOrSleep && strainScore === null ? 'unavailable'
        : recovery.syncEligible && metric.providerTiming.scoreSnapshotMatches ? 'saved' : 'unverified'
  const rpe = reportedRpe(workout)
  const at = workoutTime(workout)
  const pair = canDisplay && rpe !== null && at ? pairedScore : null
  return {
    status,
    lastSyncAt: recovery.batch.timeStatus === 'recorded' ? recovery.batch.lastSuccessfulBatchAt : null,
    storedDate: storedMetric ? metric.storedDate : null,
    recoveryScore,
    recoveryScoreStatus: savedScoreStatus(recoveryScore, earlierRecovery),
    hrvMs,
    restingHeartRate,
    sleepPerformance,
    sleepScoreStatus: sleepStatus,
    sleepStoredDate: sleepPerformance === null ? null : sleep.storedDate,
    sleepInBedMinutes: sleepInBedMs === null ? null : Math.round(sleepInBedMs / 60_000),
    strainScore,
    strainStatus,
    strainStoredDate: strainScore === null ? null : strain.storedDate,
    recoveryUpdatedAt: storedMetric && metric.providerTiming.scoreSnapshotMatches ? metric.providerUpdatedAt : null,
    sleepUpdatedAt: sleepPerformance !== null && sleep.providerTiming.status === 'recorded'
      && sleep.providerTiming.scoreState === 'SCORED' ? sleep.providerUpdatedAt : null,
    sleepEndedAt: storedSleep && sleep.providerTiming.status === 'recorded' ? sleep.intervalEnd : null,
    strainUpdatedAt: strainScore !== null && strain.providerTiming.status === 'recorded'
      && strain.providerTiming.scoreState === 'SCORED' ? strain.providerUpdatedAt : null,
    syncStatus: recovery.syncStatus,
    sessionEffort: {
      status: !workout ? 'no_workout' : rpe === null ? 'no_rpe' : !at ? 'timing_unverified' : pair ? 'paired' : 'recovery_unavailable',
      rpe,
      workoutAt: at,
      recoveryScore: pair?.recoveryScore ?? null,
      recoveryUpdatedAt: pair?.recoveryUpdatedAt ?? null,
    },
  } as const
}
