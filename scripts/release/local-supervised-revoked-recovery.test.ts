/** Opt-in local revocation qualification of a stopped, verified fixture.
 * Append one disabled enrollment version; never reseed, restore or resend work. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolveSupervisedRequest } from '@/app/lib/coach/supervised-request-resolution-server'
import { recoverSupervisedLifecycle } from '@/app/lib/coach/supervised-lifecycle-recovery'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import type { SupervisedPending } from '@/app/lib/coach/supervised-pending'
import { stableStringify } from '@/app/lib/coach/rolling-weekly-contracts'

describe.skipIf(process.env.SOCIUS_LOCAL_REVOKED_RECOVERY !== 'true')('retained authenticated revoked recovery', () => {
  it('recovers exact historical requests after one isolated enrollment revocation', async () => {
    const runId = process.env.SOCIUS_LOCAL_REVOKED_RUN
    if (!runId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId)) throw Error('Fresh exact local UUID required')
    const sourceRun = '15dd9ac3-c64c-4763-85d1-1bfd98cebf4c', sourceDir = `output/playwright/supervised-browser-${sourceRun}`
    const bytes = readFileSync(`${sourceDir}/server-receipt.json`), source = JSON.parse(bytes.toString())
    if (createHash('sha256').update(bytes).digest('hex') !== '1ee939a539463b0e0162c191afac87c40f6b642e8732a866e99172248e6ca907'
      || source.runId !== sourceRun || source.status !== 'stopped' || source.priorRowsPreserved !== true
      || source.target !== 'http://127.0.0.1:55321' || source.programId !== '3a803777-c825-44d0-a563-6b51ae64dbe5'
      || source.globalNumericalPolicy !== false || !source.journal.every((e: any) => e.disposition === 'response_received')) throw Error('Verified stopped fixture required')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== source.target || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw Error('Nonlocal target denied')
    const directory = `output/app-quality-release/supervised-revoked-${runId}`
    const priorRun = process.env.SOCIUS_LOCAL_REVOKED_PRIOR
    let prior: any = null
    if (priorRun) {
      if (priorRun !== 'c30c293c-6da9-43e8-9cb9-7bf3e0e51f80') throw Error('Exact inspected revocation receipt required')
      const priorBytes = readFileSync(`output/app-quality-release/supervised-revoked-${priorRun}/receipt.json`)
      prior = JSON.parse(priorBytes.toString())
      if (createHash('sha256').update(priorBytes).digest('hex') !== '1da71ae9a2219b828d27999b061e1f8dd2470d04be255e632b1f49a239143fa7'
        || prior.sourceRun !== sourceRun || prior.target !== source.target || prior.programId !== source.programId
        || prior.status !== 'inspect_required' || prior.failure !== 'Revoked reviewer loses current candidate packet'
        || !prior.journal.every((e: any) => e.disposition === 'response_received')
        || !prior.journal.some((e: any) => e.name === 'append_disabled_enrollment' && !e.result.error && e.result.data?.version === 2 && e.result.data?.enabled === false)) throw Error('Confirmed prior revocation required')
    }
    mkdirSync(directory)
    const checks: string[] = [], journal: any[] = []
    const receipt: any = { runId, sourceRun, target: source.target, programId: source.programId, status: 'prepared', checks, journal,
      priorRun: priorRun ?? null, permittedMutation: prior ? 'No enrollment mutation; verify exact previously revoked fixture'
        : 'One new disabled enrollment version only; preserve original receipts and core rows' }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, label: string) => { if (!ok) throw Error(label); checks.push(label); save() }
    const attempt = async <T,>(name: string, payload: unknown, call: () => PromiseLike<T>): Promise<T> => {
      const e: any = { name, payload, disposition: 'pending', attemptedAt: new Date().toISOString() }; journal.push(e); save()
      try { const result = await call(); e.result = result; e.disposition = 'response_received'; save(); return result }
      catch (error) { e.disposition = 'inspect_required'; save(); throw error }
    }
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== source.target) throw Error('Nonlocal request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }
    const client = (service = false) => createClient(status.API_URL, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
    const admin = client(true), actors = new Map<string, SupabaseClient>()
    const tables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'workouts', 'coach_reviewed_set_reports']
    const podman = 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe', target = 'supabase_db_sociusfit-programming-local'
    const query = `SELECT jsonb_object_agg(table_name,rows) FROM (${tables.map(t => `SELECT '${t}' AS table_name,coalesce(jsonb_object_agg(id::text,md5(to_jsonb(x)::text)),'{}'::jsonb) AS rows FROM public.${t} x`).join(' UNION ALL ')}) snapshots;`
    const podmanCall = (args: string[]) => {
      const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
      if (result.status !== 0) throw Error('Fixed local read-only query failed')
      return JSON.parse(result.stdout)
    }
    const snapshot = () => podmanCall(['exec', target, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query])
    save()
    try {
      const container = podmanCall(['inspect', target])[0]
      check(container.State.Running && container.Config.Labels['com.supabase.cli.project'] === 'sociusfit-programming-local', 'Exact retained local container verified')
      const before = snapshot(); writeFileSync(`${directory}/prior-row-digests.json`, JSON.stringify(before), { flag: 'wx' })
      if (prior) {
        const originalBaseline = readFileSync(`output/app-quality-release/supervised-revoked-${priorRun}/prior-row-digests.json`)
        receipt.originalBaselineSha256 = createHash('sha256').update(originalBaseline).digest('hex')
        check(receipt.originalBaselineSha256 === 'b339067dee20c3d8ae315f48055dca27a60cdb69b0d8d01fc3a8c91ea96e7a20'
          && stableStringify(before) === stableStringify(JSON.parse(originalBaseline.toString())), 'Original pre-revocation core baseline unchanged before recovery')
      }
      for (const identity of source.users) {
        const found = await attempt('existing_local_identity_read', { actor: identity.actor, userId: identity.id }, async () => {
          const r = await admin.auth.admin.getUserById(identity.id)
          return { userId: r.data.user?.id, matchesEmail: r.data.user?.email === identity.email, error: r.error?.code ?? null }
        })
        check(!found.error && found.userId === identity.id && found.matchesEmail, `${identity.actor} already exists with exact fixture identity`)
      }
      for (const identity of source.users) {
        let tokenHash = ''
        const made = await attempt('local_login_issuance', { actor: identity.actor, userId: identity.id }, async () => {
          const r = await admin.auth.admin.generateLink({ type: 'magiclink', email: identity.email })
          tokenHash = r.data.properties?.hashed_token ?? ''
          return { userId: r.data.user?.id, error: r.error?.code ?? null }
        })
        check(!made.error && made.userId === identity.id && !!tokenHash, `${identity.actor} login identity verified`)
        const db = client()
        const auth = await attempt('local_login_verify', { actor: identity.actor, userId: identity.id }, async () => {
          const r = await db.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
          return { userId: r.data.user?.id, error: r.error?.code ?? null }
        })
        tokenHash = ''; check(!auth.error && auth.userId === identity.id, `${identity.actor} authenticated`); actors.set(identity.actor, db)
      }
      const owner = actors.get('athlete')!, reviewer = actors.get('reviewer')!, foreign = actors.get('foreign')!
      const ownerId = source.users.find((u: any) => u.actor === 'athlete').id, reviewerId = source.users.find((u: any) => u.actor === 'reviewer').id
      const old = await attempt('current_owned_workspace_read', { programId: source.programId }, () => owner.rpc('get_supervised_program_workspace',
        { p_program_id: source.programId, p_after_candidate_id: null, p_limit: 20 }))
      const current = old.data?.program?.latestEnrollment
      check(!old.error && old.data?.actorId === ownerId && old.data?.program?.programId === source.programId
        && old.data?.program?.athleteId === ownerId && current?.enrollmentId === (prior ? prior.revocation.p_id : source.enrollmentId)
        && current.version === (prior ? 2 : 1) && current.enabled === !prior && current.reviewerId === reviewerId, 'Exact owned enrollment version and scope verified')
      if (prior) {
        check(current.expiresAt === prior.revocation.p_expires_at && stableStringify(current.operations) === stableStringify(prior.revocation.p_operations), 'Original revoked enrollment details retained')
        receipt.revocation = prior.revocation; receipt.status = 'verifying_existing_revocation'; save()
      } else {
        const args = { p_id: randomUUID(), p_program_id: source.programId, p_user_id: ownerId, p_reviewer_id: reviewerId, p_expected_version: 1,
          p_enabled: false, p_expires_at: current.expiresAt, p_operations: current.operations, p_operator_ref: `local-revoked-recovery:${runId}` }
        receipt.revocation = args; receipt.status = 'revoking'; save()
        const revoked = await attempt('append_disabled_enrollment', args, () => admin.rpc('version_supervised_enrollment', args))
        check(!revoked.error && revoked.data?.enabled === false && revoked.data?.version === 2, 'Isolated enrollment revoked once')
      }
      const review = createSupervisedReviewService({ enabled: () => false, createServiceClient: () => admin })
      const issue = createSupervisedWeekIssuer({ enabled: () => false, createServiceClient: () => admin, review })
      const posts = source.journal.filter((e: any) => e.name === 'browser_http' && e.payload.method === 'POST')
      const submissions = posts.filter((e: any) => e.payload.path === '/api/coach/supervised/candidates')
      const decisions = posts.filter((e: any) => e.payload.path === '/api/coach/supervised/decisions')
      const issues = posts.filter((e: any) => e.payload.path === '/api/coach/supervised/issue')
      check(submissions.length === 2 && decisions.length === 2 && issues.length === 2, 'Both original exact cycles retained')
      const hidden = await attempt('revoked_reviewer_workspace_read', { programId: source.programId }, () => reviewer.rpc('get_supervised_program_workspace',
        { p_program_id: source.programId, p_after_candidate_id: null, p_limit: 20 }))
      check(!hidden.error && hidden.data === null, 'Revoked reviewer loses current workspace discovery')
      for (const e of decisions) {
        const candidate = await attempt('revoked_reviewer_candidate_read', { candidateId: e.payload.body.candidateId }, () => reviewer.rpc('get_supervised_candidate', { p_id: e.payload.body.candidateId }))
        check(candidate.error?.code === '55000' && candidate.data === null, 'Database guard denies revoked reviewer current candidate packet')
      }
      for (const [operation, requests, db, actor] of [['submit', submissions, owner, ownerId], ['decide', decisions, reviewer, reviewerId], ['issue', issues, owner, ownerId]] as const) {
        for (const e of requests) {
          const pending: SupervisedPending = { schemaVersion: 1, userId: actor, programId: source.programId, operation, body: e.payload.body }
          const result = await attempt('revoked_saved_request_read', pending, () => resolveSupervisedRequest(db, pending, false))
          check(result.kind === 'resolved' && result.resolution.disposition === 'saved', `${operation} original receipt recovers after revocation`)
          if (result.kind !== 'resolved' || result.resolution.disposition !== 'saved') throw Error('Saved result required')
          const recovered: any = result.resolution.result, original = e.result.result
          if (operation === 'submit') check(['candidateId', 'contentHash', 'sourceHash', 'enrollmentId', 'userId', 'programId'].every(key =>
            recovered.candidate?.[key] === original.candidate[key]), 'Recovered candidate identity and content/source hashes match original')
          else if (operation === 'decide') check(['decisionId', 'candidateId', 'requestId', 'reviewerId', 'contentHash', 'sourceHash', 'enrollmentId', 'enrollmentVersion', 'decision', 'decidedAt'].every(key =>
            recovered.receipt?.[key] === original.receipt[key]), 'Recovered historical decision exactly matches original authority')
          else check(recovered.proposalId === original.proposalId && recovered.planVersionId === original.planVersionId
            && recovered.programId === source.programId, 'Recovered issue IDs match original saved proposal')
          const denied = await attempt('foreign_receipt_read', pending, () => resolveSupervisedRequest(foreign, pending, false))
          check(denied.kind === 'account_changed', `Foreign actor cannot recover ${operation} receipt`)
        }
      }
      for (const e of issues) {
        const r = await attempt('disabled_revoked_issue_recovery', e.payload.body, () => issue(owner, e.payload.body))
        check(r.kind === 'recovered' && r.receipt.result.proposalId === e.result.result.proposalId, 'Disabled issuer recovers exact original after revocation')
      }
      const foreignId = source.users.find((u: any) => u.actor === 'foreign').id
      const deniedPending: SupervisedPending = { schemaVersion: 1, userId: foreignId, programId: source.programId, operation: 'submit',
        body: { ...submissions[0].payload.body, expectedUserId: foreignId } }
      const databaseDenied = await attempt('foreign_authenticated_database_receipt_read', deniedPending, () => foreign.rpc('get_supervised_request_resolution', { p_request: deniedPending }))
      check(databaseDenied.error?.code === 'P0002' && databaseDenied.data === null, 'Database denies foreign own-account historical receipt lookup')
      for (const e of posts.filter((e: any) => e.payload.path.endsWith('/accept'))) {
        const proposalId = e.payload.path.split('/').at(-2), original = e.result.result.accepted
        const request = { expectedUserId: ownerId, programId: source.programId, operation: 'accept', requestId: e.payload.body.requestId,
          identity: { proposalId, planVersionId: original.active_plan_version_id } }
        const r = await attempt('revoked_acceptance_receipt_read', request, () => recoverSupervisedLifecycle(owner, request))
        check(r.kind === 'recovered' && stableStringify(r.receipt.result) === stableStringify(original), 'Historical athlete acceptance recovers exact saved IDs')
      }
      for (const e of posts.filter((e: any) => /\/(sets|complete)$/.test(e.payload.path))) {
        const operation = e.payload.path.endsWith('/sets') ? 'set' : 'complete', sessionId = e.payload.path.split('/').at(-2)
        const request = { expectedUserId: ownerId, programId: source.programId, operation, requestId: e.payload.body.requestId,
          identity: { sessionId, [operation === 'set' ? 'report' : 'completion']: e.payload.body[operation === 'set' ? 'report' : 'completion'] } }
        const r = await attempt('revoked_execution_receipt_read', request, () => recoverSupervisedLifecycle(owner, request))
        check(r.kind === 'recovered', `${operation} historical exact receipt recovers after revocation`)
        if (r.kind !== 'recovered') throw Error('Recovered execution receipt required')
        const recovered: any = r.receipt.result
        check(operation === 'set' ? recovered.id === e.result.result.setReport.id && recovered.created_at === e.result.result.setReport.created_at
          : ['prescribed_session_id', 'checkin_id', 'workout_id', 'session_status', 'occurred_at'].every(key => recovered.result?.[key] === e.result.result.result[key]),
        `${operation} recovered result matches original saved entity and occurrence`)
      }
      const changed = structuredClone(decisions[0].payload.body); changed.contentHash = '0'.repeat(64)
      const conflict: SupervisedPending = { schemaVersion: 1, userId: reviewerId, programId: source.programId, operation: 'decide', body: changed }
      const mismatch = await attempt('changed_decision_payload_read', conflict, () => resolveSupervisedRequest(reviewer, conflict, false))
      check(mismatch.kind === 'request_conflict', 'Altered historical decision payload rejected')
      const after = snapshot(); check(stableStringify(after) === stableStringify(before), 'All core rows and counts unchanged by revocation and recovery')
      check(createHash('sha256').update(readFileSync(`${sourceDir}/server-receipt.json`)).digest('hex') === createHash('sha256').update(bytes).digest('hex'), 'Original source receipt unchanged')
      check(journal.every(e => e.disposition === 'response_received'), 'Every intended request has a retained response')
      receipt.status = 'passed'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ runId, checks: checks.length, receipt: `${directory}/receipt.json`, status: 'passed' }))
    } catch (error) { receipt.status = 'inspect_required'; receipt.failure = error instanceof Error ? error.message : 'Unknown failure'; save(); throw error }
  }, 60000)
})
