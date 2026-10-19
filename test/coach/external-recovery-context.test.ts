import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectContextRecovery } from '@/app/lib/coach/external-recovery-context'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'
import type { ContextSource } from '@/app/lib/coach/coaching-context'
import { contextClient, contextNow, contextRows } from '../fixtures/coaching-context'

const available = (rows: Record<string, unknown>[]): ContextSource => ({ status: 'available', rows, count: rows.length })
function sources() {
  const rows = contextRows()
  return { connection: available(rows.whoop_tokens), sync: available(rows.whoop_sync_status),
    recovery: available(rows.whoop_recovery), sleep: available(rows.whoop_sleep), strain: available(rows.whoop_cycles) }
}
const project = (s = sources()) => projectContextRecovery(s, contextNow, '2026-10-18')
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('legacy WHOOP timing: independent requirement oracle, not readiness inference', () => {
  it('preserves distinct source facts and storage precision without inventing capture or intervals', () => {
    const s = sources(); s.recovery.rows[0].created_at = '2026-10-18T10:10:10.123456+00:00'
    const r = project(s)
    expect(r.metrics.recovery.record).toEqual(s.recovery.rows[0])
    expect(r.metrics.sleep.record).toEqual(s.sleep.rows[0])
    expect(r.metrics.strain.record).toEqual(s.strain.rows[0])
    expect(r.metrics.recovery).toMatchObject({ status: 'timing_unverified', usableAsCurrent: false,
      capturedAt: null, observedAt: null, storageCreatedAt: '2026-10-18T10:10:10.123456+00:00',
      intervalStart: null, intervalEnd: null, providerCreatedAt: null, providerUpdatedAt: null,
      providerTimezoneOffset: null, lastRecordIngestedAt: null, measurementAgeMs: null })
    expect(r).toMatchObject({ syncEligible: true, localDayAlignment: 'unverified', batch: { ageMs: 3_600_000 } })
  })

  it.each([
    ['2026-10-19T00:30:00Z', '2026-10-18', '2026-10-19'],
    ['2026-10-18T20:30:00Z', '2026-10-19', '2026-10-18'],
    ['2026-10-18T12:00:00Z', '2026-10-18', '2026-10-18'],
    ['2026-03-08T07:30:00Z', '2026-03-08', '2026-03-08'],
    ['2026-11-01T06:30:00Z', '2026-11-01', '2026-11-01'],
  ])('never establishes local measurement day from calendar labels at %s', (asOf, local, label) => {
    const s = sources(); s.sync.rows[0].last_sync_at = asOf
    for (const key of ['recovery', 'sleep', 'strain'] as const) {
      s[key].rows[0].date = label; s[key].rows[0].created_at = asOf
    }
    const r = projectContextRecovery(s, asOf, local)
    expect(r.localDayAlignment).toBe('unverified')
    expect(r.calendarLabels.verifiesMeasurementDay).toBe(false)
    for (const m of Object.values(r.metrics)) expect(m).toMatchObject({ usableAsCurrent: false, capturedAt: null,
      observedAt: null, measurementAgeMs: null, providerTimezoneOffset: null, intervalStart: null, intervalEnd: null })
  })

  it('separates an old date label from a recent successful zero-result batch', () => {
    const s = sources(); s.recovery.rows[0].date = '2026-10-10'
    s.sync.rows[0].records_synced = { recovery: 0, sleep: 0, cycles: 0, workouts: 0 }
    expect(project(s)).toMatchObject({ syncEligible: true, batch: { ageMs: 3_600_000, processedCounts: { recovery: 0 } },
      metrics: { recovery: { status: 'stale', storedDateStatus: 'historical_label', measurementAgeMs: null } } })
  })

  it.each(['2026-02-30T10:00:00Z', '2026-10-18', '2026-10-18T11:00:00', '2026-10-18T24:00:00Z',
    '2026-10-18T11:00:60Z', '2026-10-18T11:00:00+14:01', 'bad', 12, null])('does not parse non-instant batch/storage value %s', value => {
    const s = sources(); s.sync.rows[0].last_sync_at = value; s.recovery.rows[0].created_at = value
    const r = project(s)
    expect(r.syncEligible).toBe(false); expect(r.batch.ageMs).toBeNull(); expect(r.lastSyncAt).toBeNull()
    expect(r.metrics.recovery.storageCreatedAt).toBeNull(); expect(r.metrics.recovery.capturedAt).toBeNull()
  })

  it.each(['2026-10-18T11:00:00.123456+00:00', '2026-10-18T06:00:00.123456-05:00'])('preserves valid explicit-offset timestamp %s', value => {
    const s = sources(); s.sync.rows[0].last_sync_at = value
    expect(project(s)).toMatchObject({ lastSyncAt: value, batch: { ageMs: 3_599_877, timeStatus: 'recorded' } })
  })

  it.each([
    ['2026-10-17T12:00:00Z', true], ['2026-10-17T11:59:59.999Z', false], ['2026-10-18T12:00:00.001Z', false],
  ])('retains only existing batch eligibility at %s', (time, eligible) => {
    const s = sources(); s.sync.rows[0].last_sync_at = time
    const r = project(s); expect(r.syncEligible).toBe(eligible); expect(r.metrics.recovery.usableAsCurrent).toBe(false)
    if (time.endsWith('.001Z')) expect(r.batch).toMatchObject({ timeStatus: 'future', ageMs: null })
  })

  it.each(['syncing', 'error', 'unknown', null])('preserves earlier successful-batch time under status %s without readiness', status => {
    const s = sources(); s.sync.rows[0].status = status
    expect(project(s)).toMatchObject({ syncEligible: false, lastSyncAt: '2026-10-18T11:00:00.000Z',
      metrics: { recovery: { usableAsCurrent: false } } })
  })

  it.each(['missing', 'unavailable', 'truncated'] as const)('distinguishes connection source %s from a confirmed connection', status => {
    const s = sources(); s.connection = { status, rows: [], count: status === 'missing' ? 0 : null }
    expect(project(s)).toMatchObject({ connected: status === 'missing' ? false : null, connectionSourceStatus: status, syncEligible: false })
  })

  it.each(['missing', 'unavailable', 'truncated'] as const)('keeps missing/outage/unknown-count source %s explicit', status => {
    const s = sources(); s.sync = { status, rows: [], count: null }; s.sleep = { status, rows: [], count: null }
    expect(project(s)).toMatchObject({ syncSourceStatus: status, lastSyncAt: null, batch: { ageMs: null },
      metrics: { sleep: { status, usableAsCurrent: false } } })
  })

  it.each(['2026-02-30', 'not-date', null, '2026-10-18T00:00:00Z'])('keeps malformed metric date %s unusable', date => {
    const s = sources(); s.recovery.rows[0].date = date
    expect(project(s).metrics.recovery).toMatchObject({ status: 'invalid', storedDate: null, usableAsCurrent: false })
  })
  it.each([null, '71', NaN, Infinity])('does not invent a missing/invalid score %s', score => {
    const s = sources(); s.recovery.rows[0].recovery_score = score
    expect(project(s).metrics.recovery.status).toBe(score === null ? 'missing_metric' : 'invalid')
  })

  it('bounds diagnostics and never exports raw errors, arbitrary metadata or token identity', () => {
    const s = sources(); s.sync.rows[0].error_message = 'private-error'.repeat(100_000)
    s.sync.rows[0].records_synced = { recovery: 0, sleep: -1, cycles: Infinity, workouts: 2, private: 'private-metadata' }
    s.recovery.rows[0].private = 'private-metric'; s.sync.rows[0].next_sync_at = '2026-10-18T10:00:00Z'
    const r = project(s), text = JSON.stringify(r)
    expect(r.batch).toMatchObject({ hasRecordedError: true, processedCounts: { recovery: 0, workouts: 2 }, nextSyncHintInPast: true, schedulerExecutionVerified: false })
    expect(text.length).toBeLessThan(8_000)
    for (const privateText of ['private-error', 'private-metadata', 'private-metric', 'token-id-only']) expect(text).not.toContain(privateText)
  })
})

describe('owned SELECT-only recovery assembly', () => {
  it.each([
    ['2026-10-19T00:30:00Z', 300, '2026-10-18'], ['2026-10-18T20:30:00Z', -600, '2026-10-19'],
    ['2026-03-08T07:30:00Z', 240, '2026-03-08'], ['2026-03-08T07:30:00Z', 300, '2026-03-08'],
    ['2026-11-01T06:30:00Z', 300, '2026-11-01'],
  ])('retains supplied offset without attributing historical WHOOP day (%s, %s)', async (now, offset, local) => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const rows = contextRows(); rows.whoop_recovery[0].created_at = '2026-03-08T06:30:00Z'
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Forbidden network'))
    const { db, writes, traces } = contextClient(rows)
    const r = await readCoachingContext(db, new URLSearchParams({ tzOffset: String(offset), days: '7' }))
    expect(r.localDate).toBe(local); expect(r.recovery.localDayAlignment).toBe('unverified')
    expect(r.recovery.metrics.recovery.observedAt).toBeNull(); expect(r.recovery.metrics.recovery.capturedAt).toBeNull()
    expect(writes).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
    expect(traces.filter(t => t.table.startsWith('whoop_')).every(t => t.columns !== '*' && t.limit === 1)).toBe(true)
  })

  it.each(['next_sync_at', 'records_synced', 'created_at', 'updated_at', 'last_sync_at', 'status', 'error_message'])('fences changed batch %s even without revision update', async key => {
    vi.useFakeTimers(); vi.setSystemTime(contextNow)
    const rows = contextRows(), { db } = contextClient(rows, { onRead: (table, read) => {
      if (table === 'whoop_sync_status' && read === 2) rows.whoop_sync_status[0][key] = key === 'records_synced' ? { recovery: 0 } : 'changed'
    } })
    await expect(readCoachingContext(db, new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 409 })
  })

  it.each(['whoop_tokens', 'whoop_sync_status', 'whoop_recovery', 'whoop_sleep', 'whoop_cycles'])('fails closed for foreign %s', async table => {
    vi.useFakeTimers(); vi.setSystemTime(contextNow)
    const rows = contextRows(); rows[table][0].user_id = 'foreign-owner'
    await expect(readCoachingContext(contextClient(rows, { foreignRows: true }).db,
      new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 503 })
  })
})
