import { describe, expect, it } from 'vitest'
import { evaluateRecommendationOutcome } from '@/app/lib/recommendations/outcomes'
import { baselineGroup, database, ok, OWNER, stored } from './fixtures'

describe('recommendation follow-up attribution', () => {
  it('keeps Done as reported adherence with its own event, without creating or claiming execution', async () => {
    const { db, calls } = database({ performance_observation_groups: [ok([])], recommendation_events: [ok([{ id: 'event-1', payload: { response: 'done_reported' } }])] })
    const result = await evaluateRecommendationOutcome(db, OWNER, stored())
    expect(result).toMatchObject({ adherence: 'reported', evidence: [{ table: 'recommendation_events', id: 'event-1', revision: null }] })
    expect(result.summary).toContain('No later comparable measurement'); expect(result.attributionLimits).toContain('Self-report does not establish observed execution or a benefit.')
    expect(calls.find(c => c.table === 'recommendation_events')!.operations).toEqual(expect.arrayContaining([['eq', 'user_id', OWNER], ['eq', 'recommendation_id', stored().id], ['eq', 'event_type', 'response']]))
    expect(calls.every(c => c.operations.every(([method]) => !['insert', 'update', 'upsert'].includes(method)))).toBe(true)
  })
  it('records missing follow-up as unknown, not nonadherence or benefit', async () => {
    const { db } = database({ recommendation_events: [ok([])], performance_observation_groups: [ok([])] })
    expect(await evaluateRecommendationOutcome(db, OWNER, stored())).toMatchObject({ adherence: 'unknown', evidence: [] })
  })
  it('requires full protocol, distance and ownership binding for an observed measurement', async () => {
    for (const change of [{ verified_by: 'other' }, { protocol_version: 'future' }, { comparison_modifiers: { ...baselineGroup().comparison_modifiers, distance: { value: 1609, unit: 'm' } } }]) {
      const { db } = database({ recommendation_events: [ok([])], performance_observation_groups: [ok([{ ...baselineGroup(), ...change }])] })
      expect((await evaluateRecommendationOutcome(db, OWNER, stored())).adherence).toBe('unknown')
    }
    const { db, calls } = database({ recommendation_events: [ok([])], performance_observation_groups: [ok([baselineGroup()])], performance_observation_values: [ok([{ id: 'value-1', value_numeric: 1200 }])] })
    const result = await evaluateRecommendationOutcome(db, OWNER, stored())
    expect(result.adherence).toBe('observed'); expect(result.summary).toContain('No improvement or causal benefit is inferred')
    for (const query of calls) expect(query.operations).toContainEqual(['eq', 'user_id', OWNER])
    expect(calls[1].operations).toContainEqual(['eq', 'semantic_role', 'direct_outcome'])
    expect(calls[0].operations).toContainEqual(['lte', 'observed_at', stored().decision.outcome!.dueAt])
  })
  it.each([null, '', 'NaN', Infinity])('does not invent a valid measurement from %j', async value => {
    const { db } = database({ recommendation_events: [ok([])], performance_observation_groups: [ok([baselineGroup()])], performance_observation_values: [ok([{ id: 'value-1', value_numeric: value }])] })
    expect((await evaluateRecommendationOutcome(db, OWNER, stored())).adherence).toBe('unknown')
  })
  it('allows bounded follow-up for hidden superseded advice but not withdrawn advice', async () => {
    const row = stored(); row.lifecycle = 'superseded'
    const { db } = database({ recommendation_events: [ok([])], performance_observation_groups: [ok([baselineGroup()])], performance_observation_values: [ok([{ id: 'value-1', value_numeric: 1200 }])] })
    expect((await evaluateRecommendationOutcome(db, OWNER, row)).adherence).toBe('observed')
    row.lifecycle = 'withdrawn'; expect((await evaluateRecommendationOutcome(database({ recommendation_events: [ok([])],}).db, OWNER, row)).adherence).toBe('unknown')
  })
  it('throws on an outage or truncated retrieval instead of finalizing unknown', async () => {
    for (const result of [{ data: null, error: { code: 'timeout' } }, ok(Array.from({ length: 33 }, () => baselineGroup()))]) {
      await expect(evaluateRecommendationOutcome(database({ recommendation_events: [ok([])], performance_observation_groups: [result] }).db, OWNER, stored())).rejects.toThrow('unavailable or incomplete')
    }
  })
  it('observes unchanged linked completion within the deadline, excluding old/late/amended completion', async () => {
    const row = stored('session_completion')
    for (const [at, captureRevision, expected] of [['2026-09-17T19:00:00.000Z', 1, 'observed'], ['2026-09-17T17:00:00.000Z', 1, 'unknown'], ['2026-09-19T19:00:00.000Z', 1, 'unknown'], ['2026-09-17T19:00:00.000Z', 2, 'unknown']] as const) {
      const { db } = database({ recommendation_events: [ok([])], prescribed_sessions: [ok({ id: 'session-1', status: 'completed', completed_workout_id: 'workout-1', completed_at: at })], workouts: [ok({ id: 'workout-1', capture_revision: captureRevision, execution_revision: 0 })] })
      expect((await evaluateRecommendationOutcome(db, OWNER, row)).adherence).toBe(expected)
    }
  })
})
