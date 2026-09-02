import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import {
  buildConfirmedQwikMapping,
  fetchCoachTrustCenter,
  type TrustObservationGroupRow
} from '@/app/lib/coach/trust-center'

interface Result { data: unknown[] | null; error: { message: string } | null }

describe('coach trust center', () => {
  it('builds distinct memory, review, progress, and rationale surfaces', async () => {
    const { supabase, queries } = fixture()
    const trust = await fetchCoachTrustCenter(
      supabase,
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-09-01T18:00:00.000Z')
    )

    expect(trust.available).toBe(true)
    expect(trust.memories).toEqual([expect.objectContaining({
      summary: 'Build useful strength',
      source: 'Confirmed in Program setup',
      freshness: 'review_due'
    })])
    expect(trust.imports[0]).toMatchObject({
      sourceSystem: 'qwik_vbt',
      rawStoragePolicy: 'user_retained_not_uploaded',
      canConfirm: true
    })
    expect(trust.imports[0].groups[0]).toMatchObject({
      mappingStatus: 'ambiguous',
      sourceExercise: 'Squat',
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: 'barbell_back_squat' })
      ])
    })
    expect(trust.goals[0]).toMatchObject({ statement: 'Build useful strength', priority: 'primary' })
    expect(trust.qualities[0]).toMatchObject({ qualityId: 'maximal_strength', state: 'development' })
    expect(trust.signalSummary).toContainEqual({
      semanticRole: 'direct_outcome', count: 1, latestObservedAt: '2026-08-30T12:00:00.000Z'
    })
    expect(trust.proposals[0]).toMatchObject({
      action: 'reallocate_emphasis',
      includedCount: 2,
      confidence: 0.82,
      explanation: ['Repeated compatible direct outcomes improved.'],
      excludedReasons: ['incompatible_comparability_series'],
      excludedCount: 1,
      automaticActivation: false
    })
    expect(queries.every(query => query.calls.some(call => (
      call.method === 'eq' && call.args[0] === 'user_id'
    )))).toBe(true)
  })

  it('fails closed when any authoritative trust query is unavailable', async () => {
    const { supabase } = fixture({
      coach_memories: [{ data: null, error: { message: 'relation missing' } }]
    })
    const trust = await fetchCoachTrustCenter(supabase, 'user-1')
    expect(trust).toMatchObject({ available: false, memories: [], imports: [], proposals: [] })
  })

  it('builds a canonical comparison only for an athlete-selected candidate', () => {
    const group = pendingGroup()
    const resolved = buildConfirmedQwikMapping(
      group,
      { source_file_hash: 'a'.repeat(64) },
      'barbell_back_squat',
      0.58
    )
    expect(resolved).toMatchObject({
      movementName: 'Barbell back squat',
      comparison: {
        movementId: 'barbell_back_squat',
        variationId: 'squat:bilateral_loaded',
        repetitions: 3,
        externalLoad: { value: 100, unit: 'kg' }
      }
    })
    expect(resolved?.comparabilityKey).toContain('movement=barbell_back_squat')
    expect(buildConfirmedQwikMapping(
      group,
      { source_file_hash: 'a'.repeat(64) },
      'barbell_deadlift',
      0.58
    )).toBeNull()
  })
})

function fixture(overrides: Partial<Record<string, Result[]>> = {}) {
  const userId = '11111111-1111-4111-8111-111111111111'
  const defaults: Record<string, Result[]> = {
    coach_memories: [{ data: [{
      id: '21111111-1111-4111-8111-111111111111', memory_key: 'primary_goal', kind: 'goal', version: 1,
      content: { goal: 'Build useful strength', primaryDomain: 'strength', secondaryGoals: [] },
      provenance: { source: 'program_setup' }, confidence: 1,
      confirmed_at: '2026-06-01T12:00:00.000Z', review_after: '2026-08-30T12:00:00.000Z', last_reviewed_at: null
    }], error: null }],
    measurement_imports: [{ data: [{
      id: '31111111-1111-4111-8111-111111111111', source_system: 'qwik_vbt', source_file_name: 'qwik.json',
      source_file_hash: 'a'.repeat(64), parser_version: 'qwik-import-0.1.0', captured_at: '2026-08-31T12:01:00.000Z',
      manifest: { sourceExportedAt: '2026-08-31T12:00:00.000Z', warningCount: 1 }
    }], error: null }],
    adaptation_proposals: [{ data: [{
      id: '41111111-1111-4111-8111-111111111111', created_at: '2026-09-01T12:00:00.000Z',
      rationale: {
        action: 'reallocate_emphasis', trend: 'stable', evidenceStatus: 'supported',
        confidence: 0.82,
        explanation: ['Repeated compatible direct outcomes improved.'],
        automaticPlanActivation: false, reason: 'evidence_derived_adaptation',
        evidenceSnapshot: {
          includedObservationIds: ['observation-1', 'observation-2'],
          excludedObservations: [{
            observationId: 'observation-3', reason: 'incompatible_comparability_series'
          }]
        }
      }
    }], error: null }],
    training_programs: [{ data: [{ active_plan_version_id: '51111111-1111-4111-8111-111111111111' }], error: null }],
    performance_observation_groups: [
      { data: [{
        ...pendingGroup(), id: '61111111-1111-4111-8111-111111111111', source_import_id: null,
        status: 'complete', observed_at: '2026-08-30T12:00:00.000Z', comparability_key: 'comparison-v1|fixture',
        metadata: { mappingStatus: 'mapped', canonicalMovementId: 'barbell_back_squat', canonicalMovementName: 'Barbell back squat' }
      }], error: null },
      { data: [pendingGroup()], error: null }
    ],
    performance_observation_values: [{ data: [
      { id: 'value-1', group_id: '61111111-1111-4111-8111-111111111111', metric_id: 'bar.mean_velocity', semantic_role: 'direct_outcome', value_numeric: 0.6, unit: 'm_per_s', ordinal: 0, status: 'complete' },
      { id: 'value-2', group_id: pendingGroup().id, metric_id: 'strength.load', semantic_role: 'training_signal', value_numeric: 100, unit: 'kg', ordinal: 0, status: 'complete' },
      { id: 'value-3', group_id: pendingGroup().id, metric_id: 'strength.repetitions', semantic_role: 'training_signal', value_numeric: 3, unit: 'repetitions', ordinal: 0, status: 'complete' },
      { id: 'value-4', group_id: pendingGroup().id, metric_id: 'bar.mean_velocity', semantic_role: 'direct_outcome', value_numeric: 0.58, unit: 'm_per_s', ordinal: 0, status: 'complete' }
    ], error: null }],
    training_plan_versions: [{ data: [{ intent: { adaptive_programming: {
      goals: [{ goalId: 'goal-1', statement: 'Build useful strength', priority: 'primary', target: null, horizon: { startsOn: '2026-08-01', endsOn: '2026-09-25' } }],
      qualityEmphases: [{ id: 'quality-1', goalId: 'goal-1', qualityId: 'maximal_strength', state: 'development' }]
    } } }], error: null }]
  }
  const results = { ...defaults, ...overrides }
  const callIndex = new Map<string, number>()
  const queries: Array<{ table: string; calls: Array<{ method: string; args: unknown[] }> }> = []
  const supabase = {
    from: vi.fn((table: string) => {
      const record = { table, calls: [] as Array<{ method: string; args: unknown[] }> }
      queries.push(record)
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      for (const method of ['select', 'eq', 'order', 'in']) {
        chain[method] = vi.fn((...args: unknown[]) => { record.calls.push({ method, args }); return chain })
      }
      chain.limit = vi.fn((...args: unknown[]) => {
        record.calls.push({ method: 'limit', args })
        const index = callIndex.get(table) ?? 0
        callIndex.set(table, index + 1)
        return Promise.resolve(results[table]?.[index] ?? { data: [], error: null })
      })
      return chain
    })
  } as unknown as SupabaseClient
  return { supabase, queries, userId }
}

function pendingGroup(): TrustObservationGroupRow {
  return {
    id: '71111111-1111-4111-8111-111111111111',
    source_import_id: '31111111-1111-4111-8111-111111111111',
    status: 'incomplete',
    observed_at: '2026-08-31T12:00:00.000Z',
    captured_at: '2026-08-31T12:01:00.000Z',
    source_system: 'qwik_vbt',
    source_device: 'phone-1',
    source_record_id: 'set-1',
    assessment_definition_id: 'strength.fixed_load_velocity',
    assessment_catalog_version: '0.2.0',
    protocol_version: '1.0.0',
    parser_version: 'qwik-import-0.1.0',
    comparability_key: null,
    comparison_modifiers: {
      movementId: null, variationId: null, repetitions: 3,
      externalLoad: { value: 100, unit: 'kg' }, distance: null, duration: null,
      equipmentIds: [], techniqueModifiers: [], environmentModifiers: []
    },
    metadata: {
      sourceExercise: 'Squat', mappingStatus: 'ambiguous',
      canonicalMovementId: null, canonicalMovementName: null,
      candidateMovementIds: ['barbell_back_squat', 'dumbbell_goblet_squat']
    }
  }
}
