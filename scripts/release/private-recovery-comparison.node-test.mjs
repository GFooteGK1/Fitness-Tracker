import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { compareRecoveryCatalog, equivalentCheckAndGrouping } from './private-recovery-comparison.mjs';

const fixture = () => ({ bootstrapRole: 'operator', roles: [{ name: 'operator', login: true }, { name: 'reader', login: false }], database: { name: 'postgres', collationProvider: 'i', locale: 'en-US', collationVersion: '153.120' }, columns: [], relations: [], constraints: [] });
const column = (name, position) => ({ schema: 'public', table: 'example', name, position, type: 'integer', notNull: false, identity: '', generated: '', default: null, collation: null, aclNull: true, acl: null });
const relation = () => ({ schema: 'public', name: 'example', kind: 'r', owner: 'owner', rls: true, forceRls: true, aclNull: true, acl: null });
const constraint = definition => ({ schema: 'public', table: 'workout_efforts', name: 'workout_efforts_rpe_check', kind: 'c', definition, validated: true, deferrable: false, initiallyDeferred: false });
const ownerAcl = () => ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'].map(privilege => ({ grantor: 'owner', grantee: 'owner', privilege, grantable: false }));
const a = 'CHECK ((((actual_rpe >= (1)::numeric) AND (actual_rpe <= (10)::numeric)) AND (mod((actual_rpe * (2)::numeric), (1)::numeric) = (0)::numeric)))';
const b = 'CHECK (((actual_rpe >= (1)::numeric) AND (actual_rpe <= (10)::numeric) AND (mod((actual_rpe * (2)::numeric), (1)::numeric) = (0)::numeric)))';

test('logical column positions retain visible order and every other property; inputs untouched', () => {
  const source = fixture(), actual = fixture();
  source.columns = [column('a', 1), column('b', 3), column('c', 5)];
  actual.columns = [column('a', 1), column('b', 2), column('c', 3)];
  const before = JSON.stringify([source, actual]), result = compareRecoveryCatalog(source, actual);
  assert.equal(result.matched, true); assert.equal(result.rawMatched, false);
  assert.deepEqual(result.rawDifferingSections, ['columns']); assert.equal(result.equivalences[0].rule, 'logical-surviving-order');
  assert.equal(JSON.stringify([source, actual]), before);
  for (const property of ['type', 'notNull', 'identity', 'generated', 'default', 'collation', 'aclNull', 'acl']) {
    const changed = structuredClone(actual); changed.columns[1][property] = 'different';
    assert.deepEqual(compareRecoveryCatalog(source, changed).differingSections, ['columns']);
  }
  for (const columns of [[column('b', 1), column('a', 2), column('c', 3)], [column('a', 1), column('b', 1), column('c', 3)], [column('a', 1), column('b', 2)], [column('a', 1), column('a', 2), column('c', 3)]]) {
    assert.equal(compareRecoveryCatalog(source, { ...actual, columns }).matched, false);
  }
});

test('NULL table ACL equals only exact same-kind same-owner built-in defaults', async () => {
  const db = new PGlite();
  try {
    const { rows } = await db.query("SELECT privilege_type AS privilege,is_grantable AS grantable FROM aclexplode(acldefault('r',(SELECT oid FROM pg_roles WHERE rolname=current_user))) ORDER BY privilege_type");
    assert.deepEqual(rows, ownerAcl().map(({ privilege, grantable }) => ({ privilege, grantable })));
  } finally { await db.close(); }
  const source = fixture(), actual = fixture(); source.relations = [relation()];
  actual.relations = [{ ...relation(), aclNull: false, acl: ownerAcl() }];
  assert.equal(compareRecoveryCatalog(source, actual).matched, true);
  assert.equal(compareRecoveryCatalog(actual, source).matched, true);
  const variants = [
    { acl: ownerAcl().slice(1) }, { acl: [...ownerAcl(), { grantor: 'owner', grantee: 'PUBLIC', privilege: 'SELECT', grantable: false }] },
    { owner: 'other' }, { kind: 'v' }, { rls: false },
    { acl: ownerAcl().map((entry, i) => i ? entry : { ...entry, grantable: true }) },
    { acl: ownerAcl().map((entry, i) => i ? entry : { ...entry, grantor: 'other' }) },
    { acl: ownerAcl().map((entry, i) => i ? entry : { ...entry, extra: true }) },
  ];
  for (const variant of variants) assert.equal(compareRecoveryCatalog(source, { ...actual, relations: [{ ...actual.relations[0], ...variant }] }).matched, false);
  for (const kind of ['v', 'S', 'f', 'm']) assert.equal(compareRecoveryCatalog({ ...source, relations: [{ ...relation(), kind }] }, { ...actual, relations: [{ ...actual.relations[0], kind }] }).matched, false);
});

test('allowlisted AND regrouping preserves operand order, literals, casts, operators and OR structure', () => {
  assert.equal(equivalentCheckAndGrouping(a, b), true);
  const source = fixture(), actual = fixture(); source.constraints = [constraint(a)]; actual.constraints = [constraint(b)];
  assert.equal(compareRecoveryCatalog(source, actual).matched, true);
  for (const changed of [b.replace('(10)', '(11)'), b.replace('>=', '>'), b.replace('::numeric', '::integer'), b.replace(' AND ', ' OR '), b.replace('actual_rpe >= (1)', 'actual_rpe <= (1)')]) assert.equal(equivalentCheckAndGrouping(a, changed), false);
  assert.equal(equivalentCheckAndGrouping('CHECK ((a AND b) OR c)', 'CHECK (a AND (b OR c))'), false);
  assert.equal(equivalentCheckAndGrouping('CHECK ((a OR b) OR c)', 'CHECK (a OR (b OR c))'), false);
  assert.equal(equivalentCheckAndGrouping('CHECK ((a AND b) AND c)', 'CHECK (b AND a AND c)'), false);
  assert.equal(equivalentCheckAndGrouping('CHECK (((x + y) * z) > 0 AND a)', 'CHECK ((x + (y * z)) > 0 AND a)'), false);
  assert.equal(equivalentCheckAndGrouping('CHECK (x BETWEEN 1 AND 10 AND a)', 'CHECK (x BETWEEN 1 AND 11 AND a)'), false);
  assert.equal(equivalentCheckAndGrouping(a, `${b} NOT VALID`), false);
  assert.equal(equivalentCheckAndGrouping(a, 'CHECK (' + '('.repeat(100) + 'a' + ')'.repeat(100) + ')'), false);
  assert.equal(equivalentCheckAndGrouping(a, 'CHECK (' + 'a'.repeat(9000) + ')'), false);
  for (const key of ['name', 'schema', 'table', 'kind', 'validated']) {
    const changed = structuredClone(actual); changed.constraints[0][key] = 'different';
    assert.equal(compareRecoveryCatalog(source, changed).matched, false);
  }
  assert.equal(compareRecoveryCatalog({ ...source, constraints: [{ ...constraint(a), name: 'unreviewed' }] }, { ...actual, constraints: [{ ...constraint(b), name: 'unreviewed' }] }).matched, false);
});

test('synthetic NULL and boundary evaluations agree for range and artifact AND regrouping', async () => {
  const db = new PGlite();
  try {
    const expressionA = a.slice(6), expressionB = b.slice(6);
    const { rows } = await db.query(`SELECT actual_rpe::text AS input, ${expressionA} AS before, ${expressionB} AS after FROM (VALUES (NULL::numeric),(0),(0.5),(1),(1.25),(1.5),(9.5),(10),(10.5),(11)) v(actual_rpe)`);
    assert.equal(rows.length, 10); for (const row of rows) assert.equal(row.before, row.after);
    assert.equal(rows[0].before, null); assert.equal(rows[3].before, true); assert.equal(rows[4].before, false); assert.equal(rows[7].before, true); assert.equal(rows[8].before, false);
    const x = 'CHECK (((bucket IS NULL AND path IS NULL) AND expires IS NULL) OR ((length(bucket) >= 1 AND length(bucket) <= 100) AND (path LIKE \'owner/%\' AND expires > created)))';
    const y = 'CHECK ((bucket IS NULL AND path IS NULL AND expires IS NULL) OR (length(bucket) >= 1 AND length(bucket) <= 100 AND path LIKE \'owner/%\' AND expires > created))';
    assert.equal(equivalentCheckAndGrouping(x, y), true);
    // pg_get_constraintdef spells SQL LIKE as the exact ~~ operator.
    await db.exec("CREATE TABLE artifact_example(path text CHECK(path LIKE 'owner/%'))");
    const deparsed = (await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='artifact_example'::regclass")).rows[0].definition;
    assert.match(deparsed, /~~/);
    const operatorX = x.replace(' LIKE ', ' ~~ '), operatorY = y.replace(' LIKE ', ' ~~ ');
    assert.equal(equivalentCheckAndGrouping(operatorX, operatorY), true);
    assert.equal(equivalentCheckAndGrouping(operatorX, operatorY.replace(' ~~ ', ' !~~ ')), false);
    assert.equal(equivalentCheckAndGrouping(operatorX, operatorY.replace(' ~~ ', ' ~~* ')), false);
    assert.equal(equivalentCheckAndGrouping(operatorX, operatorY.replace(' ~~ ', ' = ')), false);
    const artifact = await db.query(`SELECT ${x.slice(6)} AS before, ${y.slice(6)} AS after FROM (VALUES (NULL::text,NULL::text,NULL::integer,0),('a','owner/x',1,0),('a','other/x',1,0),('','owner/x',1,0),(repeat('a',100),'owner/x',1,0),(repeat('a',101),'owner/x',1,0),('a','owner/x',0,0),('a',NULL,1,0)) v(bucket,path,expires,created)`);
    assert.equal(artifact.rows.length, 8); for (const row of artifact.rows) assert.equal(row.before, row.after);
    assert.deepEqual(artifact.rows.map(row => row.before), [true,true,false,false,true,false,false,null]);
  } finally { await db.close(); }
});

test('unexplained locale, security and extra-section differences always fail closed', () => {
  const source = fixture();
  for (const database of [{ ...source.database, collationVersion: '153.121' }, { ...source.database, locale: 'de-DE' }, { ...source.database, collationProvider: 'c' }]) assert.deepEqual(compareRecoveryCatalog(source, { ...source, database }).differingSections, ['database']);
  assert.deepEqual(compareRecoveryCatalog(source, { ...source, unexpected: [] }).differingSections, ['unexpected']);
  assert.equal(compareRecoveryCatalog(source, { ...source, roles: [{ name: 'operator', login: false }, source.roles[1]] }).matched, false);
});
