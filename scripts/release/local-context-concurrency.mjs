// Synthetic local release verification. Never accepts a host/connection override.
// Uses existing tools and real PostgreSQL sessions; does not reset or migrate.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { CookieAuthStorageAdapter } from '@supabase/auth-helpers-shared'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(repo, 'output/app-quality-release')
const podman = path.join(output, 'tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe')
const connection = 'sociusfit-local'
const container = 'supabase_db_sociusfit-programming-local'
const project = 'sociusfit-programming-local'
const runId = crypto.randomUUID()
const checks = []
const sessions = []
const startedAt = new Date().toISOString()
let phase = 'target guard'
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
const literal = value => value === null ? 'NULL' : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`
const argsSql = args => args.map(literal).join(',')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function podmanRead(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(podman, ['--connection', connection, ...args], { windowsHide: true, env: childEnv })
    let out = ''
    const timer = setTimeout(() => { child.kill(); reject(Error('Local target inspection timed out')) }, 15_000)
    child.stdout.on('data', data => { out += data })
    child.stderr.resume()
    child.once('error', () => { clearTimeout(timer); reject(Error('Local Podman launch failed')) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(Error(`Local target inspection failed (${code})`)) })
  })
}

class Session {
  constructor(name) {
    this.name = name
    this.buffer = ''
    this.pending = null
    this.errorFrames = []
    this.child = spawn(podman, ['--connection', connection, 'exec', '-i', container,
      'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=0', '-v', 'VERBOSITY=verbose'],
    { windowsHide: true, env: childEnv })
    this.child.stdout.on('data', data => this.consume(data.toString()))
    // Retain only function names/line numbers from SQL error context, never SQL
    // text or arguments. These identify an earlier blocking trigger safely.
    this.child.stderr.on('data', data => {
      for (const match of data.toString().matchAll(/PL\/pgSQL function ([\w.]+)\([^\n]*?\) line (\d+)/g)) {
        this.errorFrames.push({ function: match[1], line: Number(match[2]) })
      }
    })
    this.child.once('error', () => this.fail(Error(`Session ${name} could not launch`)))
    this.child.once('exit', code => this.fail(Error(`Session ${name} exited (${code})`)))
    sessions.push(this)
  }
  fail(error) {
    this.exited = true
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null }
  }
  consume(chunk) {
    this.buffer += chunk
    let newline
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      if (!this.pending) continue
      if (line.startsWith(this.pending.marker + ' ')) {
        const pending = this.pending
        this.pending = null
        clearTimeout(pending.timer)
        const result = { code: line.slice(pending.marker.length + 1).trim(), lines: pending.lines, errorFrames: pending.errorFrames, elapsedMs: Math.round(performance.now() - pending.start) }
        // stdout/stderr are independent streams. Briefly drain the sanitized
        // context frames after the stdout marker before issuing another query.
        setTimeout(() => pending.resolve(result), 10)
      } else if (line) this.pending.lines.push(line)
    }
  }
  request(sql) {
    assert(!this.pending, `Session ${this.name} already has an operation`)
    assert(!this.exited, `Session ${this.name} has exited`)
    return new Promise((resolve, reject) => {
      const marker = `LOCAL_DONE_${crypto.randomUUID().replaceAll('-', '')}`
      const timer = setTimeout(() => {
        this.pending = null
        this.child.kill()
        reject(Error(`Session ${this.name} operation deadline exceeded`))
      }, 12_000)
      this.errorFrames = []
      this.pending = { marker, timer, resolve, reject, lines: [], errorFrames: this.errorFrames, start: performance.now() }
      this.child.stdin.write(`${sql}\n\\echo ${marker} :SQLSTATE\n`)
    })
  }
  async exec(sql) {
    const result = await this.request(sql)
    if (result.code !== '00000') throw Error(`Session ${this.name}: SQLSTATE ${result.code} during ${phase}`)
    return result
  }
  async json(sql) {
    const result = await this.exec(sql)
    assert.equal(result.lines.length, 1, `Expected one JSON result in ${this.name}`)
    return JSON.parse(result.lines[0])
  }
  async begin(owner) {
    await this.exec('BEGIN;')
    await this.exec("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='6s';")
    await this.exec(`SET LOCAL ROLE authenticated;`)
    await this.exec(`SELECT set_config('request.jwt.claim.sub',${literal(owner)},true);`)
    await this.exec(`SELECT set_config('request.jwt.claims',${literal({ sub: owner, role: 'authenticated' })},true);`)
  }
  async end(command = 'COMMIT') { return this.exec(`${command};`) }
  async close() {
    if (this.exited) return
    if (this.pending) { this.child.kill(); return }
    try { await this.exec('ROLLBACK;') } catch { /* Connection loss already aborts its transaction. */ }
    this.child.stdin.end('\\q\n')
  }
}

const record = (name, details = {}) => { checks.push({ name, passed: true, ...details }); console.log(`PASS ${name}`) }
const rpcSql = (name, args) => `SELECT row_to_json(q) FROM public.${name}(${argsSql(args)}) q;`
const scalarSql = (name, args = []) => `SELECT to_json(public.${name}(${argsSql(args)}));`
const rpc = (session, name, args = []) => session.json(rpcSql(name, args))
const scalar = (session, name, args = []) => session.json(scalarSql(name, args))
const isConflict = code => code === '40001' || code === '55P03'
async function transaction(session, owner, fn) {
  await session.begin(owner)
  try { const result = await fn(); await session.end(); return result }
  catch (error) { await session.end('ROLLBACK'); throw error }
}

const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] },
  fields: { quantities: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] } } }
const work = { workout_date: '2026-09-21', input_text: 'Synthetic local concurrency squat', blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: 5, weight: '80 lb' }] }] }
const planIntent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }], fixture: 'Synthetic SQL concurrency contract only; not app compiler quality evidence' }
const prescriptionSessions = (day = '2026-09-21') => [{ week_number: 1, session_index: 1, scheduled_date: day,
  prescription: { domain: 'strength', intent: 'Repeat controlled synthetic work', dose: {}, effort: 'Controlled', rest: 'As needed',
    success_condition: 'Quality', stop_condition: 'Stop on pain', scale_options: [], evidence: {} } }]
const initialArgs = (revision, key = crypto.randomUUID()) => ['Synthetic concurrency week', 'Local test only', '2026-09-21', '2027-04-01', {}, 'fixture-reference', 'fixture-policy',
  planIntent, { contextRevision: revision }, prescriptionSessions(), {}, 'a'.repeat(64), key]
const reviewArgs = (p, revision, key = crypto.randomUUID()) => [p.proposed_program_id, p.proposed_plan_version_id,
  '2026-09-21', 'athlete_requested', 'continue', 'same_track', 'sufficient', 0.8, {}, {}, {}, [], null,
  { executionSources: [], observationSources: [], contextRevision: revision }, [], 'rolling-weekly-0.1.0', 'weekly-review-0.4.0', 'c'.repeat(64), key]
const replacementArgs = (p, reviewId, revision) => [p.proposed_program_id, p.proposed_plan_version_id, reviewId,
  'Synthetic successor', 'Local test only', '2026-09-28', '2027-04-01', {}, 'fixture-reference', 'fixture-policy', planIntent,
  { contextRevision: revision }, prescriptionSessions('2026-09-28'), {}, 'd'.repeat(64), crypto.randomUUID()]
async function logWorkout(session) {
  const request = await scalar(session, 'begin_logging_request', [crypto.randomUUID(), 'b'.repeat(64)])
  const items = await scalar(session, 'freeze_logging_request_items', [request.id, [{ sourceItemId: 'source', kind: 'workout',
    record: work, blocks: [{}], provenance, inputMethod: 'text', eventAt: work.workout_date }]])
  return scalar(session, 'commit_logging_request_item', [items[0].id])
}
async function assessment(session) {
  // Actual authenticated table grant, deliberately a source whose only dirty
  // epoch is the coach revision. This reaches the final NOWAIT fence directly.
  await session.exec(`INSERT INTO public.coach_strength_assessments(user_id,idempotency_key,input_fingerprint,movement,load,unit,reps,assessed_on,athlete_confidence,estimated_1rm,estimate_kind,calculator_version)
    VALUES(auth.uid(),${literal(crypto.randomUUID())},${literal('e'.repeat(64))},'Synthetic concurrency squat',80,'kg',1,'2026-09-21',1,80,'reported_1rm','fixture');`)
}
function mutationSql(kind, receipt) {
  if (kind === 'correct') return scalarSql('amend_logged_activity', ['workout', receipt.entityId, 1, crypto.randomUUID(),
    { ...work, input_text: 'Synthetic corrected actual repetitions' }, [{}], provenance])
  if (kind === 'delete') return scalarSql('delete_logged_activity', ['workout', receipt.entityId, 1, crypto.randomUUID()])
  throw Error('Unsupported source mutation')
}
async function expectState(session, sql, code) {
  const result = await session.request(sql)
  assert.equal(result.code, code, `Expected SQLSTATE ${code}, got ${result.code} during ${phase}`)
  return result
}
const ownedTables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations']
async function counts(observer, owner) {
  return observer.json(`SELECT json_build_object(${ownedTables.flatMap(t => [literal(t), `(SELECT count(*) FROM public.${t} WHERE user_id=${literal(owner)})`]).join(',')});`)
}
async function ownerSnapshot(observer, owner) {
  return observer.json(`SELECT json_build_object('revision',(SELECT revision FROM public.coach_context_revisions WHERE user_id=${literal(owner)}),
    'workouts',(SELECT coalesce(json_agg(to_jsonb(w) ORDER BY id),'[]'::json) FROM public.workouts w WHERE user_id=${literal(owner)}));`)
}
async function observeBlocking(observer, blockedPid, blockerPid) {
  const deadline = Date.now() + 3500
  do {
    const state = await observer.json(`SELECT json_build_object('blockedPid',${blockedPid},'blockerPid',${blockerPid},
      'blockers',pg_blocking_pids(${blockedPid}),'waitEventType',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${blockedPid}),
      'waitEvent',(SELECT wait_event FROM pg_stat_activity WHERE pid=${blockedPid}),
      'ungrantedLocks',(SELECT count(*) FROM pg_locks WHERE pid=${blockedPid} AND NOT granted),
      'tupleRelations',(SELECT coalesce(json_agg(DISTINCT relation::regclass::text),'[]'::json) FROM pg_locks WHERE pid=${blockedPid} AND locktype='tuple'));`)
    if (state.blockers.includes(blockerPid) && state.waitEventType === 'Lock' && state.ungrantedLocks > 0) return state
    await pause(40)
  } while (Date.now() < deadline)
  throw Error('Expected independently observed blocking relationship was not established')
}

let failure = null
let backends = []
let liveFunctions = []
let httpCookie = null
try {
  const configPath = path.join(output, 'local-supabase/supabase/config.toml')
  assert.match(fs.readFileSync(configPath, 'utf8'), /^project_id = "sociusfit-programming-local"\s*$/m)
  assert(!fs.existsSync(path.join(output, 'local-supabase/supabase/.temp/project-ref')), 'Refusing linked project')
  const status = JSON.parse(fs.readFileSync(path.join(output, 'local-supabase-status.private.json'), 'utf8'))
  assert.equal(status.API_URL, 'http://127.0.0.1:55321')
  const dbUrl = new URL(status.DB_URL)
  assert.equal(dbUrl.hostname, '127.0.0.1')
  assert.equal(dbUrl.port, '55322')
  assert.equal(dbUrl.pathname, '/postgres')
  const inspected = JSON.parse(await podmanRead(['inspect', container]))[0]
  assert.equal(inspected.Name.replace(/^\//, ''), container)
  assert.equal(inspected.Config.Labels['com.supabase.cli.project'], project)
  assert.equal(inspected.State.Status, 'running')
  const a = new Session('source-A'), b = new Session('decision-B'), observer = new Session('observer')
  for (const session of sessions) {
    const identity = await session.json("SELECT json_build_object('pid',pg_backend_pid(),'version',current_setting('server_version'),'database',current_database(),'role',current_user);")
    assert.match(identity.version, /^17\.6(?:\D|$)/)
    assert.equal(identity.database, 'postgres')
    assert.equal(identity.role, 'postgres')
    session.pid = identity.pid
    backends.push({ name: session.name, ...identity })
  }
  assert.equal(new Set(backends.map(x => x.pid)).size, 3)
  const guards = await observer.json("SELECT json_build_object('revisionTable',to_regclass('public.coach_context_revisions') IS NOT NULL,'proposalGuard',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='zz_guard_coach_proposal_context'),'reviewDeferred',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_coach_review_context' AND tgdeferrable AND tginitdeferred));")
  assert.deepEqual(guards, { revisionTable: true, proposalGuard: true, reviewDeferred: true })
  const timeouts = await observer.json("SELECT json_agg(json_build_object('function',proname,'config',proconfig,'definitionMd5',md5(replace(pg_get_functiondef(oid),chr(13),''))) ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_coach_context_revision','create_initial_rolling_weekly_proposal','record_coach_weekly_review','create_rolling_weekly_replacement_proposal','accept_adaptation_proposal');")
  liveFunctions = timeouts
  assert.equal(timeouts.length, 5)
  for (const fn of timeouts) assert(fn.config.includes('lock_timeout=1s'), `Local migration is not current for ${fn.function}; coordinate installation before running`)
  record('fixed local target and three independent PostgreSQL backends', { guards })
  record('function-scoped one-second operational lock caps', { timeouts })

  phase = 'create separate synthetic owners'
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const owners = []
  for (const name of ['concurrency-owner-a', 'concurrency-owner-b']) {
    const email = `${name}-${runId}@sociusfit-local.invalid`, password = crypto.randomBytes(24).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw Error('Local synthetic Auth account creation failed')
    owners.push({ name, id: data.user.id })
    fs.writeFileSync(path.join(output, `local-context-concurrency-${runId}.owners.private.json`), JSON.stringify(owners, null, 2))
    if (name === 'concurrency-owner-a' && process.argv.includes('--http')) {
      const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const signedIn = await client.auth.signInWithPassword({ email, password })
      assert(!signedIn.error && signedIn.data.user?.id === data.user.id, 'Local HTTP test identity mismatch')
      const parts = []
      class LocalCookieAdapter extends CookieAuthStorageAdapter {
        setCookie(key, value) { parts.push(`${key}=${encodeURIComponent(value)}`) }
      }
      new LocalCookieAdapter().setItem('sb-127-auth-token', JSON.stringify(signedIn.data.session))
      httpCookie = parts.join('; ')
    }
  }
  const owner = owners[0].id, foreign = owners[1].id
  const revision = () => transaction(b, owner, () => scalar(b, 'get_coach_context_revision'))
  await revision()
  phase = 'first revision read contends with uncommitted source initialization'
  await a.begin(foreign)
  await logWorkout(a)
  await b.begin(foreign)
  const revisionConflict = await expectState(b, scalarSql('get_coach_context_revision'), '55P03')
  assert(revisionConflict.elapsedMs < 3000)
  await b.end('ROLLBACK')
  await a.end('ROLLBACK')
  assert.equal(await observer.json(`SELECT to_json(count(*)) FROM public.coach_context_revisions WHERE user_id=${literal(foreign)};`), 0)
  record(phase, { conflictSqlState: revisionConflict.code, conflictMs: revisionConflict.elapsedMs, noPartialInitialization: true })
  await transaction(b, foreign, () => scalar(b, 'get_coach_context_revision'))

  // Source-first races prove NOWAIT mapping and decision rollback, including
  // actual correction/deletion RPCs. Existing fixture users are never touched.
  for (const kind of ['insert', 'correct', 'delete']) {
    for (const outcome of ['ROLLBACK', 'COMMIT']) {
      phase = `source-first ${kind} ${outcome}`
      const seed = kind === 'insert' ? null : await transaction(a, owner, () => logWorkout(a))
      const observed = await revision(), before = await counts(observer, owner), sourceBefore = await ownerSnapshot(observer, owner)
      await a.begin(owner)
      if (kind === 'insert') await logWorkout(a)
      else await a.exec(mutationSql(kind, seed))
      await b.begin(owner)
      const deciding = b.request(rpcSql('create_initial_rolling_weekly_proposal', initialArgs(observed)))
      let blocking = null
      // Normally the NOWAIT guard resolves before this observation. A real
      // earlier lock wait is retained as diagnostic evidence, not called success.
      await pause(80)
      if (b.pending) blocking = await observeBlocking(observer, b.pid, a.pid)
      const result = await deciding
      if (!isConflict(result.code)) checks.push({ name: phase, passed: false, actualSqlState: result.code, elapsedMs: result.elapsedMs, blocking, errorFrames: result.errorFrames })
      assert(isConflict(result.code), `Expected context/lock conflict during ${phase}`)
      assert(result.elapsedMs < 3000, 'Decision conflict exceeded its operational bound')
      await b.end('ROLLBACK')
      assert.deepEqual(await counts(observer, owner), before)
      await a.end(outcome)
      const sourceAfter = await ownerSnapshot(observer, owner)
      if (outcome === 'ROLLBACK') assert.deepEqual(sourceAfter, sourceBefore)
      else assert(sourceAfter.revision > observed)
      // A fresh revision also passes the real proposal guard; roll back this
      // probe so each source-first case starts without a persisted proposal.
      const fresh = await revision()
      await b.begin(owner)
      await rpc(b, 'create_initial_rolling_weekly_proposal', initialArgs(fresh))
      await b.end('ROLLBACK')
      assert.deepEqual(await counts(observer, owner), before)
      record(phase, { conflictSqlState: result.code, conflictMs: result.elapsedMs, blocking, errorFrames: result.errorFrames, decisionWritesRolledBack: true, freshRetry: true, sourceOutcome: outcome })
    }
  }

  phase = 'final proposal revision fence remains NOWAIT'
  const directRevision = await revision(), beforeDirectFence = await counts(observer, owner)
  await a.begin(owner)
  await assessment(a)
  await b.begin(owner)
  const directFence = await expectState(b, rpcSql('create_initial_rolling_weekly_proposal', initialArgs(directRevision)), '40001')
  await b.end('ROLLBACK')
  await a.end('ROLLBACK')
  assert.deepEqual(await counts(observer, owner), beforeDirectFence)
  record(phase, { sqlState: directFence.code, elapsedMs: directFence.elapsedMs, noDecisionWrites: true })

  // Reverse order proves the successful proposal guard retains its SHARE fence
  // until transaction end. Barrier uses actual blocking PIDs, not elapsed sleep.
  let staleProposal
  for (const outcome of ['ROLLBACK', 'COMMIT']) {
    phase = `proposal-fence-before-source ${outcome}`
    const seed = await transaction(a, owner, () => logWorkout(a))
    const observed = await revision(), before = await counts(observer, owner)
    await b.begin(owner)
    const args = initialArgs(observed)
    const proposal = { ...(await rpc(b, 'create_initial_rolling_weekly_proposal', args)), key: args.at(-1) }
    await observer.exec('BEGIN;')
    await expectState(observer, `SELECT revision FROM public.coach_context_revisions WHERE user_id=${literal(owner)} FOR UPDATE NOWAIT;`, '55P03')
    await observer.end('ROLLBACK')
    await a.begin(owner)
    const writing = a.request(mutationSql('correct', seed))
    const blocking = await observeBlocking(observer, a.pid, b.pid)
    await b.end(outcome)
    const written = await writing
    assert.equal(written.code, '00000')
    await a.end()
    assert((await revision()) > observed)
    if (outcome === 'ROLLBACK') assert.deepEqual(await counts(observer, owner), before)
    else staleProposal = proposal
    record(phase, { blocking, decisionOutcome: outcome, revisionFenceProbeSqlState: '55P03', sourceCommittedAfterFenceRelease: true })
  }

  phase = 'stale first acceptance and fresh recovery'
  const beforeAcceptance = await counts(observer, owner)
  await b.begin(owner)
  await expectState(b, rpcSql('accept_adaptation_proposal', [staleProposal.proposal_id, staleProposal.key]), '40001')
  await b.end('ROLLBACK')
  assert.deepEqual(await counts(observer, owner), beforeAcceptance)
  const freshArgs = initialArgs(await revision())
  const acceptedProposal = { ...(await transaction(b, owner, () => rpc(b, 'create_initial_rolling_weekly_proposal', freshArgs))), key: freshArgs.at(-1) }
  await a.begin(owner)
  await logWorkout(a)
  await b.begin(owner)
  const heldAcceptance = await b.request(rpcSql('accept_adaptation_proposal', [acceptedProposal.proposal_id, acceptedProposal.key]))
  assert(isConflict(heldAcceptance.code))
  assert(heldAcceptance.elapsedMs < 3000)
  await b.end('ROLLBACK')
  if (httpCookie) {
    const response = await fetch(`http://127.0.0.1:3011/api/coach/proposals/${acceptedProposal.proposal_id}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: httpCookie },
      body: JSON.stringify({ idempotencyKey: acceptedProposal.key }), signal: AbortSignal.timeout(30_000), redirect: 'error',
    })
    const body = await response.json()
    assert.equal(response.status, 409)
    assert(['Your training information is being updated; wait a moment, then refresh and retry',
      'Your training information changed; refresh and create a new proposal'].includes(body.error))
    record('real local authenticated HTTP acceptance conflict', { status: response.status, noAcceptanceReported: !body.accepted })
  }
  await a.end('ROLLBACK')
  assert.equal(await observer.json(`SELECT to_json(status) FROM public.adaptation_proposals WHERE id=${literal(acceptedProposal.proposal_id)};`), 'proposed')
  const accepted = await transaction(b, owner, () => rpc(b, 'accept_adaptation_proposal', [acceptedProposal.proposal_id, acceptedProposal.key]))
  assert.equal(accepted.proposal_status, 'accepted')
  record(phase, { staleSqlState: '40001', heldSourceConflict: heldAcceptance.code, heldSourceConflictMs: heldAcceptance.elapsedMs, freshAccepted: true })

  phase = 'accepted replay remains immutable after source mutation'
  const acceptedSnapshotSql = `SELECT to_jsonb(p) FROM public.training_plan_versions p WHERE id=${literal(acceptedProposal.proposed_plan_version_id)};`
  const acceptedBefore = await observer.json(acceptedSnapshotSql), acceptedCounts = await counts(observer, owner)
  await transaction(a, owner, () => logWorkout(a))
  const replay = await transaction(b, owner, () => rpc(b, 'accept_adaptation_proposal', [acceptedProposal.proposal_id, acceptedProposal.key]))
  assert.deepEqual(replay, accepted)
  assert.deepEqual(await observer.json(acceptedSnapshotSql), acceptedBefore)
  assert.deepEqual(await counts(observer, owner), acceptedCounts)
  record(phase, { sameResult: true, entireAcceptedPlanUnchanged: true, noDuplicateDecisionRows: true })

  for (const outcome of ['ROLLBACK', 'COMMIT']) {
    phase = `review-earlier-recommendation-lock ${outcome}`
    const observed = await revision(), before = await counts(observer, owner)
    await a.begin(owner)
    await logWorkout(a)
    await b.begin(owner)
    const result = await expectState(b, rpcSql('record_coach_weekly_review', reviewArgs(acceptedProposal, observed)), '55P03')
    assert(result.elapsedMs < 3000)
    await b.end('ROLLBACK')
    assert.deepEqual(await counts(observer, owner), before)
    await a.end(outcome)
    record(phase, { rpcSqlState: result.code, rpcMs: result.elapsedMs, reviewWritesRolledBack: true, sourceOutcome: outcome })
  }
  for (const outcome of ['ROLLBACK', 'COMMIT']) {
    phase = `deferred-review-source-conflict ${outcome}`
    const observed = await revision(), before = await counts(observer, owner)
    await a.begin(owner)
    await assessment(a)
    await b.begin(owner)
    await rpc(b, 'record_coach_weekly_review', reviewArgs(acceptedProposal, observed))
    const result = await expectState(b, 'COMMIT;', '40001')
    assert(result.elapsedMs < 4000)
    await b.end('ROLLBACK')
    assert.deepEqual(await counts(observer, owner), before)
    await a.end(outcome)
    record(phase, { rpcReturnedBeforeDeferredCheck: true, commitSqlState: result.code, commitMs: result.elapsedMs, reviewWritesRolledBack: true, sourceOutcome: outcome })
  }

  phase = 'stale stored review cannot be rebound; fresh successor recovers'
  const oldRevision = await revision()
  const oldReview = await transaction(b, owner, () => rpc(b, 'record_coach_weekly_review', reviewArgs(acceptedProposal, oldRevision)))
  const oldReplacement = await transaction(b, owner, () => rpc(b, 'create_rolling_weekly_replacement_proposal', replacementArgs(acceptedProposal, oldReview.review_id, oldRevision)))
  await transaction(a, owner, () => logWorkout(a))
  const newRevision = await revision(), beforeRebind = await counts(observer, owner)
  await b.begin(owner)
  await expectState(b, rpcSql('create_rolling_weekly_replacement_proposal', replacementArgs(acceptedProposal, oldReview.review_id, newRevision)), '40001')
  await b.end('ROLLBACK')
  assert.deepEqual(await counts(observer, owner), beforeRebind)
  const newReview = await transaction(b, owner, () => rpc(b, 'record_coach_weekly_review', reviewArgs(acceptedProposal, newRevision)))
  const newReplacement = await transaction(b, owner, () => rpc(b, 'create_rolling_weekly_replacement_proposal', replacementArgs(acceptedProposal, newReview.review_id, newRevision)))
  assert.notEqual(newReplacement.proposal_id, oldReplacement.proposal_id)
  const succession = await observer.json(`SELECT json_build_object('supersedes',(SELECT supersedes_review_id FROM public.coach_weekly_reviews WHERE id=${literal(newReview.review_id)}),'oldStatus',(SELECT status FROM public.adaptation_proposals WHERE id=${literal(oldReplacement.proposal_id)}));`)
  assert.equal(succession.supersedes, oldReview.review_id)
  assert.equal(succession.oldStatus, 'expired')
  assert.deepEqual(await observer.json(acceptedSnapshotSql), acceptedBefore)
  record(phase, { staleRebindSqlState: '40001', oldPendingExpired: true, newReviewAndProposal: true, acceptedPlanUnchanged: true })

  phase = 'tenant isolation and internal authority'
  await b.begin(foreign)
  const foreignTables = ['coach_context_revisions', 'training_programs', 'training_plan_versions', 'adaptation_proposals', 'coach_weekly_reviews']
  for (const table of foreignTables) assert.equal(await b.json(`SELECT to_json(count(*)) FROM public.${table} WHERE user_id=${literal(owner)};`), 0)
  await b.end()
  await b.begin(foreign)
  await expectState(b, rpcSql('accept_adaptation_proposal', [newReplacement.proposal_id, crypto.randomUUID()]), 'P0002')
  await b.end('ROLLBACK')
  await b.begin(foreign)
  await expectState(b, scalarSql('assert_coach_context_revision', [foreign, 0]), '42501')
  await b.end('ROLLBACK')
  await b.begin(foreign)
  await expectState(b, `UPDATE public.coach_context_revisions SET revision=revision+1 WHERE user_id=${literal(foreign)};`, '42501')
  await b.end('ROLLBACK')
  const acl = await observer.json("SELECT json_agg(json_build_object('role',r,'directWrite',has_table_privilege(r,'public.coach_context_revisions','INSERT,UPDATE,DELETE'),'internalExecute',has_function_privilege(r,'public.assert_coach_context_revision(uuid,jsonb)','EXECUTE'))) FROM unnest(ARRAY['authenticated','anon','service_role']) r;")
  for (const role of acl) { assert.equal(role.directWrite, false); assert.equal(role.internalExecute, false) }
  const isolatedRevision = await revision()
  await transaction(a, foreign, () => logWorkout(a))
  assert.equal(await revision(), isolatedRevision)
  record(phase, { foreignTablesHidden: foreignTables, foreignAcceptSqlState: 'P0002', helperSqlState: '42501', directWriteSqlState: '42501', acl, foreignMutationDidNotAdvanceOwnerRevision: true })
} catch (error) {
  failure = { phase, message: error instanceof Error ? error.message : 'Unknown local verification failure' }
} finally {
  await Promise.allSettled(sessions.map(session => session.close()))
  const result = { runId, startedAt, completedAt: new Date().toISOString(), passed: failure === null,
    scope: 'Real local PostgreSQL contention, synthetic tenant/ACL and revision transaction verification only',
    target: { connection, container, project, api: 'http://127.0.0.1:55321', databaseHostPort: 55322 },
    harnessSha256: crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    candidateMigrationSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, 'supabase/migrations/20260921010000_coach_proposal_context_revision.sql'))).digest('hex'),
    liveFunctions, backends, checks, failure,
    limitations: ['Local bootstrap has documented differences from production; no hosted state accessed', 'SQL role claims simulate authenticated actors; local Auth created the separate synthetic accounts', 'App/browser, pre-revision cutover, pause, backup restoration and compatible-artifact rollback are separate checks', 'Synthetic accounts/data retained; no reset, migration, deletion or production credential use', 'Minimal SQL fixture intent does not establish programming or compiler quality'] }
  fs.writeFileSync(path.join(output, `local-context-concurrency-${runId}.json`), JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(path.join(output, 'local-context-concurrency-result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ passed: result.passed, checks: checks.length, failure, evidence: 'output/app-quality-release/local-context-concurrency-result.json' }))
}
if (failure) process.exitCode = 1
