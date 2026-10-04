/** Actual Next15 cookie/route qualification. Fixed local target; retained revoked fixture. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import { createServer, IncomingMessage } from 'node:http'
import net from 'node:net'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { LocalRequestDrain, localFinalization } from './supervised-browser-finalization.ts'
import { sourceRun as historicalRun, sourceSha as historicalSha, sourceProgram as historicalProgram, revokedEnrollment, originalProbe, safeNextResult, allowedNextPath, fixedNextBody, nextSnapshotSql, provenNextProbe } from './supervised-next-scope.mjs'
import { denialProbe, allowedDenialPath, fixedDenialBody } from './supervised-next-denial-scope.mjs'

const [mode, runId] = process.argv.slice(2), uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const preparing = ['prepare', 'prepare-denial'].includes(mode)
if (!['prepare', 'prepare-denial', 'start', 'serve', 'finalize', 'verify'].includes(mode) || (preparing ? process.argv.length !== 3 : process.argv.length !== 4 || !uuid(runId))) throw Error('Use prepare/prepare-denial or start/finalize/verify with exact UUID')
const root = mode === 'serve' ? process.cwd() : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'output/app-quality-release'), id = preparing ? randomUUID() : runId
const directory = path.join(output, 'supervised-next-' + id), runtime = path.join(directory, 'runtime'), receiptPath = path.join(directory, 'receipt.json')
const origin = 'http://127.0.0.1:3013', api = 'http://127.0.0.1:55321', target = 'supabase_db_sociusfit-programming-local'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const denial = mode === 'prepare-denial' || (!preparing && JSON.parse(fs.readFileSync(receiptPath)).fixtureMode === 'denial')
const sourceRun = denial ? '213e7358-29c9-4886-bc31-d1a97797a0a8' : historicalRun
const sourceSha = denial ? 'b9301747e8637eda4ae1ce9ac6a093885e64e6dfb091f25ce7f7a06f370efb6b' : historicalSha
const sourceFile = denial ? path.join(output, `supervised-denial-audit-${sourceRun}/fixture.json`)
  : path.join(root, `output/playwright/supervised-browser-${sourceRun}/server-receipt.json`)
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes)
const sourceProgram = denial ? source.programs[0].programId : historicalProgram
if (denial) {
  const audit = JSON.parse(fs.readFileSync(path.join(output, `supervised-denial-audit-${sourceRun}/audit.json`)))
  if (sha(sourceBytes) !== sourceSha || audit.status !== 'verified' || audit.fixtureSha256 !== sourceSha || audit.checks.length !== 8) throw Error('Exact independently audited denial fixture required')
} else if (sha(sourceBytes) !== sourceSha || source.status !== 'stopped' || !source.priorRowsPreserved || source.programId !== sourceProgram
  || source.globalNumericalPolicy !== false || !source.journal.every(e => e.disposition === 'response_received')) throw Error('Exact stopped qualified source required')
const envNames = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']
const noEnv = location => { for (const file of envNames) if (fs.existsSync(path.join(location, file))) throw Error('Automatic environment file denied') }
noEnv(root)
const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
const podman = path.join(output, 'tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe')
function localCall(args) {
  const r = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', env: safeEnv, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
  if (r.status !== 0) throw Error('Fixed local readback failed')
  return JSON.parse(r.stdout)
}
const query = sql => localCall(['exec', target, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])
function verifyTarget() {
  const container = localCall(['inspect', target])[0]
  if (!container.State.Running || container.Config.Labels['com.supabase.cli.project'] !== 'sociusfit-programming-local') throw Error('Local container mismatch')
  const users = source.users.map(u => "'" + u.id + "'").join(',')
  if (denial) {
    const state = query(`SELECT jsonb_build_object('profiles',(SELECT coalesce(jsonb_agg(user_id),'[]') FROM public.user_profiles WHERE user_id IN (${users})),
      'enrollments',(SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT DISTINCT ON (program_id) * FROM public.coach_supervised_enrollments WHERE program_id IN (${source.programs.map(p=>"'"+p.programId+"'").join(',')}) ORDER BY program_id,version DESC) e),
      'whoop',(SELECT count(*) FROM public.whoop_tokens WHERE user_id IN (${users})))`)
    if (state.profiles.length !== 3 || state.whoop !== 0 || state.enrollments.length !== 2 || !source.programs.every(p =>
      state.enrollments.some(e => e.id === p.revokedEnrollmentId && e.program_id === p.programId && e.user_id === p.ownerId && e.version === 2 && !e.enabled))) throw Error('Exact disabled denial fixtures required')
    return state
  }
  const check = query(`SELECT jsonb_build_object('enrollment',(SELECT jsonb_build_object('id',id,'version',version,'enabled',enabled) FROM public.coach_supervised_enrollments WHERE program_id='${sourceProgram}' ORDER BY version DESC LIMIT 1),
    'profiles',(SELECT coalesce(jsonb_agg(user_id),'[]') FROM public.user_profiles WHERE user_id IN (${users})),
    'whoop',(SELECT count(*) FROM public.whoop_tokens WHERE user_id IN (${users})));`)
  if (check.enrollment?.id !== revokedEnrollment || check.enrollment.version !== 2 || check.enrollment.enabled !== false || check.whoop !== 0) throw Error('Exact revoked, WHOOP-free fixture required')
  return check
}
// Histograms of complete row digests include duplicate rows and all public base tables.
function snapshot() {
  const tables = query("SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';")
  return query(nextSnapshotSql(tables))
}
const canonical = value => JSON.stringify(value, Object.keys(value).sort())
function sameSnapshot(before, after) {
  return Object.keys(before).sort().join(',') === Object.keys(after).sort().join(',')
    && Object.entries(before).every(([table, rows]) => canonical(rows) === canonical(after[table]))
}
function preserveBefore(before, after) {
  return Object.entries(before).every(([table, rows]) => Object.entries(rows).every(([digest, count]) => after[table]?.[digest] >= count))
}
function verifyFiles(receipt) {
  noEnv(runtime)
  if (receipt.id !== id || receipt.sourceRun !== sourceRun || receipt.sourceSha !== sourceSha || receipt.programId !== sourceProgram || receipt.globalNumericalPolicy !== false || receipt.origin !== origin
    || receipt.runtime !== runtime || receipt.dependencyLockHash !== sha(fs.readFileSync(path.join(root, 'package-lock.json')))) throw Error('Runtime receipt mismatch')
  for (const file of receipt.files) {
    const absolute = path.resolve(runtime, file.path), relative = path.relative(runtime, absolute).replaceAll('\\', '/')
    if (!relative || relative.startsWith('../') || relative !== file.path) throw Error('Runtime manifest path escapes')
    let cursor = runtime
    for (const segment of relative.split('/')) { cursor = path.join(cursor, segment); if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Runtime source link denied') }
    if (sha(fs.readFileSync(absolute)) !== file.sha256) throw Error('Runtime source changed: ' + file.path)
  }
}
const policyOff = text => /initialDosePolicy:\s*false\s*,/.test(text)

if (preparing) {
  verifyTarget()
  if (!policyOff(fs.readFileSync(path.join(root, 'app/lib/personalized-coaching-capabilities.ts'), 'utf8'))) throw Error('Global policy changed')
  fs.mkdirSync(directory); fs.mkdirSync(runtime)
  const files = [], write = (relative, bytes) => {
    const p = path.join(runtime, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes, { flag: 'wx' })
    files.push({ path: relative.replaceAll('\\', '/'), sha256: sha(bytes), bytes: Buffer.byteLength(bytes) })
  }
  function copy(relative) {
    const p = path.join(root, relative), info = fs.lstatSync(p)
    if (info.isSymbolicLink()) throw Error('Source links denied')
    if (info.isDirectory()) for (const child of fs.readdirSync(p)) copy(path.join(relative, child))
    else write(relative, fs.readFileSync(p))
  }
  for (const name of ['app', 'public', 'next.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'tailwind.config.ts']) copy(name)
  for (const name of ['supervised-next-local.mjs', 'supervised-next-scope.mjs', 'supervised-next-denial-scope.mjs', 'supervised-browser-finalization.ts'])
    write('operators/' + name, fs.readFileSync(path.join(root, 'scripts/release', name)))
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(runtime, 'node_modules'), 'junction')
  write('local-fixture.json', JSON.stringify({ programId: sourceProgram, users: source.users.map(u => ({ actor: u.actor, id: u.id })) }))
  write('app/api/local-supervised-test/identity/route.ts', `import {NextResponse} from 'next/server'
import {createServerClient} from '@/app/lib/auth/supabase-server'
import {personalizedCoachingCapabilities} from '@/app/lib/personalized-coaching-capabilities'
import {isSupervisedProgrammingEnabled} from '@/app/lib/coach/supervised-programming-capability'
export async function GET(){const db=await createServerClient();const r=await db.auth.getUser();return NextResponse.json({kind:r.data.user?'identity':'unauthenticated',userId:r.data.user?.id??null,globalNumericalPolicy:personalizedCoachingCapabilities().initialDosePolicy,supervisedEnabled:isSupervisedProgrammingEnabled()},{status:r.data.user?200:401,headers:{'Cache-Control':'no-store'}})}
`)
  write('app/local-supervised-test/page.tsx', `'use client'
import {useState} from 'react'
import {useAuth} from '@/app/lib/auth/AuthContext'
import {createClient} from '@/app/lib/auth/supabase'
import fixture from '@/local-fixture.json'
export default function LocalTest(){const {user,profileStatus}=useAuth();const [status,setStatus]=useState('');async function login(actor:string){setStatus('Signing in');const r=await fetch('/api/local-supervised-test/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor})});if(!r.ok){setStatus('Local login failed');return}const session=await r.json();const s=await createClient().auth.setSession(session);setStatus(s.error?'Session failed':'Signed in '+actor)}async function probe(operation:string){const r=await fetch('/api/local-supervised-test/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation})});setStatus(JSON.stringify(await r.json()))}return <main className="max-w-4xl p-6 space-y-4"><h1>Local supervised Next authentication qualification</h1><p>Authenticated actor: {fixture.users.find(u=>u.id===user?.id)?.actor??'anonymous'}; profile: {profileStatus}</p><p role="status">{status}</p>{fixture.users.map(u=><button key={u.actor} className="p-3 min-h-11 border rounded" onClick={()=>void login(u.actor)}>Sign in as {u.actor}</button>)}<button className="p-3 min-h-11 border rounded" onClick={()=>void createClient().auth.signOut().then(()=>setStatus('Signed out'))}>Sign out locally</button><div className="space-x-2">{${JSON.stringify(denial ? ['identity',...Object.keys(source.requests)] : ['identity','submit','decide','issue','accept','set','complete','session','candidate','new_issue'])}.map(op=><button key={op} className="p-3 min-h-11 border rounded" onClick={()=>void probe(op)}>Check {op}</button>)}</div><a className="block" href="/program/supervised">Open real supervised workspace</a><a className="block" href={'/program/reviewed/plans/'+fixture.programId}>Open real reviewed program</a></main>}
`)
  const receipt = { id, sourceRun, sourceSha, programId: sourceProgram, origin, target: api, runtime, status: 'prepared', createdAt: new Date().toISOString(),
    globalNumericalPolicy: false, supervisedFlag: true, enrollmentEnabled: false, newIssueRequestId: randomUUID(), files, dependencyLockHash: sha(fs.readFileSync(path.join(root, 'package-lock.json'))), journal: [],
    evidenceContract: denial ? 3 : 2, fixtureMode: denial ? 'denial' : 'historical',
    qualification: 'Actual Next development AuthProvider/cookies/pages/routes; generated local login/probe controls. Already-issued candidate different-key conflict is not revocation-gate proof. Not production deployment, password/PKCE flow or named-athlete coaching proof.' }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ id, receipt: receiptPath, files: files.length, status: 'prepared' }))
} else if (mode === 'start') {
  const receipt = JSON.parse(fs.readFileSync(receiptPath)); verifyFiles(receipt)
  if (receipt.status !== 'prepared') throw Error('Fresh prepared run required; no restart')
  const status = JSON.parse(fs.readFileSync(path.join(output, 'local-supabase-status.private.json'))), db = new URL(status.DB_URL)
  if (status.API_URL !== api || db.hostname !== '127.0.0.1' || db.port !== '55322') throw Error('Nonlocal target denied')
  await new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(3013, '127.0.0.1', () => s.close(resolve)) })
  fs.writeFileSync(path.join(directory, 'start.json'), JSON.stringify({ id, programId: sourceProgram, sourceSha, at: new Date().toISOString() }), { flag: 'wx' })
  const child = spawn(process.execPath, [path.join(runtime, 'operators/supervised-next-local.mjs'), 'serve', id], { cwd: root, windowsHide: true, stdio: 'inherit', env: {
    ...safeEnv, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', SOCIUS_LOCAL_NEXT_TEST: id,
    NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    COACH_SUPERVISED_PROGRAMMING_ENABLED: 'true',
  } })
  child.on('error', () => { process.exitCode = 1 }); child.on('exit', code => { process.exitCode = code ?? 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => console.error('Use explicit exact-run finalization; no forced child stop.'))
  console.log(JSON.stringify({ id, pid: child.pid, origin }))
} else if (mode === 'serve') {
  const receipt = JSON.parse(fs.readFileSync(receiptPath)); verifyFiles(receipt)
  if (process.env.SOCIUS_LOCAL_NEXT_TEST !== id || process.env.NEXT_PUBLIC_SUPABASE_URL !== api || process.env.NODE_ENV !== 'development'
    || process.env.COACH_SUPERVISED_PROGRAMMING_ENABLED !== 'true' || receipt.status !== 'prepared') throw Error('Explicit local server context required')
  const save = () => fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
  const attempt = async (name, payload, call) => {
    const e = { name, payload, disposition: 'pending', at: new Date().toISOString() }; receipt.journal.push(e); save()
    try { const result = await call(); e.disposition = 'response_received'; e.result = result; save(); return result }
    catch { e.disposition = 'inspect_required'; save(); throw Error('Inspect original local request; no automatic retry') }
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (![api, origin].includes(u.origin)) throw Error('Nonlocal qualification network denied')
    if (denial && u.origin === api && u.pathname === '/rest/v1/rpc/create_registered_reviewed_week_proposal') {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      if (body.p_registration_id !== source.firstIssue.candidateId || body.p_idempotency_key !== source.firstIssue.requestId) throw Error('Unreserved denial RPC refused')
      let response
      await attempt('denial_issuance_rpc', { registrationId: body.p_registration_id, requestId: body.p_idempotency_key }, async () => {
        response = await originalFetch(input, { ...init, redirect: 'error' })
        const result = await response.clone().json()
        return { status: response.status, code: result.code ?? null,
          enrollmentRevoked: result.message === 'Supervised enrollment changed or disabled' }
      })
      return response
    }
    return originalFetch(input, { ...init, redirect: 'error' })
  }
  const client = (admin = false) => createClient(api, admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  async function login(actor) {
    const u = source.users.find(u => u.actor === actor); if (!u) throw Error('Unknown fixed actor')
    const admin = client(true)
    const found = await attempt('existing_identity', { actor, userId: u.id }, async () => {
      const r = await admin.auth.admin.getUserById(u.id); return { userId: r.data.user?.id, emailMatches: r.data.user?.email === u.email, error: r.error?.code ?? null }
    })
    if (found.error || found.userId !== u.id || !found.emailMatches || !u.email.endsWith('@sociusfit-local.invalid')) throw Error('Fixed existing synthetic identity required')
    let tokenHash
    const issued = await attempt('login_issuance', { actor, userId: u.id }, async () => {
      const r = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email }); tokenHash = r.data.properties?.hashed_token
      return { userId: r.data.user?.id, error: r.error?.code ?? null }
    })
    if (issued.error || issued.userId !== u.id || !tokenHash) throw Error('Existing login not issued')
    const db = client(); let session
    const verified = await attempt('login_verify', { actor, userId: u.id }, async () => {
      const r = await db.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash }); session = r.data.session
      return { userId: r.data.user?.id, error: r.error?.code ?? null }
    }); tokenHash = undefined
    if (verified.error || verified.userId !== u.id || !session) throw Error('Existing login not verified')
    return { db, session }
  }
  let nextApp, server, timer
  try {
    const targetState = verifyTarget(), pre = snapshot(), preBytes = JSON.stringify(pre)
    fs.writeFileSync(path.join(directory, 'before-profile-setup.json'), preBytes, { flag: 'wx' }); receipt.preSetupSha256 = sha(preBytes); save()
    receipt.createdProfiles = []
    for (const user of source.users.filter(u => !targetState.profiles.includes(u.id))) {
      if (!['reviewer', 'foreign'].includes(user.actor)) throw Error('Original athlete profile missing')
      const { db } = await login(user.actor)
      const profile = { user_id: user.id, fitness_goals: ['strength'], activity_level: 'moderately_active', body_metrics: { age: 40 },
        preferences: { units: 'imperial', notifications: false, privacy_level: 'private' }, medical_conditions: [] }
      const created = await attempt('create_missing_synthetic_profile', { actor: user.actor, userId: user.id }, async () => {
        const r = await db.from('user_profiles').insert(profile).select('user_id').single(); return { userId: r.data?.user_id, error: r.error?.code ?? null }
      })
      if (created.error || created.userId !== user.id) throw Error('Synthetic profile setup unconfirmed')
      receipt.createdProfiles.push(user.id); save()
    }
    const ready = verifyTarget(); if (ready.profiles.length !== 3) throw Error('All existing actor profiles required')
    const baseline = snapshot(); if (!preserveBefore(pre, baseline)) throw Error('Profile setup changed prior business rows')
    if (!Object.keys(pre).filter(t => t !== 'user_profiles').every(t => canonical(pre[t]) === canonical(baseline[t]))) throw Error('Profile setup changed another table')
    const countRows = rows => Object.values(rows).reduce((total, count) => total + count, 0)
    if (countRows(baseline.user_profiles) - countRows(pre.user_profiles) !== receipt.createdProfiles.length) throw Error('Unexpected profile additions')
    const baselineBytes = JSON.stringify(baseline); fs.writeFileSync(path.join(directory, 'baseline.json'), baselineBytes, { flag: 'wx' })
    receipt.baselineSha256 = sha(baselineBytes); receipt.preSetupRowsPreserved = true; receipt.baselineTables = Object.keys(baseline); save()
    const require = createRequire(import.meta.url), next = require('next')
    nextApp = next({ dev: true, dir: runtime, hostname: '127.0.0.1', port: 3013 }); await nextApp.prepare()
    const handler = nextApp.getRequestHandler(), drain = new LocalRequestDrain()
    server = createServer(async (req, res) => {
      const release = drain.admit(); if (!release) { res.writeHead(503); res.end('Finalizing'); return }
      const requestUrl = new URL(req.url, origin), pathname = requestUrl.pathname, method = req.method ?? 'GET'
      const entry = { name: 'next_http', payload: { method, path: pathname }, at: new Date().toISOString(), disposition: 'pending' }
      receipt.journal.push(entry); save()
      const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
      const chunks = [], write = res.write.bind(res), end = res.end.bind(res)
      res.write = (chunk, ...args) => { if (pathname.startsWith('/api/') && !pathname.endsWith('/login') && chunk) chunks.push(Buffer.from(chunk)); return write(chunk, ...args) }
      res.end = (chunk, ...args) => { if (pathname.startsWith('/api/') && !pathname.endsWith('/login') && chunk) chunks.push(Buffer.from(chunk)); return end(chunk, ...args) }
      try {
        if (req.headers.host !== '127.0.0.1:3013' || (method !== 'GET' && req.headers.origin !== origin) || !(denial ? allowedDenialPath : allowedNextPath)(source, method, pathname, requestUrl.search)) { json({ kind: 'outside_qualification_scope' }, 403); return }
        if (pathname === '/api/local-supervised-test/login' || pathname === '/api/local-supervised-test/probe') {
          let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 2000) throw Error('Local control too large') }
          const body = JSON.parse(raw)
          if (pathname.endsWith('/login')) {
            if (Object.keys(body).join(',') !== 'actor') { json({ kind: 'invalid_request' }, 400); return }
            const { session } = await login(body.actor); json({ access_token: session.access_token, refresh_token: session.refresh_token }); entry.result = { status: 200, loginActor: body.actor }; return
          }
          if (Object.keys(body).join(',') !== 'operation') { json({ kind: 'invalid_request' }, 400); return }
          const headers = { Cookie: req.headers.cookie ?? '', Origin: origin, 'Content-Type': 'application/json' }
          const identity = await fetch(origin + '/api/local-supervised-test/identity', { headers }), actor = (await identity.json()).userId
          if (denial && body.operation !== 'identity' && receipt.journal.some(e => e !== entry && e.name === 'next_http'
            && e.payload.path === '/api/local-supervised-test/probe' && e.payload.operation === body.operation)) { json({ kind: 'reserved_probe_already_attempted' }, 409); return }
          const probe = body.operation === 'identity' ? { path: '/api/local-supervised-test/identity', method: 'GET' }
            : denial ? denialProbe(source, body.operation, actor) : originalProbe(source, body.operation, actor, receipt.newIssueRequestId)
          entry.payload.operation = body.operation; entry.payload.actorId = actor
          entry.payload.intended = { path: probe.path, method: probe.method ?? 'POST', requestId: probe.body?.requestId ?? probe.body?.pending?.body?.requestId ?? null,
            bodySha256: probe.body ? sha(JSON.stringify(probe.body)) : null }; save()
          entry.payload.innerJournalIndex = receipt.journal.length; save()
          const r = await fetch(origin + probe.path, { method: probe.method ?? 'POST', headers, ...(probe.body ? { body: JSON.stringify(probe.body) } : {}) })
          const value = safeNextResult(await r.json()); entry.result = { status: 200, probeStatus: r.status, ...value }; json({ operation: body.operation, status: r.status, ...value }); return
        }
        let nextRequest = req
        if (method === 'POST' && (denial ? Object.values(source.requests).some(p=>p.path===pathname)
          : ['/api/coach/supervised/resolution', '/api/coach/supervised/recover', '/api/coach/supervised/issue'].includes(pathname))) {
          let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 600000) throw Error('Fixed application request too large') }
          const body = JSON.parse(raw)
          if (!(denial ? fixedDenialBody(source, pathname, body, raw) : fixedNextBody(source, pathname, body, receipt.newIssueRequestId))) { json({ kind: 'outside_qualification_scope' }, 403); return }
          if (denial && receipt.journal.some(e => e !== entry && e.name === 'next_http' && e.payload.path === pathname && e.payload.bodySha256 === sha(raw))) { json({ kind: 'reserved_request_already_attempted' }, 409); return }
          // The qualification boundary consumes the original stream to check its
          // exact immutable envelope, then supplies the same body/headers/socket
          // to Next. No production route or cookie adapter is replaced.
          nextRequest = new IncomingMessage(req.socket)
          Object.assign(nextRequest, { headers: req.headers, rawHeaders: req.rawHeaders, method: req.method, url: req.url,
            httpVersion: req.httpVersion, httpVersionMajor: req.httpVersionMajor, httpVersionMinor: req.httpVersionMinor, complete: true })
          nextRequest.push(Buffer.from(raw)); nextRequest.push(null)
          entry.payload.requestId = body.requestId ?? body.pending?.body?.requestId ?? null; entry.payload.bodySha256 = sha(raw); save()
        }
        await handler(nextRequest, res)
      } catch { if (!res.headersSent) json({ kind: 'inspect_required' }, 500); else res.end() }
      finally {
        entry.disposition = res.writableEnded ? 'response_received' : 'inspect_required'
        if (!entry.result) { let value; try { value = JSON.parse(Buffer.concat(chunks).toString()) } catch { value = null }
          entry.result = { status: res.statusCode, ...safeNextResult(value) } }
        save(); release()
      }
    })
    let stopping = false
    async function stop(request) {
      if (stopping) return; stopping = true; clearInterval(timer); receipt.status = 'finalizing'; receipt.finalization = request; save()
      const drained = drain.begin(); const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      try {
        await drained; await nextApp.close(); server.closeAllConnections(); await closed
        if (!receipt.journal.every(e => e.disposition === 'response_received')) throw Error('Unconfirmed intended request')
        verifyFiles(receipt); const final = snapshot(); fs.writeFileSync(path.join(directory, 'final-snapshot.json'), JSON.stringify(final), { flag: 'wx' })
        if (!sameSnapshot(baseline, final)) throw Error('Post-setup business state changed')
        receipt.publicTablesUnchanged = true; receipt.authIdentityUnchanged = true; receipt.status = 'stopped'; receipt.finishedAt = new Date().toISOString(); save(); process.exit(0)
      } catch (error) { receipt.status = 'inspect_required'; receipt.failure = error.message; save(); process.exit(1) }
    }
    timer = setInterval(() => { const file = path.join(directory, 'finalize.json'); if (!fs.existsSync(file)) return
      try { const request = localFinalization(JSON.parse(fs.readFileSync(file)), id, sourceProgram); if (request) void stop(request) } catch {} }, 500)
    server.on('error', () => { receipt.status = 'listen_failed'; save(); void nextApp.close() })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3013, '127.0.0.1', resolve) })
    receipt.status = 'listening'; receipt.pid = process.pid; save(); console.log(JSON.stringify({ id, origin, receipt: receiptPath, pid: process.pid }))
  } catch (error) { if (timer) clearInterval(timer); receipt.status = 'inspect_required'; receipt.failure = error.message; save(); if (nextApp) await nextApp.close(); process.exitCode = 1; console.error('Local Next preparation failed; inspect retained receipt.') }
} else if (mode === 'finalize') {
  const receipt = JSON.parse(fs.readFileSync(receiptPath)); verifyFiles(receipt)
  if (receipt.status !== 'listening' || !receipt.journal.every(e => e.disposition === 'response_received')) throw Error('Listening confirmed run required')
  const bytes = fs.readFileSync(path.join(directory, 'baseline.json')); if (sha(bytes) !== receipt.baselineSha256) throw Error('Baseline identity changed')
  const request = { operation: 'finalize', runId: id, programId: sourceProgram, requestId: randomUUID() }
  fs.writeFileSync(path.join(directory, 'finalize.json'), JSON.stringify(request), { flag: 'wx' }); console.log(JSON.stringify({ requested: true, id, requestId: request.requestId }))
} else {
  const receipt = JSON.parse(fs.readFileSync(receiptPath)); verifyFiles(receipt)
  if (receipt.evidenceContract !== (denial ? 3 : 2)) throw Error('Original evidence contract retained; use its copied verifier, never relabel prior runs')
  if (receipt.status !== 'stopped' || !receipt.publicTablesUnchanged || !receipt.authIdentityUnchanged || !receipt.preSetupRowsPreserved) throw Error('Verified stopped run required')
  const bytes = fs.readFileSync(path.join(directory, 'baseline.json')); if (sha(bytes) !== receipt.baselineSha256 || !sameSnapshot(JSON.parse(bytes), snapshot())) throw Error('Final live state differs from baseline')
  if (!receipt.journal.every(e => e.disposition === 'response_received')) throw Error('Unconfirmed intended request')
  const probes = receipt.journal.filter(e => e.name === 'next_http' && e.payload.path === '/api/local-supervised-test/probe')
  const check = (value, label) => { if (!value) throw Error(label) }
  if (denial) {
    for (const actor of [null,...source.users.map(u=>u.id)]) check(probes.some(e => e.payload.operation === 'identity' && e.payload.actorId === actor
      && provenNextProbe(receipt.journal,e,actor ? 200 : 401,actor ? 'identity' : 'unauthenticated')
      && e.result.userId === actor && e.result.globalNumericalPolicy === false && e.result.supervisedEnabled === true), 'Actual anonymous/actor cookie identity required')
    for (const [operation,p] of Object.entries(source.requests)) {
      const status = operation === 'revoked_first_issue' ? 503 : 409, kind = operation === 'revoked_first_issue' ? 'retry_required' : 'disabled'
      check(probes.some(e => e.payload.operation === operation && e.payload.actorId === p.body.expectedUserId && provenNextProbe(receipt.journal,e,status,kind)), 'Actual exact '+operation+' denial required')
      check(receipt.journal.filter(e=>e.name==='next_http' && e.payload.path===p.path && e.payload.bodySha256===p.bodySha256).length===1, 'Reserved envelope attempted exactly once')
    }
    const rpc = receipt.journal.filter(e=>e.name==='denial_issuance_rpc')
    check(rpc.length===1 && rpc[0].result.code==='55000' && rpc[0].result.enrollmentRevoked===true, 'First issuance reached exact SQL revocation guard')
    const report = { id,status:'passed',claim:'Actual local Next cookies and four reserved revoked-scope denial routes; exact SQL first-issuance revocation; no business state changes',
      receiptSha256:sha(fs.readFileSync(receiptPath)),files:receipt.files.length,publicTables:receipt.baselineTables.filter(t=>t!=='auth_identity').length,journalEntries:receipt.journal.length,
      limits:['Synthetic actors and generated test login; no production or coaching suitability proof.'] }
    fs.writeFileSync(path.join(directory,'readback-'+randomUUID()+'.json'),JSON.stringify(report,null,2),{flag:'wx'}); console.log(JSON.stringify(report)); process.exit(0)
  }
  const owner = source.users.find(u => u.actor === 'athlete').id, reviewer = source.users.find(u => u.actor === 'reviewer').id, foreign = source.users.find(u => u.actor === 'foreign').id
  const has = (actor, operation, predicate) => probes.some(e => e.payload.actorId === actor && e.payload.operation === operation && predicate(e.result))
  for (const actor of [null, owner, reviewer, foreign]) check(has(actor, 'identity', r => r.probeStatus === (actor ? 200 : 401)
    && r.userId === actor && r.globalNumericalPolicy === false && r.supervisedEnabled === true), 'Actual anonymous and three actor cookie identities required')
  const posts = source.journal.filter(e => e.name === 'browser_http' && e.payload.method === 'POST')
  for (const [operation, actor, originalPath, field] of [['submit', owner, '/api/coach/supervised/candidates', 'candidateId'],
    ['decide', reviewer, '/api/coach/supervised/decisions', 'decisionId'], ['issue', owner, '/api/coach/supervised/issue', 'proposalId']]) {
    const original = posts.find(e => e.payload.path === originalPath).result.result
    const expected = operation === 'submit' ? original.candidate.candidateId : operation === 'decide' ? original.receipt.decisionId : original.proposalId
    check(has(actor, operation, r => r.probeStatus === 200 && r.kind === 'resolved' && r.resolution?.disposition === 'saved' && r.resolution[field] === expected), 'Exact saved ' + operation + ' cookie recovery required')
  }
  const accept = posts.find(e => e.payload.path.endsWith('/accept')).result.result.accepted
  const set = posts.find(e => e.payload.path.endsWith('/sets')).result.result.setReport
  const completed = posts.find(e => e.payload.path.endsWith('/complete')).result.result.result
  check(has(owner, 'accept', r => r.probeStatus === 200 && r.kind === 'recovered' && r.receipt?.activePlanVersionId === accept.active_plan_version_id), 'Exact acceptance recovery required')
  check(has(owner, 'set', r => r.probeStatus === 200 && r.kind === 'recovered' && r.receipt?.reportId === set.id), 'Exact set recovery required')
  check(has(owner, 'complete', r => r.probeStatus === 200 && r.kind === 'recovered' && r.receipt?.sessionId === completed.prescribed_session_id && r.receipt.workoutId === completed.workout_id), 'Exact completion recovery required')
  check(probes.some(e => e.payload.actorId === owner && e.payload.operation === 'new_issue'
    && provenNextProbe(receipt.journal, e, 409, 'request_conflict')), 'Actual already-issued candidate different-key conflict required')
  check(has(foreign, 'session', r => r.probeStatus === 409 && r.kind === 'disabled' && !r.fields.includes('session')), 'Foreign direct session denial required')
  check(probes.some(e => e.payload.actorId === reviewer && e.payload.operation === 'candidate'
    && provenNextProbe(receipt.journal, e, 503, 'unavailable') && !e.result.fields.includes('candidate')
    && !e.result.fields.includes('reviewPacket')), 'Actual revoked reviewer packet unavailable response required')
  check(receipt.journal.some(e => e.payload.path === '/api/coach/supervised/programs' && e.result.actorId === owner && e.result.programIds?.includes(sourceProgram)), 'Actual owner workspace discovery required')
  check(receipt.journal.some(e => e.payload.path === '/api/coach/supervised/programs' && e.result.actorId === reviewer && !e.result.programIds?.includes(sourceProgram)), 'Revoked fixture absent from reviewer discovery required')
  const report = { id, status: 'passed', claim: 'Actual local Next cookie identity, revoked reviewer packet unavailable, already-issued candidate different-key conflict, fixed discovery and exact historical recovery with no state change; browser screenshots verify page rendering separately', receiptSha256: sha(fs.readFileSync(receiptPath)), files: receipt.files.length, publicTables: receipt.baselineTables.filter(t => t !== 'auth_identity').length,
    journalEntries: receipt.journal.length, limits: ['Auth session/token fields may change; identity projection only is preserved.', receipt.qualification] }
  fs.writeFileSync(path.join(directory, 'readback-' + randomUUID() + '.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report))
}
