// Local deterministic development evidence. No holdout, model, database or hosted access.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (path.resolve(process.cwd()) !== root) throw Error('Run from the programming-quality worktree root');
const [mode, id] = process.argv.slice(2);
if (!['prepare', 'run'].includes(mode) || (mode === 'prepare' && id)
  || (mode === 'run' && !/^[a-f0-9-]{36}$/.test(id ?? ''))) throw Error('Usage: prepare | run <prepared UUID>');
const runId = mode === 'prepare' ? randomUUID() : id;
const directory = path.join(root, 'output/app-quality-release/programming-w10', runId);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const write = (name, value) => fs.writeFileSync(path.join(directory, name), value, { flag: 'wx' });
const localFile = relative => {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw Error('Source escapes worktree');
  return absolute;
};
const require = createRequire(import.meta.url);
const documents = [
  'docs/verification/programming-quality/w10-evaluation-protocol-2026-09-28.md',
  'docs/verification/programming-quality/baseline-and-rubric.md',
  'docs/coach/initial-dose-policy-0.2-review.md',
  'docs/verification/programming-quality/c2r-week-context-review-1.md',
  'docs/verification/programming-quality/developmental-bench-week-1.md',
];

if (mode === 'prepare') {
  fs.mkdirSync(directory, { recursive: true });
  const built = await build({ stdin: { contents: [
    "export { runW10DevelopmentSuite, w10Hash } from './scripts/programming-w10-evaluation';",
    "export { buildW10DevelopmentSuite } from './test/fixtures/programming-w10-development';",
  ].join('\n'), resolveDir: root, sourcefile: 'w10-entry.ts', loader: 'ts' },
  absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true,
  tsconfig: path.join(root, 'tsconfig.json') });
  const bundle = built.outputFiles[0].contents;
  write('runner.cjs', bundle);
  const adapter = require(path.join(directory, 'runner.cjs'));
  // These already-exposed fixtures may compile while preparing. Never call this a blind run.
  const suite = adapter.buildW10DevelopmentSuite();
  write('suite.json', json(suite));
  const paths = [...new Set([...Object.keys(built.metafile.inputs).filter(name => name !== 'w10-entry.ts'),
    ...documents, 'scripts/programming-w10-runner.mjs', 'tsconfig.json', 'package-lock.json'])].sort();
  const sources = paths.map(name => ({ path: name.replaceAll('\\', '/'), sha256: hash(fs.readFileSync(localFile(name))) }));
  const manifest = { schemaVersion: 1, runId, preparedAt: new Date().toISOString(), node: process.version,
    classification: 'exposed_development_only', bundleSha256: hash(bundle),
    suiteFileSha256: hash(fs.readFileSync(path.join(directory, 'suite.json'))), suiteHash: adapter.w10Hash(suite),
    sources, roster: suite.cases.map(row => ({ id: row.id, expected: row.expected })) };
  write('manifest.json', json(manifest));
  console.log(json({ prepared: true, runId, cases: suite.cases.length, sourceFiles: sources.length,
    next: `node scripts/programming-w10-runner.mjs run ${runId}`, numericalAuthority: false }));
} else {
  const manifestText = fs.readFileSync(path.join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestText);
  if (manifest.schemaVersion !== 1 || manifest.runId !== runId || manifest.node !== process.version
    || manifest.classification !== 'exposed_development_only') throw Error('Prepared identity/runtime mismatch');
  for (const source of manifest.sources) if (hash(fs.readFileSync(localFile(source.path))) !== source.sha256) {
    throw Error(`Source changed after freeze: ${source.path}. Preserve this preparation; prepare a new development run.`);
  }
  const bundlePath = path.join(directory, 'runner.cjs'), suiteBytes = fs.readFileSync(path.join(directory, 'suite.json'));
  if (hash(fs.readFileSync(bundlePath)) !== manifest.bundleSha256 || hash(suiteBytes) !== manifest.suiteFileSha256) throw Error('Prepared artifact hash mismatch');
  const adapter = require(bundlePath), suite = JSON.parse(suiteBytes);
  if (adapter.w10Hash(suite) !== manifest.suiteHash
    || JSON.stringify(suite.cases.map(row => ({ id: row.id, expected: row.expected }))) !== JSON.stringify(manifest.roster)) throw Error('Prepared roster mismatch');
  // Exclusive start fence: never replace a failed/uncertain attempt or silently retry it.
  write('started.json', json({ runId, startedAt: new Date().toISOString(), manifestSha256: hash(manifestText) }));
  try {
    const report = adapter.runW10DevelopmentSuite(suite);
    write('report.json', json({ ...report, runId, manifestSha256: hash(manifestText) }));
    write('review-packet.json', json({ schemaVersion: 1, runId, reportSha256: hash(fs.readFileSync(path.join(directory, 'report.json'))),
      instruction: 'Development calibration only. Review complete input/output in report.json. Null is unreviewed; prior qualitative acceptance supplies no rubric scores.',
      cases: report.cases.map(row => ({ caseId: row.caseId, inputHash: row.inputHash, outputHash: row.outputHash, ...row.review })) }));
    write('receipt.json', json({ runId, completedAt: new Date().toISOString(), status: report.summary.mechanicalStatus,
      reportSha256: hash(fs.readFileSync(path.join(directory, 'report.json'))),
      reviewPacketSha256: hash(fs.readFileSync(path.join(directory, 'review-packet.json'))), summary: report.summary }));
    console.log(json({ runId, directory, ...report.summary }));
    if (report.summary.failed) process.exitCode = 1;
  } catch (error) {
    write('failure.json', json({ runId, error: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}
