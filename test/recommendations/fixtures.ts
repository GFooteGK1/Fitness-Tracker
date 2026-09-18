import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecommendationContext, StoredRecommendation } from '@/app/lib/recommendations/contracts'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
import { decision } from '@/app/lib/recommendations/rules'

export const OWNER = 'user-1'
export function context(): RecommendationContext {
  const content = intent(runningOutcome())
  return {
    userId: OWNER, now: '2026-09-17T18:00:00.000Z', localDate: '2026-09-17', tzOffset: 300,
    validUntil: '2026-09-18T04:59:59.999Z', runtimeFingerprint: 'runtime-1',
    claim: { claimed: true, leaseToken: 'lease', leaseExpiresAt: '2026-09-17T18:01:00.000Z', sourceRevision: 7, responseRevision: 2, activePlanId: null, intentMemoryId: 'memory-1', intentVersion: 1 },
    intent: { schemaVersion: 1, memoryId: 'memory-1', memoryVersion: 1, content }, missingBaselines: [],
    plan: null, sessions: [], proposals: [], review: null, nutrition: { target: null, meals: [], coverage: null },
  }
}
export function stored(kind: 'measurement' | 'session_completion' = 'measurement'): StoredRecommendation {
  const c = context(), outcome = c.intent!.content.outcomes[0]
  return { id: 'recommendation-1', lifecycle: 'active', created_at: c.now,
    decision: decision(c, { ruleId: 'fixture', scopeKey: 'fixture', title: 'Fixture', reason: 'Fixture', outcome: kind === 'measurement'
      ? { kind, sourceId: outcome.goal.id, metricId: outcome.measurement!.metricId, unit: outcome.measurement!.unit, binding: outcome, dueAt: c.validUntil }
      : { kind, sourceId: 'session-1', dueAt: c.validUntil } }) }
}
export function baselineGroup() {
  const outcome = runningOutcome(), m = outcome.measurement!
  return { id: 'group-1', user_id: OWNER, status: 'complete', verification_status: 'athlete_confirmed', verified_by: OWNER,
    source_kind: 'manual', source_system: 'sociusfit_training_baseline', workout_id: null, prescribed_session_id: null,
    observed_at: '2026-09-17T19:00:00.000Z', assessment_definition_id: m.assessmentDefinition.id, protocol_version: m.protocol.version,
    metadata: { origin: 'athlete_reported', assessmentDefinitionVersion: m.assessmentDefinition.version, protocolId: m.protocol.id },
    comparison_modifiers: { movementId: null, variationId: null, distance: outcome.binding.distance, equipmentIds: ['track'], repetitions: null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
}
type Result = { data: any; error: any }
/** Records query fences; table results intentionally do not emulate RLS. */
export function database(results: Record<string, Result[]>) {
  const calls: Array<{ table: string; operations: Array<[string, ...unknown[]]> }> = []
  const from = vi.fn((table: string) => {
    const record = { table, operations: [] as Array<[string, ...unknown[]]> }; calls.push(record)
    const result = results[table]?.shift()
    if (!result) throw new Error(`Unexpected query: ${table}`)
    const chain: any = {}
    for (const method of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'maybeSingle']) chain[method] = (...args: unknown[]) => { record.operations.push([method, ...args]); return chain }
    chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
    return chain
  })
  return { db: { from } as unknown as SupabaseClient, calls, from }
}
export const ok = (data: any): Result => ({ data, error: null })
