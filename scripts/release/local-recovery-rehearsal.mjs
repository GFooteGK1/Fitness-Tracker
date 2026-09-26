// Synthetic LOCAL recovery only. Never resets/deletes a database or accepts a target argument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = 'sociusfit-programming-local', connection = 'sociusfit-local';
const container = `supabase_db_${project}`;
const localProject = path.join(root, 'output/app-quality-release/local-supabase');
const binary = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const config = fs.readFileSync(path.join(localProject, 'supabase/config.toml'), 'utf8');
if (!/^project_id = "sociusfit-programming-local"\s*$/m.test(config)
  || fs.existsSync(path.join(localProject, 'supabase/.temp/project-ref'))) throw new Error('Refusing nonlocal or linked configuration');
const suffix = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`;
const restoredDatabase = `socius_recovery_${suffix}`;
const output = path.join(root, `output/app-quality-release/recovery-${suffix}`);
fs.mkdirSync(output, { recursive: false });
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)) env[key] = value;
}
const prefix = ['--connection', connection];
const options = { cwd: root, env, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000 };
function command(args, input) {
  const result = spawnSync(binary, [...prefix, ...args], { ...options, input });
  fs.appendFileSync(path.join(output, 'commands.private.log'), `${JSON.stringify(args)}\n${result.stderr ?? ''}\n`);
  if (result.error || result.status !== 0) throw new Error(`Local command failed (${args[0]}); inspect private command log`);
  return result.stdout.trim();
}
const exec = (...args) => command(['exec', container, ...args]);
const sql = (database, query) => command(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], query);
const inspected = JSON.parse(command(['inspect', container]))[0];
if (inspected.Name !== container || inspected.Config.Labels['com.supabase.cli.project'] !== project
  || path.resolve(inspected.Config.Labels['com.supabase.cli.workdir']) !== path.resolve(localProject)
  || !inspected.State.Running) throw new Error('Dedicated running local container identity mismatch');
const versions = { server: sql('postgres', 'SHOW server_version;'), dump: exec('pg_dump', '--version'), restore: exec('pg_restore', '--version') };
if (versions.server !== '17.6' || versions.dump !== 'pg_dump (PostgreSQL) 17.6' || versions.restore !== 'pg_restore (PostgreSQL) 17.6') throw new Error('Expected PostgreSQL 17.6 tools and server');
if (sql('postgres', "SELECT rolsuper FROM pg_roles WHERE rolname=current_user;") !== 't') throw new Error('Existing local administrative restore role required; never change role grants');

// The same exported snapshot binds source hashes, source schema and archive data.
const session = spawn(binary, [...prefix, 'exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const lines = createInterface({ input: session.stdout });
session.stderr.on('data', chunk => fs.appendFileSync(path.join(output, 'snapshot.private.log'), chunk));
function sessionSql(query) {
  return new Promise((resolve, reject) => {
    const marker = `END_${randomUUID().replaceAll('-', '')}`, result = [];
    const cleanup = () => { clearTimeout(timer); lines.off('line', receive); session.off('exit', failed); session.off('error', failed); };
    const failed = () => { cleanup(); reject(new Error('Snapshot session failed; inspect private log')); };
    const receive = line => { if (line === marker) { cleanup(); resolve(result.join('\n')); } else result.push(line); };
    const timer = setTimeout(failed, 180_000);
    lines.on('line', receive); session.once('exit', failed); session.once('error', failed);
    session.stdin.write(`${query}\n\\echo ${marker}\n`);
  });
}
const tableManifestSql = `
SELECT format('SELECT json_build_object(''table'', %L, ''rows'', count(*), ''contentHash'', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), ''''))) FROM %I.%I t;', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
AND (NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 OR EXISTS (SELECT 1 FROM pg_extension e WHERE c.oid=ANY(e.extconfig)))
ORDER BY n.nspname,c.relname
\\gexec
`;
const securitySql = `SELECT json_build_object(
 'checkConstraints', (SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',p.conname,'definition',pg_get_constraintdef(p.oid,true),'validated',p.convalidated) ORDER BY n.nspname,c.relname,p.conname) FROM pg_constraint p JOIN pg_namespace n ON n.oid=p.connamespace LEFT JOIN pg_class c ON c.oid=p.conrelid WHERE p.contype='c' AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'),
 'rls', (SELECT json_agg(json_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
 'policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public'),
 'revisionFunction', to_regprocedure('public.get_coach_context_revision()') IS NOT NULL,
 'acceptanceFunctions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%accept%proposal%'),
 'acceptedPlanRows', (SELECT count(*) FROM public.training_plan_versions WHERE status='accepted'),
 'acceptedPlanHash', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.training_plan_versions t WHERE status='accepted'));
`;
const hash = data => createHash('sha256').update(data).digest('hex');
// PostgreSQL can flatten redundant AND parentheses when restoring CHECK expressions.
// Compare those via its canonical catalog deparser above; keep all other dump text exact.
const normalizeSchema = value => value.split('\n').filter(line => !/^\\(?:un)?restrict /.test(line))
  .map(line => line.replace(/^(\s+CONSTRAINT \S+ CHECK )\(.*\)(,?)$/, '$1<canonical-catalog-check>$2')).join('\n').trim();
let receipt;
try {
  const snapshot = await sessionSql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();');
  if (!/^[0-9A-F]+-[0-9A-F]+-\d+$/.test(snapshot)) throw new Error('Invalid exported local snapshot identifier');
  const guard = JSON.parse(await sessionSql(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'nonSynthetic',(SELECT count(*) FROM auth.users WHERE email IS NULL OR email NOT LIKE '%.invalid'),'accepted',(SELECT count(*) FROM public.training_plan_versions WHERE status='accepted'));`));
  if (guard.users < 1 || guard.nonSynthetic !== 0 || guard.accepted < 1) throw new Error('Synthetic users and at least one accepted fixture plan are required');
  const sourceTables = (await sessionSql(tableManifestSql)).split('\n').filter(Boolean).map(JSON.parse);
  const sourceSecurity = JSON.parse(await sessionSql(securitySql));
  const archive = `/tmp/${restoredDatabase}.dump`;
  exec('pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', `--snapshot=${snapshot}`, '--file', archive);
  const sourceSchema = normalizeSchema(exec('pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', `--snapshot=${snapshot}`));
  await sessionSql('COMMIT;');
  session.stdin.end();
  command(['cp', `${container}:${archive}`, path.join(output, 'synthetic-database.private.dump')]);
  // No --clean/--create restoration and no DROP anywhere: collision must fail.
  exec('createdb', '-U', 'supabase_admin', '--owner=postgres', '--template=template0', restoredDatabase);
  exec('pg_restore', '-U', 'supabase_admin', '--dbname', restoredDatabase, '--exit-on-error', '--single-transaction', archive);
  const restoredTables = sql(restoredDatabase, tableManifestSql).split('\n').filter(Boolean).map(JSON.parse);
  const restoredSecurity = JSON.parse(sql(restoredDatabase, securitySql));
  const restoredSchema = normalizeSchema(exec('pg_dump', '-U', 'supabase_admin', '-d', restoredDatabase, '--schema-only'));
  const checks = { tableCountsAndHashes: JSON.stringify(sourceTables) === JSON.stringify(restoredTables),
    schemaDefinitionsOwnersGrants: sourceSchema === restoredSchema,
    securityAndAcceptedRecords: JSON.stringify(sourceSecurity) === JSON.stringify(restoredSecurity),
    representativeRls: ['training_programs','training_plan_versions','adaptation_proposals','coach_weekly_reviews','coach_context_revisions'].every(name => sourceSecurity.rls.some(row => row.table === name && row.enabled)),
    representativeFunctions: sourceSecurity.revisionFunction && sourceSecurity.acceptanceFunctions > 0 };
  fs.writeFileSync(path.join(output, 'source-schema.private.sql'), sourceSchema);
  fs.writeFileSync(path.join(output, 'restored-schema.private.sql'), restoredSchema);
  fs.writeFileSync(path.join(output, 'source-manifest.json'), JSON.stringify({ tables: sourceTables, security: sourceSecurity }, null, 2));
  fs.writeFileSync(path.join(output, 'restored-manifest.json'), JSON.stringify({ tables: restoredTables, security: restoredSecurity }, null, 2));
  receipt = { kind: 'synthetic_local_recovery_rehearsal', checkedAt: new Date().toISOString(), connection, container, sourceDatabase: 'postgres', restoredDatabase, versions,
    localExecutorRole: 'supabase_admin', snapshotConsistent: true, checks, sourceTables: sourceTables.length, sourceRows: sourceTables.reduce((sum, table) => sum + table.rows, 0),
    acceptedPlanRows: sourceSecurity.acceptedPlanRows, acceptedPlanHash: sourceSecurity.acceptedPlanHash,
    sourceSchemaSha256: hash(sourceSchema), restoredSchemaSha256: hash(restoredSchema),
    schemaComparison: 'Exact schema dump except random restrict markers and inline CHECK bodies; all CHECK definitions/validation compared with pg_get_constraintdef(pretty=true) from the same source snapshot',
    archiveSha256: hash(fs.readFileSync(path.join(output, 'synthetic-database.private.dump'))),
    restoreOptions: ['exit-on-error','single-transaction','new-template0-database'],
    preserved: ['original postgres database', 'restored database', 'local archive and manifests'],
    limitations: ['Synthetic local data only; not production backup or recovery proof', 'Cluster roles, extension binaries and local configuration reused, not restored', 'No object-storage blobs, external services or point-in-time recovery tested', 'Sequence values are restored by pg_restore but not compared against an MVCC table snapshot', 'Content digests establish equality, not clinical or programming validity'] };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  if (Object.values(checks).some(value => !value)) throw new Error('Restore comparison failed; preserved artifacts identify differences');
  console.log(JSON.stringify({ receipt: path.relative(root, path.join(output, 'receipt.json')), ...receipt }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ kind: 'synthetic_local_recovery_rehearsal', checkedAt: new Date().toISOString(), restoredDatabase, error: error.message, receiptAvailable: Boolean(receipt), preserved: true }, null, 2));
  throw error;
} finally {
  if (!session.stdin.destroyed) session.stdin.end();
  lines.close();
}
