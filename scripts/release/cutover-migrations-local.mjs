// Isolated local PostgreSQL17 verification only. Never accepts a target override.
// Creates and retains one new synthetic database; source postgres is read-only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { CUTOVER_MIGRATIONS, renderInstallSql, renderPauseSql, cutoverCatalogSql, compareCutoverCatalog } from './cutover-migrations.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = 'sociusfit-programming-local', container = `supabase_db_${project}`;
const binary = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const localProject = path.join(root, 'output/app-quality-release/local-supabase');
const suffix = randomBytes(6).toString('hex'), database = `socius_ledger_${suffix}`;
const output = path.join(root, `output/app-quality-release/cutover-ledger-${suffix}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [], startedAt = new Date().toISOString();
const expected = JSON.parse(fs.readFileSync(new URL('./cutover-migrations.expected.json', import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
fs.mkdirSync(output);
function command(args, input, expectedError) {
  const result = spawnSync(binary, ['--connection', 'sociusfit-local', ...args], { cwd: root, env, windowsHide: true, encoding: 'utf8', input, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  fs.appendFileSync(path.join(output, 'commands.log'), JSON.stringify({ args, status: result.status, stderr: result.stderr }) + '\n');
  if (expectedError) { assert.notEqual(result.status, 0); assert.match(result.stderr, new RegExp(`ERROR:  ${expectedError}`)); }
  else if (result.error || result.status !== 0) throw Error('Local SQL command failed; inspect retained command log');
  return result.stdout.trim();
}
function sql(query, expectedError, target = database) {
  assert(target === database || target === 'postgres');
  if (target === 'postgres') assert(query.startsWith('BEGIN READ ONLY;'));
  return command(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', target, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], query, expectedError);
}
const mark = name => checks.push(name);
const state = () => JSON.parse(sql('BEGIN READ ONLY; SET LOCAL ROLE postgres; SELECT jsonb_build_object(\'paused\',paused,\'generation\',generation::text) FROM public.coaching_write_control WHERE singleton; ROLLBACK;'));
const catalog = stage => JSON.parse(sql(`BEGIN READ ONLY; SET LOCAL ROLE postgres; SET LOCAL search_path=pg_catalog; ${cutoverCatalogSql(stage)} ROLLBACK;`));
const ledger = version => sql(`BEGIN READ ONLY; SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='${version}'; ROLLBACK;`);
function injectLedgerFailure(version) {
  sql(`CREATE FUNCTION public.local_reject_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version='${version}' THEN RAISE EXCEPTION 'Synthetic ledger rejection' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER local_reject_ledger BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.local_reject_ledger();`);
}
const removeLedgerFailure = () => sql('DROP TRIGGER local_reject_ledger ON supabase_migrations.schema_migrations; DROP FUNCTION public.local_reject_ledger();');
let completed = false;
try {
  const config = fs.readFileSync(path.join(localProject, 'supabase/config.toml'), 'utf8');
  assert.match(config, /^project_id = "sociusfit-programming-local"\s*$/m);
  assert.equal(fs.existsSync(path.join(localProject, 'supabase/.temp/project-ref')), false);
  const inspected = JSON.parse(command(['inspect', container]))[0];
  assert.equal(inspected.Name.replace(/^\//, ''), container);
  assert.equal(inspected.Config.Labels['com.supabase.cli.project'], project);
  assert.equal(path.resolve(inspected.Config.Labels['com.supabase.cli.workdir']), path.resolve(localProject));
  assert.equal(inspected.State.Running, true);
  assert.equal(sql('BEGIN READ ONLY; SHOW server_version_num; ROLLBACK;', undefined, 'postgres'), '170006');
  mark('fixed synthetic local container and PostgreSQL17.6 verified');

  // Reuse the previously reviewed Auth-safe bootstrap prefix, omitting its final
  // revision section. Verify every retained source/section hash before use.
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'output/app-quality-release/local-coaching-bootstrap-manifest.json')));
  const bootstrap = fs.readFileSync(path.join(root, manifest.output.path), 'utf8');
  assert.equal(sha(bootstrap), manifest.output.sha256);
  const boundary = manifest.sections.findIndex(section => section.source === 'supabase/migrations/20260921010000_coach_proposal_context_revision.sql');
  assert(boundary > 0);
  const sections = manifest.sections.slice(0, boundary).map(section => {
    const text = bootstrap.split('\n').slice(section.outputStartLine - 1, section.outputEndLine).join('\n') + '\n';
    assert.equal(sha(text), section.sha256); return { section, text };
  });
  for (const source of manifest.sourceManifest.filter(source => sections.some(({ section }) => section.source === source.path))) assert.equal(sha(fs.readFileSync(path.join(root, source.path))), source.sha256);
  let prefix = sections.map(({ text }) => text).join('\n');
  assert.equal(prefix.split("current_database() <> 'postgres'").length, 2);
  prefix = prefix.replace("current_database() <> 'postgres'", `current_database() <> '${database}'`);
  const authSchema = command(['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--schema=auth', '--schema=extensions']);
  command(['exec', container, 'createdb', '-U', 'supabase_admin', '--owner=postgres', '--template=template0', database]);
  sql(authSchema);
  sql('CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions VERSION \'1.1\';');
  sql(`SET ROLE postgres; SET socius.local_fixture='${project}'; ${prefix}`);
  sql(`SET ROLE postgres; CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) SELECT version,'synthetic prerequisite',ARRAY['synthetic ledger only'] FROM unnest(ARRAY['20260915220000','20260918010000','20260918011000','20260918020000','20260918030000','20260918040000','20260918050000']) version;`);
  mark('new isolated Auth-schema-only database with verified pre-revision bootstrap and synthetic ledger');
  const options = { targetDatabase: database, expectedGeneration: '1' };
  sql(renderInstallSql('revision', options), '55000');
  assert.equal(ledger(CUTOVER_MIGRATIONS.revision.version), '0');
  mark('revision before pause rejected with no ledger entry');

  injectLedgerFailure(CUTOVER_MIGRATIONS.pause.version);
  sql(renderInstallSql('pause', options), 'P0001');
  assert.equal(sql("SELECT to_regclass('public.coaching_write_control') IS NULL;"), 't');
  assert.equal(ledger(CUTOVER_MIGRATIONS.pause.version), '0');
  removeLedgerFailure(); mark('pause schema and ledger roll back together on injected ledger failure');
  sql(renderInstallSql('pause', options));
  assert.deepEqual(state(), { paused: false, generation: '0' });
  assert.equal(compareCutoverCatalog('pause', catalog('pause'), expected.snapshots.pause).matched, true);
  assert.equal(ledger(CUTOVER_MIGRATIONS.pause.version), '1');
  mark('pause commit, fresh independent state read and exact expected catalog pass');
  sql(renderInstallSql('pause', options), '55000');
  sql(renderInstallSql('revision', options), '55000');
  assert.deepEqual(state(), { paused: false, generation: '0' });
  mark('duplicate install and open-gate revision rejected without state change');

  sql(renderPauseSql({ paused: true, expectedGeneration: '1', reason: 'Synthetic stale CAS', targetDatabase: database }), '40001');
  assert.deepEqual(state(), { paused: false, generation: '0' });
  sql(renderPauseSql({ paused: true, expectedGeneration: '0', reason: 'Synthetic cutover pause', targetDatabase: database }));
  assert.deepEqual(state(), { paused: true, generation: '1' });
  sql(renderInstallSql('revision', { ...options, expectedGeneration: '0' }), '55000');
  mark('stale CAS and wrong revision generation rejected; committed pause independently read');

  const functionDigest = () => sql("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SELECT md5(string_agg(pg_get_functiondef(p.oid), E'\\n' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'; ROLLBACK;");
  injectLedgerFailure(CUTOVER_MIGRATIONS.revision.version);
  const functionsBefore = functionDigest();
  sql(renderInstallSql('revision', options), 'P0001');
  assert.equal(functionDigest(), functionsBefore);
  assert.equal(sql("SELECT to_regclass('public.coach_context_revisions') IS NULL;"), 't');
  assert.equal(ledger(CUTOVER_MIGRATIONS.revision.version), '0');
  assert.deepEqual(state(), { paused: true, generation: '1' });
  removeLedgerFailure(); mark('revision schema/function changes and ledger roll back atomically; pause preserved');
  sql(renderInstallSql('revision', options));
  const observed = catalog('revision'), compared = compareCutoverCatalog('revision', observed, expected.snapshots.revision);
  fs.writeFileSync(path.join(output, 'post-install-catalog.json'), JSON.stringify({ observed, compared }, null, 2));
  assert.equal(compared.matched, true);
  assert.equal(ledger(CUTOVER_MIGRATIONS.revision.version), '1');
  assert.deepEqual(state(), { paused: true, generation: '1' });
  mark('revision committed while paused; independent exact14function/16trigger catalog verification passes');
  sql(renderPauseSql({ paused: false, expectedGeneration: '1', reason: 'Synthetic verified resume', targetDatabase: database }));
  assert.deepEqual(state(), { paused: false, generation: '2' });
  sql(renderPauseSql({ paused: true, expectedGeneration: '2', reason: 'Synthetic final retained pause', targetDatabase: database }));
  assert.deepEqual(state(), { paused: true, generation: '3' });
  sql(renderPauseSql({ paused: false, expectedGeneration: '1', reason: 'Synthetic stale resume', targetDatabase: database }), '40001');
  assert.deepEqual(state(), { paused: true, generation: '3' });
  mark('resume and re-pause commits independently verified; stale resume fails closed');
  completed = true;
} finally {
  const receipt = { kind: 'isolated_local_atomic_cutover_ledger_verification', startedAt, completedAt: new Date().toISOString(), completed,
    database, sourceDatabase: 'postgres', sourceUse: 'read-only version check and schema-only Auth/extensions export; no source writes',
    createdDatabaseRetained: true, platformRolesAltered: false, syntheticLedger: true, noProductionCalls: true,
    migrations: CUTOVER_MIGRATIONS, expectedCatalogSha256: sha(fs.readFileSync(new URL('./cutover-migrations.expected.json', import.meta.url))),
    helperSha256: sha(fs.readFileSync(new URL('./cutover-migrations.mjs', import.meta.url))), checks,
    preparationFailures: [{ check: 'initial pure-renderer unit assertion', count: 1, cause: 'ON CONFLICT assertion incorrectly scanned preserved migration bodies instead of only ledger INSERT; corrected before any DB attempt' }] };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ completed, checks: checks.length, receipt: path.relative(root, path.join(output, 'receipt.json')) }));
}
