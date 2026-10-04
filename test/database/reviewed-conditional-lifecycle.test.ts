/** Disposable SQL contract proof. Neither Supabase Auth nor coaching approval is simulated as evidence. */
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { conditionalRecoveryPlan } from '../fixtures/reviewed-conditional-recovery'
import { effortWorkPlan } from '../fixtures/reviewed-effort-work'
import { parseReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedC2rWeek } from '../fixtures/reviewed-c2r-week'
import { reconcileReviewedDoseWeek, readReviewedDoseWeekSummary } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reconcileReviewedExecution, type ReviewedExecutionSlot } from '@/app/lib/coach/reviewed-execution-continuity'
import { parseReviewedSession, reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'

describe.each(['conditional_recovery', 'c2r_load_trial', 'effort_work'] as const)('%s SQL lifecycle', variant => {
let db: PGlite
const owner = '00000000-0000-4000-8000-000000000001', foreign = '00000000-0000-4000-8000-000000000002'
const program = '00000000-0000-4000-8000-000000000010', baseId = '00000000-0000-4000-8000-000000000011'
const c2r = variant === 'c2r_load_trial' ? reviewedC2rWeek() : null
const original = c2r ? { plan: c2r.base, intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: c2r.base } } : reviewedRollingWeek()
const target = c2r?.target ?? (variant === 'effort_work' ? effortWorkPlan() : conditionalRecoveryPlan())
const appliedReviewed = [
  '20260928010000_reviewed_session_set_reports.sql', '20260928020000_reviewed_session_completion.sql',
  '20260928030000_reviewed_proposal_registration.sql', '20260928040000_reviewed_execution_slots.sql',
  '20260928050000_reviewed_next_week_transition.sql', '20260928060000_reviewed_registration_recovery.sql',
  '20260928070000_reviewed_session_request_resolution.sql', '20260928080000_reviewed_proposal_resolution.sql',
  '20260928090000_reviewed_qualitative_recovery.sql',
  '20260929010000_reviewed_effort_rir.sql',
]
async function actor(user = owner, role: 'authenticated' | 'service_role' = 'authenticated') {
  await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user])
}
async function scalar<T>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}
async function rejected(call: () => Promise<unknown>, code: string) {
  await db.exec('SAVEPOINT expected_rejection')
  try { await expect(call()).rejects.toMatchObject({ code }) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}

beforeAll(async () => {
  db = await databaseFixture()
  for (const file of ['coach-system-migration.sql', 'coach-plan-replacement-migration.sql', 'coach-complete-programming-v0-3-migration.sql',
    'coach-execution-feedback-migration.sql', 'layered-adaptive-evidence-migration.sql', 'atomic-coach-session-completion-migration.sql',
    'qwik-vbt-import-migration.sql', 'coach-trust-review-migration.sql', 'rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
  for (const file of ['20260730130953_coach_workout_runner_v0_5.sql', '20260904023000_fix_atomic_session_workout_link.sql',
    '20260904120000_logging_receipts.sql', '20260915220000_exercise_preferences.sql', '20260918010000_optional_session_feedback.sql',
    '20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
  await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
  for (const file of ['20260728134202_personal_record_idempotency.sql', '20260918020000_capture_receipts.sql', '20260918030000_training_intent.sql',
    '20260918040000_targeted_review_sources.sql', '20260921010000_coach_proposal_context_revision.sql',
    '20260926010000_coach_setup_memory_bindings.sql', ...appliedReviewed]) await db.exec(sqlFile(`supabase/migrations/${file}`))
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, foreign])
  await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
    VALUES($1,$2,'Mechanical lifecycle fixture','Not a coaching review',$3,$4,'draft','rolling_weekly')`,
  [program, owner, original.plan.windowStart, original.plan.windowEnd])
  await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,
    plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
    VALUES($1,$2,$3,1,'accepted',now(),'fixture','initial-dose-0.2.0','rolling_weekly',$4,$5,1,$6,'{}')`,
  [baseId, program, owner, original.plan.windowStart, original.plan.windowEnd, JSON.stringify(original.intent)])
  await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2", [baseId, program])
  for (const [i, slot] of original.plan.scheduledSessions.entries()) await db.query(`INSERT INTO prescribed_sessions
    (id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription) VALUES($1,$2,$3,$4,1,$5,$6,$7)`,
  [randomUUID(), baseId, program, owner, i + 1, slot.scheduledDate, JSON.stringify(slot.prescription)])
}, 30000)
beforeEach(async () => { await db.exec('BEGIN'); await actor() })
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
afterAll(async () => { await db?.close() })

async function register() {
  const revision = Number(await scalar('SELECT get_coach_context_revision() AS value'))
  // SQL-side source snapshot matches the actual current base, not a made-up digest.
  await db.exec('RESET ROLE')
  const base = await scalar<Record<string, unknown>>(`SELECT jsonb_build_object(
    'program',(SELECT to_jsonb(p) FROM (SELECT id,user_id,status,program_mode,active_plan_version_id FROM training_programs WHERE id=$1) p),
    'plan',(SELECT to_jsonb(p) FROM (SELECT id,user_id,program_id,status,plan_mode,intent,input_snapshot,
      window_start,window_end,sequence_number FROM training_plan_versions WHERE id=$2) p)) AS value`, [program, baseId])
  const slots = await scalar<ReviewedExecutionSlot[]>('SELECT reviewed_execution_source($1,$2,$3) AS value', [owner, program, baseId])
  const continuity = reconcileReviewedExecution({ userId: owner, programId: program, basePlanVersionId: baseId,
    baseSessions: original.plan.scheduledSessions, sourceSlots: slots, target })
  if (continuity.kind !== 'continuity') throw new Error(continuity.reasons.join('; '))
  expect(await scalar<number>('SELECT count(*)::integer AS value FROM coach_memories WHERE user_id=$1', [owner])).toBe(0)
  const setup = { schemaVersion: 1, memories: { primary_goal: null, training_schedule: null, available_equipment: null, training_constraints: null } }
  const clock = await scalar<{ day: string; validBefore: string }>(`SELECT jsonb_build_object(
    'day',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'),
    'validBefore',clock_timestamp()+interval '5 minutes') AS value`)
  const binding = { version: 'reviewed-dose-context-3', reviewedMovementCatalogVersion: 'reviewed-identities-0.1.0', userId: owner,
    scope: { programId: program, basePlanVersionId: baseId, historyThrough: clock.day, historyDays: 28, tzOffset: 0 },
    revision, base, memories: [], memoryStates: [], setup, executionSlots: slots }
  // This hand-built source exercises SQL contracts only; it does not replace the authenticated source reader.
  const contextHash = doseContentHash(binding), registrationId = randomUUID(), key = randomUUID()
  const dose = c2r ? reconcileReviewedDoseWeek({ owner, contextHash, basePlanVersionId: baseId, base: c2r.base, target, registration: c2r.reconciliation }) : null
  if (dose && dose.kind !== 'reconciled') throw new Error(dose.reasons.join('; '))
  const packet = { schemaVersion: 2, registrationId: 'mechanical-conditional-review', userId: owner,
    policyVersion: 'initial-dose-0.2.0', movementCatalogVersion: 'reviewed-identities-0.1.0',
    source: { contextHash, binding, validBefore: clock.validBefore },
    intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: target },
    inputSnapshot: { contextRevision: revision, setupMemoryBindings: setup, reviewedSourceHash: contextHash,
      reviewedRegistrationId: 'mechanical-conditional-review', reviewedMovementCatalogVersion: 'reviewed-identities-0.1.0',
      reviewedExecutionStorage: continuity.binding.storageContract, reviewedExecutionContinuity: continuity.binding,
      ...(dose?.kind === 'reconciled' ? { reviewedDoseReconciliation: dose.receipt } : {}) },
    sessions: target.scheduledSessions.map((slot, i) => ({ week_number: 1, session_index: i + 1,
      scheduled_date: slot.scheduledDate, prescription: slot.prescription })) }
  await actor(owner, 'service_role')
  const receipt = await scalar<{ registrationId: string; proposalId: string; planVersionId: string }>(
    'SELECT register_reviewed_week_proposal($1,$2,$3) AS value', [registrationId, JSON.stringify(packet), doseContentHash(packet)])
  await actor()
  return { ...receipt, key, packet }
}
const issue = (r: { registrationId: string; key: string }) => scalar<Record<string, unknown>>(
  'SELECT create_registered_reviewed_week_proposal($1,$2) AS value', [r.registrationId, r.key])
const accept = (r: { proposalId: string; key: string }) => scalar<Record<string, unknown>>(
  'SELECT accept_adaptation_proposal($1,$2) AS value', [r.proposalId, r.key])

describe('conditional recovery through the complete reviewed SQL migration chain', () => {
  it.runIf(variant === 'effort_work')('preserves independent RIR, skipped optional work, ownership and exact completion replay', async () => {
    const r = await register(); await issue(r); await accept(r)
    const sessionId = await scalar<string>('SELECT id AS value FROM coach_effective_prescribed_sessions WHERE plan_version_id=$1 AND session_index=1', [r.planVersionId])
    const saveSet = (key: string, value: unknown) => scalar<{ id: string; replayed: boolean }>(
      'SELECT to_jsonb(x) AS value FROM record_reviewed_session_set($1,$2,$3) x', [sessionId, key, JSON.stringify(value)])
    const first = { ...reviewedSetReport('required-work'), schemaVersion: 2, repetitions: 24, rir: 2.5,
      rpe: { value: 7, scale: 'rir_based' }, load: null }
    const saved = await saveSet('effort-original-set', first)
    expect(await saveSet('effort-original-set', first)).toEqual({ ...saved, replayed: true })
    const resolve = (operation: string, key: string, payload: unknown) => scalar<Record<string, unknown>>(
      'SELECT resolve_reviewed_session_request($1,$2,$3,$4) AS value', [sessionId, operation, key, JSON.stringify(payload)])
    expect(await resolve('set', 'effort-original-set', first)).toMatchObject({ disposition: 'saved', payload: first, result: { id: saved.id } })
    await rejected(() => resolve('set', 'effort-original-set', { ...first, rir: 4 }), '22023')
    expect(await resolve('set', 'effort-never-written', { ...first, setNumber: 2 })).toMatchObject({ disposition: 'no_write' })
    await rejected(() => saveSet('effort-never-written', { ...first, setNumber: 2 }), '55000')
    await actor(foreign)
    expect(await scalar<number>('SELECT count(*)::integer AS value FROM coach_reviewed_set_reports WHERE prescribed_session_id=$1', [sessionId])).toBe(0)
    await rejected(() => saveSet('foreign-effort-set', first), 'P0002')
    await actor()
    const correction = { ...first, revision: 2, rir: 1.5 }
    const corrected = await saveSet('effort-corrected-set', correction)
    const omitted = { ...first, activityId: 'optional-work', side: 'left', status: 'not_performed',
      repetitions: null, rir: null, rpe: null, restAfterSeconds: null }
    await rejected(() => saveSet('invalid-omitted-effort', { ...omitted, rir: 2 }), '22023')
    const skipped = await saveSet('effort-omitted-set', omitted)
    const reports = await db.query<{ report: unknown }>('SELECT report FROM coach_reviewed_set_reports WHERE prescribed_session_id=$1 ORDER BY created_at,id', [sessionId])
    expect(reports.rows.map(row => parseReviewedSetReport(row.report))).toEqual([first, correction, omitted])
    const request = reviewedCompletion([corrected.id, skipped.id])
    const complete = () => scalar<{ result: { workout_id: string; replayed: boolean } }>('SELECT complete_reviewed_session($1,$2,$3) AS value', [sessionId, 'effort-completion', JSON.stringify(request)])
    const completed = await complete(), replay = await complete()
    expect(replay.result).toEqual({ ...completed.result, replayed: true })
    expect(await resolve('complete', 'effort-completion', request)).toMatchObject({ disposition: 'saved', payload: request,
      result: { result: { workout_id: completed.result.workout_id, replayed: true } } })
    const blocks = await scalar<Array<{ block_type: string; movements: Array<{ setReportId: string; sets: number; completed: boolean; rir: number | null; effort: unknown; reps: number | null }> }>>('SELECT blocks AS value FROM workouts WHERE id=$1', [completed.result.workout_id])
    expect(blocks.every(block => block.block_type === 'STRENGTH')).toBe(true)
    const actuals = blocks.flatMap(block => block.movements)
    expect(actuals.find(set => set.setReportId === corrected.id)).toMatchObject({ reps: 24, rir: 1.5, effort: first.rpe, sets: 1, completed: true })
    expect(actuals.find(set => set.setReportId === skipped.id)).toMatchObject({ reps: null, rir: null, effort: null, sets: 0, completed: false })
    expect(actuals.reduce((sum, set) => sum + set.sets, 0)).toBe(1)
    expect(await scalar<number>('SELECT count(*)::integer AS value FROM workouts')).toBe(1)
  })

  it.runIf(variant === 'effort_work')('keeps SQL/TypeScript RIR validity aligned and preserves the legacy report', async () => {
    await db.exec('RESET ROLE')
    const legacy = reviewedSetReport('required-work')
    for (const patch of [{}, { rir: null }, { schemaVersion: 2 }, { schemaVersion: 2, rir: null },
      { schemaVersion: 2, rir: 0 }, { schemaVersion: 2, rir: 2.5 }, { schemaVersion: 2, rir: -1 },
      { schemaVersion: '2', rir: 2 }, { schemaVersion: 2, rir: '2' }, { schemaVersion: 2, rir: 1001 }]) {
      const report = { ...legacy, ...patch }
      expect(await scalar<boolean>('SELECT valid_reviewed_set_report($1) AS value', [JSON.stringify(report)])).toBe(parseReviewedSetReport(report) !== null)
    }
  })

  it('issues, accepts, replays and reads the exact complete schema2 week without rewriting the base', async () => {
    const r = await register()
    expect(await issue(r)).toMatchObject({ proposalId: r.proposalId, planVersionId: r.planVersionId, replayed: false })
    expect(await issue(r)).toMatchObject({ proposalId: r.proposalId, replayed: true })
    await accept(r)
    await accept(r)
    expect(await scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1', [program])).toBe(r.planVersionId)
    const read = await scalar('SELECT intent->\'reviewed_week\' AS value FROM training_plan_versions WHERE id=$1', [r.planVersionId])
    expect(parseReviewedRollingWeek(read)).toEqual(target)
    if (c2r) {
      const receipt = await scalar("SELECT input_snapshot->'reviewedDoseReconciliation' AS value FROM training_plan_versions WHERE id=$1", [r.planVersionId])
      expect(receipt).toEqual(r.packet.inputSnapshot.reviewedDoseReconciliation)
      expect(readReviewedDoseWeekSummary(receipt, { owner, contextHash: r.packet.source.contextHash, basePlanVersionId: baseId, base: c2r.base, target }).proposed).toContain('170 lb total')
    }
    expect(await scalar('SELECT intent AS value FROM training_plan_versions WHERE id=$1', [baseId])).toEqual(original.intent)
    const sessions = await db.query<{ prescription: unknown }>('SELECT prescription FROM coach_effective_prescribed_sessions WHERE plan_version_id=$1 ORDER BY session_index', [r.planVersionId])
    expect(sessions.rows.map(row => parseReviewedSession(row.prescription))).toEqual(target.scheduledSessions.map(slot => slot.prescription))
    expect(await scalar<number>('SELECT count(*)::integer AS value FROM adaptation_proposals')).toBe(1)
    expect(await scalar<number>('SELECT count(*)::integer AS value FROM workouts')).toBe(0)
  })

  it('denies foreign recovery, issuance and acceptance while keeping owned recovery exact', async () => {
    const r = await register()
    await actor(foreign)
    expect(await scalar('SELECT get_reviewed_week_registration($1) AS value', [r.registrationId])).toBeNull()
    await rejected(() => issue(r), 'P0002')
    await actor(); await issue(r)
    await actor(foreign); await rejected(() => accept(r), 'P0002')
    await actor()
    expect(await scalar('SELECT get_reviewed_week_registration($1) AS value', [r.registrationId])).toMatchObject({ registrationId: r.registrationId, userId: owner })
  })

  it('rejects source drift before acceptance and retains the prior active week', async () => {
    const r = await register(); await issue(r)
    await db.exec('RESET ROLE')
    await db.query('UPDATE coach_context_revisions SET revision=revision+1 WHERE user_id=$1', [owner])
    await actor(); await rejected(() => accept(r), '40001')
    expect(await scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1', [program])).toBe(baseId)
    expect(await scalar('SELECT intent->\'reviewed_week\' AS value FROM training_plan_versions WHERE id=$1', [r.planVersionId])).toEqual(target)
  })

  it('retains schema2 snapshots through actual-set correction and completion replay', async () => {
    const r = await register(); await issue(r); await accept(r)
    const sessionId = await scalar<string>('SELECT id AS value FROM coach_effective_prescribed_sessions WHERE plan_version_id=$1 AND session_index=1', [r.planVersionId])
    const prep = reviewedSessionActivities(target.scheduledSessions[0].prescription.content)[0]
    const actual = { ...reviewedSetReport(prep.id), repetitions: null, durationSeconds: 180, load: null, rpe: null, restAfterSeconds: null }
    const saved = (await db.query<{ id: string }>('SELECT * FROM record_reviewed_session_set($1,$2,$3)', [sessionId, 'original-conditional-set', JSON.stringify(actual)])).rows[0]
    const correction = { ...actual, revision: 2, restAfterSeconds: 245 }
    const corrected = (await db.query<{ id: string }>('SELECT * FROM record_reviewed_session_set($1,$2,$3)', [sessionId, 'corrected-conditional-set', JSON.stringify(correction)])).rows[0]
    expect(saved.id).not.toBe(corrected.id)
    const request = reviewedCompletion([corrected.id])
    const first = await scalar<{ result: { workout_id: string; replayed: boolean } }>('SELECT complete_reviewed_session($1,$2,$3) AS value', [sessionId, 'conditional-completion', JSON.stringify(request)])
    const replay = await scalar<{ result: { workout_id: string; replayed: boolean } }>('SELECT complete_reviewed_session($1,$2,$3) AS value', [sessionId, 'conditional-completion', JSON.stringify(request)])
    expect(first.result.replayed).toBe(false)
    expect(replay.result).toMatchObject({ workout_id: first.result.workout_id, replayed: true })
    const rows = await db.query<{ report: { restAfterSeconds: number | null }; activity_snapshot: unknown }>('SELECT report,activity_snapshot FROM coach_reviewed_set_reports WHERE prescribed_session_id=$1 ORDER BY revision', [sessionId])
    expect(rows.rows.map(row => row.report.restAfterSeconds)).toEqual([null, 245])
    expect(rows.rows.every(row => doseContentHash(row.activity_snapshot) === doseContentHash(prep))).toBe(true)
    expect(await scalar<number>("SELECT blocks#>'{0,movements,0,restAfterSeconds}' AS value FROM workouts WHERE id=$1", [first.result.workout_id])).toBe(245)
    expect(await scalar<number>('SELECT count(*)::integer AS value FROM workouts')).toBe(1)
  })
})

})
