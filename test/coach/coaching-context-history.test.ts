import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoachingContext } from '@/app/lib/coach/coaching-context-server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { fetchPerformedWorkContextForCoaching } from '@/app/lib/coach/performed-work-context'
import { contextClient, contextOwner, contextRows } from '../fixtures/coaching-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

const now = '2026-10-19T00:13:53.447Z'
const params = () => new URLSearchParams({ days: '7', tzOffset: '300' })
function workout(id = 'logged-one', date = '2026-10-18') {
  return { ...structuredClone(workSnapshot().workouts[0]), id, user_id: contextOwner, workout_date: date,
    created_at: `${date}T10:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
    notes: 'private unselected narrative', input_text: 'private capture payload' }
}

describe('authenticated context workout evidence with planning history disabled', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false') })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('reads exactly seven inclusive local dates, preserving source facts and excluding narrative', async () => {
    const rows = contextRows()
    rows.workouts = [workout('before-window', '2026-10-11'), workout('first-day', '2026-10-12'),
      workout(), workout('next-local-day', '2026-10-19')]
    const saved = structuredClone(rows)
    const { db, writes, traces } = contextClient(rows)
    const result = await readCoachingContext(db, params())
    expect(result).toMatchObject({ localDate: '2026-10-18', historyDays: 7,
      performedWork: { authority: 'factual_context_only', numericPolicyEligible: false, asOf: now,
        window: { startsOn: '2026-10-12', endsOn: '2026-10-18' }, status: 'available',
        coverage: { complete: true, athleteCoverage: 'unknown' } } })
    expect(result.performedWork?.records.map(row => row.workoutId).sort()).toEqual(['first-day', 'logged-one'])
    expect(result.performedWork?.records[0]).toMatchObject({ date: '2026-10-18', revision: 1,
      sourcePath: 'blocks[0].movements[0]', origin: 'athlete_reported', reviewState: 'athlete_confirmed',
      recordedName: 'Barbell floor press', recordedWeight: { value: '175 lb' },
      quantities: { sets: { kind: 'exact', value: 4 }, repetitions: { kind: 'bounded', min: 2, max: 3 } } })
    expect(JSON.stringify(result)).not.toContain('private unselected narrative')
    expect(JSON.stringify(result)).not.toContain('private capture payload')
    expect(rows).toEqual(saved)
    expect(writes).not.toHaveBeenCalled()
    expect(traces.filter(trace => ['workouts', 'coach_checkins'].includes(trace.table)).every(trace =>
      trace.filters.some(([key, value]) => key === 'user_id' && value === contextOwner))).toBe(true)
    expect(result.acceptedProgramming?.plan).toMatchObject({ id: 'accepted-one' })
    expect(result.acceptedProgramming?.todaySessions[0].prescription).toEqual(saved.prescribed_sessions[0].prescription)
    expect(personalizedCoachingCapabilities().historyContext).toBe(false)
    expect(await fetchPerformedWorkContextForCoaching(db, contextOwner, {
      includeCoachContext: true, agentTzOffset: -300, asOf: now,
    })).toBeUndefined()
  })

  it('excludes sources created after the read cutoff and marks post-cutoff amendments partial', async () => {
    const rows = contextRows()
    rows.workouts = [{ ...workout('late-created'), created_at: '2026-10-19T00:14:00.000Z' },
      { ...workout('late-amendment'), updated_at: '2026-10-19T00:14:00.000Z' }]
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.performedWork?.records).toEqual([])
    expect(result.performedWork?.coverage.complete).toBe(false)
    expect(result.gaps).toContain('performed_work_incomplete_or_unavailable')
  })

  it.each(['workouts', 'coach_checkins'])('reports an unavailable %s source instead of empty training history', async table => {
    const { db, writes } = contextClient(undefined, { failTable: table })
    const result = await readCoachingContext(db, params())
    expect(result.performedWork).toMatchObject({ status: 'unavailable', coverage: { complete: false, retrievalComplete: false } })
    expect(result.performedWork?.coverage.missing).toContain('history_unavailable')
    expect(result.gaps).toContain('performed_work_incomplete_or_unavailable')
    expect(JSON.stringify(result)).not.toContain('private provider detail')
    expect(writes).not.toHaveBeenCalled()
  })

  it('reports an empty owned source with unknown athlete logging coverage', async () => {
    const result = await readCoachingContext(contextClient().db, params())
    expect(result.performedWork).toMatchObject({ status: 'no_records', records: [],
      coverage: { complete: true, athleteCoverage: 'unknown', includedRecords: 0 } })
  })

  it.each(['workouts', 'coach_checkins'])('does not call an empty result complete when %s exact counts are missing', async table => {
    const result = await readCoachingContext(contextClient(undefined, { unknownCountTable: table }).db, params())
    expect(result.performedWork).toMatchObject({ status: 'partial', records: [], coverage: { complete: false, retrievalComplete: false } })
    expect(result.performedWork?.coverage.missing).toContain('retrieval_incomplete')
  })

  it('reports source caps and projection omissions instead of claiming complete history', async () => {
    const rows = contextRows(); rows.workouts = Array.from({ length: 101 }, (_, i) => workout(`work-${i}`))
    const { db, writes, traces } = contextClient(rows)
    const result = await readCoachingContext(db, params())
    expect(result.performedWork).toMatchObject({ status: 'partial', coverage: { complete: false, retrievalComplete: false } })
    expect(result.performedWork?.coverage.missing).toContain('retrieval_incomplete')
    expect(result.performedWork?.coverage.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'record_budget' })]))
    expect(traces.filter(trace => trace.table === 'workouts').every(trace => trace.limit === 101)).toBe(true)
    expect(writes).not.toHaveBeenCalled()
  })

  it.each(['workouts', 'coach_checkins'])('rejects foreign %s rows if the adapter ignores owner filters', async table => {
    const rows = contextRows()
    rows[table] = table === 'workouts' ? [{ ...workout(), user_id: 'foreign-owner' }]
      : [{ id: 'foreign-completion', user_id: 'foreign-owner', occurred_at: '2026-10-18T10:00:00Z', created_at: '2026-10-18T10:00:00Z', responses: {} }]
    const { db, writes } = contextClient(rows, { foreignRows: true })
    await expect(readCoachingContext(db, params())).rejects.toMatchObject({ status: 503, message: 'Coaching context is unavailable' })
    expect(writes).not.toHaveBeenCalled()
  })

  it.each(['workouts', 'coach_checkins'])('rejects concurrent changes to %s even without a coach revision change', async table => {
    const rows = contextRows(); rows.workouts = [workout()]
    const { db, writes } = contextClient(rows, { onRead: (name, read) => {
      if (name === table && read === 2) {
        if (table === 'workouts') rows.workouts[0].rpe = 8
        else rows.coach_checkins.push({ id: 'new-completion', user_id: contextOwner,
          occurred_at: '2026-10-18T10:00:00Z', created_at: '2026-10-18T10:00:00Z', responses: {} })
      }
    } })
    await expect(readCoachingContext(db, params())).rejects.toMatchObject({ status: 409 })
    expect(rows.coach_context_revisions[0].revision).toBe(3)
    expect(writes).not.toHaveBeenCalled()
  })

  it('does not promote in-progress work or unconfirmed prescriptions into performed facts', async () => {
    const rows = contextRows()
    rows.workouts = [{ ...workout('in-progress'), execution_status: 'in_progress' },
      { ...workout('prescription-only'), blocks: [{ exercises: [{ movementId: 'barbell-floor-press', sets: 4, reps: 3 }] }] }]
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.performedWork?.records).toEqual([])
    expect(result.performedWork?.coverage.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'prescription_execution_unconfirmed' }),
    ]))
    expect(result.performedWork?.coverage.complete).toBe(false)
  })
})
