// Local-only build stages. No deployment command or credentials are accepted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'output/app-quality-release/production-artifact-93539b0');
const podman = path.join(root, 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const name = 'socius-production-artifact-93539b0';
const image = 'ad4384301ba9ec6a314f41e451e5c440874b06e52147a1a7f875c0df5c7b101b';
const mode = process.argv[2];
if (!['prepare', 'build', 'export', 'stop'].includes(mode) || process.argv.length !== 3) throw Error('Use prepare, build, export or stop');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const hash = value => createHash('sha256').update(value).digest('hex');
const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'input-receipt.json'), 'utf8'));
if (hash(fs.readFileSync(path.join(directory, 'source.tar'))) !== receipt.sourceArchiveSha256) throw Error('Pinned source archive hash changed');
function pod(args, { log, input, timeout = 120000 } = {}) {
  const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { cwd: root, env, input, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 });
  if (log) fs.writeFileSync(path.join(directory, log), result.stdout + result.stderr, { flag: 'wx' });
  if (result.status !== 0 || result.error) throw Error(`Local artifact command failed (${args[0]}); ${log ?? 'no log'}; ${result.error?.code ?? result.status}`);
  return result.stdout.trim();
}
function identity() {
  const item = JSON.parse(pod(['inspect', name]))[0];
  if (item.Image.replace(/^sha256:/, '') !== image || item.Config.Labels['io.socius.artifact'] !== '93539b0' || item.Mounts.length || Object.keys(item.HostConfig.PortBindings ?? {}).length || !item.State.Running) throw Error('Builder isolation/identity mismatch');
  return item;
}
if (mode === 'prepare') {
  if (receipt.sourceCommit !== '93539b00bef9109f4221d10c9554cd99a3f5d5fe' || receipt.privateSecretDecryptionRequested !== false) throw Error('Unexpected input receipt');
  pod(['run', '-d', '--name', name, '--label', 'io.socius.artifact=93539b0', '--network', 'podman', '--cap-drop', 'all', '--security-opt', 'no-new-privileges', '--ulimit', 'core=0:0', '--memory', '8g', '--memory-swap', '8g', '--env', 'VERCEL_TELEMETRY_DISABLED=1', '--env', 'NEXT_TELEMETRY_DISABLED=1', '--env', 'NO_UPDATE_NOTIFIER=1', '--env', 'CI=1', '--entrypoint', '/bin/sleep', image, 'infinity']);
  identity();
  pod(['cp', path.join(directory, 'source.tar'), `${name}:/tmp/source.tar`]);
  // No public or private production configuration is present during installation.
  pod(['exec', '-i', name, '/bin/sh', '-eu'], { timeout: 20 * 60 * 1000, log: 'prepare.log', input: `mkdir /app /tools
tar --no-same-owner -xf /tmp/source.tar -C /app
cd /app
test ! -e .env
test ! -e .env.local
test ! -e .env.production
test ! -e .env.production.local
npm ci --no-audit --no-fund
npm install --prefix /tools --no-audit --no-fund vercel@56.4.1
npm install --prefix /app/.vercel/builders --no-audit --no-fund @vercel/next@4.20.4
node --version
node /tools/node_modules/vercel/dist/vc.js --version
` });
  pod(['network', 'disconnect', 'podman', name]);
  const item = identity();
  if (Object.keys(item.NetworkSettings.Networks ?? {}).length) throw Error('Builder network remains attached');
  fs.writeFileSync(path.join(directory, 'linux-prepared.json'), JSON.stringify({ preparedAt: new Date().toISOString(), name, image, networks: item.NetworkSettings.Networks, sourceCommit: receipt.sourceCommit, node: '24.13.1', vercel: '56.4.1', nextBuilder: '4.20.4', credentialsMounted: false }, null, 2), { flag: 'wx' });
} else if (mode === 'build') {
  const item = identity();
  if (Object.keys(item.NetworkSettings.Networks ?? {}).length) throw Error('Build must have no external network');
  const cache = JSON.parse(fs.readFileSync(path.join(directory, 'inputs/project.json'), 'utf8'));
  if (cache.projectId !== receipt.projectId || cache.orgId !== receipt.orgId || JSON.stringify(cache.settings) !== JSON.stringify(receipt.settings)) throw Error('Project cache changed');
  const publicLines = fs.readFileSync(path.join(directory, 'inputs/.env.production.local'), 'utf8').trim().split('\n');
  if (publicLines.length !== 2) throw Error('Unexpected build environment scope');
  for (const line of publicLines) {
    const position = line.indexOf('='), key = line.slice(0, position);
    if (!receipt.publicInputs[key] || hash(JSON.parse(line.slice(position + 1))) !== receipt.publicInputs[key].sha256) throw Error('Public input changed');
  }
  const toolchain = JSON.parse(pod(['exec', name, 'node', '-e', "console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,glibc:process.report.getReport().header.glibcVersionRuntime,vercel:require('/tools/node_modules/vercel/package.json').version,builder:require('/app/.vercel/builders/node_modules/@vercel/next/package.json').version,next:require('/app/node_modules/next/package.json').version}))"]));
  if (toolchain.node !== 'v24.13.1' || toolchain.platform !== 'linux' || toolchain.arch !== 'x64' || toolchain.vercel !== '56.4.1' || toolchain.builder !== '4.20.4') throw Error('Observed build toolchain mismatch');
  pod(['cp', path.join(directory, 'inputs/project.json'), `${name}:/app/.vercel/project.json`]);
  pod(['cp', path.join(directory, 'inputs/.env.production.local'), `${name}:/app/.vercel/.env.production.local`]);
  const attempt = fs.readdirSync(directory).filter(file => /^build(?:-\d+)?\.log$/.test(file)).length + 1;
  if (attempt > 3) throw Error('Three local build attempts exhausted; revised-method approval required');
  pod(['exec', '--workdir', '/app', '--env', 'NODE_PATH=/tools/node_modules', '--env', 'VERCEL_ENV=production', '--env', 'VERCEL_TARGET_ENV=production', name, 'node', '/tools/node_modules/vercel/dist/vc.js', 'build', '--prod', '--standalone'], { timeout: 20 * 60 * 1000, log: `build-${attempt}.log` });
  fs.writeFileSync(path.join(directory, 'linux-built.json'), JSON.stringify({ builtAt: new Date().toISOString(), name, image, toolchain, network: 'disconnected', secrets: false, productionWrites: false }, null, 2), { flag: 'wx' });
} else if (mode === 'export') {
  identity();
  if (!fs.existsSync(path.join(directory, 'linux-built.json'))) throw Error('No completed build');
  pod(['exec', name, 'tar', '-cf', '/tmp/vercel-artifact.tar', '-C', '/app', '.vercel/output', '.vercel/project.json']);
  if (fs.existsSync(path.join(directory, 'vercel-artifact.tar'))) throw Error('Never overwrite retained export');
  pod(['cp', `${name}:/tmp/vercel-artifact.tar`, path.join(directory, 'vercel-artifact.tar')]);
} else {
  identity();
  pod(['stop', '--time', '5', name]);
  const item = JSON.parse(pod(['inspect', name]))[0];
  if (item.State.Running || item.State.Status !== 'exited') throw Error('Builder did not stop');
  console.log(JSON.stringify({ name, stopped: true }));
}
console.log(JSON.stringify({ stage: mode, directory, success: true }));
