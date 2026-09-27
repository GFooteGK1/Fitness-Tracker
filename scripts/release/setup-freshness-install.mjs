// Pure exact-migration preparation. No transport, credentials, pause mutation or execution.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifiedMigrationSource } from './cutover-migrations.mjs';

export const SETUP_MIGRATION = Object.freeze({ version: '20260926010000', name: 'coach_setup_memory_bindings',
  sha256: '3db1bfa44acfe078af7a0278c8b65b78f92489368b9d19a7a31bc7e8e32c6527' });
export const SETUP_PREDECESSORS = Object.freeze([
  'public.guard_coach_proposal_context()',
  'public.expire_stale_coach_context_proposals(uuid,uuid,uuid)',
  'public.record_coach_weekly_review(uuid,uuid,date,text,text,text,text,numeric,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text)',
]);
const literal = value => `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}'`;
export const SETUP_PREDECESSOR_SQL = `SELECT signature,md5(pg_get_functiondef(to_regprocedure(signature))) AS md5
FROM unnest(ARRAY[${SETUP_PREDECESSORS.map(literal).join(',')}]) signature ORDER BY signature;`;
export function setupMigrationSource() {
  const source = readFileSync(new URL(`../../supabase/migrations/${SETUP_MIGRATION.version}_${SETUP_MIGRATION.name}.sql`, import.meta.url), 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== SETUP_MIGRATION.sha256) throw Error('Setup migration bytes changed');
  if ((source.match(/^BEGIN;$/gm) ?? []).length !== 1 || (source.match(/^COMMIT;$/gm) ?? []).length !== 1 || !/COMMIT;\s*$/.test(source)) throw Error('Unsupported migration envelope');
  return source;
}

/** Target identity/TLS, current application and operator approval remain external gates.
 * The SQL checks the exact committed pause and fresh catalog again within its transaction.
 * @param {{expectedGeneration: string, predecessors: Array<{signature:string,md5:string}>}} input
 */
export function renderSetupInstallSql({ expectedGeneration, predecessors }) {
  if (typeof expectedGeneration !== 'string' || !/^(0|[1-9]\d*)$/.test(expectedGeneration)
    || BigInt(expectedGeneration) >= 9223372036854775807n) throw Error('Exact observed bigint generation required');
  if (!Array.isArray(predecessors) || predecessors.length !== SETUP_PREDECESSORS.length
    || new Set(predecessors.map(p => p.signature)).size !== SETUP_PREDECESSORS.length
    || predecessors.some(p => !SETUP_PREDECESSORS.includes(p.signature) || !/^[a-f0-9]{32}$/.test(p.md5))) {
    throw Error('Exact predecessor function catalog required');
  }
  const source = setupMigrationSource();
  const guard = `
SET LOCAL ROLE postgres;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $setup_identity$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
 RAISE EXCEPTION 'Expected verified production PostgreSQL 17 operator target' USING ERRCODE='55000'; END IF;
END $setup_identity$;
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $setup_guard$
DECLARE v_paused boolean; v_generation bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${SETUP_MIGRATION.version}') THEN
 RAISE EXCEPTION 'Setup migration already recorded; inspect instead of retrying' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260926120000' AND name='workout_save_recovery') THEN
 RAISE EXCEPTION 'Current-main workout recovery prerequisite is absent' USING ERRCODE='55000'; END IF;
 ${['pause', 'revision'].map(stage => {
    const version = stage === 'pause' ? '20260923010000' : '20260921010000';
    return `IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND statements=ARRAY[${literal(verifiedMigrationSource(stage))}]::text[]) THEN
 RAISE EXCEPTION 'Exact installed ${stage} migration ledger mismatch' USING ERRCODE='55000'; END IF;`;
  }).join('\n')}
 SELECT paused,generation INTO v_paused,v_generation FROM public.coaching_write_control WHERE singleton FOR UPDATE NOWAIT;
 IF NOT FOUND OR NOT v_paused OR v_generation<>${expectedGeneration}::bigint THEN
 RAISE EXCEPTION 'Expected committed paused generation' USING ERRCODE='55000'; END IF;
 IF to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') IS NOT NULL OR
 to_regprocedure('public.coach_setup_memories_current(uuid,jsonb,jsonb)') IS NOT NULL THEN
 RAISE EXCEPTION 'Unrecorded setup helpers require investigation' USING ERRCODE='55000'; END IF;
 ${predecessors.map(p => `IF md5(pg_get_functiondef(to_regprocedure(${literal(p.signature)}))) IS DISTINCT FROM '${p.md5}' THEN
 RAISE EXCEPTION 'Predecessor changed after preflight' USING ERRCODE='55000'; END IF;`).join('\n')}
END $setup_guard$;
`;
  const begin = source.indexOf('BEGIN;') + 'BEGIN;'.length, commit = source.lastIndexOf('COMMIT;');
  const ledger = `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ('${SETUP_MIGRATION.version}','${SETUP_MIGRATION.name}',ARRAY[${literal(source)}]::text[]);
NOTIFY pgrst, 'reload schema';
`;
  return `${source.slice(0, begin)}${guard}${source.slice(begin, commit)}${ledger}${source.slice(commit)}`;
}
