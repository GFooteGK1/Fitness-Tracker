/** Read-only audit of the retained setup; never retries a setup mutation. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { nextSnapshotSql } from './supervised-next-scope.mjs'

const run = '213e7358-29c9-4886-bc31-d1a97797a0a8'
const root = process.cwd(), output = path.join(root, 'output/app-quality-release')
const sourceDir = path.join(output, `supervised-denial-fixture-${run}`)
const auditDir = path.join(output, `supervised-denial-audit-${run}`)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = file => fs.readFileSync(path.join(sourceDir, file), 'utf8')
const sourceBytes = read('receipt.json'), source = JSON.parse(sourceBytes)
const beforeBytes = read('before.json'), before = JSON.parse(beforeBytes), staged = JSON.parse(read('staged.json'))
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
const stable = v => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)
if (source.runId !== run || source.target !== 'http://127.0.0.1:55321' || source.status !== 'inspect_required'
  || source.failure !== 'Only explicit fixture tables changed' || source.beforeSha256 !== sha(beforeBytes)
  || source.globalNumericalPolicy !== false || source.journal.length !== 32
  || source.journal.some(e => e.disposition !== 'response_received')
  || source.users.length !== 3 || source.programs.length !== 2
  || source.users.some(u => !uuid(u.id)) || source.programs.some(p => !uuid(p.programId) || !uuid(p.ownerId) || !uuid(p.baseId) || !uuid(p.revokedEnrollmentId))) throw Error('Exact retained setup receipt required')
for (const request of Object.values(source.requests)) if (request.method !== 'POST'
  || request.bodySha256 !== sha(JSON.stringify(request.body))) throw Error('Reserved request bytes changed')
if (Object.keys(source.requests).sort().join(',') !== 'revoked_accept,revoked_complete,revoked_first_issue,revoked_set') throw Error('All four exact reserved envelopes required')
const status = JSON.parse(fs.readFileSync(path.join(output, 'local-supabase-status.private.json'), 'utf8'))
const url = new URL(status.DB_URL)
if (status.API_URL !== source.target || url.hostname !== '127.0.0.1' || url.port !== '55322') throw Error('Fixed local target required')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
const podman = path.join(output, 'tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe')
function local(args) {
  const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw Error('Fixed local readback failed')
  return JSON.parse(result.stdout)
}
const container = 'supabase_db_sociusfit-programming-local'
const info = local(['inspect', container])[0]
if (!info.State.Running || info.Config.Labels['com.supabase.cli.project'] !== 'sociusfit-programming-local') throw Error('Container identity mismatch')
const query = sql => local(['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])
const tables = query("SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")
const after = query(nextSnapshotSql(tables)), checks = []
const check = (value, label) => { if (!value) throw Error(label); checks.push(label) }
check(Object.keys(before).sort().join(',') === Object.keys(after).sort().join(','), 'Snapshot table set unchanged')
check(Object.entries(before).every(([t, rows]) => Object.entries(rows).every(([digest, count]) => after[t]?.[digest] >= count)), 'All prior public rows and Auth identities preserved')
const allowed = new Set(['auth_identity', 'user_profiles', 'coach_context_revisions', 'training_programs', 'training_plan_versions', 'prescribed_sessions', 'coach_supervised_programs', 'coach_supervised_enrollments', 'coach_supervised_initial_bases', 'coach_supervised_candidates', 'coach_supervised_decisions', 'coach_reviewed_proposal_registrations', 'coach_reviewed_execution_slots', 'adaptation_proposals', 'recommendation_refresh_state'])
check(Object.keys(before).every(t => allowed.has(t) || stable(before[t]) === stable(after[t])), 'Only fixture tables plus traced recommendation invalidation changed')
check(Object.keys(staged).every(t => t === 'coach_supervised_enrollments' || stable(staged[t]) === stable(after[t])), 'Only enrollment appends since staged setup')
const owners = source.users.map(u => `'${u.id}'`).join(',')
const state = query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object('refresh',coalesce((SELECT jsonb_object_agg(h,nb) FROM (SELECT md5(to_jsonb(r)::text) h,count(*) nb FROM public.recommendation_refresh_state r WHERE user_id IN (${owners}) GROUP BY 1) d),'{}'::jsonb),
'programs',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'active',p.active_plan_version_id,'proposals',(SELECT count(*) FROM public.adaptation_proposals a WHERE a.program_id=p.id),'pending',(SELECT count(*) FROM public.adaptation_proposals a WHERE a.program_id=p.id AND a.status='proposed'),'reports',(SELECT count(*) FROM public.coach_reviewed_set_reports s WHERE s.user_id=p.user_id),'workouts',(SELECT count(*) FROM public.workouts w WHERE w.user_id=p.user_id))) FROM public.training_programs p WHERE p.id IN (${source.programs.map(p => `'${p.programId}'`).join(',')})),
'enrollments',(SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('digest',md5(to_jsonb(e)::text))) FROM (SELECT DISTINCT ON (program_id) * FROM public.coach_supervised_enrollments WHERE program_id IN (${source.programs.map(p => `'${p.programId}'`).join(',')}) ORDER BY program_id,version DESC) e)); ROLLBACK;`)
const added = Object.fromEntries(Object.entries(after.recommendation_refresh_state).map(([h,n]) => [h,n-(before.recommendation_refresh_state[h]??0)]).filter(([,n]) => n > 0))
check(Object.keys(added).length > 0 && stable(added) === stable(state.refresh), 'All added recommendation invalidation rows belong to isolated actors')
check(state.programs.length === 2 && source.programs.every((p,index) => {
  const found = state.programs.find(x => x.id === p.programId)
  return found?.active === p.baseId && found.proposals === index && found.pending === index && found.reports === 0 && found.workouts === 0
}), 'First approval remains unissued; second proposal unaccepted; accepted bases untouched')
check(state.enrollments.length === 2 && source.programs.every(p => {
  const e = state.enrollments.find(x => x.program_id === p.programId)
  const args = source.journal.find(x => x.name === 'version_supervised_enrollment' && x.identity.p_id === p.revokedEnrollmentId)?.identity
  return args && e?.id === p.revokedEnrollmentId && e.version === 2 && e.enabled === false
    && e.user_id === p.ownerId && e.reviewer_id === args.p_reviewer_id
    && stable(e.operations) === stable(args.p_operations)
    && new Date(e.expires_at).getTime() === new Date(args.p_expires_at).getTime()
}), 'Latest exact fixture scopes remain revoked at version two')
const enrollmentAdded = Object.fromEntries(Object.entries(after.coach_supervised_enrollments).map(([h,n]) => [h,n-(staged.coach_supervised_enrollments[h]??0)]).filter(([,n]) => n > 0))
check(Object.entries(staged.coach_supervised_enrollments).every(([h,n]) => after.coach_supervised_enrollments[h] >= n)
  && stable(enrollmentAdded) === stable(Object.fromEntries(state.enrollments.map(e => [e.digest,1]))), 'Exactly the two revoked rows appended after staged setup')
const fixture = { schemaVersion: 1, runId: run, target: source.target, users: source.users, programs: source.programs,
  firstIssue: source.firstIssue, unacceptedProposal: source.unacceptedProposal, execution: source.execution, requests: source.requests }
const fixtureBytes = JSON.stringify(fixture), afterBytes = JSON.stringify(after)
const receipt = { schemaVersion: 1, status: 'verified', runId: run, observedAt: new Date().toISOString(), sourceReceiptSha256: sha(sourceBytes),
  originalStatus: source.status, originalFailure: source.failure, fixtureSha256: sha(fixtureBytes), afterSha256: sha(afterBytes),
  verifierSha256: sha(fs.readFileSync(new URL(import.meta.url))), checks, publicTables: tables.length,
  qualification: 'Read-only fixture readiness audit only; no Next denial or coaching suitability proof.' }
fs.mkdirSync(auditDir) // Exclusive audit output; source failed receipt remains unchanged.
for (const [name, bytes] of [['fixture.json',fixtureBytes], ['after.json',afterBytes], ['audit.json',JSON.stringify(receipt,null,2)]]) fs.writeFileSync(path.join(auditDir,name),bytes,{flag:'wx'})
console.log(JSON.stringify({ runId: run, status: receipt.status, checks: checks.length, publicTables: tables.length, fixtureSha256: receipt.fixtureSha256 }))
