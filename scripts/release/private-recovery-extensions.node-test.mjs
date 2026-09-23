import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionPrecreationPlan, splitExtensionSchemaToc } from './private-recovery-extensions.mjs';

function fixture() {
  const versions = [['pg_stat_statements', '1.11', 3], ['pgcrypto', '1.3', 36], ['uuid-ossp', '1.1', 10]];
  return { bootstrapRole: 'supabase_admin', roles: [{ name: 'postgres', super: false, createDb: true, bypassRls: true }],
    schemas: [{ name: 'extensions', owner: 'postgres' }],
    extensions: [...versions.map(([name, version]) => ({ name, version, schema: 'extensions', owner: 'postgres' })),
      { name: 'plpgsql', version: '1.0', schema: 'pg_catalog', owner: 'supabase_admin' },
      { name: 'supabase_vault', version: '0.3.1', schema: 'vault', owner: 'supabase_admin' }],
    functions: versions.flatMap(([extension, , count]) => Array.from({ length: count }, (_, index) => ({ extension, name: `synthetic_${index}`, owner: 'postgres' }))),
    relations: [{ extension: 'pg_stat_statements', owner: 'postgres' }, { extension: 'pg_stat_statements', owner: 'postgres' }],
  };
}
test('exact reviewed ownership distribution yields only static transactional precreation', () => {
  const plan = extensionPrecreationPlan(fixture());
  assert.equal(plan.extensions.length, 3);
  assert.match(plan.sql, /^BEGIN;\nALTER ROLE "postgres" SUPERUSER;\nSET LOCAL ROLE "postgres";/);
  assert.match(plan.sql, /RESET ROLE;\nALTER ROLE "postgres" NOSUPERUSER;\nCOMMIT;$/);
  assert.doesNotMatch(plan.sql, /pg_catalog\.|GRANT|LOGIN|UPDATE|vault/);
});
test('different extension owners, members, versions or runtime roles require a new reviewed plan', () => {
  for (const mutate of [c => { c.bootstrapRole = 'other'; }, c => { c.roles[0].super = true; },
    c => { c.extensions[0].owner = 'other'; }, c => { c.functions[0].owner = 'supabase_admin'; },
    c => { c.relations[0].owner = 'other'; }, c => { c.functions.pop(); }, c => { c.extensions[0].version = '1.12'; },
    c => { c.extensions.push({ name: 'unreviewed' }); }, c => { c.extensions.pop(); }, c => { c.extensions[4].owner = 'postgres'; }]) {
    const catalog = fixture(); mutate(catalog); assert.throws(() => extensionPrecreationPlan(catalog));
  }
});
test('TOC split retains every non-schema entry including ACL and extension commands', () => {
  const toc = '; header\n3; 2615 200 SCHEMA - extensions postgres\n5; 3079 210 EXTENSION - pgcrypto\n8; 0 0 ACL extensions FUNCTION digest postgres\n';
  const split = splitExtensionSchemaToc(toc);
  assert.equal(split.totalEntries, 3); assert.equal(split.remainingEntries, 2);
  assert.equal(split.schemaList, '3; 2615 200 SCHEMA - extensions postgres\n');
  assert.match(split.remainingList, /EXTENSION - pgcrypto/); assert.match(split.remainingList, /ACL extensions FUNCTION digest postgres/);
  assert.doesNotMatch(split.remainingList, /SCHEMA - extensions/);
  assert.throws(() => splitExtensionSchemaToc(toc + '3; 0 0 COMMENT - SCHEMA extensions postgres'));
  assert.throws(() => splitExtensionSchemaToc('; none'));
});
