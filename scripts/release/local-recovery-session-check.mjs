// Synthetic-only regression against the previously prepared private PG17.6 probe.
// No Supabase CLI, network connection, production data, or production credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { RECOVERY_TRANSACTION_SQL } from './private-recovery-preflight.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const podman = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const container = 'socius-private-restore-probe-b43e4eab';
const image = '66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const database = `synthetic_recovery_settings_${suffix}`;
const restricted = `synthetic_restricted_${suffix}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
function pod(args, input) {
  const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { cwd: root, env, input, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error(`Synthetic local check failed: ${result.stderr}`);
  return result.stdout.trim();
}
const state = JSON.parse(pod(['inspect', container]))[0];
assert.equal(state.Image.replace(/^sha256:/, ''), image);
assert.equal(state.Config.Labels['sociusfit.data'], 'empty-and-synthetic-only');
assert.equal(state.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(state.HostConfig.PortBindings ?? {}).length, 0);
assert.equal(state.State.Running, true);
const sql = (text, target = database) => pod(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '/private/restore', '-U', 'restore_operator', '-d', target], text);
assert.equal(sql('SHOW server_version;', 'postgres'), '17.6');
sql(`CREATE DATABASE ${database} TEMPLATE template0; CREATE ROLE ${restricted} NOLOGIN NOBYPASSRLS;`, 'postgres');
sql(`CREATE TABLE synthetic_rows(id integer PRIMARY KEY);
INSERT INTO synthetic_rows VALUES(1),(2);
ALTER TABLE synthetic_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY one_row ON synthetic_rows USING(id=1);
GRANT SELECT ON synthetic_rows TO ${restricted};`);
const checks = [];
const readback = sql(`SET row_security=on;
${RECOVERY_TRANSACTION_SQL}
SELECT json_build_object('rowSecurity',current_setting('row_security'),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'statementTimeoutMs',(SELECT setting::integer FROM pg_settings WHERE name='statement_timeout'),'lockTimeoutMs',(SELECT setting::integer FROM pg_settings WHERE name='lock_timeout'));
ROLLBACK;
SHOW row_security;`).split('\n');
assert.deepEqual(JSON.parse(readback[0]), { rowSecurity: 'off', readOnly: 'on', isolation: 'repeatable read', statementTimeoutMs: 120000, lockTimeoutMs: 5000 });
checks.push('explicit settings override session defaults inside actual recovery preamble');
assert.equal(readback[1], 'on');
checks.push('rollback restores session row_security');
assert.equal(sql(`SET ROLE ${restricted}; SET row_security=on; SELECT count(*) FROM synthetic_rows;`), '1');
checks.push('restricted role demonstrates filtered read with row_security on');
const rejected = sql(`SET ROLE ${restricted}; BEGIN READ ONLY; SET LOCAL row_security=off;
DO $test$ BEGIN
  BEGIN PERFORM * FROM synthetic_rows; RAISE EXCEPTION 'Expected RLS rejection';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Expected rejection'; END;
END $test$;
ROLLBACK; SELECT 'rejected';`);
assert.equal(rejected, 'rejected');
checks.push('off rejects filtered read instead of granting RLS bypass');
assert.equal(sql('SET row_security=off; SELECT count(*) FROM synthetic_rows;'), '2');
checks.push('existing privileged local operator reads all synthetic rows');
const policyState = JSON.parse(sql("SELECT json_build_object('rls',relrowsecurity,'forced',relforcerowsecurity,'policies',(SELECT count(*) FROM pg_policy WHERE polrelid=c.oid)) FROM pg_class c WHERE oid='synthetic_rows'::regclass;"));
assert.deepEqual(policyState, { rls: true, forced: true, policies: 1 });
checks.push('table RLS flags and policy remain unchanged');
const receipt = { kind: 'synthetic_recovery_session_controls', checkedAt: new Date().toISOString(), container, database, version: '17.6', passed: checks.length, checks, productionAccess: false, productionBackup: false };
fs.writeFileSync(path.join(root, `output/app-quality-release/${database}.json`), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
