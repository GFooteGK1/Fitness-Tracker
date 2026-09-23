// Restore an authenticated private archive into a fresh, network-disabled RAM
// cluster. This program has no Supabase CLI or production connection capability.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { RECOVERY_PROJECT, RECOVERY_IMAGE, privateEnvironment, verifyPrivateRecoveryDirectory, privateRunDirectory, unwrapRecoveryKey, readPrivateJson, unsealPrivateMetadata, sealPrivateMetadata } from './private-recovery-files.mjs';
import { authenticateEncryptedArchive, restoreAuthenticatedArchive } from './private-recovery-archive.mjs';
import { CANONICAL_FORMAT, RECOVERY_CATALOG_SQL, RECOVERY_CANONICAL_SETTINGS, tableDigestSql, createTableDigestSink } from './private-recovery-manifest.mjs';
import { restoreRolesSql, restoreMembershipsSql, restoreDatabaseSql, restoreDatabaseAclSql, compareRecoveryCatalog } from './private-recovery-roles.mjs';
import { extensionPrecreationPlan, splitExtensionSchemaToc } from './private-recovery-extensions.mjs';

const synthetic = process.argv[3] === '--synthetic';
if (process.argv.length !== (synthetic ? 4 : 3)) throw Error('Supply one completed private backup run ID and optional --synthetic fixture mode');
verifyPrivateRecoveryDirectory();
const backup = privateRunDirectory(process.argv[2]);
const completion = readPrivateJson(backup, 'receipt.json');
if (completion.kind !== (synthetic ? 'synthetic_logical_capture' : 'encrypted_production_logical_capture') || completion.project !== (synthetic ? 'synthetic-only' : RECOVERY_PROJECT) || !completion.archiveCreated || !completion.archiveAuthenticated || !completion.sourceManifestCreated) throw Error('No completed approved-source capture');
const key = unwrapRecoveryKey(backup);
const restoreId = `restore-${randomUUID().slice(0, 12)}`, output = path.join(backup, restoreId);
fs.mkdirSync(output);
const seal = (name, value) => sealPrivateMetadata(output, name, value, key);
const root = fileURLToPath(new URL('../../', import.meta.url));
const podman = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const options = { cwd: output, env: privateEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 };
const container = `socius-private-${restoreId}`;
const workers = new Set();
let started = false, diagnostic = 0;
function pod(args, input, allowFailure = false) {
  const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { ...options, input });
  if (result.stderr) seal(`command-${++diagnostic}-stderr`, result.stderr);
  if (result.error || result.status !== 0) {
    if (result.stdout) seal(`command-${++diagnostic}-stdout`, result.stdout);
    if (!allowFailure) throw Error('Private restore command failed; encrypted diagnostics retained');
    return null;
  }
  return result.stdout.trim();
}
function start(args, timeoutMs = 120000) {
  const child = spawn(podman, ['--connection', 'sociusfit-local', ...args], { cwd: output, env: privateEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = [], size = 0, failed = false;
  child.stderr.on('data', chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) { failed = true; child.kill(); } else stderr.push(chunk); });
  child.on('error', () => { failed = true; });
  child.stdin.on('error', () => { failed = true; });
  const timer = setTimeout(() => { failed = true; child.kill(); }, timeoutMs);
  const worker = { child };
  worker.recordDiagnostic = chunk => {
    try { seal(`worker-${++diagnostic}-output`, chunk); }
    catch { failed = true; child.kill(); }
  };
  worker.done = new Promise(resolve => child.once('close', code => {
    clearTimeout(timer); workers.delete(worker);
    try { if (stderr.length) seal(`worker-${++diagnostic}-stderr`, Buffer.concat(stderr)); }
    catch { failed = true; }
    resolve({ success: !failed && code === 0 });
  }));
  worker.requireSuccess = async () => { if (!(await worker.done).success) throw Error('Private restore worker failed; encrypted diagnostics retained'); };
  workers.add(worker); return worker;
}
try {
  const manifestBytes = unsealPrivateMetadata(backup, 'source-manifest', key);
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { throw Error('Authenticated source manifest is malformed'); }
  if (manifest.version !== 1 || manifest.canonicalFormat !== CANONICAL_FORMAT || !Array.isArray(manifest.tableData)) throw Error('Unsupported recovery manifest contract');
  const catalog = manifest.catalog, bootstrap = catalog.bootstrapRole, target = 'private_recovery';
  const extensionPlan = synthetic ? null : extensionPrecreationPlan(catalog);
  const rolesSql = restoreRolesSql(catalog), membershipsSql = restoreMembershipsSql(catalog);
  const databaseSql = restoreDatabaseSql(catalog.database, target), databaseAclSql = restoreDatabaseAclSql(catalog.database, target);
  const archive = path.join(backup, 'archive.aes'), archiveManifest = readPrivateJson(backup, 'archive.manifest.json');
  if (archiveManifest.ciphertextSha256 !== completion.ciphertextSha256) throw Error('Archive completion digest mismatch');
  await authenticateEncryptedArchive({ path: archive, key, manifest: archiveManifest, maxBytes: 256 * 1024 * 1024 });

  const boot = `set -eu
test "$(cat /sys/fs/cgroup/memory.swap.max)" = 0
umask 077
mkdir /private/restore
initdb -D /private/restore/data -U "$RECOVERY_BOOTSTRAP" --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C >/private/restore/init.log 2>&1
exec postgres -D /private/restore/data -k /private/restore -c listen_addresses= -c shared_preload_libraries= -c session_preload_libraries= -c local_preload_libraries= -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c event_triggers=off -c autovacuum=off -c logging_collector=off -c log_statement=none -c log_min_messages=panic -c log_min_error_statement=panic -c cron.launch_active_jobs=off -c pg_net.batch_size=0 -c shared_buffers=64MB >/private/restore/postgres.log 2>&1`;
  pod(['run', '-d', '--name', container, '--label', `io.socius.private-restore=${completion.runId}`, '--network', 'none', '--read-only', '--image-volume', 'ignore', '--user', '100:101', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '1g', '--memory-swap', '1g', '--pids-limit', '128', '--ulimit', 'core=0:0', '--tmpfs', '/private:rw,nosuid,nodev,noexec,size=768m,mode=1777', '--log-driver', 'none', '--env', `RECOVERY_BOOTSTRAP=${bootstrap}`, '--entrypoint', '/bin/sh', RECOVERY_IMAGE, '-c', boot]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (pod(['exec', container, 'pg_isready', '-h', '/private/restore', '-U', bootstrap, '-d', 'postgres'], undefined, true) !== null) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw Error('Private empty restore cluster did not become ready');
  const state = JSON.parse(pod(['inspect', container]))[0];
  if (state.Image.replace(/^sha256:/, '') !== RECOVERY_IMAGE || state.Config.Labels['io.socius.private-restore'] !== completion.runId || state.HostConfig.NetworkMode !== 'none' || Object.keys(state.HostConfig.PortBindings ?? {}).length || !state.HostConfig.ReadonlyRootfs || state.Config.User !== '100:101' || state.HostConfig.LogConfig.Type !== 'none' || state.HostConfig.Memory !== 1073741824 || state.HostConfig.MemorySwap !== 1073741824 || (state.Mounts ?? []).some(item => ['bind', 'volume'].includes(item.Type))) throw Error('Private restore isolation mismatch');
  if (!state.HostConfig.Tmpfs?.['/private'] || !state.HostConfig.Ulimits?.some(item => item.Name === 'RLIMIT_CORE' && item.Hard === 0 && item.Soft === 0)) throw Error('Private RAM/core-dump controls missing');
  if (pod(['exec', container, 'cat', '/sys/fs/cgroup/memory.swap.max']) !== '0') throw Error('Private restore swap is enabled');
  if (pod(['exec', container, 'stat', '-c', '%u:%g:%a', '/private/restore']) !== '100:101:700') throw Error('Private RAM permissions mismatch');
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) if (pod(['exec', container, 'cat', file]).split('\n').length !== 1) throw Error('Private restore has a TCP socket');
  const pgArgs = (database, command = 'psql') => ['exec', '-i', container, 'env', 'PGOPTIONS=-c event_triggers=off -c session_preload_libraries= -c local_preload_libraries= -c statement_timeout=120000 -c lock_timeout=5000', command, '-h', '/private/restore', '-U', bootstrap, '-d', database];
  const sql = (query, database = target) => pod([...pgArgs(database), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], query);
  const controls = JSON.parse(sql("SELECT json_build_object('version',current_setting('server_version'),'listen',current_setting('listen_addresses'),'eventTriggers',current_setting('event_triggers'),'preloads',current_setting('shared_preload_libraries'),'workers',current_setting('max_worker_processes'),'logicalWorkers',current_setting('max_logical_replication_workers'),'cron',current_setting('cron.launch_active_jobs'),'bootstrap',(SELECT rolname FROM pg_roles WHERE oid=10));", 'postgres'));
  if (controls.version !== '17.6' || controls.listen !== '' || controls.eventTriggers !== 'off' || controls.preloads !== '' || controls.workers !== '0' || controls.logicalWorkers !== '0' || controls.cron !== 'off' || controls.bootstrap !== bootstrap) throw Error('Private server controls mismatch');
  seal('isolation', JSON.stringify({ controls, image: RECOVERY_IMAGE, network: 'none', ramMode: '100:101:700', swapMax: 0, coreLimit: 0 }));
  sql(rolesSql, 'postgres');
  sql(membershipsSql, 'postgres');
  sql(databaseSql, 'postgres');
  sql(databaseAclSql, 'postgres');
  let staging;
  await restoreAuthenticatedArchive({ path: archive, key, manifest: archiveManifest, maxBytes: 256 * 1024 * 1024, createDestination() {
    staging = start(['exec', '-i', container, '/bin/sh', '-c', 'umask 077; cat > /private/restore/archive.dump']);
    staging.child.stdout.resume(); return staging.child.stdin;
  } });
  await staging.requireSuccess();
  if (pod(['exec', container, 'stat', '-c', '%a', '/private/restore/archive.dump']) !== '600') throw Error('Staged archive mode mismatch');
  let restoreList = [];
  if (extensionPlan) {
    const toc = pod(['exec', container, 'pg_restore', '--list', '/private/restore/archive.dump']);
    seal('archive-toc', toc);
    const split = splitExtensionSchemaToc(toc);
    pod(['exec', '-i', container, '/bin/sh', '-c', 'umask 077; cat > /private/restore/schema.list'], split.schemaList);
    pod(['exec', '-i', container, '/bin/sh', '-c', 'umask 077; cat > /private/restore/remaining.list'], split.remainingList);
    pod([...pgArgs(target, 'pg_restore'), '--exit-on-error', '--single-transaction', '--use-list=/private/restore/schema.list', '/private/restore/archive.dump']);
    sql(extensionPlan.sql);
    const roleState = JSON.parse(sql("SELECT json_build_object('super',rolsuper,'login',rolcanlogin) FROM pg_roles WHERE rolname='postgres';"));
    if (roleState.super !== false || roleState.login !== false) throw Error('Extension installer role flags were not restored');
    seal('extension-precreation', JSON.stringify({ ...split, schemaList: undefined, remainingList: undefined, installed: extensionPlan.extensions, originalSuperuserFlagRestored: true }));
    restoreList = ['--use-list=/private/restore/remaining.list'];
  }
  // No owner/ACL filtering and no ignored managed-object errors.
  const restored = start([...pgArgs(target, 'pg_restore'), '--exit-on-error', '--single-transaction', ...restoreList, '/private/restore/archive.dump'], 10 * 60 * 1000);
  restored.child.stdin.end(); restored.child.stdout.on('data', restored.recordDiagnostic);
  await restored.requireSuccess();
  let actualCatalog;
  const rawCatalog = sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL row_security=off; ${RECOVERY_CANONICAL_SETTINGS} ${RECOVERY_CATALOG_SQL} COMMIT;`);
  seal('restored-catalog', rawCatalog);
  try { actualCatalog = JSON.parse(rawCatalog); } catch { throw Error('Restored catalog parse failed'); }
  const comparison = compareRecoveryCatalog(catalog, actualCatalog);
  seal('catalog-comparison', JSON.stringify(comparison));
  const tableData = [];
  for (const expected of manifest.tableData) {
    const sink = createTableDigestSink(), reader = start([...pgArgs(target), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
    reader.child.stdin.end(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL row_security=off; ${RECOVERY_CANONICAL_SETTINGS} ${tableDigestSql(expected)} COMMIT;`);
    await Promise.all([pipeline(reader.child.stdout, sink.stream), reader.requireSuccess()]);
    const actual = sink.result();
    tableData.push({ schema: expected.schema, table: expected.table, ...actual, matched: actual.rows === expected.rows && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes });
  }
  seal('table-comparison', JSON.stringify(tableData));
  const matchedTables = tableData.filter(table => table.matched).length;
  if (!comparison.matched || matchedTables !== manifest.tableData.length) throw Error(`Private restore parity failed: ${comparison.differingSections.length} catalog sections, ${tableData.length - matchedTables} table digests; encrypted details retained`);
  const covered = (schema, table) => tableData.some(item => item.schema === schema && item.table === table && item.matched);
  const releaseDataCoverage = { acceptedPlans: covered('public', 'training_plan_versions'), prescribedSessions: covered('public', 'prescribed_sessions'), proposals: covered('public', 'adaptation_proposals'), migrationLedger: covered('supabase_migrations', 'schema_migrations'), authIdentities: covered('auth', 'users') };
  if (!synthetic && Object.values(releaseDataCoverage).some(value => !value)) throw Error('Required release recovery table coverage is missing');
  const receipt = { kind: synthetic ? 'synthetic_private_restore_verified' : 'private_logical_restore_verified', project: completion.project, backupRunId: completion.runId, restoreId, checkedAt: new Date().toISOString(), archiveAuthenticated: true, restored: true, selectedCatalogMatched: true, tableScopesMatched: matchedTables, releaseDataCoverage, container, sourceCiphertextSha256: completion.ciphertextSha256, productionRestorePerformed: false, limitations: [...manifest.limitations, 'Comparison covers captured catalog sections and included physical table scopes; large-object contents and unlisted object kinds are not digest-compared'], substitutions: comparison.normalized };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(receipt));
} catch (error) {
  try { seal('failure', JSON.stringify({ message: error.message, restoreId, completedRestore: false })); }
  catch { console.error('Private failure diagnostic could not be saved'); }
  console.error(JSON.stringify({ restoreId, completedRestore: false, error: error.message }));
  process.exitCode = 1;
} finally {
  const active = [...workers]; for (const worker of active) worker.child.kill();
  await Promise.all(active.map(worker => worker.done));
  if (started) { try { pod(['stop', '--time', '5', container]); } catch { console.error('Private RAM container stop failed; inspect before proceeding'); process.exitCode = 1; } }
  key.fill(0);
}
