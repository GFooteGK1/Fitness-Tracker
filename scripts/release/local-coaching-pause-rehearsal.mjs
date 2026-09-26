// Local synthetic coaching pause/drain rehearsal. Unique database only; no source writes/drops.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = 'sociusfit-programming-local', connection = 'sociusfit-local', container = `supabase_db_${project}`;
const localProject = path.join(root, 'output/app-quality-release/local-supabase');
const binary = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const suffix = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`;
const database = `socius_pause_${suffix}`, output = path.join(root, `output/app-quality-release/pause-${suffix}`);
const sha = data => createHash('sha256').update(data).digest('hex');
const config = fs.readFileSync(path.join(localProject, 'supabase/config.toml'), 'utf8');
if (!/^project_id = "sociusfit-programming-local"\s*$/m.test(config)
  || fs.existsSync(path.join(localProject, 'supabase/.temp/project-ref'))) throw new Error('Refusing nonlocal or linked configuration');
fs.mkdirSync(output, { recursive: false });
const env = {};
for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)) env[key] = value;
function command(args, input, expectedFailure = false) {
  const result = spawnSync(binary, ['--connection', connection, ...args], { cwd: root, env, windowsHide: true,
    encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, timeout: 180_000 });
  fs.appendFileSync(path.join(output, 'commands.private.log'), `${JSON.stringify(args)}\n${result.stderr ?? ''}\n`);
  if (result.error || (result.status !== 0 && !expectedFailure)) throw new Error('Local command failed; inspect preserved private log');
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}
const exec = (...args) => command(['exec', container, ...args]).stdout;
function sql(query, expectedFailure = false, target = database) {
  if (target !== database && target !== 'postgres') throw new Error('Unexpected database');
  return command(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', target, '-v', 'ON_ERROR_STOP=1'], `${expectedFailure ? '\\set VERBOSITY sqlstate\n' : ''}${query}`, expectedFailure);
}
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const inspected = JSON.parse(command(['inspect', container]).stdout)[0];
if (inspected.Name !== container || inspected.Config.Labels['com.supabase.cli.project'] !== project
  || path.resolve(inspected.Config.Labels['com.supabase.cli.workdir']) !== path.resolve(localProject) || !inspected.State.Running) throw new Error('Dedicated local container mismatch');
if (sql('SHOW server_version;', false, 'postgres').stdout !== '17.6' || exec('pg_dump', '--version') !== 'pg_dump (PostgreSQL) 17.6') throw new Error('Expected PostgreSQL 17.6');

const migrationPath = 'supabase/migrations/20260921010000_coach_proposal_context_revision.sql';
const migration = fs.readFileSync(path.join(root, migrationPath));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'output/app-quality-release/local-coaching-bootstrap-manifest.json'), 'utf8'));
const bootstrap = fs.readFileSync(path.join(root, manifest.output.path), 'utf8');
if (sha(bootstrap) !== manifest.output.sha256) throw new Error('Bootstrap manifest checksum mismatch');
const boundary = manifest.sections.findIndex(section => section.source === migrationPath);
if (boundary < 1 || manifest.sections.slice(boundary + 1).some(section => section.source)) throw new Error('Expected named final revision migration boundary');
const verifiedSections = manifest.sections.slice(0, boundary).map(section => {
  const text = bootstrap.split('\n').slice(section.outputStartLine - 1, section.outputEndLine).join('\n') + '\n';
  if (sha(text) !== section.sha256) throw new Error(`Section checksum mismatch: ${section.label}`);
  return { section, text };
});
for (const source of manifest.sourceManifest.filter(source => verifiedSections.some(({ section }) => section.source === source.path))) {
  if (sha(fs.readFileSync(path.join(root, source.path))) !== source.sha256) throw new Error(`Baseline source drift: ${source.path}`);
}
let prefix = verifiedSections.map(({ text }) => text).join('\n');
const originalGuard = "current_database() <> 'postgres'";
if (prefix.split(originalGuard).length !== 2) throw new Error('Expected one explicit baseline database guard');
prefix = prefix.replace(originalGuard, `current_database() <> '${database}'`);
fs.writeFileSync(path.join(output, 'baseline.private.sql'), prefix);
fs.writeFileSync(path.join(output, 'revision-migration.sql'), migration);
const platformSchema = exec('pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--schema=auth', '--schema=extensions');
const uuidVersion = sql("SELECT extversion FROM pg_extension WHERE extname='uuid-ossp';", false, 'postgres').stdout;
if (uuidVersion !== '1.1') throw new Error('Unexpected local uuid-ossp prerequisite version');
fs.writeFileSync(path.join(output, 'platform-schema.private.sql'), platformSchema);
exec('createdb', '-U', 'supabase_admin', '--owner=postgres', '--template=template0', database);
sql(platformSchema);
// A schema-filtered dump excludes extension objects. Install the same already
// available extension version into this new database, never change global roles.
sql('CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions VERSION \'1.1\';');
sql(`SET ROLE postgres; SET socius.local_fixture = '${project}';\n${prefix}`);
if (sql("SELECT to_regclass('public.coach_context_revisions') IS NULL;").stdout !== 't') throw new Error('Baseline unexpectedly contains revision table');


const sessions = [];
let phase = "pause rehearsal";
class Session {
  constructor(name) {
    this.name = name
    this.buffer = ''
    this.pending = null
    this.errorFrames = []
    this.child = spawn(binary, ['--connection', connection, 'exec', '-i', container,
      'psql', '-X', '-U', 'postgres', '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=0', '-v', 'VERBOSITY=verbose'],
    { windowsHide: true, env: env })
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
      const marker = `LOCAL_DONE_${randomUUID().replaceAll('-', '')}`
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

const gatePath = 'supabase/migrations/20260923010000_coaching_write_pause.sql';
const gateMigration = fs.readFileSync(path.join(root, gatePath), 'utf8');
fs.writeFileSync(path.join(output, 'pause-migration.sql'), gateMigration);
fs.copyFileSync(fileURLToPath(import.meta.url), path.join(output, 'harness.mjs'));
const checks = [];
const tables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations'];
const record = (name, details = {}) => { checks.push({ name, passed: true, ...details }); console.log(`PASS ${name}`); };
const users = Object.fromEntries(['accepted', 'pending', 'review', 'fresh'].map(key => [key, randomUUID()]));
for (const id of Object.values(users)) sql(`INSERT INTO auth.users(id,email) VALUES (${literal(id)}::uuid,${literal(`pause-${id}@example.invalid`)});`);
const intent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }], fixture: 'Synthetic pause contract, not programming quality' };
const prescriptions = [{ week_number: 1, session_index: 1, scheduled_date: '2026-09-21', prescription: { domain: 'strength', intent: 'Controlled synthetic work', dose: {}, effort: 'Controlled', rest: 'As needed', success_condition: 'Quality', stop_condition: 'Stop on pain', scale_options: [], evidence: {} } }];
const initialSql = (key, snapshot = {}) => `SELECT row_to_json(p) FROM public.create_initial_rolling_weekly_proposal('Pause fixture','Strength','2026-09-21','2027-04-01','{}','fixture-reference','fixture-policy',${json(intent)},${json(snapshot)},${json(prescriptions)},'{}',${literal('a'.repeat(64))},${literal(key)}) p;`;
const acceptSql = p => `SELECT row_to_json(p) FROM public.accept_adaptation_proposal(${literal(p.proposal_id)},${literal(p.key)}) p;`;
const reviewSql = p => `SELECT row_to_json(p) FROM public.record_coach_weekly_review(${literal(p.proposed_program_id)},${literal(p.proposed_plan_version_id)},'2026-09-21','athlete_requested','continue','same_track','sufficient',0.8,'{}','{}','{}','[]',NULL,'{}','[]','fixture-policy','fixture-algorithm',${literal('b'.repeat(64))},${literal(randomUUID())}) p;`;
function actor(owner, statement, failure = false) {
  return sql(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${literal(owner)},true) AS ignored_owner \\gset\n${statement}\nCOMMIT;`, failure);
}
function initial(owner) { const key = randomUUID(); return { ...JSON.parse(actor(owner, initialSql(key)).stdout), key }; }
const accepted = initial(users.accepted), pending = initial(users.pending), reviewBase = initial(users.review);
const acceptedResult = JSON.parse(actor(users.accepted, acceptSql(accepted)).stdout);
actor(users.review, acceptSql(reviewBase));
const storedReview = JSON.parse(actor(users.accepted, reviewSql(accepted)).stdout);
const replacementSql = `SELECT row_to_json(p) FROM public.create_rolling_weekly_replacement_proposal(${literal(accepted.proposed_program_id)},${literal(accepted.proposed_plan_version_id)},${literal(storedReview.review_id)},'Pause successor','Strength','2026-09-28','2027-04-01','{}','fixture-reference','fixture-policy',${json(intent)},'{}',${json(prescriptions.map(s => ({ ...s, scheduled_date: '2026-09-28' })))},'{}',${literal('c'.repeat(64))},${literal(randomUUID())}) p;`;
const hashes = () => JSON.parse(sql(`SELECT json_build_object(${tables.map(table => `${literal(table)}, (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${table} t)`).join(',')});`).stdout);
const state = () => JSON.parse(sql('SELECT row_to_json(c) FROM public.coaching_write_control c;').stdout);
const pauseSql = (paused, generation) => `SELECT row_to_json(c) FROM public.set_coaching_write_pause(${paused},${generation},'Local synthetic operator transition') c;`;
const writer = new Session('writer'), operator = new Session('operator'), later = new Session('later'), observer = new Session('observer');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitBlocked(pid, blocker) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${pid}));`);
    if (pids.includes(blocker)) return pids;
    await wait(50);
  }
  throw Error('Expected real PostgreSQL blocker not observed');
}
let failure;
try {
  const ids = await Promise.all([writer.json('SELECT to_json(pg_backend_pid());'), operator.json('SELECT to_json(pg_backend_pid());'), later.json('SELECT to_json(pg_backend_pid());')]);
  assert.equal(new Set(ids).size, 3);
  phase = 'busy installation';
  await writer.exec('BEGIN; LOCK TABLE public.training_programs IN ROW EXCLUSIVE MODE;');
  const busy = sql(`SET ROLE postgres;\n${gateMigration}`, true);
  assert.notEqual(busy.status, 0);
  assert.match(busy.stderr, /ERROR:\s+55P03\b/);
  assert.equal(sql("SELECT to_regclass('public.coaching_write_control') IS NULL;").stdout, 't');
  await writer.end('ROLLBACK');
  record('Busy installation refuses atomically without creating gate');
  const beforeInstall = hashes();
  sql(`SET ROLE postgres;\n${gateMigration}`);
  assert.deepEqual(hashes(), beforeInstall);
  assert.equal(state().paused, false);
  assert.equal(Number(sql("SELECT count(*) FROM pg_trigger WHERE tgname='coaching_write_pause' AND NOT tgisinternal;").stdout), 6);
  record('Old schema installation preserves all output rows and starts open');

  phase = 'open-gate actor permission precheck';
  const beforePrecheck = hashes();
  for (const [owner, statements] of [
    [users.fresh, [initialSql(randomUUID()), initialSql(randomUUID())]],
    [users.pending, [acceptSql(pending)]],
    [users.review, [reviewSql(reviewBase)]],
    [users.accepted, [replacementSql]],
  ]) {
    await writer.begin(owner);
    assert.equal(await writer.json('SELECT to_json(current_user);'), 'authenticated');
    for (const statement of statements) await writer.exec(statement);
    await writer.end('ROLLBACK');
  }
  assert.equal(await later.json('SELECT to_json(current_user);'), 'postgres');
  for (const table of tables) {
    assert.equal(await later.json(`SELECT to_json(has_table_privilege(current_user,${literal(`public.${table}`)},'INSERT,UPDATE,DELETE,TRUNCATE'));`), true);
    await later.exec(`BEGIN; DELETE FROM public.${table} WHERE false; ROLLBACK;`);
  }
  assert.deepEqual(hashes(), beforePrecheck);
  record('Open-gate actor permission precheck passes for all four authenticated RPC paths and postgres DML probes; disposable transactions preserve outputs');

  phase = 'operator timeout preserves open state';
  await writer.begin(users.fresh);
  await writer.exec(initialSql(randomUUID()));
  await operator.exec('BEGIN;');
  const timingOut = operator.request(pauseSql(true, 0)).catch(error => ({ code: 'HARNESS_ERROR', message: error.message }));
  const timeoutBlockers = await waitBlocked(ids[1], ids[0]);
  const timeoutResult = await timingOut;
  assert.equal(timeoutResult.code, '55P03');
  await operator.end('ROLLBACK');
  await writer.end('ROLLBACK');
  assert.equal(state().paused, false);
  assert.equal(state().generation, 0);
  assert.deepEqual(hashes(), beforePrecheck);
  record('Operator lock timeout establishes no pause and both rolled-back transactions preserve outputs', { observedBlockingPids: timeoutBlockers, sqlstate: timeoutResult.code, observedElapsedMs: timeoutResult.elapsedMs });

  phase = 'writer drain';
  const readCommitted = new Session('read-before-pause'), repeatable = new Session('repeatable-read-before-pause');
  await readCommitted.exec('BEGIN; SELECT count(*) FROM public.training_programs;');
  await repeatable.exec('BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.training_programs;');
  await writer.begin(users.fresh);
  const inFlight = { ...await writer.json(initialSql(randomUUID())), key: 'unused' };
  await operator.exec('BEGIN;');
  const pausing = operator.request(pauseSql(true, 0)).catch(error => ({ code: 'HARNESS_ERROR', message: error.message }));
  const blockers = await waitBlocked(ids[1], ids[0]);
  // A prepared old statement is compiled while the gate is still open.
  await later.exec('PREPARE old_client_statement AS DELETE FROM public.training_programs WHERE false;');
  const admissionWhileDraining = await later.request('EXECUTE old_client_statement;');
  assert.ok(['00000', '55P03'].includes(admissionWhileDraining.code), 'Before successful pause COMMIT, another SHARE holder may join');
  // A transaction already holding SHARE must finish its multi-table writes
  // even while the pause waits; NOWAIT must not cause a lock-order cycle.
  await writer.exec(initialSql(randomUUID()));
  await writer.end();
  assert.equal((await pausing).code, '00000');
  const uncommittedPause = await later.request('EXECUTE old_client_statement;');
  assert.equal(uncommittedPause.code, '55P03', 'Uncommitted operator must fence later writer');
  await operator.end();
  assert.equal(state().paused, true);
  assert.equal((await readCommitted.request('DELETE FROM public.training_programs WHERE false;')).code, 'PT503');
  assert.equal((await repeatable.request('DELETE FROM public.training_programs WHERE false;')).code, '40001');
  await readCommitted.end('ROLLBACK');
  await repeatable.end('ROLLBACK');
  record('Transactions with reads before pause fail closed at READ COMMITTED and REPEATABLE READ');
  record('Successful pause commit drains prior multi-table transaction and fences subsequent writers', { backendIds: ids, observedBlockingPids: blockers, preCommitAdmissionSqlstate: admissionWhileDraining.code, inFlightProposalCommitted: Boolean(inFlight.proposal_id) });
  await operator.close();
  assert.equal((await later.request('EXECUTE old_client_statement;')).code, 'PT503');
  record('Committed pause survives operator disconnect and stale prepared statement fails');

  const beforeBlocked = hashes();
  for (const table of tables) {
    const column = sql(`SELECT quote_ident(attname) FROM pg_attribute WHERE attrelid=${literal(`public.${table}`)}::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum LIMIT 1;`).stdout;
    for (const statement of [`INSERT INTO public.${table} DEFAULT VALUES;`, `UPDATE public.${table} SET ${column}=${column} WHERE false;`, `DELETE FROM public.${table} WHERE false;`, `TRUNCATE public.${table} CASCADE;`]) {
      const result = await later.request(statement);
      assert.equal(result.code, 'PT503', `${table} ${statement.split(' ')[0]}`);
    }
  }
  for (const [owner, statement] of [[users.fresh, initialSql(randomUUID())], [users.pending, acceptSql(pending)], [users.review, reviewSql(reviewBase)], [users.accepted, replacementSql]]) {
    const result = actor(owner, statement, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERROR:\s+PT503\b/);
  }
  assert.deepEqual(hashes(), beforeBlocked);
  record('All six tables and four old SECURITY DEFINER writer paths fail with no output changes', { operationsPerTable: ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'], rpcs: ['initial', 'accept', 'review', 'replacement'], outputHashes: beforeBlocked });
  const replay = JSON.parse(actor(users.accepted, acceptSql(accepted)).stdout);
  assert.deepEqual(replay, acceptedResult);
  assert.deepEqual(hashes(), beforeBlocked);
  record('Owned reads and accepted replay remain available and preserve exact output hashes');

  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const statement of ['SELECT * FROM public.coaching_write_control;', "UPDATE public.coaching_write_control SET paused=false;", pauseSql(false, 1), 'SELECT public.assert_coaching_writes_open();']) {
      const result = sql(`SET ROLE ${role}; ${statement}`, true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /ERROR:\s+42501\b/);
    }
  }
  const rls = JSON.parse(sql("SELECT json_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.coaching_write_control'::regclass;").stdout);
  assert.deepEqual(rls, [true, true]);
  record('Anon authenticated and service-role callers cannot inspect mutate or invoke operator gate; FORCE RLS enabled');
  const staleResume = sql(pauseSql(false, 0), true);
  assert.match(staleResume.stderr, /ERROR:\s+40001\b/);
  assert.equal(state().paused, true);
  sql(`SET ROLE postgres;\n${gateMigration}`);
  assert.equal(state().paused, true);
  assert.equal(state().generation, 1);
  record('Stale operator resume and exact migration reapply cannot reopen pause');

  phase = 'revision cutover under pause';
  sql(`SET ROLE postgres;\n${migration.toString('utf8')}`);
  assert.equal(state().paused, true);
  assert.deepEqual(hashes(), beforeBlocked);
  assert.deepEqual(JSON.parse(actor(users.accepted, acceptSql(accepted)).stdout), acceptedResult);
  sql(pauseSql(false, 1));
  const oldPending = actor(users.pending, acceptSql(pending), true);
  assert.match(oldPending.stderr, /ERROR:\s+40001\b/);
  const freshKey = randomUUID();
  const revision = Number(actor(users.fresh, 'SELECT public.get_coach_context_revision();').stdout);
  const fresh = { ...JSON.parse(actor(users.fresh, initialSql(freshKey, { contextRevision: revision })).stdout), key: freshKey };
  assert.equal(JSON.parse(actor(users.fresh, acceptSql(fresh)).stdout).proposal_status, 'accepted');
  record('Revision migration applies while paused; compatible stamped write works after resume and old pending stays rejected');

  phase = 'pause rollback';
  const controller = new Session('rollback-operator');
  await controller.exec('BEGIN;');
  await controller.exec(pauseSql(true, 2));
  assert.equal((await later.request('EXECUTE old_client_statement;')).code, '55P03');
  await controller.end('ROLLBACK');
  assert.equal(state().paused, false);
  assert.equal(state().generation, 2);
  await later.exec('EXECUTE old_client_statement;');
  record('Aborted operator transition rolls back state and releases writer fence');

  phase = 'missing control fail closed';
  await controller.exec('BEGIN; DELETE FROM public.coaching_write_control;');
  assert.equal((await controller.request('DELETE FROM public.training_programs WHERE false;')).code, 'PT503');
  await controller.end('ROLLBACK');
  assert.equal(state().paused, false);
  record('Missing control row fails closed without modifying output; fixture control restored by rollback');
} catch (error) { failure = { phase, message: error.message }; }
finally { await Promise.allSettled(sessions.map(session => session.close())); }
const receipt = { kind: 'synthetic_local_coaching_pause_rehearsal', checkedAt: new Date().toISOString(), connection, container, database,
  sourceDatabaseReadOnly: 'postgres', postgresVersion: '17.6',
  roles: { ownedRpcWriter: 'authenticated', directDmlAndReadBeforePauseProbes: 'postgres', concurrentOperator: 'postgres', synchronousOperatorAndFixtureSetup: 'supabase_admin', migrationExecutor: 'postgres' },
  bootstrapSha256: manifest.output.sha256, verifiedBaselineSections: verifiedSections.length,
  gateMigration: { path: gatePath, sha256: sha(gateMigration) }, revisionMigrationSha256: sha(migration), harnessSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  checks, failure: failure ?? null, preserved: ['source database unchanged', 'new synthetic database', 'private baseline/schema logs and sanitized receipt'],
  limitations: ['SQL-only synthetic users; no HTTP/PostgREST transport or production traffic exercised', 'Scoped bootstrap is not a production clone', 'Coaching outputs only: source, Auth, nutrition and wearable writes are not paused', 'Privileged database operators remain trusted; no hosted actions, role changes, data deletion or deployment'] };
fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: path.relative(root, path.join(output, 'receipt.json')), ...receipt }, null, 2));
if (failure) process.exitCode = 1;
