import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildTableScope, tableDigestSql, manifestTransactionSql, createTableDigestSink, RECOVERY_CATALOG_SQL } from './private-recovery-manifest.mjs';

test('whole logical ledger distinguishes registered extension rows from omitted managed data', () => {
  const scope = buildTableScope({ extensions: [{ name: 'example', config: [{ schema: 'managed', table: 'config', predicate: 'WHERE id > 0' }] }], relations: [
    { schema: 'public', name: 'events', kind: 'r' },
    { schema: 'managed', name: 'config', kind: 'r', extension: 'example' },
    { schema: 'managed', name: 'internal', kind: 'r', extension: 'example' },
    { schema: 'public', name: 'parent', kind: 'p' },
    { schema: 'public', name: 'remote', kind: 'f' },
    { schema: 'public', name: 'summary', kind: 'm' },
  ] });
  assert.deepEqual(scope.map(item => item.scope), ['full', 'extension_config', 'excluded', 'structure_only', 'excluded', 'excluded']);
  assert.equal(scope[1].predicate, 'WHERE id > 0');
  assert.match(scope[2].reason, /not registered/);
  assert.match(scope[4].reason, /foreign table/);
});

test('duplicate extension config ownership and malformed catalogs fail', () => {
  assert.throws(() => buildTableScope({}), /Malformed/);
  const config = [{ schema: 'x', table: 'y', predicate: '' }];
  assert.throws(() => buildTableScope({ extensions: [{ name: 'a', config }, { name: 'b', config }], relations: [] }), /Duplicate/);
});

test('snapshot identifier is bounded SQL literal and imported before queries', () => {
  const sql = manifestTransactionSql('00000003-000000A1-1');
  assert.match(sql, /REPEATABLE READ READ ONLY/);
  assert.match(sql, /SET LOCAL row_security = off/);
  assert.match(sql, /SET TRANSACTION SNAPSHOT '00000003-000000A1-1'/);
  assert.equal(sql.includes('SELECT'), false);
  assert.throws(() => manifestTransactionSql("x'; COMMIT;--"), /Invalid/);
});

test('canonical COPY escapes identifiers and rejects filtered full or multi-statement predicates', () => {
  const sql = tableDigestSql({ schema: 'sch"ema', table: 'odd"table', scope: 'full' });
  assert.match(sql, /FROM ONLY "sch""ema"\."odd""table"/);
  assert.match(sql, /ORDER BY row_hash COLLATE "C"/);
  assert.throws(() => tableDigestSql({ schema: 's', table: 't', scope: 'full', predicate: 'WHERE id=1' }), /cannot filter/);
  for (const predicate of ['WHERE true; SELECT 1', 'WHERE true -- comment', 'WHERE true /* comment */', 'LIMIT 1']) {
    assert.throws(() => tableDigestSql({ schema: 's', table: 't', scope: 'extension_config', predicate }));
  }
  assert.throws(() => tableDigestSql({ schema: 's', table: 't', scope: 'excluded' }), /does not include/);
});

test('streaming digests preserve repeated row hashes across arbitrary chunks', async () => {
  const text = `${'a'.repeat(64)}\n${'a'.repeat(64)}\n${'f'.repeat(64)}\n`, sink = createTableDigestSink();
  await pipeline(Readable.from([text.slice(0, 3), text.slice(3, 65), text.slice(65)]), sink.stream);
  assert.deepEqual(sink.result(), { rows: 3, bytes: 195, sha256: createHash('sha256').update(text).digest('hex') });
});

test('empty table has explicit zero count and empty-stream digest', async () => {
  const sink = createTableDigestSink(); await pipeline(Readable.from([]), sink.stream);
  assert.deepEqual(sink.result(), { rows: 0, bytes: 0, sha256: createHash('sha256').update('').digest('hex') });
});

for (const input of [`${'a'.repeat(63)}\n`, 'private row value\n', 'a'.repeat(64), Buffer.from([0xe1, 10])]) {
  test('malformed or incomplete digest stdout fails without accepting data', async () => {
    const sink = createTableDigestSink();
    await assert.rejects(pipeline(Readable.from([input]), sink.stream), /digest stream/);
  });
}

test('catalog records credential-free authority and database locale fields', () => {
  for (const key of ['bootstrapRole', 'memberships', 'adminOption', 'inheritOption', 'setOption', 'aclNull', 'forceRls', 'securityDefiner', 'defaultPrivileges', 'collationProvider', 'icuLocale', 'collationVersion']) assert.ok(RECOVERY_CATALOG_SQL.includes(`'${key}'`));
  assert.equal(/rolpassword|pg_authid|vault\.decrypted_secrets/i.test(RECOVERY_CATALOG_SQL), false);
});

test('real local catalog preserves pgbouncer and pgsodium while excluding the literal pg_ system prefix', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE pgbouncer NOLOGIN;
      CREATE SCHEMA pgsodium AUTHORIZATION pgbouncer;
      CREATE TABLE pgsodium.synthetic_record(id integer PRIMARY KEY);
      ALTER TABLE pgsodium.synthetic_record ENABLE ROW LEVEL SECURITY;
      CREATE POLICY synthetic_owner ON pgsodium.synthetic_record TO pgbouncer USING(id=1);
      CREATE FUNCTION pgsodium.synthetic_identity(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT $1';`);
    const result = await db.query(RECOVERY_CATALOG_SQL);
    const catalog = Object.values(result.rows[0])[0];
    assert.ok(catalog.roles.some(role => role.name === 'pgbouncer'));
    assert.ok(catalog.schemas.some(schema => schema.name === 'pgsodium' && schema.owner === 'pgbouncer'));
    assert.ok(catalog.relations.some(relation => relation.schema === 'pgsodium' && relation.name === 'synthetic_record'));
    assert.ok(catalog.columns.some(column => column.schema === 'pgsodium' && column.name === 'id'));
    assert.ok(catalog.constraints.some(constraint => constraint.schema === 'pgsodium'));
    assert.ok(catalog.indexes.some(index => index.schema === 'pgsodium'));
    assert.ok(catalog.policies.some(policy => policy.schema === 'pgsodium' && policy.roles.includes('pgbouncer')));
    assert.ok(catalog.functions.some(fn => fn.schema === 'pgsodium' && fn.name === 'synthetic_identity'));
    assert.ok(buildTableScope(catalog).some(scope => scope.schema === 'pgsodium' && scope.table === 'synthetic_record' && scope.scope === 'full'));
    assert.equal(catalog.roles.some(role => role.name.startsWith('pg_')), false);
    assert.equal(catalog.schemas.some(schema => schema.name.startsWith('pg_') || schema.name === 'information_schema'), false);
    assert.equal(catalog.relations.some(relation => relation.schema.startsWith('pg_')), false);
    const builtin = await db.query("SELECT count(*)::integer AS count FROM pg_roles WHERE rolname='pg_monitor'");
    assert.equal(builtin.rows[0].count, 1);
    assert.equal(catalog.roles.some(role => role.name === 'pg_monitor'), false);
  } finally { await db.close(); }
});
