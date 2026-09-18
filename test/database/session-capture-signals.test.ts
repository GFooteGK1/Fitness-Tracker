import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'

const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const program = '00000000-0000-4000-8000-000000000010'
const otherProgram = '00000000-0000-4000-8000-000000000020'
const plan = '00000000-0000-4000-8000-000000000011'
const oldPlan = '00000000-0000-4000-8000-000000000012'
const otherPlan = '00000000-0000-4000-8000-000000000021'
const session = '00000000-0000-4000-8000-000000000100'
const oldSession = '00000000-0000-4000-8000-000000000101'
const otherSession = '00000000-0000-4000-8000-000000000200'
const exercise = { movementId: 'barbell_back_squat', sets: 3, reps: { min: 5, max: 8 } }
const signal = { schemaVersion: 1, exerciseId: 'work:0', ratingScope: 'hardest_set', workStatus: 'as_planned' }
let db: PGlite

async function identity(id: string, role = 'authenticated') {
  await db.exec(`RESET ROLE; SET LOCAL ROLE ${role};`)
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id])
}

async function save(payload: Record<string, unknown> = signal, requestId = 'signal-request-1', sessionId = session) {
  return db.query<{ id: string; created_at: string; replayed: boolean }>(
    'SELECT * FROM public.record_coach_session_signal($1::uuid,$2::text,$3::jsonb)',
    [sessionId, requestId, JSON.stringify(payload)])
}

async function rejected(operation: () => Promise<unknown>, code: string, message?: string) {
  await db.exec('SAVEPOINT expected_failure')
  try { await expect(operation()).rejects.toMatchObject({ code, ...(message ? { message: expect.stringContaining(message) } : {}) }) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure') }
}

async function complete(outcome = 'as_planned', requestId = 'complete-request-1') {
  // Parent W1 migration supports legacy feedback and nullable v2 on the same
  // atomic envelope. This fixture exercises new feedback against the guard.
  const feedback = {
    schemaVersion: 2, feedbackVersion: 2, outcome,
    sessionRpe: null, energy: null, pain: null, note: null,
    provenance: {
      sessionRpe: { origin: 'unknown', reviewState: 'unreviewed' },
      energy: { origin: 'unknown', reviewState: 'unreviewed' },
      pain: { origin: 'unknown', reviewState: 'unreviewed' },
    },
  }
  const work = outcome === 'as_planned'
    ? { mode: 'as_prescribed', workoutDate: '2026-09-17', inputText: null, blocks: null, totalDurationMinutes: null }
    : { mode: 'modified', workoutDate: '2026-09-17', inputText: 'Reported five working repetitions', blocks: [{ exercises: [{ movementId: 'barbell_back_squat', reps: 5 }] }], totalDurationMinutes: null }
  return db.query<{ replayed: boolean; workout_id: string; observation_group_ids: string[] }>(
    `SELECT * FROM public.record_coach_session_result_v2($1::uuid,'completed',$2::jsonb,
      '2026-09-17T12:00:00Z'::timestamptz,$3::text,$4::jsonb,'[]'::jsonb)`,
    [session, JSON.stringify(feedback), requestId, JSON.stringify(work)])
}

describe('data-only session capture signals through the executable coach migration chain', () => {
  beforeAll(async () => {
    db = await databaseFixture()
    for (const file of [
      'coach-system-migration.sql', 'coach-plan-replacement-migration.sql',
      'coach-complete-programming-v0-3-migration.sql', 'coach-execution-feedback-migration.sql',
      'layered-adaptive-evidence-migration.sql', 'atomic-coach-session-completion-migration.sql',
      'qwik-vbt-import-migration.sql', 'coach-trust-review-migration.sql', 'rolling-weekly-coach-migration.sql',
    ]) await db.exec(sqlFile(`docs/migrations/${file}`))
    for (const file of [
      '20260730130953_coach_workout_runner_v0_5.sql',
      '20260904023000_fix_atomic_session_workout_link.sql',
      '20260904120000_logging_receipts.sql',
      '20260915220000_exercise_preferences.sql',
      '20260918010000_optional_session_feedback.sql',
      '20260918011000_session_capture_signals.sql',
    ]) {
      try { await db.exec(sqlFile(`supabase/migrations/${file}`)) }
      catch (error) { throw new Error(`Migration ${file}: ${String(error)}`) }
    }
    await db.exec(`INSERT INTO auth.users(id) VALUES ('${owner}'),('${other}');`)
    for (const [userId, programId, planId] of [[owner, program, plan], [other, otherProgram, otherPlan]]) {
      await db.query(`INSERT INTO public.training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
        VALUES ($1,$2,'Signal fixture','Capture explicit exercise report','2026-09-14','2026-09-20','draft','rolling_weekly')`, [programId, userId])
      await db.query(`INSERT INTO public.training_plan_versions(id,program_id,user_id,version,status,reference_version,
        policy_version,intent,input_snapshot,accepted_at,plan_mode,window_start,window_end)
        VALUES ($1,$2,$3,1,'accepted','fixture','fixture','{"horizon_weeks":1}','{}',now(),'rolling_weekly','2026-09-14','2026-09-20')`, [planId, programId, userId])
      await db.query("UPDATE public.training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2", [planId, programId])
    }
    await db.query(`INSERT INTO public.training_plan_versions(id,program_id,user_id,version,status,reference_version,
      policy_version,intent,input_snapshot,accepted_at,plan_mode,window_start,window_end)
      VALUES ($1,$2,$3,2,'superseded','fixture','fixture','{"horizon_weeks":1}','{}',now(),'rolling_weekly','2026-09-07','2026-09-13')`, [oldPlan, program, owner])
    const prescription = { domain: 'strength', title: 'Explicit exercise report', intent: 'Practice', dose: {}, effort: 'controlled', rest: 'full', success_condition: 'quality', stop_condition: 'pain', scale_options: [], evidence: {}, blocks: [{ id: 'work', exercises: [exercise] }] }
    for (const [sessionId, planId, programId, userId] of [[session, plan, program, owner], [oldSession, oldPlan, program, owner], [otherSession, otherPlan, otherProgram, other]]) {
      await db.query(`INSERT INTO public.prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
        VALUES($1,$2,$3,$4,1,1,'2026-09-17',$5::jsonb)`, [sessionId, planId, programId, userId, JSON.stringify(prescription)])
    }
  }, 30000)
  beforeEach(async () => { await db.exec('BEGIN'); await identity(owner) })
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await db?.close() })

  it('derives an immutable accepted exercise snapshot and does not infer missing fields or create observations', async () => {
    const result = await save({ ...signal, rpe: 8.5, rpeScale: 'rir_based' })
    expect(result.rows[0].replayed).toBe(false)
    const rows = await db.query<{ signal: Record<string, unknown>; prescription_snapshot: unknown; policy_version: string }>('SELECT signal,prescription_snapshot,policy_version FROM public.coach_session_signals')
    expect(rows.rows[0]).toEqual({ signal: { ...signal, rpe: 8.5, rpeScale: 'rir_based' }, prescription_snapshot: exercise, policy_version: 'session-capture-1' })
    expect(rows.rows[0].signal).not.toHaveProperty('stop')
    expect(rows.rows[0].signal).not.toHaveProperty('sessionRpe')
    expect((await db.query('SELECT id FROM public.performance_observation_groups')).rows).toHaveLength(0)
    expect((await db.query('SELECT id FROM public.workouts')).rows).toHaveLength(0)
    expect((await db.query('SELECT status FROM public.prescribed_sessions WHERE id=$1', [session])).rows[0]).toEqual({ status: 'planned' })
  })

  it('enforces authenticated read-only access, FORCE RLS, and cross-owner RPC denial', async () => {
    await save()
    await rejected(() => db.query("INSERT INTO public.coach_session_signals(user_id) VALUES ($1)", [owner]), '42501')
    await rejected(() => db.exec("UPDATE public.coach_session_signals SET policy_version='forged'"), '42501')
    await rejected(() => db.exec('DELETE FROM public.coach_session_signals'), '42501')
    await identity(other)
    expect((await db.query('SELECT * FROM public.coach_session_signals')).rows).toHaveLength(0)
    await rejected(() => save(), 'P0002')
    await identity('', 'anon')
    await rejected(() => save(), '42501')
    await identity('', 'authenticated')
    await rejected(() => save(), '28000')
    await db.exec('RESET ROLE')
    expect((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.coach_session_signals'::regclass")).rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
    expect((await db.query("SELECT proconfig FROM pg_proc WHERE oid='public.record_coach_session_signal(uuid,text,jsonb)'::regprocedure")).rows[0]).toEqual({ proconfig: ['search_path=""'] })
  })

  it('rejects cross-owner and inconsistent program/plan references even for privileged inserts', async () => {
    await db.exec('RESET ROLE')
    for (const [userId, programId, planId] of [[other, program, plan], [owner, otherProgram, plan], [owner, program, otherPlan]]) {
      await rejected(() => db.query(`INSERT INTO public.coach_session_signals(user_id,prescribed_session_id,program_id,plan_version_id,
        request_id,signal,prescription_snapshot,policy_version) VALUES ($1,$2,$3,$4,'bad-owner-key',$5,'{}','session-capture-1')`,
      [userId, session, programId, planId, JSON.stringify(signal)]), '23503')
    }
  })

  it('removes inherited service-role table and function access', async () => {
    await identity(owner, 'service_role')
    await rejected(() => save(), '42501')
    await rejected(() => db.exec('SELECT * FROM public.coach_session_signals'), '42501')
    await rejected(() => db.exec('DELETE FROM public.coach_session_signals'), '42501')
    await db.exec('RESET ROLE')
    const permissions = await db.query(`SELECT
      has_function_privilege('service_role','public.record_coach_session_signal(uuid,text,jsonb)','EXECUTE') AS signal,
      has_function_privilege('service_role','public.guard_coach_signal_completion()','EXECUTE') AS guard,
      has_table_privilege('service_role','public.coach_session_signals','INSERT') AS insert`)
    expect(permissions.rows[0]).toEqual({ signal: false, guard: false, insert: false })
  })

  it('replays exactly after terminal completion and rejects changed payload or session reuse', async () => {
    const first = await save()
    const completion = await complete()
    expect(completion.rows[0].observation_group_ids).toEqual([])
    expect((await save()).rows[0]).toEqual({ ...first.rows[0], replayed: true })
    expect((await complete()).rows[0].replayed).toBe(true)
    await rejected(() => save({ ...signal, stop: false }), '22023')
    await rejected(() => save(signal, 'signal-request-1', oldSession), '22023')
    await rejected(() => save(signal, 'new-terminal-key'), '55000')
    expect((await db.query('SELECT id FROM public.workouts')).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM public.coach_session_signals')).rows).toHaveLength(1)
  })

  it('keeps exact replay available after a plan change while rejecting new stale-plan signals', async () => {
    const first = await save()
    await db.exec('RESET ROLE')
    await db.query("UPDATE public.training_programs SET active_plan_version_id=$1 WHERE id=$2", [oldPlan, program])
    await identity(owner)
    expect((await save()).rows[0]).toEqual({ ...first.rows[0], replayed: true })
    await rejected(() => save(signal, 'new-stale-key'), '40001')
    await rejected(() => save(signal, 'new-unaccepted-key', oldSession), '40001')
  })

  it.each([
    { actualReps: 5 }, { actualLoad: 40, actualLoadUnit: 'kg' }, { completedWorkingSets: 2 },
    { actualDurationMinutes: 12 }, { actualRestSeconds: 90 }, { workStatus: 'changed' }, { stop: true },
  ])('blocks as-prescribed completion after actual/deviation report %j and rolls back canonical side effects', async extra => {
    await save({ ...signal, ...extra })
    await rejected(() => complete(), '22023', 'Exercise reports require actual-work details')
    expect((await db.query('SELECT id FROM public.workouts')).rows).toHaveLength(0)
    expect((await db.query('SELECT id FROM public.coach_checkins')).rows).toHaveLength(0)
    const completion = await complete(extra.stop ? 'stopped_early' : 'modified')
    expect(completion.rows[0].workout_id).toBeTruthy()
    expect(completion.rows[0].observation_group_ids).toEqual([])
    expect((await save({ ...signal, ...extra })).rows[0].replayed).toBe(true)
  })

  it('allows scoped effort and explicit no-stop without forcing modified work or session RPE', async () => {
    await save({ ...signal, ratingScope: 'effort', rpe: 6.75, rpeScale: 'effort_0_10', stop: false })
    const result = await complete()
    expect(result.rows[0].observation_group_ids).toEqual([])
  })

  it.each([
    { fit: 'too_easy' }, { confidence: 'confident' }, { requestedLoad: 100 }, { requestProgression: true },
    { schemaVersion: '1' }, { schemaVersion: 2 }, { ratingScope: 'session' }, { workStatus: null },
    { actualReps: 1.5 }, { completedWorkingSets: 1.5 }, { actualReps: 1001 }, { completedWorkingSets: 101 },
    { actualLoad: 2001, actualLoadUnit: 'kg' }, { actualLoad: 40 }, { actualLoadUnit: 'lb' },
    { actualLoad: 40, actualLoadUnit: 'stones' }, { actualDurationMinutes: 1441 }, { actualRestSeconds: 3601 },
    { rpe: 11, rpeScale: 'effort_0_10' }, { rpe: -1, rpeScale: 'effort_0_10' }, { rpe: 7 }, { rpeScale: 'rir_based' },
    { rpe: '7', rpeScale: 'rir_based' }, { stop: null }, { stop: 'false' }, { note: 'x'.repeat(501) }, { note: null },
    { exerciseId: 'missing:0' }, { exerciseId: 'work:1' },
  ])('rejects malformed, unsupported, or policy-authoring fields %j', async extra => {
    await rejected(() => save({ ...signal, ...extra }), '22023')
    expect((await db.query('SELECT id FROM public.coach_session_signals')).rows).toHaveLength(0)
  })

  it('retains explicit zero actual amounts and zero RPE without turning absence into zero', async () => {
    await save({ ...signal, rpe: 0, rpeScale: 'effort_0_10', actualReps: 0, actualLoad: 0, actualLoadUnit: 'lb', completedWorkingSets: 0, actualDurationMinutes: 0, actualRestSeconds: 0 })
    const row = (await db.query<{ signal: Record<string, unknown> }>('SELECT signal FROM public.coach_session_signals')).rows[0]
    expect(row.signal.actualReps).toBe(0)
    expect(row.signal.rpe).toBe(0)
    expect(row.signal).not.toHaveProperty('stop')
  })

  it('supports account deletion through existing owned cascades', async () => {
    await save()
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM auth.users WHERE id=$1', [owner])
    expect((await db.query('SELECT id FROM public.coach_session_signals')).rows).toHaveLength(0)
    expect((await db.query('SELECT id FROM auth.users WHERE id=$1', [other])).rows).toHaveLength(1)
  })
})
