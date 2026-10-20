import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'
import { projectContextRecovery } from '@/app/lib/coach/external-recovery-context'
import { contextClient, contextNow, contextRows } from '../fixtures/coaching-context'
import type { ContextSource } from '@/app/lib/coach/coaching-context'

const sleepId = '12345678-1234-1234-1234-123456789abc'
const columns = ['provider_created_at', 'provider_updated_at', 'provider_interval_start', 'provider_interval_end',
  'provider_timezone_offset', 'provider_score_state', 'timing_ingested_at', 'timing_mapping_version', 'timing_provenance']
function timedRows() {
  const rows = contextRows()
  for (const [table, role] of [['whoop_recovery', 'none'], ['whoop_sleep', 'sleep'], ['whoop_cycles', 'cycle']]) {
    Object.assign(rows[table][0], { provider_created_at: '2026-10-18T05:10:00.123456-05:00',
      provider_updated_at: '2026-10-18T10:10:00.123457Z', timing_ingested_at: '2026-10-18T11:00:00.123456Z',
      provider_interval_start: role === 'none' ? null : '2026-10-18T01:00:00.123456Z',
      provider_interval_end: role === 'sleep' ? '2026-10-18T09:00:00.123456Z' : null,
      provider_timezone_offset: role === 'none' ? null : '-05:00', provider_score_state: 'SCORED',
      timing_mapping_version: 'whoop_timing_owner_v1', timing_provenance: { source: 'provider_payload', intervalRole: role,
        legacyDate: 'unchanged_not_measurement_day', observationTime: 'not_assigned' } })
  }
  rows.whoop_recovery[0].provider_sleep_id = sleepId
  rows.whoop_sleep[0].sleep_id = sleepId; rows.whoop_sleep[0].provider_cycle_id = '12'
  return rows
}
function project(rows = timedRows(), now = contextNow) {
  const available = (table: string): ContextSource => ({ status: 'available', rows: rows[table], count: rows[table].length })
  return projectContextRecovery({ connection: available('whoop_tokens'), sync: available('whoop_sync_status'),
    recovery: available('whoop_recovery'), sleep: available('whoop_sleep'), strain: available('whoop_cycles') }, now, '2026-10-18')
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('retained WHOOP timing facts without measurement-freshness claims', () => {
  it('exposes all populated facts through query-respecting owner SELECTs, retaining precision and legitimate nulls', async () => {
    vi.useFakeTimers(); vi.setSystemTime(contextNow)
    const rows = timedRows(), { db, traces, writes } = contextClient(rows)
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Forbidden network'))
    const r = (await readCoachingContext(db, new URLSearchParams({ tzOffset: '300' }))).recovery
    expect(r.viewVersion).toBe('external-recovery-timing-2')
    expect(r.metrics.recovery).toMatchObject({ providerCreatedAt: rows.whoop_recovery[0].provider_created_at,
      providerUpdatedAt: rows.whoop_recovery[0].provider_updated_at, lastRecordIngestedAt: rows.whoop_recovery[0].timing_ingested_at,
      intervalStart: null, intervalEnd: null, providerTimezoneOffset: null,
      providerTiming: { status: 'recorded', mappingVersion: 'whoop_timing_owner_v1', scoreState: 'SCORED', issues: [],
        provenance: rows.whoop_recovery[0].timing_provenance, sourceLink: { sleepId, cycleId: null, verification: 'not_joined' } } })
    expect(r.metrics.sleep).toMatchObject({ intervalStart: rows.whoop_sleep[0].provider_interval_start,
      intervalEnd: rows.whoop_sleep[0].provider_interval_end, providerTimezoneOffset: '-05:00',
      providerTiming: { status: 'recorded', sourceLink: { cycleId: '12', verification: 'not_joined' } } })
    expect(r.metrics.strain).toMatchObject({ intervalEnd: null, providerTiming: { status: 'recorded', issues: [] } })
    for (const metric of Object.values(r.metrics)) expect(metric).toMatchObject({ usableAsCurrent: false, observedAt: null,
      capturedAt: null, measurementAgeMs: null, sourceDateBasis: 'UTC', measurementTimingStatus: 'unrecorded' })
    expect(r.localDayAlignment).toBe('unverified'); expect(r.batch.schedulerExecutionVerified).toBe(false)
    for (const trace of traces.filter(t => ['whoop_recovery', 'whoop_sleep', 'whoop_cycles'].includes(t.table))) {
      for (const column of columns) expect(trace.columns.split(',')).toContain(column)
      expect(trace.limit).toBe(1)
    }
    expect(writes).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
  })
  it.each(['omitted', 'null'])('preserves %s legacy timing without fallback from storage, date, batch or clock', mode => {
    const rows = contextRows()
    if (mode === 'null') for (const table of ['whoop_recovery', 'whoop_sleep', 'whoop_cycles']) for (const key of columns) rows[table][0][key] = null
    for (const m of Object.values(project(rows).metrics)) expect(m).toMatchObject({ providerCreatedAt: null, providerUpdatedAt: null,
      intervalStart: null, intervalEnd: null, providerTimezoneOffset: null, lastRecordIngestedAt: null,
      providerTiming: { status: 'unrecorded', mappingVersion: null, provenance: null, issues: [] } })
  })
  it.each(['provider_updated_at', 'timing_ingested_at', 'provider_score_state', 'timing_mapping_version', 'timing_provenance', 'provider_sleep_id', 'provider_interval_end'])('retains valid individual facts in a partial snapshot missing %s', key => {
    const rows = timedRows(); delete rows.whoop_recovery[0][key]
    expect(project(rows).metrics.recovery).toMatchObject({ providerCreatedAt: rows.whoop_recovery[0].provider_created_at,
      providerTiming: { status: 'partial', issues: [key + '_missing'] } })
  })
  it.each(['provider_interval_start', 'provider_interval_end', 'provider_timezone_offset', 'provider_cycle_id'])('does not certify a sleep snapshot missing %s', key => {
    const rows = timedRows(); rows.whoop_sleep[0][key] = null
    expect(project(rows).metrics.sleep.providerTiming).toMatchObject({ status: 'partial', issues: [key + '_missing'] })
    expect(project(rows).metrics.sleep.providerCreatedAt).toBe(rows.whoop_sleep[0].provider_created_at)
  })
  it.each(['2026-02-30T10:00:00Z', '2026-10-18', '2026-10-18T10:00:00', '2026-10-18T24:00:00Z',
    '2026-10-18T10:00:00-00:00', '2026-10-18T10:00:00+14:01', '0000-01-01T00:00:00Z', 10, '2026-10-18T10:00:00.1234567Z'])('rejects invalid provider timestamp %s without erasing another valid fact', value => {
    const rows = timedRows(); rows.whoop_recovery[0].provider_created_at = value
    expect(project(rows).metrics.recovery).toMatchObject({ providerCreatedAt: null, providerUpdatedAt: rows.whoop_recovery[0].provider_updated_at,
      providerTiming: { status: 'invalid', issues: ['provider_created_at_invalid'] } })
  })
  it('reports future timing at one microsecond after the read clock, while retaining the timestamp as a fact', () => {
    const rows = timedRows(); rows.whoop_recovery[0].timing_ingested_at = '2026-10-18T12:00:00.000001Z'
    expect(project(rows).metrics.recovery).toMatchObject({ usableAsCurrent: false, lastRecordIngestedAt: rows.whoop_recovery[0].timing_ingested_at,
      providerTiming: { status: 'future', issues: ['timing_ingested_at_future'] } })
  })
  it.each([
    ['provider_updated_at', '2026-10-18T10:10:00.123455Z'],
    ['timing_ingested_at', '2026-10-18T10:10:00.123456Z'],
    ['provider_interval_end', '2026-10-18T01:00:00.123455Z'],
    ['provider_interval_end', '2026-10-18T11:00:00.123457Z'],
  ])('does not certify reversed/incoherent microsecond ordering %s', (key, value) => {
    const rows = timedRows(); rows.whoop_sleep[0][key] = value
    expect(project(rows).metrics.sleep.providerTiming).toMatchObject({ status: 'invalid', issues: ['snapshot_order_invalid'] })
    expect(project(rows).metrics.sleep.providerCreatedAt).toBe(rows.whoop_sleep[0].provider_created_at)
  })
  it('distinguishes missing sleep end from a valid open cycle and rejects recovery intervals', () => {
    const rows = timedRows(); rows.whoop_sleep[0].provider_interval_end = null
    expect(project(rows).metrics.sleep.providerTiming.status).toBe('partial')
    expect(project(rows).metrics.strain.providerTiming.status).toBe('recorded')
    rows.whoop_recovery[0].provider_interval_start = rows.whoop_sleep[0].provider_interval_start
    expect(project(rows).metrics.recovery).toMatchObject({ intervalStart: null,
      providerTiming: { status: 'invalid', issues: ['recovery_interval_or_timezone_invalid'] } })
  })
  it.each(['provider_score_state', 'timing_mapping_version', 'timing_provenance', 'provider_sleep_id'])('rejects unrecognized %s metadata without exposing raw instruction text', key => {
    const rows = timedRows(); rows.whoop_recovery[0][key] = key === 'timing_provenance' ? { source: 'private-instruction'.repeat(10000) } : 'private-instruction'
    const result = project(rows)
    expect(result.metrics.recovery.providerTiming.status).toBe('invalid')
    expect(JSON.stringify(result)).not.toContain('private-instruction')
  })
  it('whitelists provenance keys and keeps source links explicitly unjoined even when latest IDs differ', () => {
    const rows = timedRows(); (rows.whoop_sleep[0].timing_provenance as Record<string, unknown>).private = { instruction: 'secret-provenance' }
    rows.whoop_sleep[0].provider_cycle_id = '13'
    const result = project(rows)
    expect(result.metrics.sleep.providerTiming).toMatchObject({ status: 'recorded', sourceLink: { cycleId: '13', verification: 'not_joined' } })
    expect(JSON.stringify(result)).not.toContain('secret-provenance')
  })
  it.each([...columns, 'provider_sleep_id'])('fences a changed retained recovery %s on the second read', async key => {
    vi.useFakeTimers(); vi.setSystemTime(contextNow)
    const rows = timedRows(), { db } = contextClient(rows, { onRead: (table, read) => {
      if (table === 'whoop_recovery' && read === 2) rows.whoop_recovery[0][key] = 'changed-during-read'
    } })
    await expect(readCoachingContext(db, new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 409 })
  })
  it.each(['whoop_recovery', 'whoop_sleep', 'whoop_cycles'])('rejects populated foreign-owner %s without output or writes', async table => {
    vi.useFakeTimers(); vi.setSystemTime(contextNow)
    const rows = timedRows(); rows[table][0].user_id = 'foreign-owner'
    const { db, writes } = contextClient(rows, { foreignRows: true })
    await expect(readCoachingContext(db, new URLSearchParams({ tzOffset: '0' }))).rejects.toMatchObject({ status: 503 })
    expect(writes).not.toHaveBeenCalled()
  })
})
