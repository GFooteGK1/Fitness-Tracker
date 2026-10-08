// Create/check local sourced review records. Never writes scores or production state.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (path.resolve(process.cwd()) !== root) throw Error('Run from the programming-quality worktree root');
const [mode, runId, suppliedReviewId] = process.argv.slice(2);
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value ?? '');
if (!['prepare', 'check'].includes(mode) || !uuid(runId)
  || (mode === 'prepare' && suppliedReviewId) || (mode === 'check' && !uuid(suppliedReviewId))) {
  throw Error('Usage: prepare <completed run UUID> | check <completed run UUID> <review UUID>');
}
const reviewId = suppliedReviewId ?? randomUUID();
const runDirectory = path.join(root, 'output/app-quality-release/programming-w10', runId);
const directory = path.join(root, 'output/app-quality-release/programming-w10-adjudication', reviewId);
const report = fs.readFileSync(path.join(runDirectory, 'report.json'), 'utf8');
const executionManifest = fs.readFileSync(path.join(runDirectory, 'manifest.json'), 'utf8');
const receipt = JSON.parse(fs.readFileSync(path.join(runDirectory, 'receipt.json'), 'utf8'));
if (receipt.runId !== runId || JSON.parse(report).runId !== runId) throw Error('Run identity mismatch');
const rubricPath = 'docs/verification/programming-quality/baseline-and-rubric.md';
const rubric = fs.readFileSync(path.join(root, rubricPath), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' || value instanceof Uint8Array
  ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const require = createRequire(import.meta.url);
if (mode === 'prepare') {
  fs.mkdirSync(directory, { recursive: true });
  const built = await build({ entryPoints: ['scripts/programming-w10-adjudication.ts'], absWorkingDir: root,
    bundle: true, format: 'cjs', platform: 'node', write: false, metafile: true, tsconfig: 'tsconfig.json' });
  const bundle = built.outputFiles[0].contents;
  write('validator.cjs', bundle);
  const validator = require(path.join(directory, 'validator.cjs'));
  const ledger = validator.pendingW10Ledger(report, receipt.reportSha256, rubric, executionManifest);
  write('ledger.json', ledger);
  write('sources.json', []);
  const sources = [...new Set([...Object.keys(built.metafile.inputs), 'scripts/programming-w10-review-records.mjs',
    rubricPath, 'package-lock.json', 'tsconfig.json'])].sort().map(name => ({ path: name, sha256: hash(fs.readFileSync(path.resolve(root, name))) }));
  write('manifest.json', { schemaVersion: 1, runId, reviewId, node: process.version, createdAt: new Date().toISOString(),
    reportSha256: receipt.reportSha256, validatorSha256: hash(bundle), sources });
  console.log(JSON.stringify({ prepared: true, runId, reviewId, cases: ledger.cases.length, reviewsRecorded: 0,
    next: `node scripts/programming-w10-review-records.mjs check ${runId} ${reviewId}` }, null, 2));
} else {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.runId !== runId || manifest.reviewId !== reviewId
    || manifest.node !== process.version || manifest.reportSha256 !== receipt.reportSha256) throw Error('Review identity mismatch');
  for (const source of manifest.sources) {
    const target = path.resolve(root, source.path);
    if (!target.startsWith(root + path.sep) || hash(fs.readFileSync(target)) !== source.sha256) throw Error(`Review validator source changed: ${source.path}`);
  }
  const bundle = path.join(directory, 'validator.cjs');
  if (hash(fs.readFileSync(bundle)) !== manifest.validatorSha256) throw Error('Review validator changed');
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'));
  if (!Array.isArray(index)) throw Error('Expected a review evidence index');
  const evidence = Object.create(null);
  for (const source of index) {
    // Explicit review documents only; no arbitrary file reads from ledger fields.
    if (typeof source.id !== 'string' || !source.id.trim() || Object.hasOwn(evidence, source.id)
      || typeof source.path !== 'string' || !/^docs\/verification\/programming-quality\/[a-zA-Z0-9_-]+\.md$/.test(source.path)) throw Error('Invalid review evidence path/identity');
    evidence[source.id] = fs.readFileSync(path.join(root, source.path), 'utf8');
  }
  const validator = require(bundle);
  const result = validator.validateW10Ledger(report, receipt.reportSha256, rubric, executionManifest,
    JSON.parse(fs.readFileSync(path.join(directory, 'ledger.json'), 'utf8')), evidence);
  console.log(JSON.stringify({ runId, reviewId, ...result }, null, 2));
  if (!result.valid) process.exitCode = 1;
}
