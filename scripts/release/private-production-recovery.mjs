// Fixed-target operator recovery tool. Requires explicit production-export authority.
// Never links the synthetic workspace or prints credentials/production records.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createCipheriv, createHash } from 'node:crypto';
import { classifyRecoveryMetadata } from './private-recovery-preflight.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = 'C:/Users/foote/AppData/Local/SociusFit/Recovery';
const project = 'auolnfwetmfcwhtvakzy';
const image = '66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f';
const cli = path.join(root, 'output/app-quality-release/tools/supabase-2.117.0/supabase.exe');
const podman = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const pwsh = 'C:/Users/foote/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const mode = process.argv[2];
if (!['inspect', 'backup'].includes(mode) || process.argv.length !== 3) throw Error('Use inspect or backup; source and destination are fixed');
if (mode === 'backup') throw Error('Backup is not implemented or verified; no production access attempted');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const options = { cwd: destination, env, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 };
const hash = value => createHash('sha256').update(value).digest('hex');
const ca = fs.readFileSync(path.join(root, 'output/app-quality-release/supabase-prod-ca-2021.crt'));
if (hash(ca) !== '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7') throw Error('Official production CA digest mismatch');

// Fail closed on redirection or ACL broadening before any credential or data read.
for (let current = path.resolve(destination); ; current = path.dirname(current)) {
  const stat = fs.lstatSync(current);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Recovery path contains a non-directory or link');
  if (path.dirname(current) === current) break;
}
const aclScript = `$ErrorActionPreference='Stop'; $p='C:\\Users\\foote\\AppData\\Local\\SociusFit\\Recovery';
$a=Get-Acl -LiteralPath $p; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$allowed=@($u,'S-1-5-18','S-1-5-32-544');
if (-not $a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $u) { throw 'Unsafe owner or inheritance' }
$rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));
if ($rules.Count -ne 3) { throw 'Unexpected ACL count' }
foreach ($r in $rules) { if ($r.IdentityReference.Value -notin $allowed -or $r.IsInherited -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl' -or [int]$r.InheritanceFlags -ne 3 -or [int]$r.PropagationFlags -ne 0) { throw 'Unexpected ACL rule' } }
'verified'`;
const acl = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', aclScript], options);
if (acl.status !== 0 || acl.stdout.trim() !== 'verified') throw Error('Private recovery ACL validation failed');

const runId = `${mode}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const output = path.join(destination, runId);
fs.mkdirSync(output);
const key = randomBytes(32);
function dpapi(data, action) {
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security.Cryptography.ProtectedData;
$data=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());
$entropy=[Text.Encoding]::UTF8.GetBytes('SociusFit private recovery v1');
$result=[Security.Cryptography.ProtectedData]::${action}($data,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);
[Console]::Out.Write([Convert]::ToBase64String($result));`;
  const result = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', script], { ...options, input: data.toString('base64') });
  if (result.status !== 0) throw Error('Windows key protection failed');
  return Buffer.from(result.stdout.trim(), 'base64');
}
const protectedKey = dpapi(key, 'Protect');
if (!dpapi(protectedKey, 'Unprotect').equals(key)) throw Error('Windows key recovery self-check failed');
fs.writeFileSync(path.join(output, 'archive-key.dpapi'), protectedKey, { flag: 'wx' });
function sealed(name, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  fs.writeFileSync(path.join(output, `${name}.aes`), ciphertext, { flag: 'wx' });
  fs.writeFileSync(path.join(output, `${name}.encryption.json`), JSON.stringify({ algorithm: 'aes-256-gcm', key: 'archive-key.dpapi', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), plaintextSha256: hash(bytes), ciphertextSha256: hash(ciphertext), bytes: bytes.length }), { flag: 'wx' });
}
let commandIndex = 0;
function command(binary, args, input) {
  const result = spawnSync(binary, args, { ...options, input });
  if (result.stderr) sealed(`command-${++commandIndex}-stderr`, result.stderr);
  if (result.error || result.status !== 0) throw Error(`Recovery command failed (${path.basename(binary)}, exit ${result.status}); encrypted diagnostics retained`);
  return result.stdout.trim();
}
const pod = (args, input) => command(podman, ['--connection', 'sociusfit-local', ...args], input);
const client = `socius-private-export-${randomUUID().slice(0, 12)}`;
let clientStarted = false;
try {
  // No token-store scraping: the official CLI uses the already approved login.
  const script = command(cli, ['db', 'dump', '--dry-run', '--project-ref', project]);
  const connection = {};
  for (const line of script.split(/\r?\n/)) {
    const match = /^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="([^"\\\r\n]*)"$/.exec(line);
    if (match) {
      if (connection[match[1]] !== undefined) throw Error('Duplicate CLI connection variable');
      connection[match[1]] = match[2];
    }
  }
  if (Object.keys(connection).length !== 5 || !connection.PGPASSWORD) throw Error('Unrecognized CLI connection format; never evaluate its script');
  const direct = connection.PGHOST === `db.${project}.supabase.co` && connection.PGUSER === 'cli_login_postgres';
  const pooled = connection.PGHOST === 'aws-1-us-east-1.pooler.supabase.com' && connection.PGUSER === `cli_login_postgres.${project}`;
  if (!(direct || pooled) || connection.PGPORT !== '5432' || connection.PGDATABASE !== 'postgres') throw Error('CLI connection does not match the approved project/session endpoint');
  pod(['run', '-d', '--name', client, '--label', `io.socius.recovery=${project}`, '--network', 'podman', '--read-only', '--image-volume', 'ignore', '--log-driver', 'none', '--user', '100:101', '--cap-drop', 'all', '--security-opt', 'no-new-privileges', '--ulimit', 'core=0:0', '--memory', '128m', '--memory-swap', '128m', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777', '--entrypoint', '/bin/sleep', image, 'infinity']);
  clientStarted = true;
  const inspected = JSON.parse(pod(['inspect', client]))[0];
  if (inspected.Image.replace(/^sha256:/, '') !== image || inspected.Config.Labels['io.socius.recovery'] !== project || Object.keys(inspected.HostConfig.PortBindings ?? {}).length || !inspected.HostConfig.ReadonlyRootfs || inspected.Config.User !== '100:101' || (inspected.HostConfig.NetworkMode !== 'bridge' || Object.keys(inspected.NetworkSettings.Networks ?? {}).join(',') !== 'podman') || inspected.HostConfig.LogConfig.Type !== 'none' || inspected.HostConfig.Memory !== 134217728 || inspected.HostConfig.MemorySwap !== 134217728 || (inspected.Mounts ?? []).some(mount => mount.Type === 'bind' || mount.Type === 'volume')) throw Error('Exporter identity or isolation mismatch');
  const tmpOptions = inspected.HostConfig.Tmpfs?.['/tmp']?.split(',') ?? [];
  if (!['rw', 'nosuid', 'nodev', 'noexec'].every(value => tmpOptions.includes(value)) || !inspected.HostConfig.Ulimits?.some(limit => limit.Name === 'RLIMIT_CORE' && limit.Soft === 0 && limit.Hard === 0)) throw Error('Exporter tmpfs or core-dump control mismatch');
  if (pod(['exec', client, 'cat', '/sys/fs/cgroup/memory.swap.max']) !== '0') throw Error('Exporter swap must be disabled');
  const escapePass = value => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  const passfile = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].map(name => escapePass(connection[name])).join(':') + '\n';
  pod(['exec', '-i', client, '/bin/sh', '-c', 'umask 077; mkdir /tmp/private-recovery; cat > /tmp/private-recovery/pgpass'], passfile);
  pod(['exec', '-i', client, '/bin/sh', '-c', 'umask 077; cat > /tmp/private-recovery/root.crt'], ca);
  if (pod(['exec', client, 'stat', '-c', '%a', '/tmp/private-recovery', '/tmp/private-recovery/pgpass']) !== '700\n600') throw Error('Private credential path modes mismatch');
  connection.PGPASSWORD = '';
  const pgEnv = ['env', ...['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE'].map(name => `${name}=${connection[name]}`), 'PGPASSFILE=/tmp/private-recovery/pgpass', 'PGSSLMODE=verify-full', 'PGSSLROOTCERT=/tmp/private-recovery/root.crt', 'PGCONNECT_TIMEOUT=15', 'PGOPTIONS=-c default_transaction_read_only=on -c row_security=off -c statement_timeout=120000 -c lock_timeout=5000'];
  const pg = (args, input) => pod(['exec', '-i', client, ...pgEnv, ...args], input);
  if (pg(['pg_dump', '--version']) !== 'pg_dump (PostgreSQL) 17.6') throw Error('Unexpected pg_dump version');
  const metadataSql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE postgres;
SELECT jsonb_build_object('database',current_database(),'role',current_user,'login',session_user,'version',current_setting('server_version'),'versionNum',current_setting('server_version_num'),'readOnly',current_setting('transaction_read_only'),'rowSecurity',current_setting('row_security'),'isolation',current_setting('transaction_isolation'),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'bytes',pg_database_size(current_database()),
'schemas',(SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'),
'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion,'schema',n.nspname) ORDER BY extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'),
'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'));
ROLLBACK;`;
  const rawMetadata = pg(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], metadataSql);
  sealed('source-inventory', rawMetadata);
  let metadata;
  try { metadata = JSON.parse(rawMetadata); } catch { throw Error('Metadata JSON parse failed; encrypted evidence retained'); }
  const validation = classifyRecoveryMetadata(metadata);
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(validation, null, 2), { flag: 'wx' });
  if (!validation.passed) throw Error(`Metadata preflight rejected: ${validation.failedChecks.join(', ')}; encrypted evidence retained`);
  const receipt = { kind: 'production_recovery_inventory', project, runId, checkedAt: new Date().toISOString(), readOnly: true, sslMode: 'verify-full', encryptedInventory: true, keyProtection: 'Windows DPAPI CurrentUser', databaseBytes: metadata.bytes, tableCount: metadata.tables.length, extensionNames: metadata.extensions.map(item => item.name), archiveCreated: false, productionRestorePerformed: false };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(receipt));
} catch (error) {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ project, runId, message: error.message, completedBackup: false, at: new Date().toISOString() }), { flag: 'wx' });
  console.error(JSON.stringify({ project, runId, completedBackup: false, error: error.message }));
  process.exitCode = 1;
} finally {
  if (clientStarted) {
    try { pod(['stop', '--time', '5', client]); } catch { console.error('Exporter stop failed; inspect fixed recovery container before proceeding'); process.exitCode = 1; }
  }
  key.fill(0);
}
