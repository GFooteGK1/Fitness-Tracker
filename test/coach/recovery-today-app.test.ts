import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContextSource } from '@/app/lib/coach/coaching-context'
import { projectContextRecovery, qualifiedRecoveryBefore } from '@/app/lib/coach/external-recovery-context'
import { createOwnedTodayRecoveryReader, createOwnedWorkoutRecoveryReader, projectTodayRecovery } from '@/app/lib/coach/recovery-today-app'
import { projectProviderTiming } from '@/app/lib/whoop/provider-timing'
import { contextClient, contextOwner, contextRows } from '../fixtures/coaching-context'
import { legacyIdentity, providerPayload, timingNow } from '../fixtures/whoop-provider-timing'

const workoutAt = '2026-10-19T13:00:00.000Z'
const later = '2026-10-19T15:00:00.000Z'
const workout = { performedAt: workoutAt, sessionRpe: 7.5, rpeOrigin: 'athlete_reported', rpeReviewState: 'corrected' }
const policy = { clientId: 'synthetic-client', resource: 'https://socius.invalid/api/mcp', issuer: 'https://auth.invalid' }

function recoveryRow() {
  const row = { user_id: contextOwner, cycle_id: 42, date: '2026-10-19', recovery_score: 71.25,
    hrv_rmssd_milli: 42.125, resting_heart_rate: 51.5, created_at: '2026-10-19T12:00:00Z' }
  return { ...row, ...projectProviderTiming('recovery', providerPayload('recovery'), row, timingNow) }
}

const source = (rows: Array<Record<string, unknown>>): ContextSource => ({ status: rows.length ? 'available' : 'missing', rows, count: rows.length })

function recoveryContext(recovery = source([recoveryRow()]), strain = source([]), sleep?: ContextSource) {
  const rows = contextRows()
  return projectContextRecovery({
    connection: source(rows.whoop_tokens), sync: source([{ status: 'idle', last_sync_at: timingNow }]),
    recovery, sleep: sleep ?? source([{ ...rows.whoop_sleep[0], total_sleep_duration_ms: 28_800_000 }]), strain,
  }, later, '2026-10-19')
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('WHOOP Today and retained recovery before a logged workout', () => {
  it('shows saved scores, in-bed time and last sync without converting them into measurement age', () => {
    const context = recoveryContext()
    expect(context.metrics.recovery).toMatchObject({ usableAsCurrent: false, observedAt: null })
    expect(projectTodayRecovery(context, 0)).toMatchObject({ status: 'saved', lastSyncAt: timingNow, recoveryScore: 71.25, hrvMs: 42.125,
      restingHeartRate: 51.5, sleepPerformance: 82, sleepInBedMinutes: 480,
      recoveryUpdatedAt: '2026-10-19T11:30:00.123456Z', sleepEndedAt: null, sessionEffort: { status: 'no_workout' } })
    expect(projectTodayRecovery(recoveryContext(source([{ ...recoveryRow(), timing_provenance: null }])), 0)).toMatchObject({
      status: 'unverified', recoveryScore: 71.25, recoveryUpdatedAt: null,
    })
    expect(projectTodayRecovery({ ...context, connected: false }, 0)).toMatchObject({ status: 'disconnected', recoveryScore: null, sleepPerformance: null })
  })

  it.each([0, 12.45, 21])('retains the WHOOP cycle strain score %s on its native scale', strain => {
    const cycle = { ...contextRows().whoop_cycles[0], date: '2026-10-19', strain }
    const context = recoveryContext(source([]), source([cycle]), source([]))
    expect(projectTodayRecovery(context, 0)).toMatchObject({ status: 'unverified',
      strainScore: strain, strainStatus: 'stored', strainStoredDate: '2026-10-19', sessionEffort: { status: 'no_workout' },
    })
    expect(projectTodayRecovery({ ...context, connected: false }, 0)).toMatchObject({ status: 'disconnected',
      strainScore: null, strainStatus: 'unavailable', strainStoredDate: null,
    })
  })

  it('identifies a stale saved cycle score independently and uses it as a stale-only read', () => {
    const strain = source([{ ...contextRows().whoop_cycles[0], strain: 0 }])
    const projection = { strainScore: 0, strainStatus: 'stale', strainStoredDate: '2026-10-18' }
    expect(projectTodayRecovery(recoveryContext(undefined, strain), 0)).toMatchObject({ status: 'saved', ...projection })
    expect(projectTodayRecovery(recoveryContext(source([]), strain, source([])), 0)).toMatchObject({ status: 'stale', ...projection })
  })

  it('keeps each reading status and retained provider update separate from batch sync time', () => {
    const sleep = { ...legacyIdentity('sleep', contextOwner), date: '2026-10-18', sleep_performance_percentage: 82 }
    const sleepPayload = { ...providerPayload('sleep'), start: '2026-10-18T02:00:00Z', end: '2026-10-18T10:30:00Z' }
    const strain = { ...legacyIdentity('cycle', contextOwner), strain: 9 }
    const context = recoveryContext(
      undefined,
      source([{ ...strain, ...projectProviderTiming('cycle', providerPayload('cycle'), strain, timingNow) }]),
      source([{ ...sleep, ...projectProviderTiming('sleep', sleepPayload, sleep, timingNow) }]),
    )
    expect(projectTodayRecovery(context, 0)).toMatchObject({
      recoveryScoreStatus: 'stored', sleepScoreStatus: 'stale', strainStatus: 'stored',
      recoveryUpdatedAt: '2026-10-19T11:30:00.123456Z',
      sleepUpdatedAt: '2026-10-19T11:30:00.123456Z', sleepStoredDate: '2026-10-18',
      strainUpdatedAt: '2026-10-19T11:30:00.123456Z',
      lastSyncAt: timingNow,
    })
  })

  it('does not label same-local-day WHOOP data as earlier when UTC rolls over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime('2026-10-20T01:45:00Z')
    const rows = contextRows()
    rows.whoop_recovery = [recoveryRow()]
    const sleep = { ...legacyIdentity('sleep', contextOwner), sleep_performance_percentage: 82, is_nap: false }
    const strain = { ...legacyIdentity('cycle', contextOwner), strain: 9 }
    rows.whoop_sleep = [{ ...sleep, ...projectProviderTiming('sleep', providerPayload('sleep'), sleep, timingNow) }]
    rows.whoop_cycles = [{ ...strain, ...projectProviderTiming('cycle', providerPayload('cycle'), strain, timingNow) }]
    const { db, traces, writes } = contextClient(rows)
    const principal = { ...policy, subject: contextOwner, role: 'authenticated', expiresAt: Date.now() + 86_400_000 }
    const read = createOwnedTodayRecoveryReader(async () => ({ db, principal }), policy)

    expect(await read(360)).toMatchObject({ date: '2026-10-19', recovery: {
      recoveryScoreStatus: 'stored', sleepScoreStatus: 'stored', strainStatus: 'stored',
    } })
    expect(traces.map(trace => trace.table).sort()).toEqual([
      'whoop_cycles', 'whoop_recovery', 'whoop_sleep', 'whoop_sync_status', 'whoop_tokens',
    ])
    expect(traces.every(trace => trace.filters.some(filter => filter[0] === 'user_id' && filter[1] === contextOwner))).toBe(true)
    expect(writes).not.toHaveBeenCalled()

    vi.setSystemTime('2026-10-19T15:00:00Z')
    expect(await read(-600)).toMatchObject({ date: '2026-10-20', recovery: {
      recoveryScoreStatus: 'stale', sleepScoreStatus: 'stale', strainStatus: 'stale',
    } })
  })

  it('does not display invalid or future cycle strain as a score', () => {
    const cycle = { ...contextRows().whoop_cycles[0], date: '2026-10-19', strain: 3 }
    const rows = [
      ...[null, '0', -0.1, 21.01, Infinity, NaN].map(strain => ({ ...cycle, strain })),
      { ...cycle, date: 'invalid' }, { ...cycle, date: '2026-10-20' }, { ...cycle, created_at: '2026-10-19T16:00:00Z' },
    ]
    for (const row of rows) {
      expect(projectTodayRecovery(recoveryContext(source([]), source([row]), source([])), 0)).toMatchObject({
        status: 'unavailable', strainScore: null, strainStatus: 'unavailable', strainStoredDate: null,
      })
    }
  })

  it('pairs the exact earlier provider score even when a later sync re-ingests it within the read time', () => {
    const row = recoveryRow()
    const window = 24 * 60 * 60 * 1000
    expect(qualifiedRecoveryBefore({ ...row, timing_ingested_at: '2026-10-19T14:00:00.000Z' }, workoutAt, later, window)).toMatchObject({ recoveryScore: 71.25,
      recoveryUpdatedAt: '2026-10-19T11:30:00.123456Z' })
    expect(qualifiedRecoveryBefore({ ...row, recovery_score: 75 }, workoutAt, later, window)).toBeNull()
    expect(qualifiedRecoveryBefore({ ...row, timing_ingested_at: '2026-10-19T11:15:00.000Z' }, workoutAt, later, window)).toBeNull()
    expect(qualifiedRecoveryBefore({ ...row, timing_ingested_at: '2026-10-19T16:00:00.000Z' }, workoutAt, later, window)).toBeNull()
    expect(qualifiedRecoveryBefore({ ...row, provider_updated_at: '2026-10-19T13:30:00.000Z', timing_ingested_at: later }, workoutAt, later, window)).toBeNull()
    expect(qualifiedRecoveryBefore(row, '2026-10-19', later, window)).toBeNull()
    expect(qualifiedRecoveryBefore(row, '2026-10-20T15:00:00.000Z', '2026-10-20T16:00:00.000Z', window)).toBeNull()
  })

  it('chooses the qualifying older owner score and reports no pair when workout timing or athlete-reported RPE is missing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(later)
    const rows = contextRows()
    rows.whoop_recovery = [
      { ...recoveryRow(), cycle_id: 43, provider_updated_at: '2026-10-19T14:00:00.000Z', timing_ingested_at: later },
      { ...recoveryRow(), timing_ingested_at: '2026-10-19T14:00:00.000Z' },
    ]
    const { db, traces, writes } = contextClient(rows)
    const principal = { ...policy, subject: contextOwner, role: 'authenticated', expiresAt: Date.now() + 60000 }
    const read = createOwnedWorkoutRecoveryReader(async () => ({ db, principal }), policy)
    expect(await read({ ...workout, performedAt: null })).toBeNull()
    expect(await read({ ...workout, rpeOrigin: 'model_estimated' })).toBeNull()
    expect(traces).toHaveLength(0)
    const pair = await read(workout)
    expect(projectTodayRecovery(recoveryContext(), 0, workout, pair).sessionEffort).toMatchObject({ status: 'paired',
      rpe: 7.5, workoutAt, recoveryScore: 71.25, recoveryUpdatedAt: '2026-10-19T11:30:00.123456Z' })
    expect(projectTodayRecovery(recoveryContext(), 0, { ...workout, performedAt: null }, pair).sessionEffort.status).toBe('timing_unverified')
    expect(traces[0]).toMatchObject({ table: 'whoop_recovery', filters: [['user_id', contextOwner], ['provider_score_state', 'SCORED']], limit: 20 })
    expect(writes).not.toHaveBeenCalled()

    rows.whoop_recovery[1].user_id = 'foreign-owner'
    const foreign = contextClient(rows, { foreignRows: true })
    const isolated = createOwnedWorkoutRecoveryReader(async () => ({ db: foreign.db, principal }), policy)
    await expect(isolated(workout)).rejects.toMatchObject({ status: 503 })
  })

  it('keeps the dashboard usable after a historical read fault while rejecting mismatched authorization', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(later)
    const { db } = contextClient()
    db.from = vi.fn(() => { throw new Error('historical connection lost') })
    const principal = { ...policy, subject: contextOwner, role: 'authenticated', expiresAt: Date.now() + 60000 }
    const read = createOwnedWorkoutRecoveryReader(async () => ({ db, principal }), policy)
    await expect(read(workout)).resolves.toBeNull()
    expect(projectTodayRecovery(recoveryContext(), 0, workout, null)).toMatchObject({ recoveryScore: 71.25,
      sessionEffort: { status: 'recovery_unavailable', rpe: 7.5 } })

    vi.mocked(db.from).mockClear()
    const mismatched = createOwnedWorkoutRecoveryReader(async () => ({ db, principal: { ...principal, subject: 'foreign-owner' } }), policy)
    await expect(mismatched(workout)).rejects.toMatchObject({ status: 401 })
    expect(db.from).not.toHaveBeenCalled()
  })
})
