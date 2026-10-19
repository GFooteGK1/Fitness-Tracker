import type { TimingKind } from '@/app/lib/whoop/provider-timing'

export const timingNow = '2026-10-19T12:00:00.000Z'
export const syntheticTimingOwner = '11111111-1111-4111-8111-111111111111'
export const syntheticOther = '22222222-2222-4222-8222-222222222222'
export const syntheticSleep = '33333333-3333-4333-8333-333333333333'
export function providerPayload(kind: TimingKind): Record<string, unknown> {
  return { ...(kind === 'recovery' ? { cycle_id: 42, sleep_id: syntheticSleep }
    : kind === 'sleep' ? { id: syntheticSleep, cycle_id: 42 } : { id: 42 }),
    created_at: '2026-10-19T11:00:00.123456Z', updated_at: '2026-10-19T11:30:00.123456Z',
    start: '2026-10-19T00:30:00.000001-04:00', end: '2026-10-19T06:30:00.000002-04:00',
    timezone_offset: '-04:00', score_state: 'SCORED', nap: false,
    score: { recovery_score: 71.25, resting_heart_rate: 51.5, hrv_rmssd_milli: 42.125,
      spo2_percentage: 98.25, skin_temp_celsius: 33.75, sleep_performance_percentage: 82.5,
      sleep_consistency_percentage: 77.25, sleep_efficiency_percentage: 88.125, respiratory_rate: 15.25,
      stage_summary: { total_in_bed_time_milli: 28_123_456 }, strain: 8.125, kilojoule: 3456.25,
      average_heart_rate: 93.5, max_heart_rate: 152.25 } }
}
export function legacyIdentity(kind: TimingKind, userId = syntheticTimingOwner): Record<string, unknown> {
  return { user_id: userId, ...(kind === 'sleep' ? { sleep_id: syntheticSleep } : { cycle_id: 42 }), date: '2026-10-19' }
}
