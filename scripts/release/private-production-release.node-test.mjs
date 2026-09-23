// Executes the actual release branch and cleanup in an isolated VM. All process,
// filesystem and transport capabilities are fakes; no credentials or network.
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECOVERY_TRANSACTION_SQL } from './private-recovery-preflight.mjs';
import { RELEASE_TARGET_METADATA_SQL, RELEASE_TARGET_QUERY_SHA256, releaseMigrationManifest } from './release-target-metadata.mjs';

const source = readFileSync(new URL('./private-production-recovery.mjs', import.meta.url), 'utf8');
const begin = source.indexOf("  if (mode === 'release') {");
const end = source.indexOf("  } else if (mode === 'locale') {", begin);
assert(begin > 0 && end > begin);
const branch = source.slice(begin, end) + '\n  }';
const finalizerStart = source.lastIndexOf('} finally {');
const receiptStart = source.indexOf('\nif (releaseReceipt) {', finalizerStart);
assert(finalizerStart > end && receiptStart > finalizerStart);
const finalizer = source.slice(finalizerStart + '} finally {'.length, receiptStart).trim().replace(/\}$/, '');
const publication = source.slice(receiptStart);

async function exercise({ malformed = false, rejected = false, queryFails = false, stopFails = false, stillRunning = false, foreign = false } = {}) {
  const events = [], writes = [], errors = [];
  const raw = malformed ? '{secret malformed metadata' : JSON.stringify({ ledger: [{ recorded: true }], functions: [['private-definition']], functionAccess: [{}], relations: [[]], groups: [[]], newerLedger: [] });
  const process = {};
  let queries = 0;
  const sandbox = {
    mode: 'release', project: 'approved-project', runId: 'synthetic-release', image: 'pinned-image', client: 'fixed-exporter', clientStarted: true,
    workers: new Set(), key: { fill(value) { assert.equal(value, 0); events.push('key-zeroed'); } },
    process, RECOVERY_TRANSACTION_SQL, RELEASE_TARGET_METADATA_SQL,
    pg(args, sql) {
      queries++; events.push('query');
      assert.deepEqual(Array.from(args), ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
      assert.equal(sql, `${RECOVERY_TRANSACTION_SQL}\n${RELEASE_TARGET_METADATA_SQL}\nROLLBACK;`);
      if (queryFails) throw Error('synthetic transport failure');
      return raw;
    },
    sealed(name, value) { assert.equal(name, 'source-release-metadata'); assert.equal(value, raw); events.push('sealed'); },
    JSON: { ...JSON, stringify: JSON.stringify, parse(value) {
      if (value === raw) { assert(events.includes('sealed')); events.push('parsed'); }
      return JSON.parse(value);
    } },
    classifyReleaseTargetMetadata(metadata, transport) {
      assert.deepEqual({ ...transport }, { projectRef: 'approved-project', fixedTargetVerified: true, tlsVerifyFull: true });
      assert(events.includes('parsed')); events.push('classified');
      return { passed: !rejected, state: rejected ? 'stop_and_review' : 'reviewed_pre_install_baseline', checks: { safe: !rejected }, failedChecks: rejected ? ['safe'] : [], querySha256: RELEASE_TARGET_QUERY_SHA256, limitations: ['synthetic transport fixture'] };
    },
    releaseMigrationManifest,
    pod(args) {
      if (args[0] === 'stop') { events.push('stop'); if (stopFails) throw Error('synthetic stop failure'); return ''; }
      assert.equal(args[0], 'inspect'); events.push('stopped-readback');
      return JSON.stringify([{ Name: 'fixed-exporter', Image: 'pinned-image', Config: { Labels: { 'io.socius.recovery': foreign ? 'other' : 'approved-project' } }, State: { Running: stillRunning, Status: stillRunning ? 'running' : 'exited' } }]);
    },
    fs: { writeFileSync(file, value, options) { assert.equal(options.flag, 'wx'); assert.equal(events.at(-1), 'key-zeroed'); writes.push(JSON.parse(value)); events.push('receipt'); } },
    path: { join: (...parts) => parts.join('/') }, output: 'synthetic-only',
    console: { log() {}, error(message) { errors.push(message); } },
  };
  await new Script(`(async () => { let releaseReceipt; let releaseCleanupVerified = false;
    try { ${branch} } catch { process.exitCode = 1; }
    finally { ${finalizer} }
    ${publication}
  })()`).runInNewContext(sandbox);
  return { events, writes, process, queries, errors };
}

test('release mode encrypts before parsing, queries once and publishes sanitized receipt only after verified stop', async () => {
  const result = await exercise();
  assert.equal(result.queries, 1);
  assert.deepEqual(result.events, ['query', 'sealed', 'parsed', 'classified', 'stop', 'stopped-readback', 'key-zeroed', 'receipt']);
  const [receipt] = result.writes;
  assert.equal(receipt.passed, true);
  assert.equal(receipt.cleanup.exporterStoppedVerified, true);
  assert.equal(receipt.querySha256, RELEASE_TARGET_QUERY_SHA256);
  assert.deepEqual(receipt.migrations, releaseMigrationManifest());
  assert.equal(receipt.counts.functions, 1);
  assert.equal(JSON.stringify(receipt).includes('private-definition'), false);
  assert.equal(result.process.exitCode, undefined);
});

test('classification rejection emits failed receipt after cleanup', async () => {
  const result = await exercise({ rejected: true });
  assert.equal(result.writes[0].passed, false);
  assert.deepEqual(result.writes[0].failedChecks, ['safe']);
  assert.equal(result.process.exitCode, 1);
});

for (const variant of ['stopFails', 'stillRunning', 'foreign']) test(`${variant} prevents success receipt`, async () => {
  const result = await exercise({ [variant]: true });
  assert.equal(result.writes[0].passed, false);
  assert.equal(result.writes[0].state, 'stop_and_review');
  assert.deepEqual(result.writes[0].failedChecks, ['exporterStoppedVerified']);
  assert.equal(result.process.exitCode, 1);
});

for (const variant of ['malformed', 'queryFails']) test(`${variant} cleans up without completion receipt or query retry`, async () => {
  const result = await exercise({ [variant]: true });
  assert.equal(result.queries, 1);
  assert.equal(result.writes.length, 0);
  assert.equal(result.process.exitCode, 1);
  assert(result.events.includes('stopped-readback'));
});
