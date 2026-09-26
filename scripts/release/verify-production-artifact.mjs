// Run only inside the isolated Linux builder at /app. No network/process launch.
// The input receipt contains hashes of public inputs, never private secrets.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const app = '/app';
const output = '/app/.vercel/output';
const receiptPath = '/app/production-artifact-verification.json';
const projectId = 'prj_RocmjxStsTrtmrDaqMddMnb29ENh';
const orgId = 'team_zjdKVgrSBNAYC9gql0Raiocm';
const projectRef = 'auolnfwetmfcwhtvakzy';
const sourceCommit = '93539b00bef9109f4221d10c9554cd99a3f5d5fe';
const sha = value => createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const inside = value => value === output || value.startsWith(`${output}/`);
function requireCheck(condition, name) { if (!condition) throw Error(`Artifact verification failed: ${name}`); }
function relative(file) { return path.relative(output, file).split(path.sep).join('/'); }

try {
  requireCheck(process.platform === 'linux' && process.arch === 'x64' && process.cwd() === app && process.argv.length === 2, 'Linux amd64 /app invocation');
  requireCheck(!fs.existsSync(receiptPath), 'new verification receipt');
  requireCheck(fs.realpathSync(output) === output, 'physical output root');
  const input = readJson('/app/artifact-input-receipt.json');
  requireCheck(input.sourceCommit === sourceCommit && input.projectId === projectId && input.orgId === orgId && input.projectRef === projectRef && input.privateSecretDecryptionRequested === false, 'input identity');
  const link = readJson('/app/.vercel/project.json');
  requireCheck(link.projectId === projectId && link.orgId === orgId && link.projectName === 'fitness-tracker', 'project link');
  requireCheck(JSON.stringify(link.settings) === JSON.stringify(input.settings), 'captured project settings');
  const config = readJson(`${output}/config.json`);
  const builds = readJson(`${output}/builds.json`);
  requireCheck(config.version === 3, 'Build Output API v3');
  requireCheck(builds.target === 'production' && builds.cliVersion === '56.4.1' && !builds.error, 'completed production build metadata');
  requireCheck(Array.isArray(builds.argv) && builds.argv.includes('--prod') && builds.argv.includes('--standalone'), 'production standalone invocation');

  const publicValues = {};
  for (const line of fs.readFileSync('/app/.vercel/.env.production.local', 'utf8').trim().split(/\r?\n/)) {
    const match = /^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=(".*")$/.exec(line);
    requireCheck(match && publicValues[match[1]] === undefined, 'scoped public environment file');
    publicValues[match[1]] = JSON.parse(match[2]);
  }
  requireCheck(Object.keys(publicValues).length === 2, 'exact two public inputs');
  for (const [name, value] of Object.entries(publicValues)) requireCheck(typeof value === 'string' && sha(value) === input.publicInputs?.[name]?.sha256, 'public input digest');
  const url = publicValues.NEXT_PUBLIC_SUPABASE_URL;
  const anon = publicValues.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  requireCheck(url === `https://${projectRef}.supabase.co`, 'production Supabase URL');
  const claims = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString('utf8'));
  requireCheck(anon.split('.').length === 3 && claims.ref === projectRef && claims.role === 'anon', 'public anon project and role');

  const files = [], symlinks = [], functions = [], native = [];
  const executableMatches = { productionUrl: [], publicAnon: [], clientProductionUrl: [], clientPublicAnon: [] };
  const violations = [];
  const versionOrder = (a, b) => {
    const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) if ((aa[i] ?? 0) !== (bb[i] ?? 0)) return (aa[i] ?? 0) - (bb[i] ?? 0);
    return 0;
  };
  function inspectFunction(directory) {
    const file = path.join(directory, '.vc-config.json');
    const functionConfig = readJson(file);
    const runtime = functionConfig.runtime;
    requireCheck(runtime === 'nodejs24.x' || runtime === 'edge', 'expected function runtime');
    const handler = runtime === 'edge' ? functionConfig.entrypoint : functionConfig.handler;
    requireCheck(typeof handler === 'string' && handler.length > 0 && !path.isAbsolute(handler), 'relative function entrypoint');
    const entry = path.resolve(directory, handler);
    requireCheck(inside(entry) && inside(fs.realpathSync(entry)) && fs.statSync(entry).isFile(), 'retained function entrypoint');
    requireCheck(functionConfig.filePathMap === undefined, 'no external file-reference map');
    functions.push({ path: relative(directory), runtime, entrypoint: handler, configurationSha256: sha(fs.readFileSync(file)), entrypointSha256: sha(fs.readFileSync(entry)) });
  }
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = fs.lstatSync(file), rel = relative(file);
      if (stat.isSymbolicLink()) {
        requireCheck(!path.isAbsolute(fs.readlinkSync(file)), 'relocatable relative symlink');
        const resolved = fs.realpathSync(file);
        requireCheck(inside(resolved), 'standalone symlink containment');
        symlinks.push({ path: rel, target: fs.readlinkSync(file), resolved: relative(resolved) });
        if (name.endsWith('.func') && fs.statSync(file).isDirectory()) inspectFunction(file);
        continue;
      }
      if (stat.isDirectory()) {
        if (name.endsWith('.func')) inspectFunction(file);
        walk(file);
        continue;
      }
      requireCheck(stat.isFile(), 'regular retained output files');
      const bytes = fs.readFileSync(file);
      files.push({ path: rel, bytes: bytes.length, sha256: sha(bytes), mode: stat.mode & 0o777 });
      if (name.endsWith('.node') || /\.so(?:\.\d+)*$/.test(name)) {
        const elf = bytes.length > 20 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
        requireCheck(elf && bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 62, 'native ELF64 little-endian x86_64');
        const versions = [...new Set([...bytes.toString('latin1').matchAll(/GLIBC_(\d+(?:\.\d+)+)/g)].map(match => match[1]))].sort(versionOrder);
        native.push({ path: rel, kind: name.endsWith('.node') ? 'node-addon' : 'shared-library', sha256: sha(bytes), format: 'ELF64-x86_64', observedGlibcVersionStrings: versions, maxObservedGlibcVersion: versions.at(-1) ?? null });
      }
      // Maps/build diagnostics are evidence, not executable application assets.
      if (!rel.startsWith('diagnostics/') && /\.(?:js|mjs|cjs|html|css)$/.test(name)) {
        const text = bytes.toString('utf8'), normalized = text.replaceAll('\\/', '/');
        if (/[A-Za-z]:(?:\\{1,2}|\/)(?:Users|Dev|Windows|Program Files)\b/i.test(text)) violations.push({ path: rel, reason: 'Windows filesystem prefix in executable asset' });
        if (/(?:localhost|127\.0\.0\.1|host\.docker\.internal|\[::1\]):55321\b/i.test(normalized)) violations.push({ path: rel, reason: 'local Supabase endpoint in executable asset' });
        if (text.includes(url)) { executableMatches.productionUrl.push(rel); if (rel.startsWith('static/')) executableMatches.clientProductionUrl.push(rel); }
        if (text.includes(anon)) { executableMatches.publicAnon.push(rel); if (rel.startsWith('static/')) executableMatches.clientPublicAnon.push(rel); }
      }
    }
  }
  walk(output);
  requireCheck(functions.length > 0 && files.length > 0, 'nonempty functions and output');
  requireCheck(violations.length === 0, 'no Windows build prefixes or local Supabase endpoints in executable assets');
  requireCheck(executableMatches.clientProductionUrl.length > 0 && executableMatches.clientPublicAnon.length > 0, 'public production inputs embedded in client assets');
  const serviceWorker = files.find(file => file.path === 'static/sw.js');
  requireCheck(serviceWorker && serviceWorker.bytes > 0, 'generated service worker');
  const receipt = {
    kind: 'offline_production_artifact_verification', checkedAt: new Date().toISOString(), passed: true,
    sourceCommit, projectId, orgId, projectRef, artifactRoot: '.vercel/output', formatVersion: 3, target: builds.target,
    environment: { platform: process.platform, arch: process.arch, node: process.version, glibcRuntime: process.report.getReport().header.glibcVersionRuntime ?? null },
    publicInputs: { url: { value: url, sha256: sha(url) }, anon: { sha256: sha(anon), role: claims.role, projectRef: claims.ref } },
    inputReceiptSha256: sha(fs.readFileSync('/app/artifact-input-receipt.json')), projectLinkSha256: sha(fs.readFileSync('/app/.vercel/project.json')),
    configSha256: sha(fs.readFileSync(`${output}/config.json`)), buildsSha256: sha(fs.readFileSync(`${output}/builds.json`)),
    fileManifestSha256: sha(JSON.stringify(files)), totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    serviceWorker, functions, symlinks, native, executableMatches, files,
    limitations: ['Offline structural inspection only; functions and browser code were not executed.',
      'Source commit is bound to the supplied input receipt; this verifier does not independently compare source.tar to the build directory.',
      'GLIBC version strings are observed binary markers, not parsed dynamic requirements or a deployment-runtime compatibility proof.',
      'Windows scan checks Users/Dev/Windows/Program Files drive prefixes; local endpoint scan checks port55321 on localhost/127.0.0.1/host.docker.internal/IPv6loopback. No claim about arbitrary encoded strings.',
      'Hosted runtime secrets, flags, services, routing behavior and production application rollback have not been validated.'],
  };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: true, receiptPath, files: files.length, functions: functions.length, symlinks: symlinks.length, nativeFiles: native.length, manifestSha256: receipt.fileManifestSha256 }));
} catch (error) {
  // Do not print parsed input, key material, filesystem content or JSON errors.
  console.error(error instanceof Error && error.message.startsWith('Artifact verification failed:') ? error.message : 'Artifact verification failed: unreadable or malformed artifact input');
  process.exitCode = 1;
}
