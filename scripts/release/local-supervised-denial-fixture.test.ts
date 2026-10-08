/** Explicit retained-local setup for real Next revocation-denial qualification.
 * Add isolated synthetic data; never re-enable or modify an existing fixture. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../../test/fixtures/reviewed-effort-work'
import { denialExecutionEnvelopes } from './supervised-denial-envelopes'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import type { SupervisedCandidateDraft } from '@/app/lib/coach/supervised-candidate-draft'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { nextSnapshotSql } from './supervised-next-scope.mjs'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const stable = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)
type Snapshot = Record<string, Record<string, number>>

describe.skipIf(process.env.SOCIUS_LOCAL_DENIAL_FIXTURE !== 'true')('isolated retained-local revoked denial fixture', () => {
  it('prepares unissued approval, unaccepted proposal and untouched accepted execution with recorded revocation', async () => {
    const runId = process.env.SOCIUS_LOCAL_DENIAL_RUN
    if (!runId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId)) throw Error('Fresh local fixture UUID required')
    const target = 'http://127.0.0.1:55321', container = 'supabase_db_sociusfit-programming-local'
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== target || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322'
      || personalizedCoachingCapabilities().initialDosePolicy !== false) throw Error('Fixed local target and disabled global policy required')
    const env: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key))), NODE_ENV: 'test' }
    const podman = 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe'
    const local = (args: string[]) => {
      const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
      if (result.status !== 0) throw Error('Fixed local readback failed')
      return JSON.parse(result.stdout)
    }
    const inspected = local(['inspect', container])[0]
    if (!inspected.State.Running || inspected.Config.Labels['com.supabase.cli.project'] !== 'sociusfit-programming-local') throw Error('Container identity mismatch')
    const query = (sql: string) => local(['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])
    const snapshot = (): Snapshot => query(nextSnapshotSql(query("SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")))
    const directory = `output/app-quality-release/supervised-denial-fixture-${runId}`
    mkdirSync(directory) // Exclusive; a failure is inspected, never reseeded.
    const users = ['first_issue_owner', 'execution_owner', 'denial_reviewer'].map(actor => ({ actor, id: randomUUID(), email: `denial-${runId}-${actor}@sociusfit-local.invalid` }))
    const programs = users.slice(0, 2).map(u => ({ actor: u.actor, ownerId: u.id, programId: randomUUID(), baseId: randomUUID(), enrollmentId: randomUUID(), candidateId: randomUUID(), issueRequestId: randomUUID(), revokedEnrollmentId: randomUUID() }))
    const journal: any[] = [], checks: string[] = []
    const receipt: any = { schemaVersion: 1, runId, target, status: 'prepared', users, programs, journal, checks, createdAt: new Date().toISOString(), globalNumericalPolicy: false,
      qualification: 'Synthetic setup only; no Next denial or physiological suitability claim' }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (value: unknown, label: string) => { if (!value) throw Error(label); checks.push(label); save() }
    const attempt = async <T,>(name: string, identity: unknown, call: () => PromiseLike<T>, sanitize: (value: T) => unknown = v => v): Promise<T> => {
      const event: any = { name, identity, disposition: 'pending', at: new Date().toISOString() }; journal.push(event); save()
      try { const result = await call(); event.result = sanitize(result); event.disposition = 'response_received'; save(); return result }
      catch { event.disposition = 'inspect_required'; save(); throw Error('Inspect original fixture request; no automatic retry') }
    }
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== target) throw Error('Nonlocal fixture request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }
    const client = (service = false) => createClient(target, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
    const admin = client(true), actors = new Map<string, SupabaseClient>()
    const write = async (name: string, identity: unknown, call: () => PromiseLike<{ data: any; error: any }>) => {
      const result = await attempt(name, identity, call, r => ({ error: r.error?.code ?? null }))
      check(!result.error, `${name} succeeds (${result.error?.code ?? 'ok'})`); return result.data
    }
    const rpc = (db: SupabaseClient, name: string, args: Record<string, unknown>) => write(name, args, () => db.rpc(name, args))
    save()
    try {
      const before = snapshot(), beforeBytes = JSON.stringify(before)
      writeFileSync(`${directory}/before.json`, beforeBytes, { flag: 'wx' }); receipt.beforeSha256 = hash(beforeBytes); save()
      for (const user of users) {
        const password = randomUUID() + randomUUID()
        const made = await attempt('create_synthetic_identity', { actor: user.actor, userId: user.id }, () => admin.auth.admin.createUser({ id: user.id, email: user.email, password, email_confirm: true }),
          r => ({ userId: r.data.user?.id, error: r.error?.code ?? null }))
        check(!made.error && made.data.user?.id === user.id, 'Exact isolated synthetic identity created')
        const db = client()
        const signed = await attempt('authenticate_synthetic_identity', { actor: user.actor, userId: user.id }, () => db.auth.signInWithPassword({ email: user.email, password }),
          r => ({ userId: r.data.user?.id, error: r.error?.code ?? null }))
        check(!signed.error && signed.data.user?.id === user.id, 'Exact synthetic actor authenticated')
        actors.set(user.actor, db)
        await write('create_synthetic_profile', { userId: user.id }, () => db.from('user_profiles').insert({ user_id: user.id, fitness_goals: ['performance'], body_metrics: { age: 35, height_cm: 175, weight_kg: 75 }, preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } }))
      }
      const reviewer = actors.get('denial_reviewer')!, expiresAt = new Date(Date.now() + 86400000).toISOString()
      for (const p of programs) {
        const owner = actors.get(p.actor)!, base = reviewedRollingWeek(), recipeInput = effortWorkInput(), recipe = recipeInput.registry[0].recipe
        await rpc(owner, 'get_coach_context_revision', {})
        await write('create_isolated_program', p, () => admin.from('training_programs').insert({ id: p.programId, user_id: p.ownerId, title: 'Isolated revoked Next denial fixture', goal_summary: 'Mechanical test only', start_date: base.plan.windowStart, end_date: base.plan.windowEnd, status: 'draft', program_mode: 'rolling_weekly' }))
        await write('create_isolated_base', p, () => admin.from('training_plan_versions').insert({ id: p.baseId, program_id: p.programId, user_id: p.ownerId, version: 1, status: 'accepted', accepted_at: new Date().toISOString(), reference_version: 'local-denial-test', policy_version: 'initial-dose-0.2.0', plan_mode: 'rolling_weekly', window_start: base.plan.windowStart, window_end: base.plan.windowEnd, sequence_number: 1, intent: base.intent, input_snapshot: {} }))
        await write('activate_isolated_base', p, () => admin.from('training_programs').update({ status: 'active', active_plan_version_id: p.baseId }).eq('id', p.programId).eq('user_id', p.ownerId))
        const sessions = base.plan.scheduledSessions.map((slot, index) => ({ id: randomUUID(), user_id: p.ownerId, program_id: p.programId, plan_version_id: p.baseId, week_number: 1, session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription }))
        await write('create_isolated_sessions', { programId: p.programId, sessionIds: sessions.map(s => s.id) }, () => admin.from('prescribed_sessions').insert(sessions))
        await rpc(admin, 'version_supervised_enrollment', { p_id: p.enrollmentId, p_program_id: p.programId, p_user_id: p.ownerId, p_reviewer_id: users[2].id, p_expected_version: 0, p_enabled: true, p_expires_at: expiresAt, p_operations: ['same_week', 'next_week'], p_operator_ref: `local-denial-fixture:${runId}` })
        await rpc(admin, 'provision_supervised_initial_base', { p_program_id: p.programId, p_plan_version_id: p.baseId, p_operator_ref: `local-denial-fixture:${runId}` })
        const options = { enabled: () => true, createServiceClient: () => admin }, review = createSupervisedReviewService(options), issue = createSupervisedWeekIssuer({ ...options, review })
        const draft: SupervisedCandidateDraft = { candidateId: p.candidateId, enrollmentId: p.enrollmentId, programId: p.programId, basePlanVersionId: p.baseId, historyDays: 90, tzOffset: 0, transition: 'same_week', windowStart: base.plan.windowStart, sequenceNumber: 1,
          recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules, protocols: recipe.protocols, instructions: recipe.instructions, limitations: recipe.limitations }, scheduleId: recipeInput.input.context.scheduleId, rationale: 'Isolated mechanical revocation-denial fixture, not athlete suitability' }
        const saved = await attempt('submit_isolated_candidate', { programId: p.programId, candidateId: p.candidateId }, () => review.submit(owner, p.ownerId, draft), r => ({ kind: r.kind }))
        check(saved.kind === 'saved', 'Exact fresh candidate submitted'); if (saved.kind !== 'saved') throw Error(saved.kind)
        const decision = { expectedUserId: users[2].id, candidateId: p.candidateId, requestId: randomUUID(), decision: 'approve' as const, enrollmentId: p.enrollmentId, contentHash: saved.candidate.contentHash, sourceHash: saved.candidate.sourceHash }
        const decided = await attempt('approve_isolated_candidate', decision, () => review.decide(reviewer, decision), r => ({ kind: r.kind }))
        check(decided.kind === 'decided', 'Exact designated approval saved')
        const request = { expectedUserId: p.ownerId, programId: p.programId, candidateId: p.candidateId, requestId: p.issueRequestId }
        if (p.actor === 'execution_owner') {
          const issued = await attempt('issue_unaccepted_proposal', request, () => issue(owner, request), r => ({ kind: r.kind, ...(r.kind === 'issued' ? { proposalId: r.proposalId, planVersionId: r.planVersionId } : {}) }))
          check(issued.kind === 'issued', 'Separate proposal issued but not accepted'); if (issued.kind !== 'issued') throw Error(issued.kind)
          receipt.unacceptedProposal = { proposalId: issued.proposalId, planVersionId: issued.planVersionId, requestId: p.issueRequestId, programId: p.programId, ownerId: p.ownerId }
          const slot = sessions[0]
          receipt.execution = { programId: p.programId, ownerId: p.ownerId, sessionId: slot.id }
          receipt.requests = { ...receipt.requests, ...denialExecutionEnvelopes({ ownerId: p.ownerId, programId: p.programId,
            sessionId: slot.id, scheduledDate: slot.scheduled_date, prescription: slot.prescription,
            proposalId: issued.proposalId, planVersionId: issued.planVersionId, issueRequestId: p.issueRequestId }) }; save()
        } else {
          const approved = await attempt('read_exact_unissued_approval', { candidateId: p.candidateId }, () => review.resolveApproved(owner, p.candidateId), r => ({ kind: r.kind }))
          check(approved.kind === 'approved_candidate', 'Unissued candidate retains reproducible approval'); if (approved.kind !== 'approved_candidate') throw Error(approved.kind)
          await rpc(admin, 'register_reviewed_week_proposal', { p_id: p.candidateId, p_packet: approved.privatePacket, p_fingerprint: doseContentHash(approved.privatePacket) })
          receipt.firstIssue = request
          receipt.requests = { ...receipt.requests, revoked_first_issue: { path: '/api/coach/supervised/issue', method: 'POST',
            body: request, bodySha256: hash(JSON.stringify(request)) } }; save()
        }
      }
      const staged = snapshot(); writeFileSync(`${directory}/staged.json`, JSON.stringify(staged), { flag: 'wx' })
      for (const p of programs) await rpc(admin, 'version_supervised_enrollment', { p_id: p.revokedEnrollmentId, p_program_id: p.programId, p_user_id: p.ownerId, p_reviewer_id: users[2].id, p_expected_version: 1, p_enabled: false, p_expires_at: expiresAt, p_operations: ['same_week', 'next_week'], p_operator_ref: `local-denial-fixture:${runId}` })
      const after = snapshot()
      check(Object.keys(before).sort().join(',') === Object.keys(after).sort().join(','), 'Snapshot table set unchanged')
      check(Object.entries(before).every(([table, rows]) => Object.entries(rows).every(([digest, count]) => after[table]?.[digest] >= count)), 'Every preexisting public row and Auth identity preserved')
      const allowed = new Set(['auth_identity', 'user_profiles', 'coach_context_revisions', 'training_programs', 'training_plan_versions', 'prescribed_sessions', 'coach_supervised_programs', 'coach_supervised_enrollments', 'coach_supervised_initial_bases', 'coach_supervised_candidates', 'coach_supervised_decisions', 'coach_reviewed_proposal_registrations', 'coach_reviewed_execution_slots', 'adaptation_proposals'])
      check(Object.keys(before).every(table => allowed.has(table) || stable(before[table]) === stable(after[table])), 'Only explicit fixture tables changed')
      check(Object.keys(staged).every(table => table === 'coach_supervised_enrollments' || stable(staged[table]) === stable(after[table])), 'Revocation appended enrollment rows only')
      const readback = query(`SELECT jsonb_build_object('unissued',(SELECT count(*) FROM public.adaptation_proposals WHERE program_id='${programs[0].programId}'), 'pending',(SELECT count(*) FROM public.adaptation_proposals WHERE program_id='${programs[1].programId}' AND status='proposed'),'active',(SELECT active_plan_version_id FROM public.training_programs WHERE id='${programs[1].programId}'),'reports',(SELECT count(*) FROM public.coach_reviewed_set_reports WHERE user_id='${programs[1].ownerId}'),'workouts',(SELECT count(*) FROM public.workouts WHERE user_id='${programs[1].ownerId}'),'enrollments',(SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'enabled',enabled)) FROM public.coach_supervised_enrollments WHERE id IN ('${programs[0].revokedEnrollmentId}','${programs[1].revokedEnrollmentId}')))`)
      check(readback.unissued === 0 && readback.pending === 1 && readback.active === programs[1].baseId && readback.reports === 0 && readback.workouts === 0, 'No first issuance, acceptance or performed work created')
      check(readback.enrollments.length === 2 && readback.enrollments.every((e: any) => e.enabled === false && e.version === 2), 'Both isolated enrollments revoked exactly once')
      const afterBytes = JSON.stringify(after); writeFileSync(`${directory}/after.json`, afterBytes, { flag: 'wx' }); receipt.afterSha256 = hash(afterBytes)
      const fixture = { schemaVersion: 1, runId, target, users, programs, firstIssue: receipt.firstIssue, unacceptedProposal: receipt.unacceptedProposal, execution: receipt.execution, requests: receipt.requests }
      const fixtureBytes = JSON.stringify(fixture); writeFileSync(`${directory}/fixture.json`, fixtureBytes, { flag: 'wx' }); receipt.fixtureSha256 = hash(fixtureBytes)
      check(journal.every(e => e.disposition === 'response_received'), 'Every setup request has a confirmed outcome')
      receipt.status = 'ready'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ runId, status: 'ready', checks: checks.length, requests: journal.length, programs: programs.length, fixtureSha256: receipt.fixtureSha256 }))
    } catch (error) { receipt.status = 'inspect_required'; receipt.failure = error instanceof Error ? error.message : 'Unknown fixture failure'; save(); throw error }
  }, 120000)
})
