import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { SOCIUS_TOOLS, TRAINER_TOOLS, NUTRITIONIST_TOOLS } from '@/app/lib/agents/tools/definitions'
import * as work from '@/app/lib/coach/performed-work-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

const now = '2026-09-21T01:00:00.000Z'
const owner = 'athlete'
const tool = 'get_coach_performed_work'

describe('explicit performed-work retrieval', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true') })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })

  it('exposes only a bounded lookback to Socius', () => {
    const definition = SOCIUS_TOOLS.find(item => item.name === tool)!
    expect(definition.parameters.additionalProperties).toBe(false)
    expect(Object.keys(definition.parameters.properties as object)).toEqual(['window_days'])
    expect([...TRAINER_TOOLS, ...NUTRITIONIST_TOOLS].some(item => item.name === tool)).toBe(false)
  })

  it.each([{ window_days: 181 }, { window_days: 0 }, { window_days: 28.5 }, { window_days: '60' },
    { user_id: 'foreign' }, { as_of: now }, { tz_offset: 360 }, { start_date: '2026-01-01' }, { limit: 999 }])(
    'rejects an invalid or overriding request before reads: %j', async input => {
      const fetch = vi.spyOn(work, 'fetchPerformedWorkContextForCoaching')
      const result = await executeToolCall(tool, input, owner, {} as SupabaseClient)
      expect(result.success).toBe(false); expect(fetch).not.toHaveBeenCalled()
    })

  it('uses the authenticated owner, server clock and agent timezone', async () => {
    const snapshot = work.buildPerformedWorkContext(workSnapshot())
    const fetch = vi.spyOn(work, 'fetchPerformedWorkContextForCoaching').mockResolvedValue(snapshot)
    const db = {} as SupabaseClient
    const result = await executeToolCall(tool, { window_days: 60 }, owner, db, { tzOffset: -300 })
    expect(fetch).toHaveBeenCalledWith(db, owner, { includeCoachContext: true, agentTzOffset: -300, asOf: now, windowDays: 60 })
    expect(result).toMatchObject({ success: true, data: { context: { numericPolicyEligible: false } } })
  })

  it('rejects a foreign projected owner without disclosing its records', async () => {
    const snapshot = work.buildPerformedWorkContext(workSnapshot()); snapshot.userId = 'foreign'
    vi.spyOn(work, 'fetchPerformedWorkContextForCoaching').mockResolvedValue(snapshot)
    const result = await executeToolCall(tool, {}, owner, {} as SupabaseClient)
    expect(result.success).toBe(false); expect(result.data).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('work-1')
  })

  it('keeps capability-disabled and unavailable history distinct from no records', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false')
    const read = vi.fn(() => { throw new Error('Must not query') })
    const result = await executeToolCall(tool, {}, owner, { from: read } as unknown as SupabaseClient)
    expect(result.success).toBe(false); expect(result.error).toContain('not enabled'); expect(read).not.toHaveBeenCalled()
    vi.spyOn(work, 'fetchPerformedWorkContextForCoaching').mockRejectedValue(new Error('private provider detail'))
    expect(JSON.stringify(await executeToolCall(tool, {}, owner, {} as SupabaseClient))).not.toContain('private provider detail')
  })

  it('retrieves an older owned workout through the real reader only when requested, preserving caps and session effort', async () => {
    const row = { ...workSnapshot().workouts[0], workout_date: '2026-08-06',
      created_at: '2026-08-06T12:00:00.000Z', updated_at: '2026-08-06T12:00:00.000Z', rpe: 8 }
    const writes = vi.fn()
    const queries: Array<{ table: string; filters: Array<[string, unknown]>; limit: number }> = []
    const db = { rpc: writes, from: (table: string) => {
      let rows: Array<Record<string, unknown>> = table === 'workouts' ? [row] : []
      const trace = { table, filters: [] as Array<[string, unknown]>, limit: 0 }; queries.push(trace)
      const q = { select: (_fields: string) => q,
        eq: (key: string, value: unknown) => { trace.filters.push([key, value]); rows = rows.filter(r => r[key] === value); return q },
        gte: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) >= value); return q },
        lte: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) <= value); return q },
        order: (_key: string, _options: unknown) => q,
        limit: async (n: number) => { trace.limit = n; return { data: rows.slice(0, n), error: null } },
        insert: writes, update: writes, delete: writes }
      return q
    } } as unknown as SupabaseClient
    const passive = await executeToolCall(tool, {}, owner, db, { tzOffset: -300 })
    const expanded = await executeToolCall(tool, { window_days: 60 }, owner, db, { tzOffset: -300 })
    expect(passive).toMatchObject({ success: true, data: { context: { records: [], status: 'no_records' } } })
    expect(expanded).toMatchObject({ success: true, data: { context: { numericPolicyEligible: false,
      records: [{ workoutId: row.id, recordedWeight: { value: '175 lb' },
        sessionEffort: { value: 8, scope: 'session', sourcePath: 'rpe' } }] } } })
    for (const query of queries) { expect(query.filters).toContainEqual(['user_id', owner]); expect(query.limit).toBeLessThanOrEqual(401) }
    expect(writes).not.toHaveBeenCalled()
  })
})
