/** Disposable SQL authority proof; no hosted data or human approval. */
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { databaseFixture, sqlFile } from './fixture'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkInput, effortWorkPlan } from '../fixtures/reviewed-effort-work'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import { reconcileReviewedExecution, type ReviewedExecutionSlot } from '@/app/lib/coach/reviewed-execution-continuity'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { SUPERVISED_REVIEW_SHAPES, hasOnlySupervisedReviewFields } from '@/app/lib/coach/supervised-programming-contract'

describe('supervised programming review authority', () => {
  let db: PGlite
  const athlete = '00000000-0000-4000-8000-000000000001', reviewer = '00000000-0000-4000-8000-000000000002'
  const foreign = '00000000-0000-4000-8000-000000000003', program = '00000000-0000-4000-8000-000000000010', baseId = '00000000-0000-4000-8000-000000000011'
  const original = reviewedRollingWeek(), target = effortWorkPlan()
  async function actor(user = athlete, role = 'authenticated') {
    await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user])
  }
  async function scalar<T = any>(query: string, args: unknown[] = []): Promise<T> { // SQL test replies deliberately vary by RPC.
    return (await db.query<{ value: T }>(query, args)).rows[0].value
  }
  async function rejected(call: () => Promise<unknown>, code: string) {
    await db.exec('SAVEPOINT rejection')
    try { await expect(call()).rejects.toMatchObject({ code }) }
    finally { await db.exec('ROLLBACK TO SAVEPOINT rejection; RELEASE SAVEPOINT rejection') }
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
      '20260918040000_targeted_review_sources.sql', '20260921010000_coach_proposal_context_revision.sql', '20260926010000_coach_setup_memory_bindings.sql',
      '20260928010000_reviewed_session_set_reports.sql', '20260928020000_reviewed_session_completion.sql', '20260928030000_reviewed_proposal_registration.sql',
      '20260928040000_reviewed_execution_slots.sql', '20260928050000_reviewed_next_week_transition.sql', '20260928060000_reviewed_registration_recovery.sql',
      '20260928070000_reviewed_session_request_resolution.sql', '20260928080000_reviewed_proposal_resolution.sql', '20260928090000_reviewed_qualitative_recovery.sql',
      '20260929010000_reviewed_effort_rir.sql', '20260930010000_supervised_programming_review.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
    await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)', [athlete, reviewer, foreign])
    await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
      VALUES($1,$2,'Mechanical authority test','No athlete approval',$3,$4,'draft','rolling_weekly')`, [program, athlete, original.plan.windowStart, original.plan.windowEnd])
    await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
      VALUES($1,$2,$3,1,'accepted',now(),'fixture','initial-dose-0.2.0','rolling_weekly',$4,$5,1,$6,'{}')`,
    [baseId, program, athlete, original.plan.windowStart, original.plan.windowEnd, JSON.stringify(original.intent)])
    await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2", [baseId, program])
    for (const [i, slot] of original.plan.scheduledSessions.entries()) await db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,$4,1,$5,$6,$7)`, [randomUUID(), baseId, program, athlete, i + 1, slot.scheduledDate, JSON.stringify(slot.prescription)])
  }, 30000)
  beforeEach(async () => { await db.exec('BEGIN'); await actor(); await scalar('SELECT get_coach_context_revision() AS value') })
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await db?.close() })
  async function enroll(expected = 0, enabled = true, designated = reviewer, expiry?: string) {
    const id = randomUUID(), expires = expiry ?? new Date(Date.now() + 3600000).toISOString()
    await actor(athlete, 'service_role')
    const args = [id, program, athlete, designated, expected, enabled, expires, '["same_week","next_week"]', 'local-qualified-operator']
    const result = await scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value', args)
    return { id, args, result }
  }
  async function packet(id = randomUUID()) {
    await db.exec('RESET ROLE')
    const base = await scalar(`SELECT jsonb_build_object('program',(SELECT to_jsonb(p) FROM (SELECT id,user_id,status,program_mode,active_plan_version_id FROM training_programs WHERE id=$1)p),
      'plan',(SELECT to_jsonb(p) FROM (SELECT id,user_id,program_id,status,plan_mode,intent,input_snapshot,window_start,window_end,sequence_number FROM training_plan_versions WHERE id=$2)p)) AS value`, [program, baseId])
    const revision = await scalar<number>('SELECT revision AS value FROM coach_context_revisions WHERE user_id=$1', [athlete])
    const slots = await scalar<ReviewedExecutionSlot[]>('SELECT reviewed_execution_source($1,$2,$3) AS value', [athlete, program, baseId])
    const continuity = reconcileReviewedExecution({ userId: athlete, programId: program, basePlanVersionId: baseId, baseSessions: original.plan.scheduledSessions, sourceSlots: slots, target })
    if (continuity.kind !== 'continuity') throw new Error(continuity.reasons.join('; '))
    const setup = { schemaVersion: 1, memories: { primary_goal: null, training_schedule: null, available_equipment: null, training_constraints: null } }
    const clock = await scalar(`SELECT jsonb_build_object('day',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'),'validBefore',clock_timestamp()+interval '5 minutes') AS value`)
    const scope = { programId: program, basePlanVersionId: baseId, historyThrough: clock.day, historyDays: 28, tzOffset: 0 }
    const binding = { version: 'reviewed-dose-context-3', reviewedMovementCatalogVersion: 'reviewed-identities-0.1.0', userId: athlete, scope,
      revision, base, memories: [], memoryStates: [], setup, executionSlots: slots }
    const sourceHash = doseContentHash(binding)
    const privatePacket = { schemaVersion: 2, registrationId: id, userId: athlete, policyVersion: 'initial-dose-0.2.0', movementCatalogVersion: 'reviewed-identities-0.1.0',
      source: { contextHash: sourceHash, binding, validBefore: clock.validBefore }, intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: target },
      inputSnapshot: { contextRevision: revision, setupMemoryBindings: setup, reviewedSourceHash: sourceHash, reviewedRegistrationId: id,
        reviewedMovementCatalogVersion: 'reviewed-identities-0.1.0', reviewedExecutionStorage: continuity.binding.storageContract, reviewedExecutionContinuity: continuity.binding,
        reviewedWeekTransition: { schemaVersion: 1, kind: 'same_week', basePlanVersionId: baseId,
          sourceWindow: { windowStart: original.plan.windowStart, windowEnd: original.plan.windowEnd, sequenceNumber: 1 },
          targetWindow: { windowStart: target.windowStart, windowEnd: target.windowEnd, sequenceNumber: 1 },
          baseProfileHash: doseContentHash(original.plan.profileSnapshot), targetProfileHash: doseContentHash(target.profileSnapshot) } },
      sessions: target.scheduledSessions.map((slot, i) => ({ week_number: 1, session_index: i + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription })) }
    const reviewPacket = { schemaVersion: 1, reviewMode: 'manual_complete_week', week: target, baseWeek: original.plan, rationale: 'Mechanical review only',
      changes: [{ kind: 'changed', summary: 'Effort-led exercise and optional work', sessionIds: [target.scheduledSessions[0].prescription.sessionId] }],
      evidence: [{ sourceId: 'source-context', summary: 'Synthetic source only; no real athlete performance' }],
      evidenceSource: { sourceHash, revision, historyThrough: clock.day, historyDays: 28 }, limitations: ['Not a coaching judgment'] }
    return { id, privatePacket, reviewPacket, sourceHash }
  }
  async function submit(enrollmentId: string, supplied?: Awaited<ReturnType<typeof packet>>) {
    const p = supplied ?? await packet()
    await actor(athlete, 'service_role')
    const candidate = await scalar('SELECT submit_supervised_candidate($1,$2,$3,$4) AS value', [p.id, enrollmentId, JSON.stringify(p.privatePacket), JSON.stringify(p.reviewPacket)])
    return { ...p, candidate, enrollmentId }
  }
  const decision = (c: Awaited<ReturnType<typeof submit>>, request = randomUUID(), choice = 'approve') =>
    scalar('SELECT decide_supervised_candidate($1,$2,$3,$4,$5,$6) AS value', [c.id, request, choice, c.candidate.contentHash, c.sourceHash, c.enrollmentId])
  const resolve = (c: Awaited<ReturnType<typeof submit>>) => scalar('SELECT get_approved_supervised_candidate($1,$2,$3,$4) AS value', [c.id, c.candidate.contentHash, c.sourceHash, c.enrollmentId])

  /** Read-only PostgREST-shaped transport, with real SQL/RLS and no fabricated source replies.
   * This is a disposable integration test, not real Auth or HTTP transport proof.
   */
  function sourceClient(): SupabaseClient {
    const quote = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid test SQL identifier'); return `"${name}"` }
    return { auth: { getUser: async () => ({ data: { user: { id: athlete } }, error: null }) }, from: (table: string) => {
      let fields = '*', maximum = 10000
      const predicates: string[] = [], ordering: string[] = [], values: unknown[] = []
      const chain = {
        select(columns: string) { fields = columns === '*' ? '*' : columns.split(',').map(quote).join(','); return chain },
        eq(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}=$${values.length}`); return chain },
        gte(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}>=$${values.length}`); return chain },
        lte(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}<=$${values.length}`); return chain },
        order(column: string, options: { ascending: boolean }) { ordering.push(`${quote(column)} ${options.ascending ? 'ASC' : 'DESC'}`); return chain },
        limit(limit: number) { if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid test limit'); maximum = limit; return chain },
        then(onfulfilled: (result: unknown) => unknown, onrejected: (reason: unknown) => unknown) {
          const query = `SELECT ${fields},count(*) OVER()::int AS fixture_count FROM public.${quote(table)}${predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''}${ordering.length ? ` ORDER BY ${ordering.join(',')}` : ''} LIMIT ${maximum}`
          // Serialize in PostgreSQL, as PostgREST does, preserving DATE as YYYY-MM-DD.
          return db.query<{ payload: Array<Record<string, unknown>> }>(`SELECT coalesce(jsonb_agg(q),'[]'::jsonb) AS payload FROM (${query}) q`, values).then(result => {
            const rows = result.rows[0].payload, count = Number(rows[0]?.fixture_count ?? 0)
            const data = rows.map(({ fixture_count: _count, ...row }) => { void _count; return row })
            return onfulfilled({ data, error: null, count })
          }, onrejected)
        },
      }
      return chain
    } } as unknown as SupabaseClient
  }

  it('denies direct tables and every private helper for both ordinary authenticated and service roles', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await actor(athlete, role)
      for (const table of ['coach_supervised_programs', 'coach_supervised_enrollments', 'coach_supervised_candidates', 'coach_supervised_decisions']) {
        await rejected(() => db.exec(`SELECT * FROM public.${table}`), '42501')
        await rejected(() => db.exec(`DELETE FROM public.${table}`), '42501')
      }
      for (const call of ["supervised_enrollment_json(null)", "supervised_candidate_json(null)", "supervised_decision_json(null,false)",
        "assert_supervised_enrollment_current(null,'same_week')", "assert_supervised_source_current('{}')", 'supervised_review_field_map()', "supervised_review_fields_valid('{}')"])
        await rejected(() => db.exec(`SELECT ${call}`), '42501')
    }
  })
  it('restricts enrollment/submission/resolver to service role and enforces a genuine owned accepted base', async () => {
    for (const role of ['anon', 'authenticated']) {
      await actor(athlete, role)
      await rejected(() => db.exec('SELECT version_supervised_enrollment(null,null,null,null,0,true,now(),\'[]\',\'operator\')'), '42501')
      await rejected(() => db.exec("SELECT submit_supervised_candidate(null,null,'{}','{}')"), '42501')
      await rejected(() => db.exec('SELECT get_approved_supervised_candidate(null,null,null,null)'), '42501')
    }
    await actor(athlete, 'service_role')
    await rejected(() => scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,0,true,now()+interval \'1 day\',\'["same_week"]\',\'operator\') AS value', [randomUUID(), program, foreign, reviewer]), '55000')
    await db.exec('RESET ROLE'); await db.query("UPDATE training_programs SET status='draft',active_plan_version_id=NULL WHERE id=$1", [program]); await actor(athlete, 'service_role')
    await rejected(() => enroll(), '55000')
  })
  it('appends operator versions, preserves permanent lineage and recovers exact enrollment receipt', async () => {
    const e = await enroll(), disabled = await enroll(1, false)
    expect(disabled.result).toMatchObject({ enabled: false, version: 2 })
    expect(await scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value', e.args)).toEqual(e.result)
    await rejected(() => scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value', [...e.args.slice(0, 8), 'changed-operator']), '22023')
    await rejected(() => enroll(0), '40001')
    await db.exec('RESET ROLE')
    expect(await scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(1)
    expect(await scalar('SELECT count(*)::int AS value FROM coach_supervised_enrollments')).toBe(2)
    await rejected(() => db.exec('DELETE FROM coach_supervised_programs'), '55000')
  })
  it('shows exact bounded packet to designated reviewer and athlete without broad athlete-table privileges', async () => {
    const e = await enroll(), c = await submit(e.id)
    expect(c.candidate.reviewPacket).toEqual(c.reviewPacket)
    expect(c.candidate).not.toHaveProperty('privatePacket')
    await actor(reviewer)
    expect(await scalar('SELECT get_supervised_candidate($1) AS value', [c.id])).toEqual(c.candidate)
    expect(await scalar('SELECT count(*)::int AS value FROM prescribed_sessions WHERE user_id=$1', [athlete])).toBe(0)
    await actor(athlete); expect(await scalar('SELECT get_supervised_candidate($1) AS value', [c.id])).toEqual(c.candidate)
    await rejected(() => decision(c), 'P0002')
    await actor(foreign); expect(await scalar('SELECT get_supervised_candidate($1) AS value', [c.id])).toBeNull()
    await rejected(() => decision(c), 'P0002')
  })
  it('binds exact content/source/enrollment, allows only explicit reviewer approval, and resolves service-only', async () => {
    const e = await enroll(), c = await submit(e.id), request = randomUUID()
    expect(await resolve(c)).toBeNull()
    await actor(reviewer)
    for (const [content, source, enrollment] of [['0'.repeat(64), c.sourceHash, e.id], [c.candidate.contentHash, '0'.repeat(64), e.id], [c.candidate.contentHash, c.sourceHash, randomUUID()]]) {
      await rejected(() => scalar('SELECT decide_supervised_candidate($1,$2,\'approve\',$3,$4,$5) AS value', [c.id, randomUUID(), content, source, enrollment]), '22023')
    }
    const saved = await decision(c, request)
    expect(saved).toMatchObject({ candidateId: c.id, reviewerId: reviewer, decision: 'approve', replayed: false, enrollmentVersion: 1 })
    expect(await decision(c, request)).toEqual({ ...saved, replayed: true })
    await rejected(() => decision(c, request, 'reject'), '22023')
    await rejected(() => decision(c), '22023')
    await actor(athlete, 'service_role')
    expect(await resolve(c)).toMatchObject({ candidate: c.candidate, privatePacket: c.privatePacket, decision: { decisionId: saved.decisionId } })
    await db.exec('RESET ROLE')
    expect(await scalar('SELECT count(*)::int AS value FROM coach_reviewed_proposal_registrations')).toBe(0)
    expect(await scalar('SELECT count(*)::int AS value FROM adaptation_proposals')).toBe(0)
  })
  it('reject receipt is durable and cannot supply approved compiler authority', async () => {
    const e = await enroll(), c = await submit(e.id), request = randomUUID(); await actor(reviewer)
    expect(await decision(c, request, 'reject')).toMatchObject({ decision: 'reject', replayed: false })
    expect(await decision(c, request, 'reject')).toMatchObject({ decision: 'reject', replayed: true })
    await actor(athlete, 'service_role'); expect(await resolve(c)).toBeNull()
  })
  it('revocation blocks new decisions/resolution but preserves exact committed receipts and athlete history', async () => {
    const e = await enroll(), c = await submit(e.id), request = randomUUID(); await actor(reviewer)
    const saved = await decision(c, request)
    await enroll(1, false); await actor(reviewer)
    expect(await decision(c, request)).toEqual({ ...saved, replayed: true })
    await rejected(() => scalar('SELECT get_supervised_candidate($1) AS value', [c.id]), '55000')
    await actor(athlete); expect(await scalar('SELECT get_supervised_candidate($1) AS value', [c.id])).toEqual(c.candidate)
    await actor(athlete, 'service_role'); await rejected(() => resolve(c), '55000')
    await enroll(2, true); await actor(athlete, 'service_role'); await rejected(() => resolve(c), '55000')
  })
  it('changed reviewer version does not revive old undecided candidates', async () => {
    const e = await enroll(), c = await submit(e.id)
    await enroll(1, true, foreign)
    await actor(reviewer); await rejected(() => decision(c), '55000')
    await actor(foreign); await rejected(() => decision(c), 'P0002')
    await actor(athlete, 'service_role'); const another = await packet(); await rejected(() => submit(e.id, another), '55000')
  })
  it('source revision and accepted-base changes invalidate fresh approval but not receipt replay', async () => {
    const e = await enroll(), c = await submit(e.id), request = randomUUID(); await actor(reviewer)
    const saved = await decision(c, request)
    await db.exec('RESET ROLE'); await db.query('UPDATE coach_context_revisions SET revision=revision+1 WHERE user_id=$1', [athlete])
    await actor(reviewer); expect(await decision(c, request)).toEqual({ ...saved, replayed: true })
    await actor(athlete, 'service_role'); await rejected(() => resolve(c), '40001')
    const fresh = await submit(e.id, await packet())
    await db.exec('RESET ROLE'); await db.query("UPDATE training_programs SET status='archived' WHERE id=$1", [program])
    await actor(reviewer); await rejected(() => decision(fresh), '40001')
  })
  it('expired source and expired enrollment reject new decisions', async () => {
    const e = await enroll(), expired = await packet()
    expired.privatePacket.source.validBefore = '2000-01-01T00:00:00Z'
    await rejected(() => submit(e.id, expired), '40001')
    const c = await submit(e.id)
    // Test clock expiry without sleeping or mutating immutable authority records.
    await db.exec('RESET ROLE; ALTER TABLE coach_supervised_enrollments DISABLE TRIGGER immutable_supervised_authority')
    await db.query("UPDATE coach_supervised_enrollments SET expires_at='2000-01-01' WHERE id=$1", [e.id])
    await db.exec('ALTER TABLE coach_supervised_enrollments ENABLE TRIGGER immutable_supervised_authority')
    await actor(reviewer); await rejected(() => decision(c), '55000')
  })
  it('rejects caller content/source projection mismatches, broad evidence fields and identity reuse', async () => {
    const e = await enroll(), p = await packet(), c = await submit(e.id, p)
    expect((await submit(e.id, p)).candidate).toEqual(c.candidate)
    for (const mutate of [
      (x: typeof p) => { x.reviewPacket.rationale = 'Changed content' },
      (x: typeof p) => { x.reviewPacket.evidenceSource.sourceHash = '0'.repeat(64) },
      (x: typeof p) => { Object.assign(x.reviewPacket, { memories: [] }) },
      (x: typeof p) => { x.reviewPacket.baseWeek.title = 'Other base' },
      (x: typeof p) => { Object.assign(x.reviewPacket.evidence[0], { raw: { medical: 'private' } }) },
    ]) { const changed = structuredClone(p); mutate(changed); await rejected(() => submit(e.id, changed), '22023') }
    await db.exec('RESET ROLE')
    await rejected(() => db.query("UPDATE coach_supervised_candidates SET review_packet='{}' WHERE id=$1", [c.id]), '55000')
    await actor(reviewer); await decision(c)
    await db.exec('RESET ROLE'); await rejected(() => db.exec('DELETE FROM coach_supervised_decisions'), '55000')
  })
  it('self-review requires explicit enrollment relationship rather than athlete ownership alone', async () => {
    const e = await enroll(0, true, athlete), c = await submit(e.id); await actor(athlete)
    expect(await decision(c)).toMatchObject({ reviewerId: athlete, decision: 'approve' })
  })
  it('recovers only the authenticated actor receipt without new writes after revocation', async () => {
    const e = await enroll(), c = await submit(e.id), request = randomUUID(); await actor(reviewer)
    expect(await scalar('SELECT get_supervised_decision_receipt($1) AS value', [request])).toBeNull()
    const saved = await decision(c, request)
    await enroll(1, false)
    await actor(reviewer)
    expect(await scalar('SELECT get_supervised_decision_receipt($1) AS value', [request])).toEqual({ ...saved, replayed: true })
    expect(await scalar('SELECT get_supervised_decision_receipt($1) AS value', [randomUUID()])).toBeNull()
    for (const other of [athlete, foreign]) {
      await actor(other); expect(await scalar('SELECT get_supervised_decision_receipt($1) AS value', [request])).toBeNull()
    }
    for (const role of ['anon', 'service_role']) {
      await actor(reviewer, role); await rejected(() => scalar('SELECT get_supervised_decision_receipt($1) AS value', [request]), '42501')
    }
    await db.exec('RESET ROLE')
    expect(await scalar('SELECT count(*)::int AS value FROM coach_supervised_decisions')).toBe(1)
  })
  it('keeps recursive SQL and server privacy fields in parity and rejects nested hidden source data', async () => {
    await db.exec('RESET ROLE')
    expect(await scalar('SELECT supervised_review_field_map() AS value')).toEqual(SUPERVISED_REVIEW_SHAPES)
    for (const mutate of [
      () => {},
      (week: typeof target) => { Object.assign(week, { memories: [] }) },
      (week: typeof target) => { Object.assign(week.profileSnapshot, { rawWorkouts: [] }) },
      (week: typeof target) => { Object.assign(week.scheduledSessions[0].prescription.content, { privateSource: {} }) },
      (week: typeof target) => { Object.assign(week.scheduledSessions[0].prescription.content.steps[0], { rawNotes: [] }) },
      (week: typeof target) => { Object.assign(week.profileSnapshot, { athleteGoalSummary: { private: true } }) },
    ]) {
      const week = structuredClone(target); mutate(week)
      expect(await scalar('SELECT supervised_review_fields_valid($1) AS value', [JSON.stringify(week)])).toBe(hasOnlySupervisedReviewFields(week))
    }
    const e = await enroll()
    const p = structuredClone(await packet())
    Object.assign(p.reviewPacket.week.scheduledSessions[0].prescription.content, { privateSource: {} })
    // Both private and public projections share the same week: equality alone cannot protect privacy.
    expect(p.reviewPacket.week).toEqual(p.privatePacket.intent.reviewed_week)
    await rejected(() => submit(e.id, p), '22023')
  })
  it('allows operator revocation after the underlying program is archived', async () => {
    await enroll()
    await db.exec('RESET ROLE'); await db.query("UPDATE training_programs SET status='archived' WHERE id=$1", [program])
    expect((await enroll(1, false)).result).toMatchObject({ enabled: false, version: 2 })
    await rejected(() => enroll(2, true), '55000')
  })
  it('roundtrips a real server-prepared candidate from actual SQL source through immutable review and approval', async () => {
    const e = await enroll(), proposed = effortWorkInput(), recipe = proposed.registry[0].recipe, candidateId = randomUUID()
    await actor(athlete)
    await fetchReviewedDoseContext(sourceClient(), { programId: program, basePlanVersionId: baseId, historyDays: 28, tzOffset: 0,
      historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 0) })
    const prepared = await prepareSupervisedCandidate(sourceClient(), {
      candidateId, enrollmentId: e.id, programId: program, basePlanVersionId: baseId, historyDays: 28, tzOffset: 0,
      transition: 'next_week', windowStart: '2026-08-10', sequenceNumber: 2, scheduleId: proposed.input.context.scheduleId,
      recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules,
        protocols: recipe.protocols, instructions: recipe.instructions, limitations: recipe.limitations },
      rationale: 'Mechanical roundtrip only; this is not an athlete approval.',
    })
    expect(prepared.kind).toBe('prepared_candidate')
    if (prepared.kind !== 'prepared_candidate') throw new Error(JSON.stringify(prepared))
    expect(prepared.privatePacket.inputSnapshot.reviewedWeekTransition.kind).toBe('next_week')
    await actor(athlete, 'service_role')
    const saved = await scalar('SELECT submit_supervised_candidate($1,$2,$3,$4) AS value', [candidateId, e.id, JSON.stringify(prepared.privatePacket), JSON.stringify(prepared.reviewPacket)])
    expect(saved.reviewPacket).toEqual(prepared.reviewPacket)
    await actor(reviewer)
    const receipt = await scalar('SELECT decide_supervised_candidate($1,$2,$3,$4,$5,$6) AS value', [candidateId, randomUUID(), 'approve', saved.contentHash, saved.sourceHash, e.id])
    expect(receipt).toMatchObject({ candidateId, decision: 'approve', replayed: false })
    await actor(athlete, 'service_role')
    const resolved = await scalar('SELECT get_approved_supervised_candidate($1,$2,$3,$4) AS value', [candidateId, saved.contentHash, saved.sourceHash, e.id])
    expect(resolved.privatePacket).toEqual(prepared.privatePacket)
  })
})
