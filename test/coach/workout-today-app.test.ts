import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureProvenance } from '../../app/lib/capture/contracts'
import { readCoachingContext } from '../../app/lib/coach/coaching-context-server'
import { createWorkoutTodayReader } from '../../app/lib/coach/workout-today-app'
import { recommendationScope } from '../../app/lib/recommendations/context'
import { contextClient, contextNow, contextOwner, contextRows, type ContextRows } from '../fixtures/coaching-context'
import { effortWorkSession } from '../fixtures/reviewed-effort-work'

const localDate = '2026-10-18'
const latest = '53f08a7a-021c-45bd-a79e-2e8111cc5143'
const older = 'e61a5142-f8dd-4708-92c4-326452fea83e'
const policy = { clientId: 'client', issuer: 'https://issuer.test', resource: 'https://socius.test/mcp' }

function workout(id: string, date: string, overrides: Record<string, unknown> = {}) {
  return {
    id, user_id: contextOwner, workout_date: date, execution_status: 'completed',
    created_at: `${date}T10:30:00.000Z`, updated_at: `${date}T11:00:00.000Z`,
    capture_revision: 2, capture_provenance: captureProvenance('workout', 'athlete_reported', 'corrected'), rpe: 8.5,
    blocks: [{ movements: [
      { name: 'Front squat', sets: 1, reps: 5, load: 155, unit: 'lb', effort: { scope: 'set', scale: 'RPE', value: 7 } },
      { name: 'Front squat', sets: 1, reps: 5, load: 155, unit: 'lb', effort: { scope: 'set', scale: 'RPE', value: 8 } },
      { name: 'Front squat', sets: 1, reps: 3, load: 175, unit: 'lb' },
    ] }],
    ...overrides,
  }
}

function activityTime(id: string, event_at: string, revision = 2) {
  return { user_id: contextOwner, entity_kind: 'workout', original_entity_id: id, revision, event_at,
    event_precision: 'timestamp', deleted: false, captured_at: `${localDate}T11:50:00.000Z` }
}

async function read(rows: ContextRows) {
  const fixture = contextClient(rows)
  // The fixture projects all seed revisions so the selector has to reject an
  // unrelated or superseded revision itself. Production also filters exact pairs.
  const from = fixture.db.from.bind(fixture.db)
  fixture.db.from = ((table: string) => {
    const query = from(table)
    return table === 'activity_revisions' ? Object.assign(query, { or: () => query }) : query
  }) as typeof fixture.db.from
  const context = await readCoachingContext(fixture.db, new URLSearchParams({ tzOffset: '0', days: '7' }))
  const readWorkout = createWorkoutTodayReader(async () => ({ db: fixture.db, principal: {
    ...policy, role: 'authenticated', subject: contextOwner, expiresAt: Date.now() + 60_000,
  } }), policy)
  const result = await readWorkout(context)
  expect(fixture.writes).not.toHaveBeenCalled()
  expect(fixture.traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === contextOwner))).toBe(true)
  return result
}

function addSavedTrainingRecommendation(rows: ContextRows) {
  vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true')
  const scope = recommendationScope(0)
  const now = {
    source_revision: 3, response_revision: 0, processed_source_revision: 3, processed_response_revision: 0,
    current_recommendation_id: 'saved-one', last_error: null, next_due_at: null,
    processed_context: { activePlanId: 'accepted-one', intentMemoryId: 'memory-training_intent', intentVersion: 1,
      runtimeFingerprint: scope.runtimeFingerprint, localDate: scope.localDate, timezoneOffset: scope.tzOffset },
  }
  rows.recommendation_refresh_state = [{ user_id: contextOwner, ...now }]
  rows.recommendations = [{ id: 'saved-one', user_id: contextOwner, local_date: localDate, timezone_offset: 0,
    plan_version_id: 'accepted-one', intent_memory_id: 'memory-training_intent', intent_version: 1,
    source_revision: 3, response_revision: 0, lifecycle: 'active', valid_until: `${localDate}T22:00:00.000Z`,
    runtime_fingerprint: scope.runtimeFingerprint, scope_key: 'review:weekly-review-one', evidence_fingerprint: 'first',
    rule_id: 'accepted_plan.review', policy_version: 'bounded-actions-1',
    decision: { schemaVersion: 1, kind: 'action', ruleId: 'accepted_plan.review', policyVersion: 'bounded-actions-1',
      sourceRevision: 3, responseRevision: 0, title: 'Review your plan before training',
      reason: 'Your saved weekly review calls for recovery.', destination: { type: 'review' } },
  }]
}

describe('Workout Today source projection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(contextNow))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('shows one latest completed workout and groups equal set doses without losing different reps, load or recorded effort', async () => {
    const rows = contextRows()
    rows.workouts = [workout(older, '2026-10-17', { blocks: [{ movements: [{ name: 'Not the latest movement', sets: 5, reps: 3 }] }] }),
      workout(latest, localDate), workout('skipped', localDate, { execution_status: 'skipped', created_at: contextNow })]
    rows.activity_revisions = [activityTime(latest, `${localDate}T10:00:00.000Z`)]
    const result = await read(rows)
    expect(result.lastWorkout).toEqual({ status: 'available', date: localDate, timing: 'exact', sessionRpe: 8.5,
      movements: [{ name: 'Front squat', measurements: ['2 sets × 5 reps at 155 lb · Set RPE 7, 8', '1 set × 3 reps at 175 lb'] }] })
    expect(JSON.stringify(result.lastWorkout)).not.toContain(latest)
    expect(result.workoutEvidence).toMatchObject({ workoutId: latest, revision: 2, performedAt: `${localDate}T10:00:00.000Z`, sessionRpe: 8.5,
      rpeOrigin: 'athlete_reported', rpeReviewState: 'corrected' })
    expect(result.workoutRecommendation).toMatchObject({ status: 'planned', source: 'accepted_plan', title: 'Saved easy session' })
  })

  it('uses occurrence time rather than capture ordering on the same day, but does not infer timing from a missing revision', async () => {
    const rows = contextRows()
    rows.workouts = [workout(older, localDate, { created_at: `${localDate}T11:10:00.000Z`, updated_at: `${localDate}T11:20:00.000Z` }),
      workout(latest, localDate)]
    rows.activity_revisions = [activityTime(older, `${localDate}T09:00:00.000Z`), activityTime(latest, `${localDate}T10:00:00.000Z`)]
    expect((await read(rows)).workoutEvidence?.workoutId).toBe(latest)
    rows.activity_revisions.pop()
    const result = await read(rows)
    expect(result.lastWorkout).toMatchObject({ status: 'partial', timing: 'same_day_order_unknown' })
    expect(result.workoutEvidence).toMatchObject({ workoutId: older, performedAt: null })
  })

  it('consolidates explicit repeated sets while preserving ambiguous rounds and per-side quantities', async () => {
    const rows = contextRows()
    rows.workouts = [workout(latest, localDate, { blocks: [{ block_type: 'STRENGTH', segments: [
      { rounds: 4, events: [{ movement_name: 'Step up', performed: { sets: [
        { reps_per_leg: 6, load: { value: 15, unit: 'lb' } }, { reps_per_leg: 6, load: { value: 15, unit: 'lb' } },
      ] } }, { movement_name: 'Air squat', performed: { reps: 6 } }] },
    ] }] })]
    const result = await read(rows)
    expect(result.lastWorkout.movements).toEqual([
      { name: 'Step up', measurements: ['2 sets × 6 reps per side at 15 lb'] },
      { name: 'Air squat', measurements: ['6 reps · 4 recorded rounds'] },
    ])
  })

  it('separates recorded warm-up from main work and groups the same movement across saved blocks', async () => {
    const rows = contextRows()
    rows.workouts = [workout(latest, localDate, { blocks: { blocks: [
      { title: 'Warm-up and quad isometrics', block_type: 'STRENGTH', segments: [{ events: [
        { movement_name: 'Bike', performed: { time_s: 120 } },
        { movement_name: 'Quad isometrics', performed: { sets: 2, time_s: 30 } },
        { movement_name: 'Wall sit, hold 1', performed: { time_s: 20 } },
        { movement_name: 'Wall sit, hold 2', performed: { time_s: 20 } },
        { movement_name: 'Wall sit, hold 3', performed: { time_s: 30 } },
      ] }] },
      { role: 'specific_preparation', segments: [{ events: [
        { movement_name: 'Bench press', performed: { sets: 1, reps: 5, load: { value: 65, unit: 'lb' } } },
      ] }] },
      { title: 'Bench press warm-up', block_type: 'STRENGTH', segments: [
        { events: [{ movement_name: 'Bench Press', performed: { sets: 1, reps: 5, load: { value: 155, unit: 'lb' } } }] },
        { events: [{ movement_name: 'Bench press', performed: { sets: 1, reps: 3, load: { value: 175, unit: 'lb' } } }] },
      ] },
      { block_type: 'STRENGTH', segments: [{ events: [
        { movement_name: 'bench  press', performed: { sets: 1, reps: 5, load: { value: 155, unit: 'lb' } } },
        { movement_name: 'Incline bench press', performed: { sets: 1, reps: 8 } },
      ] }] },
      { title: 'Conditioning after warm-up', block_type: 'CARDIO', segments: [{ events: [
        { movement_name: 'Bike', performed: { time_s: 300 } },
      ] }] },
    ] } })]

    expect((await read(rows)).lastWorkout.movements).toEqual([
      { name: 'Bike', phase: 'warmup', measurements: ['120 s'] },
      { name: 'Quad isometrics', phase: 'warmup', measurements: ['2 sets · 30 s'] },
      { name: 'Wall sit', phase: 'warmup', measurements: ['2 holds × 20 s', '1 hold × 30 s'] },
      { name: 'Bench press', phase: 'warmup', measurements: ['1 set × 5 reps at 65 lb'] },
      { name: 'Bench Press', measurements: ['2 sets × 5 reps at 155 lb', '1 set × 3 reps at 175 lb'] },
      { name: 'Incline bench press', measurements: ['1 set × 8 reps'] },
      { name: 'Bike', measurements: ['300 s'] },
    ])
  })

  it('keeps differently named reviewed movements separate when they share a broad catalog ID', async () => {
    const rows = contextRows()
    const movements = [
      { name: 'Acceleration runs', movementId: 'run', sets: 1, durationSeconds: 6, setReportId: 'acceleration' },
      { name: 'Upright sprints', movementId: 'run', sets: 1, durationSeconds: 10, setReportId: 'upright' },
    ]
    const blocks = [{ movements }]
    const setReportIds = movements.map(movement => movement.setReportId)
    const occurredAt = `${localDate}T10:30:00.000Z`
    rows.workouts = [workout(latest, localDate, { blocks, execution_source: 'program_runner', execution_revision: 0, capture_revision: 1 })]
    rows.coach_checkins = [{ id: 'reviewed-completion', user_id: contextOwner, prescribed_session_id: 'session-one',
      occurred_at: occurredAt, created_at: occurredAt, responses: { workoutId: latest, completionContractVersion: 3,
        resultStatus: 'completed', setReportIds, performedBlocks: blocks,
        completionRequest: { contractVersion: 3, status: 'completed', sessionId: 'session-one', occurredAt,
          workoutDate: localDate, setReportIds },
      },
    }]

    expect((await read(rows)).lastWorkout.movements).toEqual([
      { name: 'Acceleration runs', measurements: ['1 set · 6 s'] },
      { name: 'Upright sprints', measurements: ['1 set · 10 s'] },
    ])
  })

  it('uses the usable set-list alias without combining two representations of the same work', async () => {
    const rows = contextRows()
    const set = { reps: 6, load: { value: 25, unit: 'lb' } }
    rows.workouts = [workout(latest, localDate, { blocks: [{ block_type: 'STRENGTH', segments: [{ events: [
      { movement_name: 'Step up', performed: { sets: [], set_details: [set, set] } },
    ] }] }, { movements: [
      { name: 'Squat', sets: [null], set_details: [set, set] },
      { name: 'Press', sets: [set, set], set_details: [set, set] },
    ] }] })]
    expect((await read(rows)).lastWorkout.movements).toEqual([
      { name: 'Squat', measurements: ['2 sets × 6 reps at 25 lb'] },
      { name: 'Press', measurements: ['2 sets × 6 reps at 25 lb'] },
      { name: 'Step up', measurements: ['2 sets × 6 reps at 25 lb'] },
    ])
  })

  it('shows a current owned recommendation on an unscheduled day and falls back when it is stale or deferred', async () => {
    const rows = contextRows()
    rows.prescribed_sessions = []
    addSavedTrainingRecommendation(rows)
    expect((await read(rows)).workoutRecommendation).toMatchObject({
      status: 'recommended', source: 'saved_recommendation', title: 'Review your plan before training',
    })
    rows.recommendation_suppressions = [{ user_id: contextOwner, scope_key: 'review:weekly-review-one',
      evidence_fingerprint: 'an-older-revision', response: 'deferred', defer_until: `${localDate}T14:00:00.000Z` }]
    expect((await read(rows)).workoutRecommendation).toMatchObject({ status: 'unscheduled', source: 'accepted_plan', sessions: [] })
    rows.recommendation_suppressions = []
    rows.recommendation_refresh_state[0].source_revision = 4
    expect((await read(rows)).workoutRecommendation).toMatchObject({ status: 'unscheduled', source: 'accepted_plan', sessions: [] })
  })

  it('shows validated reviewed session movements and preserves optional work', async () => {
    const rows = contextRows()
    rows.prescribed_sessions[0].prescription = effortWorkSession()
    const { workoutRecommendation } = await read(rows)
    expect(workoutRecommendation).toMatchObject({ status: 'planned', source: 'accepted_plan' })
    expect(workoutRecommendation.sessions[0].details).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Working set: .*2 sets; repetitions to about 2 RIR/),
      expect.stringMatching(/^Optional: .*2 sets per side; repetitions to about 2 RIR/),
    ]))
  })
})
