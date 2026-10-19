import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { upsertWhoopTiming } from '@/app/lib/whoop/timing-upsert'
import { legacyIdentity, providerPayload, syntheticOther, syntheticTimingOwner, timingNow } from '../fixtures/whoop-provider-timing'

vi.mock('@/app/lib/whoop/timing-owner', () => ({ isWhoopTimingOwner: (id: unknown) => id === '11111111-1111-4111-8111-111111111111' }))
function adapter(failRequest = 0) {
  const calls: Array<{ method: string; url: URL; body: Array<Record<string, unknown>> }> = []
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: String(init?.method), url: new URL(String(input)), body: JSON.parse(String(init?.body)) })
    return calls.length === failRequest ? new Response(JSON.stringify({ code: 'synthetic_failure', message: 'test failure' }), { status: 400 })
      : new Response(null, { status: 201 })
  })
  const db = createClient('https://synthetic.invalid', 'synthetic-test-key', {
    global: { fetch: request }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { db, calls, request }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(timingNow) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('installed Supabase adapter timing groups (captured requests, no network)', () => {
  it.each(['recovery', 'sleep', 'cycle'] as const)('keeps non-owner %s exact legacy body, columns and one request', async kind => {
    for (const userId of [syntheticOther, '44444444-4444-4444-8444-444444444444']) {
      const { db, calls } = adapter(), row = { ...legacyIdentity(kind, userId), health: 7.125 }
      await upsertWhoopTiming(db, kind, userId, [row], [providerPayload(kind)])
      expect(calls).toHaveLength(1); expect(calls[0].method).toBe('POST')
      expect(JSON.stringify(calls[0].body)).toBe(JSON.stringify([row]))
      expect(calls[0].url.searchParams.get('columns')).toBe(Object.keys(row).map(k => `"${k}"`).join(','))
      expect(calls[0].url.searchParams.get('on_conflict')).toBe(kind === 'sleep' ? 'user_id,sleep_id' : 'user_id,cycle_id')
      expect(calls[0].body[0]).not.toHaveProperty('timing_ingested_at')
    }
  })
  it.each([false, true])('separates complete and malformed owner metadata in either original order (%s)', async reverse => {
    const { db, calls } = adapter()
    const pair = [
      { row: { ...legacyIdentity('cycle'), health: 1 }, payload: providerPayload('cycle') },
      { row: { ...legacyIdentity('cycle'), cycle_id: 43, health: 2 }, payload: { ...providerPayload('cycle'), id: 43, created_at: 'bad' } },
    ]
    if (reverse) pair.reverse()
    await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, pair.map(p => p.row), pair.map(p => p.payload))
    expect(calls).toHaveLength(2)
    expect(calls[0].body).toEqual([{ ...legacyIdentity('cycle'), cycle_id: 43, health: 2 }])
    expect(calls[0].url.searchParams.get('columns')).not.toContain('timing_')
    expect(calls[1].body[0]).toMatchObject({ cycle_id: 42, health: 1, timing_ingested_at: timingNow })
    expect(calls[1].url.searchParams.get('columns')).toContain('provider_created_at')
  })
  it('uses zero/one calls for empty, complete-only and malformed-only owner groups', async () => {
    const { db, calls } = adapter()
    await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [], []); expect(calls).toHaveLength(0)
    await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [legacyIdentity('cycle')], [providerPayload('cycle')])
    expect(calls).toHaveLength(1)
    await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [legacyIdentity('cycle')], [{}])
    expect(calls).toHaveLength(2); expect(calls[1].body[0]).not.toHaveProperty('timing_ingested_at')
  })
  it('rejects owner row mismatch and never emits a database request', async () => {
    const { db, calls } = adapter()
    await expect(upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [legacyIdentity('cycle', syntheticOther)], [providerPayload('cycle')])).rejects.toThrow('identity mismatch')
    await expect(upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [legacyIdentity('cycle')], [])).rejects.toThrow('identity mismatch')
    expect(calls).toHaveLength(0)
  })
  it('does not cache owner eligibility or leak timing to a subsequent non-owner', async () => {
    const { db, calls } = adapter()
    await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner, [legacyIdentity('cycle')], [providerPayload('cycle')])
    await upsertWhoopTiming(db, 'cycle', syntheticOther, [legacyIdentity('cycle', syntheticOther)], [providerPayload('cycle')])
    expect(calls).toHaveLength(2)
    expect(calls[0].body[0]).toHaveProperty('timing_ingested_at')
    expect(calls[1].body[0]).toEqual(legacyIdentity('cycle', syntheticOther))
  })
  it('stops on a group failure and reports it without claiming atomic whole-batch success', async () => {
    const { db, calls } = adapter(1)
    const result = await upsertWhoopTiming(db, 'cycle', syntheticTimingOwner,
      [{ ...legacyIdentity('cycle'), cycle_id: 43 }, legacyIdentity('cycle')],
      [{ ...providerPayload('cycle'), id: 43, created_at: 'bad' }, providerPayload('cycle')])
    expect(result.error).toMatchObject({ code: 'synthetic_failure' }); expect(calls).toHaveLength(1)
  })
  it.each(['recovery', 'sleep', 'cycle'] as const)('keeps duplicate %s identities in the exact legacy single-bulk failure path', async kind => {
    const { db, calls } = adapter(1)
    const rows = [{ ...legacyIdentity(kind), health: 1 }, { ...legacyIdentity(kind), health: 2 }]
    const result = await upsertWhoopTiming(db, kind, syntheticTimingOwner, rows,
      [providerPayload(kind), { ...providerPayload(kind), created_at: 'bad' }])
    expect(result.error).toMatchObject({ code: 'synthetic_failure' })
    expect(calls).toHaveLength(1); expect(calls[0].body).toEqual(rows)
    expect(calls[0].url.searchParams.get('columns')).not.toContain('timing_')
  })
})
