import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreRolesSql, restoreMembershipsSql, restoreDatabaseSql, restoreDatabaseAclSql, compareRecoveryCatalog } from './private-recovery-roles.mjs';
const bootstrap = { name: 'bootstrap', super: true, inherit: true, createRole: true, createDb: true, login: true, replication: true, bypassRls: true, connectionLimit: -1, config: null };
const catalog = { bootstrapRole: bootstrap.name, roles: [bootstrap, { ...bootstrap, name: 'reader', super: false }], memberships: [], database: { name: 'postgres', owner: 'bootstrap', aclNull: true, acl: null, encoding: 'UTF8', collationProvider: 'c', collate: 'C', ctype: 'C' } };
test('preserves role attributes while substituting NOLOGIN only for nonbootstrap roles', () => {
  const sql = restoreRolesSql(catalog);
  assert.match(sql, /CREATE ROLE "reader" NOLOGIN/);
  assert.match(sql, /ALTER ROLE "reader" WITH NOSUPERUSER/);
  assert.match(sql, /ALTER ROLE "bootstrap".* LOGIN CONNECTION LIMIT -1/);
  assert.doesNotMatch(sql, /PASSWORD/);
});
test('orders ADMIN dependencies and retains all membership options and grantor', () => {
  const data = { ...catalog, memberships: [
    { role: 'target', member: 'reader', grantor: 'manager', adminOption: false, inheritOption: false, setOption: true },
    { role: 'target', member: 'manager', grantor: 'bootstrap', adminOption: true, inheritOption: true, setOption: false },
  ] };
  const sql = restoreMembershipsSql(data).split('\n');
  assert.match(sql[0], /TO "manager".*ADMIN true.*GRANTED BY "bootstrap"/);
  assert.match(sql[1], /TO "reader".*ADMIN false, INHERIT false, SET true.*GRANTED BY "manager"/);
  assert.throws(() => restoreMembershipsSql({ ...data, memberships: data.memberships.slice(0, 1) }), /dependency/);
});
test('quotes identifiers and keeps database locale and ACL explicit', () => {
  assert.match(restoreDatabaseSql(catalog.database, 'quoted"name'), /"quoted""name".*LOCALE_PROVIDER libc/);
  assert.equal(restoreDatabaseAclSql(catalog.database, 'private_recovery'), '');
  assert.throws(() => restoreDatabaseSql({ ...catalog.database, collationProvider: 'unknown' }, 'db'), /Unsupported/);
});
test('normalizes only target name and login substitutions, detecting security drift', () => {
  const actual = structuredClone(catalog);
  actual.database.name = 'private_recovery'; actual.roles[1].login = false;
  assert.equal(compareRecoveryCatalog(catalog, actual).matched, true);
  actual.roles[1].bypassRls = false;
  assert.deepEqual(compareRecoveryCatalog(catalog, actual).differingSections, ['roles']);
});
test('orders delegated database grants after the prerequisite grant option', () => {
  const database = { ...catalog.database, aclNull: false, acl: [
    { grantor: 'a-delegate', grantee: 'reader', privilege: 'CONNECT', grantable: false },
    { grantor: 'bootstrap', grantee: 'a-delegate', privilege: 'CONNECT', grantable: true },
  ] };
  const sql = restoreDatabaseAclSql(database, 'db');
  assert.ok(sql.indexOf('TO "a-delegate" WITH GRANT OPTION') < sql.indexOf('TO "reader"'));
  assert.throws(() => restoreDatabaseAclSql({ ...database, acl: database.acl.slice(0, 1) }, 'db'), /dependency/);
});
