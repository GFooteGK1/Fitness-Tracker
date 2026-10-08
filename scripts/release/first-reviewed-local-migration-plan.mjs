/** Offline preparation only. Fixed local execution uses the guarded one-shot operator. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
export const firstReviewedMigrationFiles = [
  '20261005120000_first_reviewed_designation.sql',
  '20261005130000_first_reviewed_candidates.sql',
  '20261005155602_first_reviewed_acceptance.sql',
  '20261005172408_first_reviewed_workspace.sql',
  '20261005192643_first_reviewed_setup_requests.sql',
]
// Read-only retained-local catalog inspection, October5. Qualified against the
// maintained predecessor fixture by the migration-plan integration tests.
const predecessors = [
  ['accept_adaptation_proposal(uuid,text)', '3f9444e823e7480da7ef25a54e188cea', ['authenticated','postgres']],
  ['assert_coach_setup_memories_current(uuid,jsonb,jsonb)', 'a5102edba6075609ead9667a7f7e7739', ['postgres']],
  ['assert_reviewed_execution_continuity(jsonb)', '3e7e3ed6a86138424d3d8060714c95f4', ['postgres']],
  ['assert_reviewed_registration_current(uuid,boolean)', '5f4b51616eb73211536aa3c78dfaae7e', ['postgres']],
  ['assert_reviewed_week_transition(jsonb)', '3e5f72d7ddcf7bb36261e5329b727c10', ['postgres']],
  ['assert_supervised_registration_link(uuid,boolean)', '33ecff43026d3a9981b89730d1a218c0', ['postgres']],
  ['confirm_coach_memory(text,text,jsonb,jsonb,numeric,text)', 'b0d65ec936b8258d66f3bdc2ec1a19f4', ['authenticated','postgres','service_role']],
  ['correct_coach_memory_with_review(uuid,jsonb,text)', '6597a6b1b83845b3e44aff454cf0d189', ['authenticated','postgres']],
  ['create_registered_reviewed_week_proposal(uuid,text)', 'f6ba9cf075872e2598a4db35adfe16b7', ['authenticated','postgres']],
  ['register_reviewed_week_proposal(uuid,jsonb,text)', 'a3596dc484baacb1d98bdb6750c1e7a7', ['postgres','service_role']],
  ['review_coach_memory(uuid,text,text,text)', '3b32991d224e888dcf4e9bc57948ba36', ['authenticated','postgres']],
  ['supervised_review_field_map()', 'b6c0a3afde97ce5c5c328b81c1a4d88b', ['postgres']],
]
const newTables = ['coach_first_review_designations', 'coach_first_review_candidates', 'coach_first_review_decisions',
  'coach_first_review_profile_snapshots', 'coach_first_review_profile_confirmations', 'coach_first_review_request_resolutions',
  'coach_first_review_acceptances', 'coach_first_review_setup_requests']
export function buildFirstReviewedLocalMigrationPlan() {
  const files = firstReviewedMigrationFiles.map(name => {
    const bytes = readFileSync(path.join(root, 'supabase/migrations', name))
    const source = bytes.toString('utf8').replace(/\r\n/g, '\n').trim()
    if ((source.match(/^BEGIN;$/gm) ?? []).length !== 1 || (source.match(/^COMMIT;$/gm) ?? []).length !== 1
      || !source.endsWith('COMMIT;')) throw Error(`Expected one source transaction: ${name}`)
    return { name, sha256: sha(bytes), body: source.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '') }
  })
  const sql = `BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.resolve_supervised_request(jsonb)') IS NULL
   OR to_regprocedure('public.get_supervised_resource_scope(text,uuid)') IS NULL
   OR to_regclass('public.coaching_write_control') IS NULL THEN RAISE EXCEPTION 'Qualified supervised prerequisites missing'; END IF;
 IF ${newTables.map(t => `to_regclass('public.${t}') IS NOT NULL`).join(' OR ')}
   OR to_regprocedure('public.accept_adaptation_proposal_before_first_review(uuid,text)') IS NOT NULL
   OR to_regprocedure('public.list_first_review_programs(uuid,integer)') IS NOT NULL THEN
   RAISE EXCEPTION 'First-reviewed batch already or partially applied; inspect instead of replaying'; END IF;
END $guard$;
DO $predecessors$ DECLARE item record; function_oid oid; actual_acl text[]; BEGIN
 FOR item IN SELECT * FROM (VALUES ${predecessors.map(([signature,digest,roles]) =>
    `('${signature}','${digest}',ARRAY[${roles.map(r => `'${r}:EXECUTE:false'`).join(',')}]::text[])`).join(',\n')}) AS pinned(signature,digest,acl) LOOP
  function_oid:=to_regprocedure('public.'||item.signature);
  IF function_oid IS NULL OR md5(replace(pg_get_functiondef(function_oid),E'\\r\\n',E'\\n'))<>item.digest
    OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=function_oid)<>'postgres' THEN
   RAISE EXCEPTION 'First-reviewed predecessor definition changed: %',item.signature;
  END IF;
  SELECT ARRAY(SELECT coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid=function_oid ORDER BY 1) INTO actual_acl;
  IF actual_acl IS DISTINCT FROM item.acl THEN RAISE EXCEPTION 'First-reviewed predecessor privileges changed: %',item.signature; END IF;
 END LOOP;
END $predecessors$;
CREATE TEMP TABLE first_reviewed_before(schema_name text,table_name text,row_count bigint,digest text) ON COMMIT DROP;
DO $snapshot$ DECLARE item record; n bigint; h text; BEGIN
 FOR item IN SELECT ns.nspname,cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace
   WHERE cl.relkind='r' AND (ns.nspname='public' OR (ns.nspname='auth' AND cl.relname='users')) ORDER BY ns.nspname,cl.relname LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')) FROM %I.%I t',item.nspname,item.relname) INTO n,h;
  INSERT INTO first_reviewed_before VALUES(item.nspname,item.relname,n,h);
 END LOOP;
END $snapshot$;
${files.map(f => `-- Pinned migration: ${f.name}\n${f.body}`).join('\n')}
DO $preserve$ DECLARE item record; n bigint; h text; BEGIN
 FOR item IN SELECT * FROM first_reviewed_before LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')) FROM %I.%I t',item.schema_name,item.table_name) INTO n,h;
  IF n IS DISTINCT FROM item.row_count OR h IS DISTINCT FROM item.digest THEN RAISE EXCEPTION 'Existing data changed in %.%',item.schema_name,item.table_name; END IF;
 END LOOP;
 ${newTables.map(t => `IF EXISTS(SELECT 1 FROM public.${t}) THEN RAISE EXCEPTION 'Migration introduced first-review data: ${t}'; END IF;`).join('\n')}
END $preserve$;
SELECT schema_name,table_name,row_count,digest FROM first_reviewed_before ORDER BY schema_name,table_name;
NOTIFY pgrst,'reload schema';
COMMIT;
`
  return { sql, manifest: { schemaVersion: 1, kind: 'first_reviewed', target: 'supabase_db_sociusfit-programming-local',
    machine: 'sociusfit-local', database: 'postgres', api: 'http://127.0.0.1:55321',
    files: files.map(({name,sha256}) => ({name,sha256})), sqlSha256: sha(sql) } }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--hash-only')) throw Error('Unexpected preparation mode')
  const plan = buildFirstReviewedLocalMigrationPlan()
  if (process.argv[2] === '--hash-only') console.log(plan.manifest.sqlSha256)
  else {
    const runId = randomUUID(), directory = path.join(root,'output/app-quality-release',`first-reviewed-migration-${runId}`)
    mkdirSync(directory)
    writeFileSync(path.join(directory,'plan.sql'),plan.sql,{flag:'wx'})
    writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({...plan.manifest,runId},null,2),{flag:'wx'})
    console.log(JSON.stringify({directory,sqlSha256:plan.manifest.sqlSha256,files:plan.manifest.files}))
  }
}
