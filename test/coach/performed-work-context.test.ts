import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { buildPerformedWorkContext, fetchPerformedWorkContextForCoaching, renderPerformedWorkContext } from '@/app/lib/coach/performed-work-context'
import { workSnapshot } from '../fixtures/coach-performed-work'
import { fetchPlanningHistorySnapshot } from '@/app/lib/coach/planning-context'

function clientFixture(rows: unknown[], error: unknown = null) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = { then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: table === 'workouts' ? rows : [], error })) }
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) q[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return q }
    return q
  })
  return { client: { from } as unknown as SupabaseClient, from, calls }
}
afterEach(() => vi.unstubAllEnvs())

describe('factual performed work for coaching', () => {
  it('retains exact, bounded and unknown quantities with literal weight and effort scope', () => {
    const context = buildPerformedWorkContext(workSnapshot())
    expect(context.records[0]).toMatchObject({ basis: 'reported_work', role: 'working',
      quantities: { sets: { kind: 'exact', value: 4 }, repetitions: { kind: 'bounded', min: 2, max: 3 }, load: { kind: 'unknown' } },
      recordedWeight: { value: '175 lb', origin: 'athlete_reported', sourcePath: 'blocks[0].movements[0].weight' },
      effort: { scale: 'RPE', scope: 'hardest_set', value: 7 } })
    expect(context.numericPolicyEligible).toBe(false)
    expect(context.coverage.athleteCoverage).toBe('unknown')
  })

  it('reflects a corrected source without rewriting a previous projection or inventing a maximum', () => {
    const input = workSnapshot()
    const prior = buildPerformedWorkContext(input)
    input.workouts[0].blocks = [{ movements: [{ name: 'Barbell floor press', sets: 4, reps: 2, load: 80, unit: 'kg' }] }]
    input.workouts[0].capture_revision = 2
    input.workouts[0].updated_at = '2026-09-19T12:00:00Z'
    input.workouts[0].capture_provenance = captureProvenance('workout', 'athlete_reported', 'corrected')
    const corrected = buildPerformedWorkContext(input)
    expect(corrected.records[0]).toMatchObject({ revision: 2, reviewState: 'corrected',
      quantities: { repetitions: { kind: 'exact', value: 2 }, load: { kind: 'exact', value: 80 }, loadUnit: 'kg' } })
    expect(prior.records[0].quantities.repetitions).toMatchObject({ kind: 'bounded', min: 2, max: 3 })
    expect(corrected.records[0]).not.toHaveProperty('estimatedOneRepMax')
  })

  it('keeps recorded workout RPE at session scope with independent provenance through correction', () => {
    const input = workSnapshot()
    input.workouts[0].rpe = 8
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: {
      rpe: { origin: 'athlete_reported', reviewState: 'athlete_confirmed' }
    } }
    const prior = buildPerformedWorkContext(input)
    expect(prior.records[0].sessionEffort).toEqual({ scale: 'RPE', scope: 'session', sourcePath: 'rpe',
      value: 8, recordedValue: 8, status: 'recorded', origin: 'athlete_reported', reviewState: 'athlete_confirmed' })
    expect(prior.records[0].effort).toEqual({ scale: 'RPE', scope: 'hardest_set', value: 7 })
    input.workouts[0].rpe = 6
    input.workouts[0].capture_revision = 2
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: {
      rpe: { origin: 'athlete_reported', reviewState: 'corrected' }
    } }
    expect(buildPerformedWorkContext(input).records[0]).toMatchObject({ revision: 2,
      sessionEffort: { value: 6, scope: 'session', reviewState: 'corrected' },
      effort: { scale: 'RPE', scope: 'hardest_set', value: 7 } })
    expect(prior.records[0].sessionEffort.value).toBe(8)
  })

  it.each([undefined, null, '8', 0, 11])('preserves unknown or invalid workout effort without assigning it to a movement: %s', rpe => {
    const input = workSnapshot()
    input.workouts[0].rpe = rpe
    input.workouts[0].capture_provenance = { schemaVersion: 1, fields: {
      blocks: { origin: 'athlete_reported', reviewState: 'athlete_confirmed' }
    } }
    input.workouts[0].blocks = [{ movements: [{ name: 'Barbell floor press', reps: 3 }] }]
    const record = buildPerformedWorkContext(input).records[0]
    expect(record.effort).toBeNull()
    expect(record.sessionEffort).toMatchObject({ scope: 'session', value: null, recordedValue: rpe ?? null,
      status: rpe == null ? 'unknown' : 'invalid', origin: 'legacy_unknown', reviewState: 'unreviewed' })
  })

  it('excludes unconfirmed prescriptions and unreviewed imports rather than calling them performed', () => {
    const input = workSnapshot()
    input.workouts[0].blocks = [{ exercises: [{ movementId: 'barbell_floor_press', dose: { kind: 'sets_reps', sets: { min: 4, max: 4 }, repetitions: { min: 2, max: 2 } } }] }]
    const prescription = buildPerformedWorkContext(input)
    expect(prescription.records).toEqual([])
    expect(prescription.coverage.omitted[0].reason).toBe('prescription_execution_unconfirmed')
    const imported = workSnapshot()
    imported.workouts[0].capture_provenance = captureProvenance('workout', 'imported_unverified')
    expect(buildPerformedWorkContext(imported).coverage.omitted[0].reason).toBe('unreviewed_template_or_import')
  })

  it('retains estimated provenance and explicit noncompletion without promoting either', () => {
    const input = workSnapshot()
    input.workouts[0].capture_provenance = captureProvenance('workout', 'model_estimated', 'athlete_confirmed')
    input.workouts[0].blocks = [{ movements: [{ name: 'Barbell floor press', sets: 2, reps: 5, completed: false }] }]
    expect(buildPerformedWorkContext(input).records[0]).toMatchObject({ basis: 'estimated_work',
      origin: 'model_estimated', completionState: 'explicitly_not_completed' })
  })

  it('preserves conflicting load and literal weight fields without choosing one', () => {
    const input = workSnapshot()
    input.workouts[0].blocks = [{ movements: [{ name: 'Barbell floor press', load: 80, unit: 'kg', weight: '175 lb' }] }]
    const record = buildPerformedWorkContext(input).records[0]
    expect(record.quantities.load).toMatchObject({ kind: 'exact', value: 80 })
    expect(record.recordedWeight?.value).toBe('175 lb')
    expect(record.quantities.sets.kind).toBe('unknown')
  })

  it('does not resurrect deleted canonical work from an older snapshot', () => {
    const input = workSnapshot()
    input.workouts = []
    expect(buildPerformedWorkContext(input).status).toBe('no_records')
    expect(buildPerformedWorkContext(input).coverage.athleteCoverage).toBe('unknown')
  })

  it('retains current-versus-historical source lineage through the shared resolver', () => {
    const input = workSnapshot()
    input.mode = 'historical_replay'
    input.revisions = [{ id: 'snapshot-1', user_id: input.userId, entity_kind: 'workout', original_entity_id: 'work-1',
      revision: 1, record: structuredClone(input.workouts[0]), provenance: input.workouts[0].capture_provenance,
      captured_at: '2026-09-18T12:00:00Z', event_at: '2026-09-18T12:00:00Z', deleted: false }]
    expect(buildPerformedWorkContext(input).records[0].snapshotId).toBe('snapshot-1')
    input.revisions[0].deleted = true
    expect(buildPerformedWorkContext(input).records).toEqual([])
  })

  it('marks a whole oversized record omitted rather than clipping its fields', () => {
    const input = workSnapshot()
    input.workouts[0].blocks = [{ movements: [{ name: 'Barbell floor press', protocol: 'x'.repeat(20_000) }] }]
    const context = buildPerformedWorkContext(input)
    expect(context.records).toEqual([])
    expect(context.status).toBe('partial')
    expect(context.coverage.omitted[0].reason).toBe('record_budget')
  })

  it('distinguishes retrieval failures and truncation from absent logged work', () => {
    const input = workSnapshot()
    input.complete = false
    expect(buildPerformedWorkContext(input).status).toBe('partial')
    input.available = false
    expect(buildPerformedWorkContext(input).status).toBe('unavailable')
  })

  it('rejects foreign source owners and foreign prompt packets', () => {
    const input = workSnapshot()
    input.workouts[0].user_id = 'other'
    expect(() => buildPerformedWorkContext(input)).toThrow('ownership mismatch')
    expect(() => renderPerformedWorkContext(buildPerformedWorkContext(workSnapshot()), 'other')).toThrow('ownership mismatch')
  })
})

describe('performed-work retrieval gate and trusted scope', () => {
  it('deliberately retrieves older work while passive reads retain the 28-day window', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    const row = workSnapshot().workouts[0]
    Object.assign(row, { workout_date: '2026-08-01', created_at: '2026-08-01T12:00:00Z',
      updated_at: '2026-08-01T12:00:00Z', captured_at: '2026-08-01T12:00:00Z', rpe: 8 })
    const { client, calls } = clientFixture([row])
    const options = { includeCoachContext: true, agentTzOffset: -300, asOf: workSnapshot().asOf }
    const passive = await fetchPerformedWorkContextForCoaching(client, 'athlete', options)
    const deliberate = await fetchPerformedWorkContextForCoaching(client, 'athlete', { ...options, windowDays: 60 })
    expect(passive?.window).toEqual({ startsOn: '2026-08-24', endsOn: '2026-09-20' })
    expect(passive?.records).toEqual([])
    expect(deliberate?.window).toEqual({ startsOn: '2026-07-23', endsOn: '2026-09-20' })
    expect(deliberate?.records[0]).toMatchObject({ date: '2026-08-01', sessionEffort: { value: 8, scope: 'session' } })
    expect(calls).toContainEqual({ table: 'workouts', method: 'gte', args: ['workout_date', '2026-07-23'] })
    expect(calls.filter(call => call.table === 'workouts' && call.method === 'select').every(call => String(call.args[0]).split(',').includes('rpe'))).toBe(true)
    expect(calls.filter(call => call.method === 'eq' && call.args[0] === 'user_id').every(call => call.args[1] === 'athlete')).toBe(true)
  })

  it.each([0, -1, 181, 28.5, Number.NaN])('rejects invalid requested history windows before reading: %s', async windowDays => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    const { client, from } = clientFixture([])
    await expect(fetchPerformedWorkContextForCoaching(client, 'athlete', {
      includeCoachContext: true, agentTzOffset: 0, asOf: workSnapshot().asOf, windowDays
    })).rejects.toThrow('between 1 and 180')
    await expect(fetchPlanningHistorySnapshot(client, 'athlete', { startDate: '2026-09-21', windowDays })).rejects.toThrow('between 1 and 180')
    expect(from).not.toHaveBeenCalled()
  })

  it('keeps bounded long-window retrieval visibly incomplete and rejects an absent owner', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...workSnapshot().workouts[0], id: `work-${index}` }))
    const { client } = clientFixture(rows)
    const context = await fetchPerformedWorkContextForCoaching(client, 'athlete', {
      includeCoachContext: true, agentTzOffset: -300, asOf: workSnapshot().asOf, windowDays: 180
    })
    expect(context?.status).toBe('partial')
    expect(context?.coverage.retrievalComplete).toBe(false)
    expect(context?.coverage.missing).toContain('retrieval_incomplete')
    const empty = clientFixture([])
    await expect(fetchPlanningHistorySnapshot(empty.client, '', { startDate: '2026-09-21' })).rejects.toThrow('owner')
    expect(empty.from).not.toHaveBeenCalled()
  })

  it('does no extra reads when history capability or programming context is disabled', async () => {
    const { client, from } = clientFixture([])
    const options = { includeCoachContext: true, agentTzOffset: -300, asOf: workSnapshot().asOf }
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false')
    expect(await fetchPerformedWorkContextForCoaching(client, 'athlete', options)).toBeUndefined()
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    expect(await fetchPerformedWorkContextForCoaching(client, 'athlete', { ...options, includeCoachContext: false })).toBeUndefined()
    expect(from).not.toHaveBeenCalled()
  })

  it('retrieves the owned athlete-local window using the existing canonical reader', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    const { client, calls } = clientFixture(workSnapshot().workouts)
    const context = await fetchPerformedWorkContextForCoaching(client, 'athlete', { includeCoachContext: true, agentTzOffset: -300, asOf: workSnapshot().asOf })
    expect(context?.window.endsOn).toBe('2026-09-20')
    expect(context?.records).toHaveLength(1)
    expect(calls.filter(call => call.method === 'eq' && call.args[0] === 'user_id').every(call => call.args[1] === 'athlete')).toBe(true)
    expect(calls).toContainEqual({ table: 'workouts', method: 'lte', args: ['created_at', workSnapshot().asOf] })
  })

  it('returns explicit unavailable context for query failures without leaking query text', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true')
    const { client } = clientFixture([], { code: '08006', message: 'private database message' })
    const context = await fetchPerformedWorkContextForCoaching(client, 'athlete', { includeCoachContext: true, agentTzOffset: 0, asOf: workSnapshot().asOf })
    expect(context?.status).toBe('unavailable')
    expect(JSON.stringify(context)).not.toContain('private database message')
  })
})
