import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'

const asOf = '2026-09-01T18:00:00.000Z'

interface Result {
  data: unknown[] | null
  error: { message: string } | null
}

function supabaseFixture(overrides: Partial<Record<string, Result>> = {}) {
  const results: Record<string, Result> = {
    training_programs: {
      data: [{
        id: 'program-1', user_id: 'user-1', title: 'Active block',
        goal_summary: 'Build strength', start_date: '2026-08-01', end_date: '2026-09-30',
        status: 'active', active_plan_version_id: 'plan-1', created_at: '2026-07-31T12:00:00Z'
      }], error: null
    },
    training_plan_versions: {
      data: [{
        id: 'plan-1', user_id: 'user-1', program_id: 'program-1', version: 1,
        status: 'accepted', reference_version: '0.1.0', policy_version: '0.3.0',
        intent: { adaptive_programming: { goals: [] } }
      }], error: null
    },
    prescribed_sessions: { data: [], error: null },
    coach_memories: {
      data: [{
        id: 'memory-1', user_id: 'user-1', memory_key: 'primary_goal', kind: 'goal',
        content: { goal: 'Build strength' }, provenance: { source: 'athlete' }, confidence: 1,
        confirmed_at: '2026-08-01T12:00:00Z', version: 1, status: 'confirmed',
        effective_from: null, effective_until: null, review_after: null, last_reviewed_at: null
      }], error: null
    },
    coach_strength_assessments: { data: [], error: null },
    performance_observation_groups: {
      data: [{
        id: 'observation-1', user_id: 'user-1', source_import_id: null,
        workout_id: 'workout-1', prescribed_session_id: null,
        observation_kind: 'readiness_check', status: 'complete',
        observed_at: '2026-08-31T12:00:00Z', captured_at: '2026-08-31T12:01:00Z',
        source_kind: 'manual', source_system: 'sociusfit', source_device: 'none',
        source_record_id: 'readiness-1', assessment_definition_id: 'readiness.self_report',
        assessment_catalog_version: '0.2.0', protocol_version: '1.0.0',
        verification_status: 'athlete_confirmed',
        comparability_key: 'comparison-v1|metric=readiness.score|definition=readiness.self_report%401.0.0|protocol=daily-readiness-five-point%401.0.0|source=manual',
        comparison_modifiers: {}, metadata: { protocolId: 'daily-readiness-five-point' }
      }], error: null
    },
    performance_observation_values: {
      data: [{
        id: 'value-1', group_id: 'observation-1', user_id: 'user-1',
        metric_id: 'readiness.score', semantic_role: 'proxy', value_numeric: 4,
        unit: 'score', ordinal: 0, status: 'complete', provenance: {}
      }], error: null
    },
    measurement_imports: { data: [], error: null },
    ...overrides
  }
  const queries: Array<{
    table: string
    calls: Array<{ method: string; args: unknown[] }>
  }> = []

  const supabase = {
    from: vi.fn((table: string) => {
      const record = { table, calls: [] as Array<{ method: string; args: unknown[] }> }
      queries.push(record)
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      for (const method of ['select', 'eq', 'lte', 'gte', 'order', 'in']) {
        chain[method] = vi.fn((...args: unknown[]) => {
          record.calls.push({ method, args })
          return chain
        })
      }
      chain.limit = vi.fn((...args: unknown[]) => {
        record.calls.push({ method: 'limit', args })
        return Promise.resolve(results[table] ?? { data: [], error: null })
      })
      return chain
    })
  } as unknown as SupabaseClient

  return { supabase, queries }
}

describe('fetchCoachEvidenceContext', () => {
  it('pushes tenant, status, as-of, and window filters into bounded database reads', async () => {
    const { supabase, queries } = supabaseFixture()

    const context = await fetchCoachEvidenceContext(supabase, 'user-1', {
      purpose: 'general_coaching', asOf
    })

    expect(context.storageAvailable).toBe(true)
    expect(context.evidenceIds).toEqual(['observation-1'])
    expect(context.reproduction.activePlanVersionId).toBe('plan-1')
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every(query => query.calls.some(call => (
      call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'user-1'
    )))).toBe(true)

    const groups = queries.find(query => query.table === 'performance_observation_groups')
    expect(groups?.calls).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['status', 'complete'] },
      { method: 'gte', args: ['observed_at', '2026-08-04T18:00:00.000Z'] },
      { method: 'lte', args: ['observed_at', asOf] }
    ]))
    expect(groups?.calls.find(call => call.method === 'limit')?.args[0]).toBe(49)
  })

  it('returns an explicit unavailable packet when an authoritative query fails', async () => {
    const { supabase } = supabaseFixture({
      performance_observation_groups: {
        data: null,
        error: { message: 'relation does not exist' }
      }
    })

    const context = await fetchCoachEvidenceContext(supabase, 'user-1', {
      purpose: 'general_coaching', asOf
    })

    expect(context.storageAvailable).toBe(false)
    expect(context.selectionComplete).toBe(false)
    expect(context.missing).toContain('performance_observations_unavailable')
  })
})
