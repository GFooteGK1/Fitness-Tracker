// Local synthetic old/new writer compatibility exercise. No source DB writes or drops.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = 'sociusfit-programming-local', connection = 'sociusfit-local', container = `supabase_db_${project}`;
const localProject = path.join(root, 'output/app-quality-release/local-supabase');
const binary = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const suffix = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`;
const database = `socius_cutover_${suffix}`, output = path.join(root, `output/app-quality-release/cutover-${suffix}`);
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

const users = { accepted: randomUUID(), pending: randomUUID(), fresh: randomUUID() };
for (const id of Object.values(users)) sql(`INSERT INTO auth.users(id,email) VALUES (${literal(id)}::uuid,${literal(`cutover-${id}@example.invalid`)});`);
const intent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }], fixture: 'immutable local cutover intent' };
const sessions = [{ week_number: 1, session_index: 1, scheduled_date: '2026-09-21', prescription: {
  domain: 'strength', intent: 'Synthetic controlled work', dose: {}, effort: 'Controlled', rest: 'As needed',
  success_condition: 'Quality', stop_condition: 'Stop on pain', scale_options: [], evidence: {} } }];
function actor(owner, query, expectedFailure = false) {
  return sql(`BEGIN; SELECT set_config('request.jwt.claim.sub',${literal(owner)},true) AS ignored_owner \\gset\nSET LOCAL ROLE authenticated;\n${query}\nCOMMIT;`, expectedFailure);
}
function initial(owner, stamp, key = randomUUID(), expectedFailure = false) {
  const result = actor(owner, `SELECT row_to_json(p) FROM public.create_initial_rolling_weekly_proposal(
    'Synthetic cutover week','Strength','2026-09-21','2027-04-01','{}'::jsonb,'fixture-reference','fixture-policy',
    ${json(intent)},${json(stamp)},${json(sessions)},'{}'::jsonb,${literal('a'.repeat(64))},${literal(key)}) p;`, expectedFailure);
  return expectedFailure ? result : { ...JSON.parse(result.stdout), key };
}
function accept(owner, proposal, expectedFailure = false) {
  const result = actor(owner, `SELECT row_to_json(p) FROM public.accept_adaptation_proposal(${literal(proposal.proposal_id)}::uuid,${literal(proposal.key)}) p;`, expectedFailure);
  return expectedFailure ? result : JSON.parse(result.stdout);
}
function immutableRecords() {
  return JSON.parse(sql(`SELECT json_build_object(
    'plans',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM public.training_plan_versions t),
    'proposals',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM public.adaptation_proposals t),
    'programs',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM public.training_programs t),
    'sessions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM public.prescribed_sessions t));`).stdout);
}
const catalog = () => JSON.parse(sql(`SELECT json_build_object(
  'revisionTable',to_regclass('public.coach_context_revisions') IS NOT NULL,
  'functions',(SELECT json_agg(json_build_object('name',proname,'config',proconfig,'definitionHash',md5(pg_get_functiondef(p.oid))) ORDER BY proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('get_coach_context_revision','create_initial_rolling_weekly_proposal','record_coach_weekly_review','create_rolling_weekly_replacement_proposal','accept_adaptation_proposal')));`).stdout);
const oldAccepted = initial(users.accepted, {}), acceptedResponse = accept(users.accepted, oldAccepted);
const oldPending = initial(users.pending, {}), before = immutableRecords(), beforeCatalog = catalog();
fs.writeFileSync(path.join(output, 'before-catalog.json'), JSON.stringify(beforeCatalog, null, 2));
sql(`SET ROLE postgres;\n${migration.toString('utf8')}`);
const afterCatalog = catalog(), afterMigration = immutableRecords();
const oldPendingResult = accept(users.pending, oldPending, true);
const oldNewWriteResult = initial(users.fresh, {}, randomUUID(), true);
const afterRejected = immutableRecords(), replay = accept(users.accepted, oldAccepted), afterReplay = immutableRecords();
const revision = Number(actor(users.fresh, 'SELECT public.get_coach_context_revision();').stdout);
if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid fresh revision');
const fresh = initial(users.fresh, { contextRevision: revision }), freshAccepted = accept(users.fresh, fresh);
const beforeReapply = immutableRecords();
sql(`SET ROLE postgres;\n${migration.toString('utf8')}`);
const afterReapply = immutableRecords(), reappliedCatalog = catalog();
const checks = {
  oldSchemaBeforeMigration: beforeCatalog.revisionTable === false,
  acceptedAndPendingUnchangedByMigration: JSON.stringify(before) === JSON.stringify(afterMigration),
  oldPendingFirstAcceptanceRejected40001: oldPendingResult.status !== 0 && /ERROR:\s+40001\b/.test(oldPendingResult.stderr),
  oldUnstampedNewWriterRejected40001: oldNewWriteResult.status !== 0 && /ERROR:\s+40001\b/.test(oldNewWriteResult.stderr),
  rejectedWritesRollback: JSON.stringify(afterMigration) === JSON.stringify(afterRejected),
  acceptedReplayReturnsSameResult: JSON.stringify(acceptedResponse) === JSON.stringify(replay),
  acceptedReplayPreservesAllOriginalRecords: JSON.stringify(afterRejected) === JSON.stringify(afterReplay),
  newStampedWriterAccepted: freshAccepted.proposal_status === 'accepted',
  newSchemaAndFunctionTimeouts: afterCatalog.revisionTable && afterCatalog.functions.length === 5 && afterCatalog.functions.every(fn => fn.config.includes('lock_timeout=1s')),
  exactMigrationReapplyPreservesRecordsAndCatalog: JSON.stringify(beforeReapply) === JSON.stringify(afterReapply) && JSON.stringify(afterCatalog) === JSON.stringify(reappliedCatalog),
};
fs.writeFileSync(path.join(output, 'after-catalog.json'), JSON.stringify(afterCatalog, null, 2));
const receipt = { kind: 'synthetic_local_cutover_rehearsal', checkedAt: new Date().toISOString(), connection, container, database,
  sourceDatabaseReadOnly: 'postgres', schemaExecutorRole: 'postgres', fixtureSetupRole: 'supabase_admin', writerRole: 'authenticated',
  verifiedBaselineSections: verifiedSections.length, bootstrapSha256: manifest.output.sha256, uuidExtensionVersion: uuidVersion,
  excludedCachedRevisionSectionSha256: manifest.sections[boundary].sha256, appliedCurrentRevisionSha256: sha(migration),
  baselineGuardTransformation: 'Only expected database name changed from postgres to this unique local database; empty Auth/public and real Auth/role/extension checks retained',
  checks, beforeOriginalRecordHashes: before, afterReplayOriginalRecordHashes: afterReplay,
  preserved: ['original source database', 'new cutover database', 'baseline/schema/migration/catalog artifacts'],
  limitations: ['Synthetic SQL-only users; no Auth login or external services exercised', 'Scoped local bootstrap is not a production clone or migration ledger',
    'No operator traffic pause, drain or coordinated app deployment exercised', 'Old unstamped writers are incompatible after migration; no safe old-app rollback demonstrated',
    'Migration reapplication is idempotency evidence, not migration rollback', 'No hosted database, spending, production data, global role changes or database deletion'] };
fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (Object.values(checks).some(value => !value)) throw new Error('Cutover assertions failed; inspect preserved sanitized receipt');
console.log(JSON.stringify({ receipt: path.relative(root, path.join(output, 'receipt.json')), ...receipt }, null, 2));
