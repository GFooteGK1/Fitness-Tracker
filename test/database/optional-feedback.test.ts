import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'

let db: PGlite
let owner: string
let other: string
let sequence = 0
const at = '2026-09-17T12:00:00.000Z'
const work = { mode: 'as_prescribed', workoutDate: '2026-09-17', inputText: null, blocks: null, totalDurationMinutes: null }
function feedback(values: Record<string, unknown> = {}) {
  const fields = { sessionRpe: null, energy: null, pain: null, ...values }
  return { schemaVersion: 2, feedbackVersion: 2, outcome: 'as_planned', note: null, ...fields,
    provenance: Object.fromEntries(['sessionRpe', 'energy', 'pain'].map(key => [key,
      (fields as Record<string, unknown>)[key] == null
        ? { origin: 'unknown', reviewState: 'unreviewed' }
        : { origin: 'athlete_reported', reviewState: 'athlete_confirmed' }])) }
}
async function athlete(id = owner) {
  await db.exec('SET ROLE authenticated')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function session() {
  await db.exec('RESET ROLE')
  const id = randomUUID()
  sequence++
  await db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
    SELECT $1,plan_version_id,program_id,user_id,$2,$3,scheduled_date,prescription FROM prescribed_sessions
    WHERE id=current_setting('atomic_completion_test.session_as_prescribed')::uuid`,
  [id, 2 + Math.floor(sequence / 6), 1 + sequence % 6])
  await athlete()
  return id
}
async function complete(id: string, f = feedback(), key = `test-${id}`, performed: unknown = work, status = 'completed') {
  return (await db.query<Record<string, any>>('SELECT * FROM record_coach_session_result_v2($1,$2,$3,$4,$5,$6,$7)',
    [id, status, f, at, key, performed, []])).rows[0]
}
beforeAll(async () => {
  db = await databaseFixture()
  for (const file of ['coach-system-migration.sql', 'coach-plan-replacement-migration.sql',
    'coach-complete-programming-v0-3-migration.sql', 'coach-execution-feedback-migration.sql',
    'layered-adaptive-evidence-migration.sql', 'atomic-coach-session-completion-migration.sql',
    'qwik-vbt-import-migration.sql', 'coach-trust-review-migration.sql', 'rolling-weekly-coach-migration.sql']) {
    await db.exec(sqlFile(`docs/migrations/${file}`))
  }
  await db.exec(sqlFile('supabase/migrations/20260730130953_coach_workout_runner_v0_5.sql'))
  await db.exec(sqlFile('supabase/migrations/20260904023000_fix_atomic_session_workout_link.sql'))
  const migration = sqlFile('supabase/migrations/20260918010000_optional_session_feedback.sql')
  await db.exec(migration)
  await db.exec(migration)
  // Execute the original v1 verifier against the replacement RPC before new cases.
  await db.exec(sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql'))
  const setup = sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0]
    .replaceAll(', TRUE)', ', FALSE)')
  await db.exec(`${setup}\nCOMMIT;`)
  owner = (await db.query<{ id: string }>("SELECT current_setting('atomic_completion_test.user_1') id")).rows[0].id
  other = (await db.query<{ id: string }>("SELECT current_setting('atomic_completion_test.user_2') id")).rows[0].id
}, 30000)
afterAll(async () => { await db?.close() })

describe('optional feedback actual PostgreSQL transitions', () => {
  it('saves unknown feedback once without an observation and preserves canonical linkage', async () => {
    const id = await session()
    const result = await complete(id)
    expect(result.observation_group_ids).toEqual([])
    const replay = await complete(id)
    expect(replay.workout_id).toBe(result.workout_id)
    expect(replay.checkin_id).toBe(result.checkin_id)
    expect(replay.replayed).toBe(true)
    const saved = (await db.query<any>('SELECT responses FROM coach_checkins WHERE id=$1', [result.checkin_id])).rows[0].responses
    expect(saved.sessionRpe).toBeNull()
    expect(saved.pain).toBeNull()
    expect(saved.feedbackProvenance).toEqual({ checkinId: result.checkin_id, revision: 1 })
    expect((await db.query<any>('SELECT completed_workout_id FROM prescribed_sessions WHERE id=$1', [id])).rows[0].completed_workout_id).toBe(result.workout_id)
    await expect(complete(id, feedback({ pain: 'none' }))).rejects.toThrow('different data')
  })
  it('preserves explicit no pain and fractional RPE with exactly one source-bound observation', async () => {
    const id = await session()
    const result = await complete(id, feedback({ sessionRpe: 7.5, pain: 'none' }))
    expect(result.observation_group_ids).toHaveLength(1)
    const observation = (await db.query<any>(`SELECT g.metadata,v.value_numeric FROM performance_observation_groups g
      JOIN performance_observation_values v ON v.group_id=g.id WHERE g.id=$1`, [result.observation_group_ids[0]])).rows[0]
    expect(Number(observation.value_numeric)).toBe(7.5)
    expect(observation.metadata.feedbackProvenance).toMatchObject({ feedbackVersion: 2, checkinId: result.checkin_id, revision: 1, field: 'sessionRpe', origin: 'athlete_reported' })
    expect((await db.query<any>('SELECT rpe FROM workouts WHERE id=$1', [result.workout_id])).rows[0].rpe).toBeNull()
    await complete(id, feedback({ sessionRpe: 7.5, pain: 'none' }))
    expect((await db.query('SELECT id FROM performance_observation_groups WHERE prescribed_session_id=$1', [id])).rows).toHaveLength(1)
  })
  it('rejects invalid type, fake provenance, unknown versions and forged metadata before saving', async () => {
    const id = await session()
    for (const invalid of [feedback({ sessionRpe: '7' }), feedback({ energy: 2 }), feedback({ sessionRpe: 7.2 }),
      { ...feedback(), schemaVersion: 3 }, { ...feedback(), feedbackVersion: 1 },
      { ...feedback(), provenance: {} }, { ...feedback(), feedbackProvenance: { revision: 1 } }]) {
      await expect(complete(id, invalid as ReturnType<typeof feedback>)).rejects.toThrow()
    }
    expect((await db.query('SELECT id FROM coach_checkins WHERE prescribed_session_id=$1', [id])).rows).toHaveLength(0)
  })
  it('saves skipped and stopped work without manufacturing feedback', async () => {
    const skipped = await session()
    const f = { ...feedback(), outcome: 'skipped' }
    const result = await complete(skipped, f, `skip-${skipped}`, null, 'skipped')
    expect(result.workout_id).toBeNull()
    expect(result.observation_group_ids).toEqual([])
    const stopped = await session()
    const s = await complete(stopped, { ...feedback({ pain: 'concerning' }), outcome: 'stopped_early' }, `stop-${stopped}`,
      { ...work, mode: 'modified', inputText: 'Stopped after warm-up due to pain', blocks: [] })
    expect(s.observation_group_ids).toEqual([])
    expect(s.workout_id).toBeTruthy()
  })
  it('denies cross-owner IDs, anonymous RPC and stale accepted-plan sessions', async () => {
    const id = await session()
    await athlete(other)
    await expect(complete(id)).rejects.toThrow('not found')
    await db.exec('SET ROLE anon')
    await expect(complete(id)).rejects.toThrow('permission denied')
    await athlete()
    const stale = (await db.query<{ id: string }>("SELECT current_setting('atomic_completion_test.session_stale') id")).rows[0].id
    await expect(complete(stale)).rejects.toThrow('active plan changed')
  })

  it('rejects v2 downgrades through both reachable legacy SQL entrypoints', async () => {
    const id = await session()
    const mixed = { schemaVersion: 1, feedbackVersion: 2, outcome: 'as_planned', sessionRpe: 7, energy: 'okay', pain: 'none', note: null }
    await expect(db.query('SELECT * FROM record_coach_session_result($1,$2,$3,$4,$5)',
      [id, 'completed', mixed, at, 'legacy-downgrade-one'])).rejects.toThrow('schema version')
    await expect(db.query('SELECT finalize_program_workout($1,$2,$3,$4,$5,$6)',
      [id, randomUUID(), 0, mixed, at, 'legacy-downgrade-two'])).rejects.toThrow('response values')
    expect((await db.query('SELECT id FROM coach_checkins WHERE prescribed_session_id=$1', [id])).rows).toHaveLength(0)
  })


})
