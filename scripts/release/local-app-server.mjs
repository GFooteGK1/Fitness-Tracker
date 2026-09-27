// Starts only the synthetic local app. Inherited service credentials are excluded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] ?? 'dev';
const setupRehearsal = process.argv[3] === '--setup-rehearsal';
if (!['dev', 'build', 'start'].includes(mode) || process.argv.length > (setupRehearsal ? 4 : 3)) throw new Error('Use dev, build or start, optionally --setup-rehearsal');
const localOutput = setupRehearsal ? 'output/setup-freshness-release' : 'output/app-quality-release';
const apiPort = setupRehearsal ? '55421' : '55321', dbPort = setupRehearsal ? '55422' : '55322';
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
  if (fs.existsSync(path.join(root, name))) throw new Error(`Refusing automatic environment file: ${name}`);
}
const status = JSON.parse(fs.readFileSync(path.join(root, localOutput, 'local-supabase-status.private.json'), 'utf8'));
if (status.API_URL !== `http://127.0.0.1:${apiPort}`) throw new Error('Unexpected local API destination');
const db = new URL(status.DB_URL);
if (db.hostname !== '127.0.0.1' || db.port !== dbPort) throw new Error('Unexpected local database');
const buildReceipt = path.join(root, localOutput, 'local-app-build.json');
const keyHash = createHash('sha256').update(status.ANON_KEY).digest('hex');
if (mode === 'start') {
  const receipt = JSON.parse(fs.readFileSync(buildReceipt, 'utf8'));
  const buildId = fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim();
  if (receipt.buildId !== buildId || receipt.apiUrl !== status.API_URL || receipt.anonKeyHash !== keyHash) {
    throw new Error('Build destination is unverified; run this helper in build mode first');
  }
}
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)) env[key] = value;
}
Object.assign(env, {
  NODE_ENV: mode === 'dev' ? 'development' : 'production', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
});
const args = [path.join(root, 'node_modules/next/dist/bin/next'), mode,
  ...(mode === 'build' ? [] : ['--hostname', '127.0.0.1', '--port', '3011'])];
const child = spawn(process.execPath, args, {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  if (mode === 'build' && code === 0) {
    const buildId = fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim();
    fs.writeFileSync(buildReceipt, JSON.stringify({ buildId, apiUrl: status.API_URL, anonKeyHash: keyHash }, null, 2));
  }
  process.exitCode = code ?? 1;
});
