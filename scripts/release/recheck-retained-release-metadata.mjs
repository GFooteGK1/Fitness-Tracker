// Reclassify a specific authenticated saved observation. No source connection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { RECOVERY_DIRECTORY, verifyPrivateRecoveryDirectory, unwrapRecoveryKey, unsealPrivateMetadata, readPrivateJson } from './private-recovery-files.mjs';
import { RELEASE_TARGET_QUERY_SHA256, classifyReleaseTargetMetadata } from './release-target-metadata.mjs';
const runId = 'release-20260923233048-22dfac49';
const directory = path.join(RECOVERY_DIRECTORY, runId);
if (process.argv.length !== 2) throw Error('Retained source is fixed');
verifyPrivateRecoveryDirectory();
if (fs.lstatSync(directory).isSymbolicLink()) throw Error('Retained evidence directory redirected');
const original = readPrivateJson(directory, 'receipt.json');
if (original.project !== 'auolnfwetmfcwhtvakzy' || original.runId !== runId || original.querySha256 !== RELEASE_TARGET_QUERY_SHA256 || original.sourceConnections !== 1 || original.readOnly !== true || original.sslMode !== 'verify-full' || original.cleanup?.exporterStoppedVerified !== true || original.checks.fixedTarget !== true) throw Error('Retained transport receipt not verified');
const key = unwrapRecoveryKey(directory);
try {
  const bytes = unsealPrivateMetadata(directory, 'source-release-metadata', key);
  const metadata = JSON.parse(bytes.toString('utf8'));
  const validation = classifyReleaseTargetMetadata(metadata, { projectRef: original.project, fixedTargetVerified: true, tlsVerifyFull: true });
  const result = { ...original, ...validation, reclassifiedAt: new Date().toISOString(), originalClassifierPassed: original.passed,
    originalFailedChecks: original.failedChecks, sourceObservationTime: metadata.identity.observedAt,
    authenticatedSourceSha256: createHash('sha256').update(bytes).digest('hex'),
    reclassificationSourceConnections: 0, originalReceiptPreserved: true };
  const target = fileURLToPath(new URL('../../docs/verification/programming-quality/production-release-target-2026-09-23.json', import.meta.url));
  fs.writeFileSync(target, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: result.passed, runId, reclassificationSourceConnections: 0, rawMetadataEqual: validation.metadataComparison.rawExistingMetadataUnchanged, qualifications: validation.metadataComparison.qualifications.length, target }));
  if (!result.passed) process.exitCode = 1;
} finally { key.fill(0); }
