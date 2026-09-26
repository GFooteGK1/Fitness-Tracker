// Pure classifier: no credentials, I/O, or production side effects.
// Set safety/completeness controls in SQL, not only startup options that a pooler
// may omit. row_security=off rejects policy-filtered reads; it grants no bypass.
export const RECOVERY_TRANSACTION_SQL = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE postgres;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';`;

export function classifyRecoveryMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) metadata = {};
  const numericVersion = (typeof metadata.versionNum === 'string' && /^\d{6}$/.test(metadata.versionNum)) || (typeof metadata.versionNum === 'number' && Number.isSafeInteger(metadata.versionNum));
  const checks = {
    database: metadata.database === 'postgres',
    effectiveRole: metadata.role === 'postgres',
    temporaryLogin: metadata.login === 'cli_login_postgres',
    readOnly: metadata.readOnly === 'on',
    rowSecurityDisabled: metadata.rowSecurity === 'off',
    repeatableRead: metadata.isolation === 'repeatable read',
    statementTimeout: metadata.statementTimeoutMs === 120000,
    lockTimeout: metadata.lockTimeoutMs === 5000,
    expectedServerVersion: numericVersion && Number(metadata.versionNum) === 170006,
    compatibleServerMajor: numericVersion && Number(metadata.versionNum) >= 170000 && Number(metadata.versionNum) < 180000,
    inventoryShape: Array.isArray(metadata.tables) && Array.isArray(metadata.extensions) && metadata.extensions.every(item => item && typeof item.name === 'string'),
    databaseSize: typeof metadata.bytes === 'number' && Number.isSafeInteger(metadata.bytes) && metadata.bytes >= 0,
  };
  // Behind a pooler this describes its backend leg, not client verify-full TLS.
  return { checks, backendTlsObserved: metadata.ssl === true ? true : metadata.ssl === false ? false : null, passed: Object.values(checks).every(Boolean), failedChecks: Object.keys(checks).filter(name => !checks[name]) };
}
