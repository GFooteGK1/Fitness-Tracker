import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecoveryMetadata } from './private-recovery-preflight.mjs';

const valid = { database: 'postgres', role: 'postgres', login: 'cli_login_postgres', readOnly: 'on', rowSecurity: 'off', isolation: 'repeatable read', ssl: true, version: '17.6', versionNum: '170006', tables: [], extensions: [{ name: 'plpgsql' }], bytes: 1024 };
test('accepts only fully verified metadata', () => assert.equal(classifyRecoveryMetadata(valid).passed, true));
test('separates version mismatch from source identity and authority', () => {
  const result = classifyRecoveryMetadata({ ...valid, version: '17.5', versionNum: '170005' });
  assert.deepEqual(result.failedChecks, ['expectedServerVersion']);
  assert.equal(result.checks.compatibleServerMajor, true);
  assert.equal(result.checks.database, true);
});
test('fails closed for malformed metadata, missing fields and wrong transaction state', () => {
  for (const malformed of [null, undefined, [], 'private data', 17]) assert.equal(classifyRecoveryMetadata(malformed).passed, false);
  for (const name of ['database', 'role', 'login', 'readOnly', 'rowSecurity', 'isolation', 'versionNum', 'tables', 'extensions', 'bytes']) {
    const record = { ...valid }; delete record[name];
    assert.equal(classifyRecoveryMetadata(record).passed, false, name);
  }
  for (const changed of [{ readOnly: 'off' }, { rowSecurity: 'on' }, { role: 'service_role' }, { isolation: 'read committed' }, { versionNum: '180000' }, { versionNum: [170006] }, { extensions: [null] }, { tables: {} }, { bytes: -1 }, { bytes: Infinity }]) {
    assert.equal(classifyRecoveryMetadata({ ...valid, ...changed }).passed, false);
  }
});
test('treats backend SSL separately and uses numeric server version', () => {
  assert.equal(classifyRecoveryMetadata({ ...valid, ssl: false }).passed, true);
  assert.equal(classifyRecoveryMetadata({ ...valid, ssl: false }).backendTlsObserved, false);
  assert.equal(classifyRecoveryMetadata({ ...valid, ssl: undefined }).backendTlsObserved, null);
  assert.equal(classifyRecoveryMetadata({ ...valid, version: 'PostgreSQL vendor package 17.6' }).passed, true);
});
