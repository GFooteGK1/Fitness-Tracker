import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as evidence from '@/app/lib/coach/evidence-context'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { SOCIUS_TOOLS, TRAINER_TOOLS, NUTRITIONIST_TOOLS } from '@/app/lib/agents/tools/definitions'
import { reasoningEvidencePacket } from '../fixtures/coach-reasoning-evidence'

const userId = 'test-user-123'
const now = '2026-09-21T17:30:00.000Z'
const purposeInput = { purpose: 'metric_history', metric_id: 'bar.mean_velocity' }

describe('Socius read-only evidence tool', () => {
  let fetchEvidence: MockInstance<typeof evidence.fetchCoachEvidenceContext>
  let supabase: SupabaseClient

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    fetchEvidence = vi.spyOn(evidence, 'fetchCoachEvidenceContext').mockResolvedValue(reasoningEvidencePacket())
    supabase = { from: vi.fn(() => { throw new Error('Unexpected direct query') }),
      rpc: vi.fn(() => { throw new Error('Unexpected mutation') }) } as unknown as SupabaseClient
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('exposes bounded evidence selectors only to Socius without owner, clock or write parameters', () => {
    const tool = SOCIUS_TOOLS.find(item => item.name === 'get_coach_evidence')!
    expect(tool.parameters.additionalProperties).toBe(false)
    expect(tool.parameters.required).toEqual(['purpose'])
    expect(Object.keys(tool.parameters.properties as object)).toEqual([
      'purpose', 'window_days', 'goal_id', 'metric_id', 'protocol', 'comparability_key',
    ])
    expect(tool.description).toContain('untrusted data')
    expect([...TRAINER_TOOLS, ...NUTRITIONIST_TOOLS].some(item => item.name === tool.name)).toBe(false)
  })

  it('dispatches using the trusted owner and server clock and returns actual measured values and provenance', async () => {
    const input = { ...purposeInput, window_days: 70, protocol: { id: 'test-velocity', version: '1.0.0' },
      comparability_key: 'comparison-v1|test-bench-double' }
    const before = structuredClone(input)
    const result = await executeToolCall('get_coach_evidence', input, userId, supabase)
    expect(fetchEvidence).toHaveBeenCalledWith(supabase, userId, {
      purpose: 'metric_history', asOf: now, windowDays: 70, metricId: 'bar.mean_velocity',
      protocol: input.protocol, comparabilityKey: input.comparability_key,
    })
    expect(result.success).toBe(true)
    expect(result.data?.context).toMatchObject({ authority: 'factual_context_only',
      evidenceSeries: [{ samples: [{ value: 0.57, ordinal: 1, source: { verificationStatus: 'athlete_confirmed' } },
        { value: 0.52, ordinal: 2 }] }] })
    expect(input).toEqual(before)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it.each([
    [{ purpose: 'general_coaching' }, 28],
    [{ purpose: 'new_planning' }, 365],
    [{ purpose: 'weekly_review' }, 14],
    [{ purpose: 'adaptation_review', goal_id: 'goal-strength' }, 84],
    [purposeInput, 365],
  ])('supports the existing bounded purpose request %j', async (input, defaultWindow) => {
    expect((await executeToolCall('get_coach_evidence', input, userId, supabase)).success).toBe(true)
    expect(fetchEvidence).toHaveBeenCalledWith(supabase, userId, expect.objectContaining({
      purpose: input.purpose, windowDays: defaultWindow, asOf: now,
    }))
  })

  it.each([
    { ...purposeInput, user_id: 'other-user' },
    { ...purposeInput, userId: 'other-user' },
    { ...purposeInput, asOf: '2030-01-01T00:00:00Z' },
    { ...purposeInput, as_of: '2000-01-01T00:00:00Z' },
    { ...purposeInput, start_date: '2020-01-01' },
    { ...purposeInput, recordBudgetCharacters: 64_000 },
    { ...purposeInput, protocol: { id: 'test', version: '1.0.0', user_id: 'other-user' } },
    { purpose: 'today_session', prescribed_session_id: '11111111-1111-4111-8111-111111111111' },
    { purpose: 'unsupported' },
  ])('rejects unsupported selectors without querying: %j', async input => {
    expect((await executeToolCall('get_coach_evidence', input, userId, supabase)).success).toBe(false)
    expect(fetchEvidence).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it.each([
    [{ purpose: 'metric_history' }, 'requires a metric'],
    [{ purpose: 'adaptation_review' }, 'requires a goal'],
    [{ ...purposeInput, metric_id: 'invented.metric' }, 'Metric is unsupported'],
    [{ purpose: 'general_coaching', window_days: 91 }, 'purpose limit'],
    [{ purpose: 'weekly_review', window_days: 36 }, 'purpose limit'],
    [{ purpose: 'adaptation_review', goal_id: 'goal-strength', window_days: 181 }, 'purpose limit'],
    [{ ...purposeInput, window_days: 731 }, 'purpose limit'],
    [{ ...purposeInput, window_days: 0 }, 'purpose limit'],
    [{ ...purposeInput, window_days: 1.5 }, 'purpose limit'],
    [{ ...purposeInput, window_days: '10' }, 'purpose limit'],
    [{ ...purposeInput, protocol: { id: 'test', version: 'bad' } }, 'Protocol selector is invalid'],
    [{ ...purposeInput, comparability_key: 'invented' }, 'Comparability key is invalid'],
  ])('returns existing selector-validation errors: %j', async (input, error) => {
    const result = await executeToolCall('get_coach_evidence', input, userId, supabase)
    expect(result).toMatchObject({ success: false, error: expect.stringContaining(error) })
    expect(fetchEvidence).not.toHaveBeenCalled()
  })

  it('requires a server owner before performing a read', async () => {
    expect((await executeToolCall('get_coach_evidence', purposeInput, '', supabase)).success).toBe(false)
    expect(fetchEvidence).not.toHaveBeenCalled()
  })

  it('rejects another athlete packet without exposing private records', async () => {
    fetchEvidence.mockResolvedValue(reasoningEvidencePacket('other-user'))
    const result = await executeToolCall('get_coach_evidence', purposeInput, userId, supabase)
    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('other-user')
    expect(JSON.stringify(result)).not.toContain('memory-goal')
  })

  it('returns incomplete selection and whole-record omissions even for a successful read', async () => {
    const packet = reasoningEvidencePacket()
    packet.selectionComplete = false
    packet.limits.sourceTruncated = true
    packet.missing = ['source_query_truncated']
    packet.memories[0].content = { description: 'x'.repeat(32_001) }
    fetchEvidence.mockResolvedValue(packet)
    const result = await executeToolCall('get_coach_evidence', purposeInput, userId, supabase)
    expect(result.success).toBe(true)
    expect(result.data?.context).toMatchObject({ memories: [], coverage: {
      complete: false, sourceLimits: { sourceTruncated: true }, missing: ['source_query_truncated'],
      omitted: [{ kind: 'memory', id: 'memory-goal', reason: 'record_budget' }],
    }, evidenceSeries: packet.evidenceSeries })
  })

  it('preserves explicit missing sources when storage is unavailable', async () => {
    const packet = reasoningEvidencePacket()
    packet.storageAvailable = false
    packet.selectionComplete = false
    packet.missing = ['performance_observation_values_unavailable']
    fetchEvidence.mockResolvedValue(packet)
    const result = await executeToolCall('get_coach_evidence', purposeInput, userId, supabase)
    expect(result.success).toBe(false)
    expect(result.data?.context).toMatchObject({ coverage: { complete: false, missing: packet.missing } })
  })

  it('sanitizes thrown provider errors and performs no fallback write', async () => {
    fetchEvidence.mockRejectedValue(new Error('private provider URL or credential detail'))
    const result = await executeToolCall('get_coach_evidence', purposeInput, userId, supabase)
    expect(result).toEqual({ success: false, error: 'Coach evidence could not be retrieved; no evidence-based change is authorized' })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('executes the real read pipeline with user-scoped queries and excludes foreign athlete records', async () => {
    fetchEvidence.mockRestore()
    const queries: Array<Record<string, ReturnType<typeof vi.fn>>> = []
    const forbiddenWrite = vi.fn(() => { throw new Error('Writes are forbidden') })
    const memory = { id: 'owned-goal', user_id: userId, memory_key: 'goal', kind: 'goal',
      content: { goal: 'confirmed test goal' }, provenance: { source: 'athlete' }, confidence: 1,
      confirmed_at: '2026-09-20T12:00:00Z', version: 1, status: 'confirmed', effective_from: '2026-09-20T12:00:00Z',
      effective_until: null, review_after: null, last_reviewed_at: null }
    const db = { from: vi.fn((table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = { insert: forbiddenWrite, update: forbiddenWrite, delete: forbiddenWrite }
      for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'in']) query[method] = vi.fn(() => query)
      query.limit = vi.fn().mockResolvedValue({ data: table === 'coach_memories'
        ? [memory, { ...memory, id: 'foreign-goal', user_id: 'foreign-user', content: { secret: 'foreign-private' } }] : [], error: null })
      queries.push(query)
      return query
    }), rpc: forbiddenWrite } as unknown as SupabaseClient
    const result = await executeToolCall('get_coach_evidence', { purpose: 'new_planning' }, userId, db)
    expect(result.success).toBe(true)
    expect(result.data?.context).toMatchObject({ scope: { userId }, asOf: now,
      memories: [{ id: 'owned-goal', content: memory.content }] })
    expect(JSON.stringify(result)).not.toContain('foreign-private')
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) expect(query.eq).toHaveBeenCalledWith('user_id', userId)
    expect(forbiddenWrite).not.toHaveBeenCalled()
  })
})
