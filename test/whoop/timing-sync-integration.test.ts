import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fullSync } from '@/app/lib/whoop/sync-service'
import * as api from '@/app/lib/whoop/api-client'
import * as token from '@/app/lib/whoop/token-service'
import { providerPayload, syntheticOther, syntheticTimingOwner, timingNow } from '../fixtures/whoop-provider-timing'

vi.mock('@/app/lib/whoop/timing-owner', () => ({ isWhoopTimingOwner: (id: unknown) => id === '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn(() => { throw Error('No real auth/client') }) }))
vi.mock('@/app/lib/whoop/token-service', () => ({ getValidAccessToken: vi.fn(async () => 'synthetic-no-real-token') }))
vi.mock('@/app/lib/whoop/api-client', () => ({ getRecovery: vi.fn(), getSleep: vi.fn(), getCycles: vi.fn(), getWorkouts: vi.fn() }))
function dbFixture() {
  const calls: Array<{ table: string; rows: Array<Record<string, unknown>>; options: unknown }> = []
  const db = { from: (table: string) => ({ upsert: async (rows: Record<string, unknown> | Array<Record<string, unknown>>, options: unknown) => {
    calls.push({ table, rows: structuredClone(Array.isArray(rows) ? rows : [rows]), options }); return { error: null }
  } }) }
  return { db: db as unknown as SupabaseClient, calls }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(timingNow)
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Forbidden real network'))
  vi.mocked(api.getRecovery).mockResolvedValue([providerPayload('recovery')] as never)
  vi.mocked(api.getSleep).mockResolvedValue([providerPayload('sleep')] as never)
  vi.mocked(api.getCycles).mockResolvedValue([providerPayload('cycle')] as never)
  vi.mocked(api.getWorkouts).mockResolvedValue([])
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('synthetic sync orchestration: providers/token/database fully stubbed', () => {
  it.each([syntheticOther, '44444444-4444-4444-8444-444444444444'])('keeps every non-owner legacy health field and date unchanged (%s)', async user_id => {
    const { db, calls } = dbFixture(), result = await fullSync(user_id, db)
    expect(result).toMatchObject({ success: true, recordsSynced: { recovery: 1, sleep: 1, cycles: 1, workouts: 0 } })
    const health = calls.filter(c => c.table !== 'whoop_sync_status')
    expect(health.map(c => c.table)).toEqual(['whoop_recovery', 'whoop_sleep', 'whoop_cycles'])
    expect(health.map(c => c.rows[0])).toEqual([
      { user_id, cycle_id: 42, date: '2026-10-19', recovery_score: 71.25, resting_heart_rate: 51.5, hrv_rmssd_milli: 42.125, spo2_percentage: 98.25, skin_temp_celsius: 33.75 },
      { user_id, sleep_id: '33333333-3333-4333-8333-333333333333', date: '2026-10-19', sleep_performance_percentage: 82.5, sleep_consistency_percentage: 77.25, sleep_efficiency_percentage: 88.125, respiratory_rate: 15.25, total_sleep_duration_ms: 28_123_456, is_nap: false },
      { user_id, cycle_id: 42, date: '2026-10-19', strain: 8.125, kilojoules: 3456.25, average_heart_rate: 93.5, max_heart_rate: 152.25 },
    ])
    for (const fn of [api.getRecovery, api.getSleep, api.getCycles, api.getWorkouts]) expect(fn).toHaveBeenCalledExactlyOnceWith('synthetic-no-real-token', new Date('2026-10-12T12:00:00Z'), new Date(timingNow))
    expect(token.getValidAccessToken).toHaveBeenCalledExactlyOnceWith(user_id)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  it.each([syntheticTimingOwner, syntheticOther])('retains legacy UTC/fallback date behavior (%s)', async user_id => {
    vi.mocked(api.getRecovery).mockResolvedValue([{ ...providerPayload('recovery'), created_at: '2026-10-18T23:30:00-05:00' }] as never)
    vi.mocked(api.getSleep).mockResolvedValue([{ ...providerPayload('sleep'), created_at: 'bad' }] as never)
    const { db, calls } = dbFixture(); await fullSync(user_id, db)
    expect(calls.find(c => c.table === 'whoop_recovery')?.rows[0].date).toBe('2026-10-19')
    expect(calls.find(c => c.table === 'whoop_sleep')?.rows[0].date).toBe('2026-10-19')
    expect(calls.find(c => c.table === 'whoop_sleep')?.rows[0]).not.toHaveProperty('timing_ingested_at')
  })
  it('only adds metadata for the synthetic gated owner, preserving health and batch counts', async () => {
    const { db, calls } = dbFixture(); const result = await fullSync(syntheticTimingOwner, db)
    expect(result.recordsSynced).toEqual({ recovery: 1, sleep: 1, cycles: 1, workouts: 0 })
    for (const call of calls.filter(c => c.table !== 'whoop_sync_status')) expect(call.rows[0]).toMatchObject({ date: '2026-10-19', timing_ingested_at: timingNow })
    expect(calls.find(c => c.table === 'whoop_recovery')?.rows[0]).toMatchObject({ recovery_score: 71.25, provider_interval_start: null })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  it('empty ordinary results cause no health or timing upserts', async () => {
    for (const fn of [api.getRecovery, api.getSleep, api.getCycles, api.getWorkouts]) vi.mocked(fn).mockResolvedValue([])
    const { db, calls } = dbFixture(); expect((await fullSync(syntheticTimingOwner, db)).recordsSynced).toEqual({ recovery: 0, sleep: 0, cycles: 0, workouts: 0 })
    expect(calls.every(c => c.table === 'whoop_sync_status')).toBe(true)
  })
})
