// Exact schema-grant replay for an isolated private restore only.
import { quoteIdentifier } from './private-recovery-roles.mjs';

function schemaEntries(schema) {
  quoteIdentifier(schema?.name); quoteIdentifier(schema?.owner);
  if (typeof schema.aclNull !== 'boolean' || (schema.acl !== null && !Array.isArray(schema.acl))
    || (schema.aclNull && schema.acl !== null)) throw Error('Malformed schema ACL');
  const entries = schema.aclNull
    ? ['CREATE', 'USAGE'].map(privilege => ({ grantor: schema.owner, grantee: schema.owner, privilege, grantable: false }))
    : (schema.acl ?? []);
  const keys = new Set();
  for (const item of entries) {
    quoteIdentifier(item?.grantor); quoteIdentifier(item?.grantee);
    if (!['CREATE', 'USAGE'].includes(item.privilege) || typeof item.grantable !== 'boolean'
      || (item.grantee === 'PUBLIC' && item.grantable)) throw Error('Invalid schema privilege');
    const key = JSON.stringify([item.grantor, item.grantee, item.privilege]);
    if (keys.has(key)) throw Error('Duplicate schema ACL entry');
    keys.add(key);
  }
  return entries;
}
const recipient = name => name === 'PUBLIC' ? 'PUBLIC' : quoteIdentifier(name);
const canonical = schema => schemaEntries(schema).map(entry => JSON.stringify([entry.grantor, entry.grantee, entry.privilege, entry.grantable])).sort();

/** Exact owner + effective grantor/grantee/privilege/grant-option comparison.
 * NULL expands only to built-in schema owner defaults; it grants no PUBLIC access.
 */
export function schemaAclMatches(expected, actual) {
  return expected.name === actual.name && expected.owner === actual.owner
    && JSON.stringify(canonical(expected)) === JSON.stringify(canonical(actual));
}

/** Standalone transaction. All current recipients and grantors are considered,
 * including extra PUBLIC access. Final caller must reread and compare the catalog.
 * Does not modify owners, grant roles, or write PostgreSQL catalogs directly.
 */
export function restoreSchemaAclsSql(sourceSchemas, restoredSchemas) {
  if (!Array.isArray(sourceSchemas) || !Array.isArray(restoredSchemas)) throw Error('Malformed schema inventory');
  const actual = new Map();
  for (const schema of restoredSchemas) {
    schemaEntries(schema);
    if (actual.has(schema.name)) throw Error('Duplicate restored schema');
    actual.set(schema.name, schema);
  }
  const names = new Set(), sql = [];
  for (const source of sourceSchemas) {
    const desired = schemaEntries(source), current = actual.get(source.name);
    if (names.has(source.name)) throw Error('Duplicate source schema');
    names.add(source.name);
    if (!current || source.owner !== current.owner) throw Error('Schema identity or owner differs from source');
    if (schemaAclMatches(source, current)) continue;
    // NULL cannot be recreated by ordinary GRANT/REVOKE. Do not hide a raw
    // representation mismatch or use a catalog UPDATE as a repair shortcut.
    if (source.aclNull) throw Error('Unexpected access on default-ACL schema requires explicit review');
    const qname = quoteIdentifier(source.name), previous = schemaEntries(current);
    const removals = new Set();
    for (const item of previous) {
      const identity = JSON.stringify([item.grantor, item.grantee]);
      if (removals.has(identity)) continue;
      removals.add(identity);
      sql.push(`SET LOCAL ROLE ${quoteIdentifier(item.grantor)}; REVOKE ALL ON SCHEMA ${qname} FROM ${recipient(item.grantee)} CASCADE;`);
    }
    sql.push(`SET LOCAL ROLE ${quoteIdentifier(source.owner)}; REVOKE ALL ON SCHEMA ${qname} FROM PUBLIC CASCADE; REVOKE ALL ON SCHEMA ${qname} FROM ${quoteIdentifier(source.owner)} CASCADE;`);
    const pending = [...desired], grantable = new Set();
    while (pending.length) {
      const index = pending.findIndex(item => item.grantor === source.owner || grantable.has(JSON.stringify([item.privilege, item.grantor])));
      if (index < 0) throw Error('Source schema grant-option dependency cannot be reproduced');
      const item = pending.splice(index, 1)[0];
      sql.push(`SET LOCAL ROLE ${quoteIdentifier(item.grantor)}; GRANT ${item.privilege} ON SCHEMA ${qname} TO ${recipient(item.grantee)}${item.grantable ? ' WITH GRANT OPTION' : ''};`);
      if (item.grantable) grantable.add(JSON.stringify([item.privilege, item.grantee]));
    }
  }
  if (names.size !== actual.size) throw Error('Unexpected restored schema');
  return sql.length ? ['BEGIN;', ...sql, 'COMMIT;'].join('\n') : '';
}
