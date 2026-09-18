import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildFactualPlanningContext, applyFactualPlanningContext, fetchFactualPlanningContext } from '@/app/lib/coach/planning-context'
import { resolveHistorySnapshot, type ActivityHistoryRevision, type HistoryWorkoutRow } from '@/app/lib/coach/planning-history'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { validateProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { buildStoredRollingWeeklyIntent, parseStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'

const movement = MOVEMENT_CATALOG[0]
const asOf = '2026-09-17T18:00:00.000Z'
const row: HistoryWorkoutRow = { id: 'workout-1', user_id: 'athlete-1', workout_date: '2026-09-10',
  created_at: '2026-09-10T18:00:00.000Z', updated_at: '2026-09-10T18:00:00.000Z',
  blocks: [{ movements: [{ name: movement.name, sets: 3, reps: 5 }] }] }
const input = { userId: 'athlete-1', asOf, startsOn: '2026-08-21', endsOn: '2026-09-17', mode: 'current' as const, workouts: [row], available: true, complete: true }
const snapshot = (revision: number, captured_at: string, record: HistoryWorkoutRow = row): ActivityHistoryRevision => ({
  id: `revision-${revision}`, user_id: row.user_id, original_entity_id: row.id, entity_kind: 'workout', revision,
  record, provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'), captured_at, event_at: row.created_at, deleted: false })

describe('factual planning history', () => {
  it('keeps legacy quantity origins unknown and uses no dose sum', () => {
    const history = buildFactualPlanningContext(input)
    expect(history.movements[0]).toMatchObject({ movementId: movement.id, origin: 'legacy_unknown', reviewState: 'unreviewed', sourcePath: 'blocks[0].movements[0]', capturedAt: row.updated_at })
    expect(history.loggingCoverage).toBe('unknown')
    const profile = applyFactualPlanningContext(GOLDEN_PROGRAMMING_PROFILES[0].profile, history)
    expect(profile.recentTraining.doseByCoverageTarget).toEqual([])
    expect(profile.prescriptionBasis?.numericPolicyEligible).toBe(false)
  })
  it('deduplicates only canonical identities and retains distinct same-day sessions', () => {
    expect(buildFactualPlanningContext({ ...input, workouts: [row, row, { ...row, id: 'workout-2' }] }).sourceIds).toEqual(['workout-1', 'workout-2'])
  })
  it('distinguishes cold start, partial retrieval and database outage without resetting an athlete', () => {
    expect(buildFactualPlanningContext({ ...input, workouts: [] }).status).toBe('cold_start')
    for (const override of [{ complete: false }, { available: false, complete: false }]) {
      const history = buildFactualPlanningContext({ ...input, ...override })
      expect(history.status).not.toBe('cold_start')
      expect(() => applyFactualPlanningContext(GOLDEN_PROGRAMMING_PROFILES[0].profile, history)).toThrow('unavailable or incomplete')
    }
  })
  it('does not treat malformed or ambiguous saved blocks as a complete cold start', () => {
    for (const blocks of [{}, [{ exercises: [], movements: [] }], [null], [{ movements: [null] }], [{}]]) {
      const history = buildFactualPlanningContext({ ...input, workouts: [{ ...row, blocks }] })
      expect(history.status).toBe('partial')
      expect(history.retrievalComplete).toBe(false)
      expect(() => applyFactualPlanningContext(GOLDEN_PROGRAMMING_PROFILES[0].profile, history)).toThrow('unavailable or incomplete')
    }
  })
  it('does not infer work from copied canonical prescriptions or unreviewed templates', () => {
    const canonical = { ...row, blocks: [{ exercises: [{ movementId: movement.id, dose: { kind: 'sets_reps', sets: { min: 2, max: 4 } } }] }] }
    expect(buildFactualPlanningContext({ ...input, workouts: [canonical] }).movements).toEqual([])
    expect(buildFactualPlanningContext({ ...input, workouts: [{ ...row, capture_provenance: captureProvenance('workout', 'copied_template') }] }).movements).toEqual([])
  })
  it('does not turn stopped summaries or unfinished movements into prescribed work', () => {
    const stopped = { ...row, blocks: [{ movements: [{ name: movement.name, completed: false }] }] }
    expect(buildFactualPlanningContext({ ...input, workouts: [stopped] }).movements).toEqual([])
  })
  it('preserves current restrictions, equipment, avoidance and reported outside training', () => {
    const history = buildFactualPlanningContext({ ...input, workouts: [{ ...row, capture_provenance: captureProvenance('workout', 'athlete_reported') }], outsideTraining: { status: 'reported', sourceIds: ['athlete-note'], notes: ['Two club practices'] } })
    const original = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    original.preferences = [{ movementId: movement.id, preference: 'avoid', source: 'athlete_confirmed' }]
    original.explicitConstraints = [{ id: 'restriction', kind: 'no_running', description: 'No running', source: 'athlete_confirmed' }]
    const updated = applyFactualPlanningContext(original, history)
    expect(updated.recentTraining.performedMovementIds).toEqual([])
    expect(updated.equipment).toEqual(original.equipment)
    expect(updated.explicitConstraints).toEqual(original.explicitConstraints)
    expect(updated.planningContext?.outsideTraining).toEqual(history.outsideTraining)
  })
  it('uses reported familiarity only for existing eligible movement selection, preserving scheduled numerical coverage', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
    profile.startDate = '2026-09-07'
    const direction = buildRollingTrainingDirection(profile, { hypothesis: 'A stable supported direction.', goalTargetDate: '2026-12-31' })
    const baseline = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
    if (baseline.kind !== 'weekly_plan') throw new Error('Expected plan')
    let selected = false
    for (const candidate of MOVEMENT_CATALOG) {
      const history = buildFactualPlanningContext({ ...input, workouts: [{ ...row, capture_provenance: captureProvenance('workout', 'athlete_reported'), blocks: [{ movements: [{ name: candidate.name, sets: 999, reps: 999 }] }] }] })
      const updated = applyFactualPlanningContext(profile, history)
      expect(updated.recentTraining.performedMovementIds).toEqual([candidate.id])
      const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile: updated, direction })
      if (plan.kind !== 'weekly_plan') throw new Error('Expected plan')
      expect(plan.schedule).toEqual(baseline.schedule)
      if (JSON.stringify(plan.sessions.map(session => session.blocks.map(block => block.exercises.map(exercise => exercise.movementId))))
        !== JSON.stringify(baseline.sessions.map(session => session.blocks.map(block => block.exercises.map(exercise => exercise.movementId))))) { selected = true; break }
    }
    expect(selected).toBe(true)
  })
  it('rejects mixed owners and conflicting canonical copies', () => {
    expect(() => buildFactualPlanningContext({ ...input, workouts: [{ ...row, user_id: 'other' }] })).toThrow('ownership')
    expect(buildFactualPlanningContext({ ...input, workouts: [row, { ...row, blocks: [] }] }).status).toBe('partial')
  })
  it('rejects malformed or future metadata while preserving legacy accepted profiles', () => {
    const original = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
    original.startDate = '2026-09-07'
    const profile = applyFactualPlanningContext(original, buildFactualPlanningContext(input))
    expect(validateProgrammingProfile(profile).ok).toBe(true)
    const direction = buildRollingTrainingDirection(profile, { hypothesis: 'A supported stable direction.' })
    const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
    if (plan.kind !== 'weekly_plan') throw new Error('Expected plan')
    const stored = buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))
    expect(parseStoredRollingWeeklyIntent(stored)).not.toBeNull()
    for (const [key, value] of [['planningContext', { version: 'future' }], ['prescriptionBasis', { version: 'future' }], ['prescriptionBasis', { ...profile.prescriptionBasis, sourceIds: null }], ['prescriptionBasis', { ...profile.prescriptionBasis, historyAsOf: '1999-01-01T00:00:00Z' }]] as const) {
      const changed = structuredClone(stored)
      Object.assign(changed.weekly_plan.profileSnapshot, { [key]: value })
      expect(parseStoredRollingWeeklyIntent(changed)).toBeNull()
    }
    expect(validateProgrammingProfile(original).ok).toBe(true)
  })
})

describe('immutable as-of revisions', () => {
  it('uses the old snapshot after a later correction, never the current values', () => {
    const corrected = { ...row, blocks: [], updated_at: '2026-09-18T12:00:00Z', capture_revision: 2 }
    const result = resolveHistorySnapshot({ ...input, mode: 'historical_replay', workouts: [corrected], revisions: [snapshot(1, row.created_at), snapshot(2, corrected.updated_at, corrected)] })
    expect(result.workouts[0].blocks).toEqual(row.blocks)
    expect(result.workouts[0].historySnapshotId).toBe('revision-1')
  })
  it('withholds legacy current values without an immutable historical snapshot', () => {
    expect(buildFactualPlanningContext({ ...input, mode: 'historical_replay' }).status).toBe('replay_unavailable')
    expect(resolveHistorySnapshot({ ...input, mode: 'historical_replay', revisions: [snapshot(1, '2026-09-18T12:00:00Z')] }).workouts).toEqual([])
  })
  it('retains pre-deletion replay and respects a terminal deletion without resurrecting current rows', () => {
    const revisions = [snapshot(1, row.created_at), { ...snapshot(2, '2026-09-18T12:00:00Z'), deleted: true }]
    expect(resolveHistorySnapshot({ ...input, workouts: [], mode: 'historical_replay', revisions }).workouts).toHaveLength(1)
    expect(resolveHistorySnapshot({ ...input, workouts: [], asOf: '2026-09-19T00:00:00Z', mode: 'historical_replay', revisions }).workouts).toEqual([])
    expect(resolveHistorySnapshot({ ...input, workouts: [], revisions }).workouts).toEqual([])
  })
  it('rejects conflicting or cross-owner snapshot identities', () => {
    expect(resolveHistorySnapshot({ ...input, mode: 'historical_replay', revisions: [snapshot(1, row.created_at), { ...snapshot(1, row.created_at), record: {} }] }).issues[0].reason).toBe('conflicting_snapshot_revision')
    expect(resolveHistorySnapshot({ ...input, mode: 'historical_replay', revisions: [{ ...snapshot(1, row.created_at), record: { ...row, user_id: 'other' } }] }).workouts).toEqual([])
  })
})

function fixture(results: Record<string, Array<{ data: unknown[] | null; error: unknown }>>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const supabase = { from: vi.fn((table: string) => {
    const result = results[table]?.shift() ?? { data: [], error: null }
    const q: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)) }
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) q[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return q }
    return q
  }) } as unknown as SupabaseClient
  return { supabase, calls }
}
describe('bounded owned history retrieval', () => {
  it('falls back only for missing capture columns, retains legacy missingness', async () => {
    const { supabase, calls } = fixture({ workouts: [{ data: null, error: { code: '42703', message: 'column capture_revision missing' } }, { data: [row], error: null }] })
    const context = await fetchFactualPlanningContext(supabase, row.user_id, { startDate: '2026-09-21', asOf, tzOffset: 300 })
    expect(context.status).toBe('available')
    expect(context.missing).toContain('legacy_capture_provenance_unknown')
    expect(calls.filter(call => call.table === 'workouts' && call.method === 'select')).toHaveLength(2)
    expect(calls).toContainEqual({ table: 'workouts', method: 'eq', args: ['user_id', row.user_id] })
  })
  it('does not mask outages or unrelated missing columns as legacy cold start', async () => {
    for (const error of [{ code: '08006', message: 'connection failed' }, { code: '42703', message: 'column blocks missing' }]) {
      const { supabase, calls } = fixture({ workouts: [{ data: null, error }] })
      expect((await fetchFactualPlanningContext(supabase, row.user_id, { startDate: '2026-09-21', asOf })).status).toBe('unavailable')
      expect(calls.filter(call => call.table === 'workouts' && call.method === 'select')).toHaveLength(1)
    }
  })
  it('marks truncation as partial and honors local day near UTC midnight', async () => {
    const { supabase } = fixture({ workouts: [{ data: Array.from({ length: 101 }, (_, i) => ({ ...row, id: `row-${i}` })), error: null }] })
    const result = await fetchFactualPlanningContext(supabase, row.user_id, { startDate: '2026-09-21', asOf: '2026-09-18T01:00:00Z', tzOffset: 300 })
    expect(result.status).toBe('partial')
    expect(result.endsOn).toBe('2026-09-17')
  })
  it('rejects an invalid local start date instead of normalizing it', async () => {
    await expect(fetchFactualPlanningContext(fixture({}).supabase, row.user_id, { startDate: '2026-02-31', asOf })).rejects.toThrow('Invalid history start date')
  })
})
