import { describe, expect, it } from 'vitest'
import { projectProviderTiming, type TimingKind } from '@/app/lib/whoop/provider-timing'
import { isWhoopTimingOwner } from '@/app/lib/whoop/timing-owner'
import { legacyIdentity, providerPayload, syntheticOther, syntheticTimingOwner, timingNow } from '../fixtures/whoop-provider-timing'

const project = (kind: TimingKind = 'sleep', change: Record<string, unknown> = {}, asOf = timingNow) =>
  projectProviderTiming(kind, { ...providerPayload(kind), ...change }, legacyIdentity(kind), asOf)

describe('fixed single-owner feature filter, not authorization', () => {
  it.each([null, undefined, 1, {}, [], '', ' ', syntheticOther, syntheticTimingOwner,
    syntheticOther.toUpperCase(), ` ${syntheticOther}`, `${syntheticOther}\n`, '22222222-2222-4222-8222-22222222222x'])('rejects non-owner/malformed input %s', id => {
    expect(isWhoopTimingOwner(id)).toBe(false)
  })
})

describe('complete provider timing snapshots from literal source requirements', () => {
  it('preserves all six fractional digits, original offsets and explicit provenance', () => {
    expect(project()).toEqual({ provider_created_at: '2026-10-19T11:00:00.123456Z',
      provider_updated_at: '2026-10-19T11:30:00.123456Z', provider_interval_start: '2026-10-19T00:30:00.000001-04:00',
      provider_interval_end: '2026-10-19T06:30:00.000002-04:00', provider_timezone_offset: '-04:00',
      provider_score_state: 'SCORED', timing_ingested_at: timingNow, timing_mapping_version: 'whoop_timing_owner_v1',
      timing_provenance: { source: 'provider_payload', intervalRole: 'sleep', legacyDate: 'unchanged_not_measurement_day', observationTime: 'not_assigned' },
      provider_cycle_id: '42' })
  })
  it('retains recovery links without importing or guessing a measurement interval', () => {
    const r = project('recovery', { start: 'private-invalid', timezone_offset: 'private-invalid', private: 'private-data' })
    expect(r).toMatchObject({ provider_sleep_id: '33333333-3333-4333-8333-333333333333', provider_interval_start: null,
      provider_interval_end: null, provider_timezone_offset: null, timing_provenance: { intervalRole: 'none' } })
    expect(JSON.stringify(r)).not.toContain('private')
  })
  it('permits only an explicitly null cycle end as an open interval', () => {
    expect(project('cycle', { end: null })).toMatchObject({ provider_interval_end: null })
    for (const end of [undefined, '', false, 'bad']) expect(project('cycle', { end })).toBeNull()
    expect(project('sleep', { end: null })).toBeNull()
  })
  it.each(['SCORED', 'PENDING_SCORE', 'UNSCORABLE'])('retains provider score state %s without interpreting health', state => {
    expect(project('sleep', { score_state: state })).toMatchObject({ provider_score_state: state })
  })
  it.each(['PENDING', 'scored', '', null, {}, ['SCORED']])('omits metadata for unknown score state %s', state => {
    expect(project('sleep', { score_state: state })).toBeNull()
  })
  it.each(['2026-02-30T11:00:00Z', '2026-10-19', '2026-10-19T11:00:00', '2026-10-19T24:00:00Z',
    '2026-10-19T11:00:60Z', '2026-10-19T11:00:00.1234567Z', '2026-10-19T11:00:00-00:00',
    '2026-10-19T11:00:00+14:01', '2026-10-19T11:00:00-15:00', null, 123])('omits metadata for invalid source instant %s', created_at => {
    expect(project('sleep', { created_at })).toBeNull()
  })
  it.each(['', '.1', '.123', '.123456'])('keeps supported fractional precision %s', fraction => {
    const created_at = `2026-10-19T11:00:00${fraction}Z`
    expect(project('sleep', { created_at })?.provider_created_at).toBe(created_at)
  })
  it('checks lifecycle order and future values at microsecond precision', () => {
    expect(project('sleep', { created_at: '2026-10-19T11:00:00.000002Z', updated_at: '2026-10-19T11:00:00.000001Z' })).toBeNull()
    expect(project('sleep', { updated_at: '2026-10-19T12:00:00.000001Z' })).toBeNull()
    expect(project('sleep', { created_at: '2026-10-19T06:00:00.000001-05:00', updated_at: '2026-10-19T11:00:00.000001Z' })).not.toBeNull()
    expect(project('sleep', {}, 'not-an-instant')).toBeNull()
  })
  it('checks interval order/future at microseconds without comparing interval to lifecycle creation', () => {
    expect(project('sleep', { start: '2026-10-19T10:00:00.000002Z', end: '2026-10-19T10:00:00.000001Z' })).toBeNull()
    expect(project('sleep', { end: '2026-10-19T12:00:00.000001Z' })).toBeNull()
    expect(project('cycle', { start: '2026-10-19T12:00:00.000001Z', end: null })).toBeNull()
    expect(project('sleep', { created_at: '2026-10-18T00:00:00Z' })).not.toBeNull()
  })
  it.each(['-04:00', '-05:00', '+14:00', '-14:00', '+00:00'])('retains fixed offset %s without deriving an IANA zone or date', timezone_offset => {
    const r = project('sleep', { timezone_offset })
    expect(r?.provider_timezone_offset).toBe(timezone_offset)
    expect(r).not.toHaveProperty('date'); expect(r).not.toHaveProperty('observed_at')
  })
  it.each(['-00:00', '+14:01', '-14:01', '+15:00', '-5:00', 'America/New_York', '', null, 300])('omits metadata for invalid offset %s', timezone_offset => {
    expect(project('sleep', { timezone_offset })).toBeNull()
  })
  it.each([
    ['2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00', '-04:00'],
    ['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00', '-05:00'],
    ['2026-10-18T23:30:00-05:00', '2026-10-19T06:30:00-05:00', '-05:00'],
  ])('retains provider interval %s to %s literally', (start, end, timezone_offset) => {
    const r = project('sleep', { start, end, timezone_offset, created_at: end, updated_at: end }, '2026-12-01T00:00:00Z')
    expect(r).toMatchObject({ provider_interval_start: start, provider_interval_end: end, provider_timezone_offset: timezone_offset })
    expect(r).not.toHaveProperty('local_date')
  })
  it.each(['recovery', 'sleep', 'cycle'] as const)('rejects mismatched source identity for %s', kind => {
    const payload = providerPayload(kind), legacy = legacyIdentity(kind)
    if (kind === 'sleep') legacy.sleep_id = '44444444-4444-4444-8444-444444444444'
    else legacy.cycle_id = 43
    expect(projectProviderTiming(kind, payload, legacy, timingNow)).toBeNull()
  })
  it('does not coerce UUID or unsafe numeric link domains', () => {
    expect(project('recovery', { sleep_id: 42 })).toBeNull()
    expect(project('sleep', { cycle_id: '42' })).toBeNull()
    expect(project('sleep', { cycle_id: Number.MAX_SAFE_INTEGER + 1 })).toBeNull()
    expect(project('sleep', { cycle_id: -1 })).toBeNull()
    expect(projectProviderTiming('cycle', null, {}, timingNow)).toBeNull()
  })
  it('accepts an actual leap day, without interpreting it as a measurement day', () => {
    expect(project('sleep', { created_at: '2024-02-29T00:00:00Z' })).not.toBeNull()
  })
  it.each(['created_at', 'updated_at', 'start', 'end'])('rejects PostgreSQL-unrepresentable year zero in %s', field => {
    expect(project('sleep', { [field]: '0000-01-01T00:00:00Z' })).toBeNull()
    expect(project('cycle', { [field]: '0000-01-01T00:00:00Z' })).toBeNull()
  })
  it('emits fixed bounded provenance and no raw payload or health values', () => {
    const r = project('sleep', { privateMetadata: 'private'.repeat(100_000), notes: 'untrusted instructions', score: { private: 'hidden' } })
    expect(JSON.stringify(r).length).toBeLessThan(1_000)
    for (const text of ['privateMetadata', 'untrusted instructions', 'hidden']) expect(JSON.stringify(r)).not.toContain(text)
    expect(r).not.toHaveProperty('score')
  })
})
