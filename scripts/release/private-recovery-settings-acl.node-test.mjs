import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { restoreRolesSql } from './private-recovery-roles.mjs';
import { restoreSchemaAclsSql, schemaAclMatches } from './private-recovery-schema-acl.mjs';

async function schema(db, name) {
  const result = await db.query(`SELECT jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclNull',n.nspacl IS NULL,'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type) FROM aclexplode(n.nspacl) a)) AS value FROM pg_namespace n WHERE n.nspname=$1`, [name]);
  return result.rows[0].value;
}

test('role search_path preserves exact list, quoted commas, and caller settings inside and after a transaction', async () => {
  const db = new PGlite();
  try {
    const result = await db.query(`SELECT rolname AS name,rolsuper AS super,rolinherit AS inherit,rolcreaterole AS "createRole",rolcreatedb AS "createDb",rolcanlogin AS login,rolreplication AS replication,rolbypassrls AS "bypassRls",rolconnlimit AS "connectionLimit",rolconfig AS config FROM pg_roles WHERE rolname=current_user`);
    const bootstrap = result.rows[0], value = '"schema,with,commas", public, "quote""name", pg_catalog';
    await db.exec(`SET search_path TO pg_catalog, public; BEGIN; SET LOCAL search_path TO public, pg_catalog;`);
    const sql = restoreRolesSql({ bootstrapRole: bootstrap.name, roles: [bootstrap,
      { ...bootstrap, name: 'synthetic_path_reader', super: false, config: [`search_path=${value}`, 'session_preload_libraries=synthetic_not_loaded'] },
      { ...bootstrap, name: 'synthetic_simple_reader', super: false, config: ['search_path=public, extensions'] },
    ] });
    assert.match(sql, /pg_catalog\.set_config/);
    assert.match(sql, /SET search_path FROM CURRENT/);
    assert.doesNotMatch(sql, /set_config\([^\n]*session_preload_libraries/);
    await db.exec(sql);
    const stored = await db.query(`SELECT rolname,rolconfig FROM pg_roles WHERE rolname IN ('synthetic_path_reader','synthetic_simple_reader') ORDER BY rolname`);
    assert.ok(stored.rows[0].rolconfig.includes(`search_path=${value}`));
    assert.ok(stored.rows[0].rolconfig.includes('session_preload_libraries=synthetic_not_loaded'));
    assert.deepEqual(stored.rows[1].rolconfig, ['search_path=public, extensions']);
    assert.equal((await db.query("SELECT pg_catalog.current_setting('search_path') AS path")).rows[0].path, 'public, pg_catalog');
    assert.equal((await db.query("SELECT pg_catalog.current_setting('session_preload_libraries') AS value")).rows[0].value, '');
    await db.exec('COMMIT;');
    assert.equal((await db.query("SELECT pg_catalog.current_setting('search_path') AS path")).rows[0].path, 'pg_catalog, public');
  } finally { await db.close(); }
});

test('schema ACL replay restores missing delegated grant and removes unexpected PUBLIC access with exact grantors/options', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE "z-owner" NOLOGIN; CREATE ROLE "a-delegate" NOLOGIN; CREATE ROLE "reader,role" NOLOGIN;
      CREATE SCHEMA "test,schema" AUTHORIZATION "z-owner";
      SET ROLE "z-owner"; GRANT USAGE ON SCHEMA "test,schema" TO "a-delegate" WITH GRANT OPTION; RESET ROLE;
      SET ROLE "a-delegate"; GRANT USAGE ON SCHEMA "test,schema" TO "reader,role"; RESET ROLE;`);
    const desired = await schema(db, 'test,schema');
    await db.exec(`SET ROLE "a-delegate"; REVOKE USAGE ON SCHEMA "test,schema" FROM "reader,role"; RESET ROLE;`);
    const missing = await schema(db, 'test,schema');
    assert.equal(schemaAclMatches(desired, missing), false);
    assert.equal((await db.query(`SELECT pg_catalog.has_schema_privilege('reader,role',(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='test,schema'),'USAGE') AS allowed`)).rows[0].allowed, false);
    await db.exec(`SET ROLE "z-owner"; GRANT CREATE ON SCHEMA "test,schema" TO PUBLIC; RESET ROLE;`);
    const broadened = await schema(db, 'test,schema');
    assert.equal(schemaAclMatches(desired, broadened), false);
    assert.equal((await db.query(`SELECT pg_catalog.has_schema_privilege('reader,role',(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='test,schema'),'CREATE') AS allowed`)).rows[0].allowed, true);
    const sql = restoreSchemaAclsSql([desired], [broadened]);
    assert.ok(sql.indexOf('TO "a-delegate" WITH GRANT OPTION') < sql.indexOf('TO "reader,role"'));
    await db.exec(sql);
    const actual = await schema(db, 'test,schema');
    assert.equal(schemaAclMatches(desired, actual), true);
    const normalize = value => value.acl.map(item => [item.grantor,item.grantee,item.privilege,item.grantable]).sort();
    assert.deepEqual(normalize(actual), normalize(desired));
    assert.equal(actual.owner, desired.owner);
    assert.equal((await db.query(`SELECT pg_catalog.has_schema_privilege('reader,role',(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='test,schema'),'USAGE') AS usage`)).rows[0].usage, true);
    assert.equal((await db.query(`SELECT pg_catalog.has_schema_privilege('reader,role',(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='test,schema'),'CREATE') AS allowed`)).rows[0].allowed, false);
    assert.equal(restoreSchemaAclsSql([desired], [actual]), '');
  } finally { await db.close(); }
});

test('schema ACL boundaries reject unresolved grant authority, changed ownership and unexpected default access', () => {
  const base = { name: 's', owner: 'owner', aclNull: true, acl: null };
  const desired = { ...base, aclNull: false, acl: [{ grantor: 'delegate', grantee: 'reader', privilege: 'USAGE', grantable: false }] };
  assert.throws(() => restoreSchemaAclsSql([desired], [base]), /dependency/);
  assert.throws(() => restoreSchemaAclsSql([base], [{ ...base, owner: 'other' }]), /owner/);
  const extra = { ...base, aclNull: false, acl: [{ grantor: 'owner', grantee: 'PUBLIC', privilege: 'USAGE', grantable: false }] };
  assert.equal(schemaAclMatches(base, extra), false);
  assert.throws(() => restoreSchemaAclsSql([base], [extra]), /default-ACL/);
  assert.throws(() => restoreSchemaAclsSql([base], [base, { ...base, name: 'extra' }]), /Unexpected restored schema/);
  assert.throws(() => restoreSchemaAclsSql([{ ...extra, acl: [{ ...extra.acl[0], privilege: 'EXECUTE' }] }], [base]), /Invalid schema privilege/);
});
