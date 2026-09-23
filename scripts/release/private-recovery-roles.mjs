// Credential-free SQL for an isolated empty cluster. Never use against production.
export const quoteIdentifier = value => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw Error('Invalid recovery identifier');
  return `"${value.replaceAll('"', '""')}"`;
};
const literal = value => {
  if (typeof value !== 'string' || value.includes('\0')) throw Error('Invalid recovery literal');
  return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
};

export function restoreRolesSql(catalog) {
  const bootstrap = catalog.roles.find(role => role.name === catalog.bootstrapRole);
  if (!bootstrap?.super) throw Error('Source bootstrap role is missing or not superuser');
  const sql = [];
  for (const role of catalog.roles) {
    const name = quoteIdentifier(role.name);
    if (role.name !== catalog.bootstrapRole) sql.push(`CREATE ROLE ${name} NOLOGIN;`);
    const flags = [['super', 'SUPERUSER'], ['inherit', 'INHERIT'], ['createRole', 'CREATEROLE'], ['createDb', 'CREATEDB'], ['replication', 'REPLICATION'], ['bypassRls', 'BYPASSRLS']].map(([key, option]) => {
      if (typeof role[key] !== 'boolean') throw Error('Invalid source role flag');
      return `${role[key] ? '' : 'NO'}${option}`;
    });
    if (!Number.isInteger(role.connectionLimit) || role.connectionLimit < -1) throw Error('Invalid role connection limit');
    sql.push(`ALTER ROLE ${name} WITH ${flags.join(' ')} ${role.name === catalog.bootstrapRole ? 'LOGIN' : 'NOLOGIN'} CONNECTION LIMIT ${role.connectionLimit};`);
    for (const setting of role.config ?? []) {
      const index = setting.indexOf('=');
      if (index < 1) throw Error('Malformed role setting');
      const settingName = setting.slice(0, index), value = setting.slice(index + 1);
      if (settingName === 'search_path') {
        // search_path is a list GUC. ALTER ROLE ... TO one string quotes the
        // whole list as one schema. Save PostgreSQL's current list representation
        // instead. This DO statement runs in one transaction and restores the
        // caller setting even when its caller already has an open transaction.
        const block = `DECLARE prior_path pg_catalog.text := pg_catalog.current_setting('search_path');
BEGIN
  PERFORM pg_catalog.set_config('search_path', ${literal(value)}, true);
  ALTER ROLE ${name} SET search_path FROM CURRENT;
  PERFORM pg_catalog.set_config('search_path', prior_path, true);
END`;
        sql.push(`DO ${literal(block)};`);
      } else {
        // Persist other settings only. Never activate source preload libraries
        // in the operator session; the runner must keep its connection guards.
        sql.push(`ALTER ROLE ${name} SET ${quoteIdentifier(settingName)} TO ${literal(value)};`);
      }
    }
  }
  return sql.join('\n');
}

export function restoreMembershipsSql(catalog) {
  const pending = [...catalog.memberships], admin = new Set(), sql = [];
  while (pending.length) {
    const index = pending.findIndex(item => item.grantor === catalog.bootstrapRole || admin.has(JSON.stringify([item.role, item.grantor])));
    if (index < 0) throw Error('Source membership grantor dependency cannot be reproduced');
    const item = pending.splice(index, 1)[0];
    if (![item.adminOption, item.inheritOption, item.setOption].every(value => typeof value === 'boolean')) throw Error('Invalid membership options');
    sql.push(`GRANT ${quoteIdentifier(item.role)} TO ${quoteIdentifier(item.member)} WITH ADMIN ${item.adminOption}, INHERIT ${item.inheritOption}, SET ${item.setOption} GRANTED BY ${quoteIdentifier(item.grantor)};`);
    if (item.adminOption) admin.add(JSON.stringify([item.role, item.member]));
  }
  return sql.join('\n');
}

export function restoreDatabaseSql(database, name) {
  if (!['c', 'i'].includes(database.collationProvider)) throw Error('Unsupported source collation provider');
  const provider = database.collationProvider === 'i' ? 'icu' : 'libc';
  return `CREATE DATABASE ${quoteIdentifier(name)} WITH TEMPLATE template0 OWNER ${quoteIdentifier(database.owner)} ENCODING ${literal(database.encoding)} LOCALE_PROVIDER ${provider} LC_COLLATE ${literal(database.collate)} LC_CTYPE ${literal(database.ctype)}${provider === 'icu' ? ` ICU_LOCALE ${literal(database.icuLocale)}` : ''};`;
}

export function restoreDatabaseAclSql(database, name) {
  if (database.aclNull) return '';
  const qname = quoteIdentifier(name), owner = quoteIdentifier(database.owner);
  const sql = [`SET ROLE ${owner}; REVOKE ALL ON DATABASE ${qname} FROM PUBLIC; REVOKE ALL ON DATABASE ${qname} FROM ${owner}; RESET ROLE;`];
  const pending = [...(database.acl ?? [])], grantable = new Set();
  while (pending.length) {
    const index = pending.findIndex(item => item.grantor === database.owner || grantable.has(JSON.stringify([item.privilege, item.grantor])));
    if (index < 0) throw Error('Source database grant-option dependency cannot be reproduced');
    const item = pending.splice(index, 1)[0];
    if (!['CREATE', 'CONNECT', 'TEMPORARY'].includes(item.privilege)) throw Error('Unknown database privilege');
    sql.push(`SET ROLE ${quoteIdentifier(item.grantor)}; GRANT ${item.privilege} ON DATABASE ${qname} TO ${item.grantee === 'PUBLIC' ? 'PUBLIC' : quoteIdentifier(item.grantee)}${item.grantable ? ' WITH GRANT OPTION' : ''}; RESET ROLE;`);
    if (item.grantable) grantable.add(JSON.stringify([item.privilege, item.grantee]));
  }
  return sql.join('\n');
}

export { compareRecoveryCatalog } from './private-recovery-comparison.mjs';
