// Pure SQL preparation. No network, database client, credentials or execution.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CUTOVER_MIGRATIONS = Object.freeze({
  pause: { version: '20260923010000', name: 'coaching_write_pause', sha256: '6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041' },
  revision: { version: '20260921010000', name: 'coach_proposal_context_revision', sha256: '0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f' },
});
const prerequisites = ['20260915220000', '20260918010000', '20260918011000', '20260918020000', '20260918030000', '20260918040000', '20260918050000'];
const pauseTables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations'];
const revisionFunctions = ['get_coach_context_revision', 'advance_coach_context_revision', 'coach_context_revision_value', 'assert_coach_context_revision', 'assert_coach_plan_intent_current', 'guard_coach_proposal_context', 'guard_coach_review_context', 'expire_stale_coach_context_proposals', 'record_coach_weekly_review', 'create_rolling_weekly_replacement_proposal', 'create_initial_rolling_weekly_proposal', 'accept_adaptation_proposal'];
const revisionSources = ['coach_memories', 'workouts', 'coach_checkins', 'coach_strength_assessments', 'performance_observation_groups', 'performance_observation_values', 'measurement_imports', 'prescribed_sessions'];
// Preserve exact ledger source bytes even if an editor converts query CRLF to LF.
const literal = value => `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}'`;
const list = values => values.map(literal).join(',');
const sha = value => createHash('sha256').update(value).digest('hex');
function phase(value) { if (!Object.hasOwn(CUTOVER_MIGRATIONS, value)) throw Error('Expected pause or revision phase'); return CUTOVER_MIGRATIONS[value]; }
function generation(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || BigInt(value) >= 9223372036854775807n) throw Error('Supply exact observed bigint generation as a decimal string');
  return value;
}
function database(value) {
  if (value !== 'postgres' && !/^socius_ledger_[a-f0-9]{12}$/.test(value)) throw Error('Unapproved database name');
  return value;
}
export function verifiedMigrationSource(stage) {
  const spec = phase(stage);
  const bytes = readFileSync(new URL(`../../supabase/migrations/${spec.version}_${spec.name}.sql`, import.meta.url));
  if (sha(bytes) !== spec.sha256) throw Error('Pinned migration bytes changed; do not render or apply');
  const source = bytes.toString('utf8');
  if ((source.match(/^BEGIN;\r?$/gm) ?? []).length !== 1 || (source.match(/^COMMIT;\r?$/gm) ?? []).length !== 1 || !/COMMIT;\s*$/.test(source)) throw Error('Unsupported migration transaction envelope');
  return source;
}

export function migrationLedgerInsertSql(stage) {
  const spec = phase(stage);
  return `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ('${spec.version}','${spec.name}',ARRAY[${literal(verifiedMigrationSource(stage))}]::text[]);`;
}

function identityGuard(target) {
  return `IF current_database() <> ${literal(database(target))} OR current_user <> 'postgres' OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
 RAISE EXCEPTION 'Wrong cutover database, effective operator or PostgreSQL major' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls)) THEN
 RAISE EXCEPTION 'Required existing operator RLS bypass is absent' USING ERRCODE='55000'; END IF;`;
}

/** @param {string} stage @param {{expectedGeneration?: string, targetDatabase?: string}} options */
export function renderInstallSql(stage, { expectedGeneration, targetDatabase = 'postgres' } = {}) {
  const spec = phase(stage), source = verifiedMigrationSource(stage);
  const pause = CUTOVER_MIGRATIONS.pause;
  const gate = stage === 'revision' ? `
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${pause.version}' AND name='${pause.name}' AND statements=ARRAY[${literal(verifiedMigrationSource('pause'))}]::text[]) THEN
 RAISE EXCEPTION 'Exact pause migration must be installed and recorded first' USING ERRCODE='55000'; END IF;
 SELECT c.paused,c.generation INTO v_paused,v_generation FROM public.coaching_write_control c WHERE c.singleton FOR UPDATE NOWAIT;
 IF NOT FOUND OR NOT v_paused OR v_generation <> ${generation(expectedGeneration)}::bigint THEN
 RAISE EXCEPTION 'Committed pause at exact observed generation is required' USING ERRCODE='55000'; END IF;
 IF pg_catalog.to_regclass('public.coach_context_revisions') IS NOT NULL THEN
 RAISE EXCEPTION 'Unrecorded revision objects require investigation' USING ERRCODE='55000'; END IF;` : `
 IF pg_catalog.to_regclass('public.coaching_write_control') IS NOT NULL
 OR pg_catalog.to_regprocedure('public.assert_coaching_writes_open()') IS NOT NULL
 OR pg_catalog.to_regprocedure('public.set_coaching_write_pause(boolean,bigint,text)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='coaching_write_pause' AND NOT tgisinternal) THEN
 RAISE EXCEPTION 'Pause objects already exist; do not install or repair ledger blindly' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${CUTOVER_MIGRATIONS.revision.version}') THEN
 RAISE EXCEPTION 'Revision was already recorded before this pause installation' USING ERRCODE='55000'; END IF;`;
  const prologue = `
SET LOCAL ROLE postgres;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $cutover_preflight$
DECLARE v_paused boolean; v_generation bigint;
BEGIN
 ${identityGuard(targetDatabase)}
 IF pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
 RAISE EXCEPTION 'Migration ledger is absent; do not create or repair it here' USING ERRCODE='55000'; END IF;
END $cutover_preflight$;
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $cutover_ledger_guard$
DECLARE v_paused boolean; v_generation bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${spec.version}') THEN
 RAISE EXCEPTION 'Migration version already recorded; inspect instead of replaying' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${list(prerequisites)})) <> ${prerequisites.length} THEN
 RAISE EXCEPTION 'Reviewed prerequisite migration ledger entries are missing' USING ERRCODE='55000'; END IF;
 ${gate}
END $cutover_ledger_guard$;
`;
  const ledger = `
-- Atomic with the original migration: this exact file is one ledger statement.
${migrationLedgerInsertSql(stage)}
`;
  const begin = source.indexOf('BEGIN;') + 'BEGIN;'.length, commit = source.lastIndexOf('COMMIT;');
  return `-- PREPARATION ONLY. Target identity must also be verified in the operator UI.
-- Original file SHA256 ${spec.sha256}; source bytes are unmodified below except
-- additive preflight and ledger statements inside its own transaction.
${source.slice(0, begin)}${prologue}${source.slice(begin, commit)}${ledger}${source.slice(commit)}
-- Require success through COMMIT, then run the readback in a fresh query.
`;
}

export function renderPauseSql({ paused, expectedGeneration, reason, targetDatabase = 'postgres' }) {
  if (typeof paused !== 'boolean' || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500 || /\p{Cc}/u.test(reason)) throw Error('Supply boolean state and an operator reason of 3–500 printable characters');
  const observed = generation(expectedGeneration);
  return `BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
DO $operator_identity$ BEGIN ${identityGuard(targetDatabase)} END $operator_identity$;
SELECT * FROM public.set_coaching_write_pause(${paused ? 'TRUE' : 'FALSE'},${observed}::bigint,${literal(reason.trim())});
COMMIT;
-- A separate fresh read must require paused=${paused} and generation=${BigInt(observed) + 1n}.
`;
}

export function cutoverCatalogSql(stage) {
  phase(stage);
  const names = ['assert_coaching_writes_open', 'set_coaching_write_pause', ...(stage === 'revision' ? revisionFunctions : [])];
  const tables = ['coaching_write_control', ...(stage === 'revision' ? ['coach_context_revisions'] : [])];
  return `WITH functions AS (
 SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
 md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_md5,
 (SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')) execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (${list(names)}) AND p.prokind='f'
), relations AS (
 SELECT c.oid,c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT jsonb_object_agg(r.rolname,(SELECT jsonb_object_agg(privilege,has_table_privilege(r.oid,c.oid,privilege)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) privilege)) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')) privileges
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${list(tables)})
), metadata AS (
 SELECT r.relname,'column' kind,a.attname::text identity,jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) detail
 FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 UNION ALL SELECT r.relname,'constraint',c.conname,jsonb_build_array(c.contype,c.convalidated,c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid)) FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid AND c.contype<>'n'
 UNION ALL SELECT r.relname,'index',i.relname,jsonb_build_array(x.indisvalid,x.indisready,pg_get_indexdef(i.oid)) FROM relations r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class i ON i.oid=x.indexrelid
 UNION ALL SELECT r.relname,'policy',p.policyname,jsonb_build_array(p.permissive,p.roles,p.cmd,p.qual,p.with_check) FROM relations r JOIN pg_policies p ON p.schemaname='public' AND p.tablename=r.relname
), triggers AS (
 SELECT c.relname,t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid) definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
 AND (t.tgname='coaching_write_pause' ${stage === 'revision' ? "OR t.tgname IN ('zz_advance_coach_context_revision','zz_guard_coach_proposal_context','guard_coach_review_context')" : ''})
)
SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY proname COLLATE "C",args COLLATE "C") FROM functions f),
 'relations',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY relname COLLATE "C") FROM relations r),
 'metadata',(SELECT jsonb_agg(to_jsonb(m) ORDER BY relname COLLATE "C",kind COLLATE "C",identity COLLATE "C") FROM metadata m),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY relname COLLATE "C",tgname COLLATE "C") FROM triggers t)) AS cutover_catalog;`;
}

export function renderReadbackSql(stage) {
  const spec = phase(stage);
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE postgres; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s';
SELECT current_database(),current_user,session_user,current_setting('server_version_num'),current_setting('transaction_read_only');
SELECT paused,generation FROM public.coaching_write_control WHERE singleton;
SELECT version,name,statements=ARRAY[${literal(verifiedMigrationSource(stage))}]::text[] AS exact_original_file FROM supabase_migrations.schema_migrations WHERE version='${spec.version}';
${cutoverCatalogSql(stage)}
ROLLBACK;
`;
}

export function compareCutoverCatalog(stage, observed, expected) {
  phase(stage);
  const expectedCounts = { functions: stage === 'pause' ? 2 : 14, relations: stage === 'pause' ? 1 : 2, triggers: stage === 'pause' ? 6 : 16 };
  const checks = Object.fromEntries(Object.entries(expectedCounts).map(([key, size]) => [key, Array.isArray(observed?.[key]) && observed[key].length === size && Array.isArray(expected?.[key]) && expected[key].length === size]));
  const differingSections = ['functions', 'relations', 'metadata', 'triggers'].filter(key => JSON.stringify(observed?.[key]) !== JSON.stringify(expected?.[key]));
  return { matched: Object.values(checks).every(Boolean) && differingSections.length === 0, counts: checks, differingSections };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, stage, expectedGeneration, reason] = process.argv.slice(2);
  if (command === 'install' && process.argv.length === (stage === 'revision' ? 5 : 4)) process.stdout.write(renderInstallSql(stage, { expectedGeneration }));
  else if (command === 'readback' && process.argv.length === 4) process.stdout.write(renderReadbackSql(stage));
  else if (command === 'gate' && ['pause','resume'].includes(stage) && process.argv.length === 6) process.stdout.write(renderPauseSql({ paused: stage === 'pause', expectedGeneration, reason }));
  else if (command === 'verify' && process.argv.length === 5) {
    const file = JSON.parse(readFileSync(expectedGeneration, 'utf8'));
    const observed = Array.isArray(file) ? file.find(row => row?.cutover_catalog)?.cutover_catalog : file.cutover_catalog ?? file;
    const expected = JSON.parse(readFileSync(new URL('./cutover-migrations.expected.json', import.meta.url), 'utf8'));
    if (JSON.stringify(expected.migrations) !== JSON.stringify(CUTOVER_MIGRATIONS)) throw Error('Expected catalog migration pins differ');
    const result = compareCutoverCatalog(stage, observed, expected.snapshots[stage]);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.matched) process.exitCode = 1;
  } else throw Error('Usage: install pause | install revision GENERATION | readback pause|revision | gate pause|resume GENERATION "reason" | verify pause|revision READBACK_JSON');
}
