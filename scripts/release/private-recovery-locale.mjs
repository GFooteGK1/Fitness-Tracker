// Catalog-only evidence. No application tables or functions are invoked.
export const RECOVERY_LOCALE_SQL = `SELECT pg_catalog.jsonb_build_object(
 'database',pg_catalog.current_database(),'role',current_user,'login',session_user,
 'versionNum',pg_catalog.current_setting('server_version_num'),
 'readOnly',pg_catalog.current_setting('transaction_read_only'),
 'isolation',pg_catalog.current_setting('transaction_isolation'),
 'rowSecurity',pg_catalog.current_setting('row_security'),
 'statementTimeoutMs',(SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='statement_timeout'),
 'lockTimeoutMs',(SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='lock_timeout'),
 'encoding',pg_catalog.pg_encoding_to_char(d.encoding),
 'provider',d.datlocprovider,'collate',d.datcollate,'ctype',d.datctype,
 'locale',d.datlocale,'recordedVersion',d.datcollversion,
 'actualVersion',pg_catalog.pg_database_collation_actual_version(d.oid)
) FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database();`;

export function validateSourceLocale(value) {
  const checks = {
    database: value?.database === 'postgres',
    role: value?.role === 'postgres',
    login: value?.login === 'cli_login_postgres',
    version: value?.versionNum === '170006',
    readOnly: value?.readOnly === 'on',
    isolation: value?.isolation === 'repeatable read',
    rowSecurity: value?.rowSecurity === 'off',
    statementTimeout: value?.statementTimeoutMs === 120000,
    lockTimeout: value?.lockTimeoutMs === 5000,
    encoding: value?.encoding === 'UTF8',
    provider: value?.provider === 'i',
    locale: ['collate', 'ctype', 'locale'].every(key => typeof value?.[key] === 'string' && value[key].length > 0 && value[key].length < 256),
    versions: ['recordedVersion', 'actualVersion'].every(key => typeof value?.[key] === 'string' && /^[0-9]+(?:\.[0-9]+)*$/.test(value[key])),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

export function requireMatchingRecoveryLocale(captured, source, local) {
  const fieldMap = { provider: 'collationProvider', locale: 'locale', collate: 'collate', ctype: 'ctype', encoding: 'encoding', recordedVersion: 'collationVersion' };
  for (const [observed, archived] of Object.entries(fieldMap)) {
    if (typeof captured?.[archived] !== 'string' || source?.[observed] !== captured[archived] || local?.[observed] !== captured[archived]) throw Error('Recovery locale identity or recorded version differs');
  }
  if (source.actualVersion !== captured.collationVersion || local.actualVersion !== source.actualVersion) throw Error('Recovery actual collation version differs');
  return { matched: true, provider: source.provider, locale: source.locale, actualVersion: source.actualVersion, recordedVersion: captured.collationVersion, storedVersionException: false };
}
