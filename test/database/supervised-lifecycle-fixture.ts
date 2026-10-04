import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recommendationFixture } from './recommendation-fixture'
import { sqlFile } from './fixture'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '@/app/lib/timezone-utils'

export const lifecycleIds = { owner: '00000000-0000-4000-8000-000000000001', reviewer: '00000000-0000-4000-8000-000000000002',
  foreign: '00000000-0000-4000-8000-000000000003', program: '00000000-0000-4000-8000-000000000010', base: '00000000-0000-4000-8000-000000000011' }

/** Disposable SQL/RLS transport. PostgreSQL serializes DATE, just as PostgREST does.
 * Auth identity here is a test input, not proof of real Supabase Auth/HTTP behavior.
 */
const transportQueues = new WeakMap<PGlite, Promise<unknown>>()
export function sourceClient(db: PGlite, owner: string, role: 'authenticated' | 'service_role' = 'authenticated', calls: string[] = []): SupabaseClient {
  const quote = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid fixture identifier'); return `"${name}"` }
  // Source reads run concurrently in the application. Serialize role selection
  // with each SQL operation so the service client cannot lend another call its role.
  const execute = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = (transportQueues.get(db) ?? Promise.resolve()).then(async () => {
      await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner])
      return operation()
    })
    transportQueues.set(db, pending.catch(() => undefined))
    return pending
  }
  return { auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: (name: string, args: Record<string, unknown>) => execute(async () => {
      calls.push(name)
      await db.exec('SAVEPOINT fixture_rpc')
      try {
        const entries = Object.entries(args)
        const result = await db.query<{ value: unknown }>(`SELECT public.${quote(name)}(${entries.map(([key], index) => `${quote(key)} => $${index + 1}`).join(',')}) AS value`,
          entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value))
        await db.exec('RELEASE SAVEPOINT fixture_rpc')
        return { data: result.rows[0].value, error: null }
      } catch (error) {
        await db.exec('ROLLBACK TO SAVEPOINT fixture_rpc; RELEASE SAVEPOINT fixture_rpc')
        return { data: null, error }
      }
    }), from: (table: string) => {
    let fields = '*', maximum = 10000
    const predicates: string[] = [], ordering: string[] = [], values: unknown[] = []
    const chain = {
      select(columns: string) { fields = columns === '*' ? '*' : columns.split(',').map(quote).join(','); return chain },
      eq(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}=$${values.length}`); return chain },
      gte(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}>=$${values.length}`); return chain },
      lte(column: string, value: unknown) { values.push(value); predicates.push(`${quote(column)}<=$${values.length}`); return chain },
      order(column: string, options: { ascending: boolean }) { ordering.push(`${quote(column)} ${options.ascending ? 'ASC' : 'DESC'}`); return chain },
      limit(limit: number) { if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid fixture limit'); maximum = limit; return chain },
      then(onfulfilled: (result: unknown) => unknown, onrejected: (reason: unknown) => unknown) {
        const query = `SELECT ${fields},count(*) OVER()::int AS fixture_count FROM public.${quote(table)}${predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''}${ordering.length ? ` ORDER BY ${ordering.join(',')}` : ''} LIMIT ${maximum}`
        return execute(() => db.query<{ payload: Array<Record<string, unknown>> }>(`SELECT coalesce(jsonb_agg(q),'[]'::jsonb) AS payload FROM (${query}) q`, values)).then(result => {
          const rows = result.rows[0].payload, count = Number(rows[0]?.fixture_count ?? 0)
          return onfulfilled({ data: rows.map(({ fixture_count: _count, ...row }) => { void _count; return row }), error: null, count })
        }, onrejected)
      },
    }
    return chain
  } } as unknown as SupabaseClient
}

export async function supervisedLifecycleFixture(applyLifecycle = true, applyReview = true) {
  const db = await recommendationFixture()
  for (const file of ['20260921010000_coach_proposal_context_revision.sql', '20260923010000_coaching_write_pause.sql', '20260926010000_coach_setup_memory_bindings.sql',
    '20260928010000_reviewed_session_set_reports.sql', '20260928020000_reviewed_session_completion.sql', '20260928030000_reviewed_proposal_registration.sql',
    '20260928040000_reviewed_execution_slots.sql', '20260928050000_reviewed_next_week_transition.sql', '20260928060000_reviewed_registration_recovery.sql',
    '20260928070000_reviewed_session_request_resolution.sql', '20260928080000_reviewed_proposal_resolution.sql', '20260928090000_reviewed_qualitative_recovery.sql',
    '20260929010000_reviewed_effort_rir.sql', ...(applyReview ? ['20260930010000_supervised_programming_review.sql'] : []),
    ...(applyLifecycle ? ['20260930020000_supervised_programming_lifecycle.sql'] : [])]) {
    await db.exec(sqlFile(`supabase/migrations/${file}`))
  }
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  const original = reviewedRollingWeek()
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)', [owner, reviewer, foreign])
  await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
    VALUES($1,$2,'Mechanical supervised lifecycle','Not athlete approval',$3,$4,'draft','rolling_weekly')`, [program, owner, original.plan.windowStart, original.plan.windowEnd])
  await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
    VALUES($1,$2,$3,1,'accepted',now(),'fixture','initial-dose-0.2.0','rolling_weekly',$4,$5,1,$6,'{}')`,
  [base, program, owner, original.plan.windowStart, original.plan.windowEnd, JSON.stringify(original.intent)])
  await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2", [base, program])
  for (const [i, slot] of original.plan.scheduledSessions.entries()) await db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
    VALUES($1,$2,$3,$4,1,$5,$6,$7)`, [randomUUID(), base, program, owner, i + 1, slot.scheduledDate, JSON.stringify(slot.prescription)])
  async function actor(user = owner, role = 'authenticated') {
    await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user])
  }
  async function scalar<T = any>(query: string, values: unknown[] = []): Promise<T> {
    return (await db.query<{ value: T }>(query, values)).rows[0].value
  }
  async function enrollment(enabled = true, designated = reviewer, expiry?: string) {
    await db.exec('RESET ROLE')
    const version = await scalar<number>('SELECT coalesce(max(version),0)::int AS value FROM coach_supervised_enrollments WHERE program_id=$1', [program])
    const id = randomUUID()
    await actor(owner, 'service_role')
    await scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
      [id, program, owner, designated, version, enabled, expiry ?? new Date(Date.now() + 3600000).toISOString(), '["same_week","next_week"]', 'explicit-local-operator'])
    return id
  }
  async function anchor() {
    await actor(owner, 'service_role')
    return scalar('SELECT provision_supervised_initial_base($1,$2,$3) AS value', [program, base, 'explicit-local-base'])
  }
  async function draft(enrollmentId: string, transition: 'same_week' | 'next_week' = 'same_week') {
    await db.exec('RESET ROLE')
    const active = await scalar<string>('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1', [program])
    const plan = await scalar<{ window_start: string; sequence_number: number }>('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [active])
    const input = effortWorkInput(), recipe = input.registry[0].recipe, candidateId = randomUUID()
    await actor()
    return { candidateId, enrollmentId, programId: program, basePlanVersionId: active,
      historyDays: 90, tzOffset: 0, transition, windowStart: transition === 'same_week' ? plan.window_start
        : formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(plan.window_start, 0)) + 7 * 86400000).toISOString(), 0),
      sequenceNumber: plan.sequence_number + (transition === 'next_week' ? 1 : 0),
      recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules, protocols: recipe.protocols, instructions: recipe.instructions, limitations: recipe.limitations },
      scheduleId: input.input.context.scheduleId, rationale: 'Mechanical SQL lifecycle; no athlete suitability claim.' }
  }
  async function prepare(enrollmentId: string, transition: 'same_week' | 'next_week' = 'same_week', approve = true) {
    const input = await draft(enrollmentId, transition), candidateId = input.candidateId
    const prepared = await prepareSupervisedCandidate(sourceClient(db, owner), input)
    if (prepared.kind !== 'prepared_candidate') throw new Error(JSON.stringify(prepared))
    await actor(owner, 'service_role')
    const saved = await scalar('SELECT submit_supervised_candidate($1,$2,$3,$4) AS value', [candidateId, enrollmentId, JSON.stringify(prepared.privatePacket), JSON.stringify(prepared.reviewPacket)])
    if (approve) {
      await actor(reviewer)
      await scalar('SELECT decide_supervised_candidate($1,$2,$3,$4,$5,$6) AS value', [candidateId, randomUUID(), 'approve', saved.contentHash, saved.sourceHash, enrollmentId])
    }
    return { ...prepared, saved }
  }
  async function register(candidate: Awaited<ReturnType<typeof prepare>>) {
    await actor(owner, 'service_role')
    return scalar('SELECT register_reviewed_week_proposal($1,$2,$3) AS value', [candidate.candidateId, JSON.stringify(candidate.privatePacket), doseContentHash(candidate.privatePacket)])
  }
  async function issue(candidate: Awaited<ReturnType<typeof prepare>>, key = randomUUID()) {
    await actor()
    return { ...await scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value', [candidate.candidateId, key]), key }
  }
  async function accept(proposal: Awaited<ReturnType<typeof issue>>) {
    await actor()
    return scalar('SELECT to_jsonb(result) AS value FROM accept_adaptation_proposal($1,$2) result', [proposal.proposalId, proposal.key])
  }
  async function session(planId?: string) {
    await actor()
    return scalar<{ id: string; scheduled_date: string; prescription: typeof original.plan.scheduledSessions[0]['prescription'] }>(`SELECT to_jsonb(s) AS value FROM coach_effective_prescribed_sessions s
      WHERE s.user_id=$1 AND s.plan_version_id=coalesce($2::uuid,(SELECT active_plan_version_id FROM training_programs WHERE id=$3)) ORDER BY session_index LIMIT 1`, [owner, planId ?? null, program])
  }
  return { db, actor, scalar, enrollment, anchor, draft, prepare, register, issue, accept, session, original }
}
